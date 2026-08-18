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
  detectGitWrite,
  detectEnvWrite,
  detectNamedSpawn,
  isWriteTool,
  acquireWriteLease,
  MANAGER_GIT_ALLOWED,
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
  } catch (err) {
    // Advisory by design, so a throw here is invisible to the user and the
    // plan simply never gets asked about. Record it or it is unfindable.
    appendRunEvent({
      event: 'plan-gate-error',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack || null : null,
    })
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
  if (!PROJECT_AGENTS.has(agentType)) {
    // The silent path that let a named teammate finish unreported: spawning
    // with `name` puts the child on the teammate roster, so agent_type stops
    // naming a kit agent and the report gate below never runs. Log it —
    // otherwise the only symptom is a worker that ends having said nothing.
    appendRunEvent({
      event: 'stop-ungated',
      sessionId: String(payload.session_id || '') || null,
      agent: agentType || null,
      agentId: String(payload.agent_id || '') || null,
      teammateName: String(payload.name || '') || null,
      reason: agentType
        ? `agent_type "${agentType}" is not a kit agent`
        : 'payload carried no agent_type (spawned with `name`? teammates are not gated)',
      hookEvent: 'SubagentStop',
    })
    return { handled: false, advisory: '' }
  }

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

  // Non-spawn PreToolUse: Bash policy only. Answered without touching state —
  // this fires on every Bash call a kit agent makes, so it must stay cheap.
  if (event === 'PreToolUse' && normalized.skipGate) {
    const agent = normalized.callerAgentType

    // Write lease: the mechanical form of "Writable paths must not overlap".
    // Kit agents only — the human's main chat is never leased or blocked.
    if (PROJECT_AGENTS.has(agent) && isWriteTool(normalized.toolName)) {
      const filePath = payload.tool_input?.file_path || ''
      const lease = acquireWriteLease(
        normalized.sessionId,
        filePath,
        normalized.callerAgentId,
        agent,
      )
      if (!lease.ok) {
        appendRunEvent({
          event: 'write-lease-denied',
          sessionId: normalized.sessionId || null,
          role: agent,
          path: filePath,
          holder: lease.holder,
          holderRole: lease.role,
          hookEvent: 'PreToolUse',
        })
        denyPreToolUse(
          `Blocked: \`${lease.role}\` is already writing ${filePath} in this session. Two agents editing one file clobber each other, so the second is stopped rather than allowed to race. Return to the manager with status: blocked (overlapping Writable paths) and let it sequence the edits.`,
        )
        process.exit(0)
      }
    }

    const isKitBash =
      PROJECT_AGENTS.has(agent) && /^Bash$/i.test(normalized.toolName)
    // The main chat is not a kit agent — the human is never gated here.
    const command = isKitBash ? payload.tool_input?.command : ''

    const bypass = isKitBash ? detectTrackerBypass(command) : ''
    if (bypass) {
      denyPreToolUse(
        `Blocked: ${bypass} is a DIY bypass. Issue trackers and standards URLs are MCP-only (see .claude/protocols/ref-resolution.md). Use the tracker's MCP; if it is missing or unauthed, return status: blocked naming the server.`,
      )
      process.exit(0)
    }

    // The Write/Read denies in settings.json never see Bash, so a redirect or
    // `tee` reaches .env unchallenged. Same rule, enforced on the other path.
    const envWrite = isKitBash ? detectEnvWrite(command) : ''
    if (envWrite) {
      appendRunEvent({
        event: 'env-write-blocked',
        sessionId: normalized.sessionId || null,
        agent,
        via: envWrite,
        hookEvent: 'PreToolUse',
      })
      denyPreToolUse(
        `Blocked: writing a .env file via ${envWrite} bypasses the Write deny in .claude/settings.json — the rule is the same on Bash. Secrets are names/refs only, never values in the repo. Need an env var set? Name it in your report and let the user write it.`,
      )
      process.exit(0)
    }

    // Only the manager moves the repo, and only locally: add/commit are
    // recoverable, push/branch/history are the user's call.
    const gitWrite = isKitBash ? detectGitWrite(command) : ''
    const managerMay = agent === MANAGER && MANAGER_GIT_ALLOWED.has(gitWrite)
    if (gitWrite && !managerMay) {
      denyPreToolUse(
        agent === MANAGER
          ? `Blocked: \`git ${gitWrite}\` is the user's to run, not yours. You may \`git add\` and \`git commit\` locally; anything that publishes or rewrites history goes in the Final report as a command for the user.`
          : `Blocked: \`git ${gitWrite}\` — only the manager commits. Return to the manager with status: blocked (or done, with your work left in the tree) and let it integrate.`,
      )
      process.exit(0)
    }

    noop()
    process.exit(0)
  }

  // Named spawns are rejected for everyone, root included. The nest gate
  // exempts root by design, but root is exactly who can create an ungated
  // teammate — which is how a worker once finished having reported nothing.
  if (event === 'PreToolUse' && !normalized.skipGate) {
    const teammate = detectNamedSpawn(payload.tool_input)
    if (teammate) {
      appendRunEvent({
        event: 'named-spawn-blocked',
        sessionId: normalized.sessionId || null,
        role: normalized.callerAgentType || 'root',
        agent: normalized.target || null,
        teammateName: teammate,
        hookEvent: 'PreToolUse',
      })
      denyPreToolUse(
        `Blocked: spawning \`${normalized.target}\` with name: "${teammate}" makes it an addressable teammate, not a subagent. Teammates sit on a flat roster (it could not dispatch specialists) and their agent_type stops matching the SubagentStop matcher, so the worker-report gate would never run and it could finish silently. Drop \`name\`; put \`${normalized.target}: <task>\` in \`description\`.`,
      )
      process.exit(0)
    }
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
  // On PreToolUse the deny reason carries the message to the user. Every other
  // event writes {} and the crash is swallowed whole — log before that happens.
  appendRunEvent({
    event: 'hook-error',
    hookEvent: String(payload.hook_event_name || '') || null,
    sessionId: String(payload.session_id || '') || null,
    agent: String(payload.agent_type || '') || null,
    error: msg,
    stack: err instanceof Error ? err.stack || null : null,
  })
  if (String(payload.hook_event_name || '') === 'PreToolUse') {
    denyPreToolUse(msg)
  } else {
    write({})
  }
}
