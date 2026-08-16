#!/usr/bin/env node
/**
 * Claude Code hook adapter for the call-graph gate + worker-report gate.
 * Wire via .claude/settings.json → node "${CLAUDE_PROJECT_DIR}/.claude/hooks/adapters/claude.mjs"
 *
 * PreToolUse can deny Agent/Task spawns (it never force-allows — non-denied
 * spawns fall through to normal permission handling).
 * SubagentStart cannot block; it only records agent_id → agent_type.
 * SubagentStop can block: kit workers are held until their JSON fence validates.
 */

import {
  readStdin,
  normalizeClaudePayload,
  decide,
  appendRunEvent,
  bumpReportBlock,
  PROJECT_AGENTS,
  MAX_REPORT_BLOCKS,
  PLAN_GATE_IMPLEMENTERS,
  MANAGER,
  planGateEnabled,
  setPlanPending,
  readPlanApproval,
  approvePlan,
  detectTrackerBypass,
  setGate,
  clearGate,
  readGates,
  MAX_GATE_ROUNDS,
  IMPLEMENTER_OWNERS,
} from '../gate-core.mjs'
import { appendTaskMemory, resolveTokenCount } from '../task-log.mjs'
import {
  extractWorkerReportJson,
  validateWorkerReport,
} from '../../../scripts/validate-worker-report.mjs'

function write(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

function denyPreToolUse(reason) {
  write({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })
}

function noop() {
  write({})
}

/**
 * Plan gate: planner's plan is approved once, at the first implementer spawn.
 * Advisory by design — it never denies, and every failure falls through to
 * normal permission handling. The nest gate above stays fail-closed.
 */
function planGateSafe(fn) {
  if (!planGateEnabled()) return false
  try {
    return fn()
  } catch {
    return false
  }
}

function planSummaryOf(report) {
  const next = String(report.recommendNext || '').trim()
  return `Plan: ${String(report.goal || '').trim()}${next && next !== 'none' ? `\nNext: ${next}` : ''}`
}

/** @returns {boolean} true when an ask was written */
function askPlanApproval(normalized) {
  return planGateSafe(() => {
    if (normalized.callerAgentType !== MANAGER) return false
    if (!PLAN_GATE_IMPLEMENTERS.has(normalized.target)) return false
    const { planApproval, planSummary } = readPlanApproval(normalized.sessionId)
    if (planApproval !== 'pending') return false
    write({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `Approve this plan before \`${normalized.target}\` starts?\n\n${planSummary}`,
      },
    })
    return true
  })
}

const REPORT_HINT =
  'End your final message with a fenced JSON worker-report matching .claude/schemas/worker-report.schema.json (see .claude/protocols/worker-report.md).'

/**
 * A schema-valid report can still admit a DIY bypass in prose. Advisory only —
 * judging whether a quote is a real fallback is the manager's call, not a regex's.
 */
function bypassAdvisory(report) {
  const prose = [report.mcpUsed, report.evidence, report.notes, report.findings]
    .filter((v) => typeof v === 'string')
    .join('\n')
  const matched = detectTrackerBypass(prose)
  if (!matched) return ''
  return `This report quotes ${matched} — trackers and standards URLs are MCP-only. Manager: bounce for an honest \`mcpUsed\`, or accept \`blocked\` naming the missing server.`
}

/** Owner named as `frontend: do the thing`, or bare. '' when nobody is blamed. */
function ownerFrom(recommendNext) {
  const first = String(recommendNext || '')
    .trim()
    .split(/[:\s]/)[0]
    .toLowerCase()
  return IMPLEMENTER_OWNERS.has(first) ? first : ''
}

/**
 * Open or close an audit fix-loop from a valid report.
 *
 * Only typed signals count: `findingsSeverity` for the auditors, and for tester
 * a failed verification that actually blames an implementer. A tester that is
 * `blocked` (no dev server, missing env) escalates to the user instead — looping
 * an implementer over broken tooling is the failure mode this must avoid.
 */
