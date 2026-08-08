#!/usr/bin/env node
/**
 * Cursor hook adapter for the call-graph gate.
 * Wire via .cursor/hooks.json → node .agents/hooks/adapters/cursor.mjs
 */

import {
  readStdin,
  normalizeCursorPayload,
  decide,
} from '../gate-core.mjs'

function deny(message, { includeAgentMessage = false } = {}) {
  const out = { permission: 'deny', user_message: message }
  if (includeAgentMessage) out.agent_message = message
  process.stdout.write(`${JSON.stringify(out)}\n`)
}

function allow() {
  process.stdout.write(`${JSON.stringify({ permission: 'allow' })}\n`)
}

function noop() {
  process.stdout.write('{}\n')
}

const raw = await readStdin()
let payload = {}
try {
  payload = raw.trim() ? JSON.parse(raw) : {}
} catch {
  deny('gate-subagents: invalid JSON on stdin')
  process.exit(0)
}

try {
  const normalized = normalizeCursorPayload(payload)
  const result = decide(normalized)

  if (result.action === 'noop') {
    noop()
    process.exit(0)
  }
  if (result.action === 'deny') {
    deny(result.message, {
      includeAgentMessage: normalized.event === 'preToolUse',
    })
    process.exit(0)
  }
  allow()
} catch (err) {
  deny(`gate-subagents: ${err instanceof Error ? err.message : String(err)}`)
}
