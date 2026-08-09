#!/usr/bin/env node
/**
 * Cursor hook adapter for the call-graph gate.
 * Wire via .cursor/hooks.json → node .agents/hooks/adapters/cursor.mjs
 *
 * Denies/throws are always appended to gate-log.jsonl next to agent-roles.json.
 * Set AGENT_KIT_GATE_LOG=1 to also log allow/noop with normalized fields.
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

function gateLogPath() {
  return join(dirname(getStatePath()), 'gate-log.jsonl')
}

function appendGateLog(entry) {
  try {
    const logPath = gateLogPath()
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    /* ignore log failures */
  }
}

function maybeLog(payload, normalized, result) {
  const isDeny = result.action === 'deny'
  if (!isDeny && process.env.AGENT_KIT_GATE_LOG !== '1') return
  appendGateLog({
    ts: new Date().toISOString(),
    event: normalized.event,
    sessionId: normalized.sessionId,
    subagentId: normalized.subagentId,
    toolCallId: normalized.toolCallId,
    target: normalized.target,
    parentConversationId: normalized.parentConversationId,
    conversationId: normalized.conversationId,
    action: result.action,
    message: isDeny ? result.message || null : undefined,
    rawKeys: Object.keys(payload || {}),
  })
}

const raw = await readStdin()
let payload = {}
try {
  payload = raw.trim() ? JSON.parse(raw) : {}
} catch {
  appendGateLog({
    ts: new Date().toISOString(),
    event: 'parse',
    action: 'deny',
    message: 'gate-subagents: invalid JSON on stdin',
  })
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
      includeAgentMessage: normalized.event === 'preToolUse',
    })
    process.exit(0)
  }
  allow()
} catch (err) {
  const message = `gate-subagents: ${err instanceof Error ? err.message : String(err)}`
  appendGateLog({
    ts: new Date().toISOString(),
    event: 'error',
    action: 'deny',
    message,
  })
  deny(message)
}
