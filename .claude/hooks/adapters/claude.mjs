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
} from '../gate-core.mjs'
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

const REPORT_HINT =
  'End your final message with a fenced JSON worker-report matching .claude/schemas/worker-report.schema.json (see .claude/protocols/worker-report.md).'

/**
 * Validate a kit worker's final message. Blocks until the fence is valid,
 * then goes advisory so a bad worker cannot burn the session.
 * @returns {boolean} true when handled (output written)
 */
function handleSubagentStop(payload) {
  const agentType = String(payload.agent_type || '')
  if (!PROJECT_AGENTS.has(agentType)) return false

  const sessionId = String(payload.session_id || '')
  const agentId = String(payload.agent_id || '')
  const report = extractWorkerReportJson(
    String(payload.last_assistant_message || ''),
  )
  const result = report
    ? validateWorkerReport(report)
    : { ok: false, errors: ['missing worker-report JSON fence'] }

  if (result.ok) {
    appendRunEvent({
      event: 'report-ok',
      sessionId: sessionId || null,
      role: agentType,
      agent: agentType,
      status: 'ok',
      hookEvent: 'SubagentStop',
    })
    return false
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
    return true
  }

  write({ decision: 'block', reason: detail })
  return true
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

  if (event === 'SubagentStop' && handleSubagentStop(payload)) {
    // Blocked or advisory — leave the role mapping in place for the retry.
    process.exit(0)
  }

  const result = decide(normalized)

  if (event === 'PreToolUse') {
    if (result.action === 'deny') {
      denyPreToolUse(result.message || 'Blocked by call-graph gate')
    } else {
      // Never force-allow: let normal permission handling run.
      noop()
    }
    process.exit(0)
  }

  // Name the specialist the moment it starts, so "dispatched" is never anonymous
  // even when the spawn title is vague.
  if (event === 'SubagentStart' && PROJECT_AGENTS.has(normalized.target)) {
    write({ systemMessage: `▶ ${normalized.target} started` })
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