function applyGates(sessionId, agentType, report) {
  const severity = String(report.findingsSeverity || '')
  const owner = ownerFrom(report.recommendNext)
  const done = String(report.status) === 'done'

  if (agentType === 'reviewer' && done) {
    severity === 'critical'
      ? setGate(sessionId, 'review', owner)
      : clearGate(sessionId, 'review')
  }
  if ((agentType === 'security' || agentType === 'risk') && done) {
    severity === 'critical'
      ? setGate(sessionId, 'secRisk', owner)
      : clearGate(sessionId, 'secRisk')
  }
  if (agentType === 'tester' && done) {
    const productFailure =
      String(report.verificationResult) === 'fail' && owner !== ''
    productFailure ? setGate(sessionId, 'test', owner) : clearGate(sessionId, 'test')
  }
}

const GATE_LABEL = {
  review: 'reviewer found a critical issue',
  secRisk: 'security/risk found a critical issue',
  test: 'a test failure blames product code',
}

/**
 * Hold the managed close while a fix-loop is open.
 *
 * There is no close tool — the Final report is plain text — so the only lever is
 * the manager's own SubagentStop. **This only fires when manager runs as a
 * subagent.** A user running manager as the main agent gets protocol, not
 * enforcement; do not read this gate as coverage it does not have.
 *
 * @returns {{ handled: boolean, advisory: string }}
 */
function holdManagedClose(sessionId) {
  const gates = readGates(sessionId)
  const open = Object.entries(gates)
  if (!open.length) return { handled: false, advisory: '' }

  const lines = open.map(
    ([key, g]) =>
      `- \`${key}\` — ${GATE_LABEL[key] || key}${g.owner ? `; owner: \`${g.owner}\`` : ''} (round ${g.rounds})`,
  )

  // Cap the loop: a flake or a stubborn nit must not hostage the close forever.
  if (open.some(([, g]) => g.rounds > MAX_GATE_ROUNDS)) {
    write({
      hookSpecificOutput: {
        hookEventName: 'SubagentStop',
        additionalContext: `Fix-loop still open after ${MAX_GATE_ROUNDS} rounds:\n${lines.join('\n')}\n\nStop looping — ask the user to waive it or keep going, then close either way.`,
      },
    })
    return { handled: true, advisory: '' }
  }

  write({
    decision: 'block',
    reason: `Cannot close yet — an audit fix-loop is open:\n${lines.join('\n')}\n\nDispatch the owner to fix, re-run the auditor, then close. If this is a false alarm, ask the user to waive it.`,
  })
  return { handled: true, advisory: '' }
}

/**
 * Validate a kit worker's final message. Blocks until the fence is valid,
 * then goes advisory so a bad worker cannot burn the session.
 * @returns {{ handled: boolean, advisory: string }} handled = output written
 */
function handleSubagentStop(payload) {
  const agentType = String(payload.agent_type || '')
  if (!PROJECT_AGENTS.has(agentType)) return { handled: false, advisory: '' }

  const sessionId = String(payload.session_id || '')
  const agentId = String(payload.agent_id || '')
  const report = extractWorkerReportJson(
    String(payload.last_assistant_message || ''),
  )
  const result = report
    ? validateWorkerReport(report)
    : { ok: false, errors: ['missing worker-report JSON fence'] }

  if (result.ok) {
    const tokens = resolveTokenCount(report, payload)
    // The payload carries no token field, so any number here came from the
    // worker's transcript unless the worker counted itself — and the
    // transcript is one turn behind at stop time. Mark it rather than imply
    // an exact figure.
    const tokensApprox = tokens != null && resolveTokenCount(report) == null
    appendTaskMemory(report, {
      sessionId: sessionId || undefined,
      tokens,
      tokensApprox,
    })
    appendRunEvent({
      event: 'report',
      sessionId: sessionId || null,
      role: agentType,
      agent: agentType,
      status: String(report.status || 'ok'),
      goal: String(report.goal || ''),
      verificationResult: String(report.verificationResult || 'n/a'),
      tokens,
      tokensApprox,
      changed: Array.isArray(report.changed) ? report.changed : [],
      validatorOk: true,
      hookEvent: 'SubagentStop',
    })
    if (agentType === 'planner' && String(report.status) === 'done') {
      planGateSafe(() => setPlanPending(sessionId, planSummaryOf(report)))
    }

    applyGates(sessionId, agentType, report)
    if (agentType === MANAGER) return holdManagedClose(sessionId)

    return { handled: false, advisory: bypassAdvisory(report) }
  }

  const blocks = bumpReportBlock(sessionId, agentId)
  const detail = `Invalid worker report from \`${agentType}\`:\n- ${result.errors.join('\n- ')}\n\n${REPORT_HINT}`
  appendRunEvent({
    event: 'report-invalid',
    sessionId: sessionId || null,
    role: agentType,
    agent: agentType,
    status: blocks > MAX_REPORT_BLOCKS ? 'advisory' : 'block',
    hookEvent: 'SubagentStop',
    errors: result.errors,
  })

  if (blocks > MAX_REPORT_BLOCKS) {
    write({
      hookSpecificOutput: {
        hookEventName: 'SubagentStop',
        additionalContext: `${detail}\n\n(Report gate gave up after ${MAX_REPORT_BLOCKS} retries — manager must bounce this report.)`,
      },
    })
    return { handled: true, advisory: '' }
  }

  write({ decision: 'block', reason: detail })
  return { handled: true, advisory: '' }
}

