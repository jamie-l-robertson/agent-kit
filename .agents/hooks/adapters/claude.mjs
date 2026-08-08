#!/usr/bin/env node
/**
 * Claude Code hook adapter for the call-graph gate.
 * Wire via .claude/settings.json → node .agents/hooks/adapters/claude.mjs
 *
 * PreToolUse can deny Agent/Task spawns. SubagentStart cannot block — it only
 * records agent_id → agent_type for later PreToolUse checks.
 */

import {
  readStdin,
  normalizeClaudePayload,
  decide,
} from '../gate-core.mjs'

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

function allowPreToolUse() {
  write({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  })
}

function noop() {
  write({})
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
  const result = decide(normalized)

  if (event === 'PreToolUse') {
    if (result.action === 'deny') {
      denyPreToolUse(result.message || 'Blocked by call-graph gate')
    } else {
      allowPreToolUse()
    }
    process.exit(0)
  }

  // SubagentStart / SubagentStop / SessionEnd — record/clear only
  noop()
} catch (err) {
  const msg = `gate-subagents: ${err instanceof Error ? err.message : String(err)}`
  if (String(payload.hook_event_name || '') === 'PreToolUse') {
    denyPreToolUse(msg)
  } else {
    write({})
  }
}
