#!/usr/bin/env node
/**
 * Cursor hook adapter for the call-graph gate.
 * Wire via .cursor/hooks.json → node .agents/hooks/adapters/cursor.mjs
 *
 * Set AGENT_KIT_GATE_LOG=1 to append normalized payloads + decisions under
 * .agents/hooks/state/gate-log.jsonl (or next to AGENT_KIT_STATE_PATH).
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  readStdin,
  normalizeCursorPayload,
  decide,
  getStatePath,
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

function maybeLog(payload, normalized, result) {
  if (process.env.AGENT_KIT_GATE_LOG !== '1') return
  try {
    const logPath = join(dirname(getStatePath()), 'gate-log.jsonl')
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(
      logPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        event: normalized.event,
        sessionId: normalized.sessionId,
        subagentId: normalized.subagentId,
        toolCallId: normalized.toolCallId,
        target: normalized.target,
        parentConversationId: normalized.parentConversationId,
        conversationId: normalized.conversationId,
        action: result.action,
        rawKeys: Object.keys(payload || {}),
      })}\n`,
      'utf8',
    )
  } catch {
    /* ignore log failures */
  }
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
  maybeLog(payload, normalized, result)

  if (result.action === 'noop') {
    noop()
    process.exit(0)
  }
  if (result.action === 'deny') {
    deny(result.message, {
      includeAgentMessage:
        normalized.event === 'preToolUse' ||
        normalized.event === 'subagentStart',
    })
    process.exit(0)
  }
  allow()
} catch (err) {
  deny(`gate-subagents: ${err instanceof Error ? err.message : String(err)}`)
}