const raw = await readStdin()
let payload = {}
try {
  payload = raw.trim() ? JSON.parse(raw) : {}
} catch {
  denyPreToolUse('gate-subagents: invalid JSON on stdin')
  process.exit(0)
}

try {
  const normalized = normalizeClaudePayload(payload)
  const event = normalized.event

  let stopAdvisory = ''
  if (event === 'SubagentStop') {
    const report = handleSubagentStop(payload)
    // Blocked or advisory — leave the role mapping in place for the retry.
    if (report.handled) process.exit(0)
    stopAdvisory = report.advisory
  }

  // Non-spawn PreToolUse: access integrity only. Answered without touching
  // state — this fires on every Bash call a kit agent makes.
  if (event === 'PreToolUse' && normalized.skipGate) {
    const matched =
      PROJECT_AGENTS.has(normalized.callerAgentType) &&
      /^Bash$/i.test(normalized.toolName)
        ? detectTrackerBypass(payload.tool_input?.command)
        : ''
    if (matched) {
      denyPreToolUse(
        `Blocked: ${matched} is a DIY bypass. Issue trackers and standards URLs are MCP-only (see .claude/protocols/ref-resolution.md). Use the tracker's MCP; if it is missing or unauthed, return status: blocked naming the server.`,
      )
    } else {
      noop()
    }
    process.exit(0)
  }

  const result = decide(normalized)

  if (event === 'PreToolUse') {
    if (result.action === 'deny') {
      denyPreToolUse(result.message || 'Blocked by call-graph gate')
    } else if (!askPlanApproval(normalized)) {
      // Never force-allow: let normal permission handling run.
      noop()
    }
    process.exit(0)
  }

  // No SubagentStart pulse: `systemMessage` did not render in the parent UI
  // when spiked (2026-08-15), and the Task panel title already names the
  // specialist. Do not re-add without checking it is visible.
  if (event === 'SubagentStart' && PLAN_GATE_IMPLEMENTERS.has(normalized.target)) {
    // The host never reports how the user answered the ask — the implementer
    // actually starting is the only "approved" signal available.
    planGateSafe(() => approvePlan(normalized.sessionId))
  }

  if (stopAdvisory) {
    write({
      hookSpecificOutput: {
        hookEventName: 'SubagentStop',
        additionalContext: stopAdvisory,
      },
    })
    process.exit(0)
  }

  // SubagentStop / SessionStart / SessionEnd — record/clear only
  noop()
} catch (err) {
  const msg = `gate-subagents: ${err instanceof Error ? err.message : String(err)}`
  if (String(payload.hook_event_name || '') === 'PreToolUse') {
    denyPreToolUse(msg)
  } else {
    write({})
  }
}
