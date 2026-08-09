/**
 * Call-graph gate core (tool-agnostic).
 *
 * - root (user / main agent) may spawn manager + workers + built-ins
 * - manager may spawn workers + built-ins
 * - workers may not spawn any subagents (including each other)
 *
 * State: .agents/hooks/state/agent-roles.json (gitignored), or AGENT_KIT_STATE_PATH.
 * Shape: { sessions: { [sessionId]: { roles: { [agentId]: role } } } }
 *
 * Adapters normalize stdin payloads into a common shape and map decisions
 * back to Cursor / Claude hook JSON.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
  statSync,
  rmSync,
  renameSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_STATE_PATH = join(__dirname, 'state', 'agent-roles.json')

/** Resolved each call so tests can set AGENT_KIT_STATE_PATH before load/save. */
export function getStatePath() {
  return process.env.AGENT_KIT_STATE_PATH || DEFAULT_STATE_PATH
}

/** Default on-disk path (ignore AGENT_KIT_STATE_PATH). Prefer getStatePath(). */
export const STATE_PATH = DEFAULT_STATE_PATH

export const MANAGER = 'manager'
export const WORKERS = new Set([
  'planner',
  'frontend',
  'backend',
  'tester',
  'documenter',
  'reviewer',
  'security',
  'devops',
  'infrastructure',
  'risk',
])
export const PROJECT_AGENTS = new Set([MANAGER, ...WORKERS])

const ROOT_ROLE = 'root'
export const FALLBACK_SESSION = '_default'

const DEFAULT_LOCK_TIMEOUT_MS = 2000
const LOCK_RETRY_MS = 15

export function lockTimeoutMs() {
  const raw = process.env.AGENT_KIT_LOCK_TIMEOUT_MS
  if (raw == null || raw === '') return DEFAULT_LOCK_TIMEOUT_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOCK_TIMEOUT_MS
}

export function emptyState() {
  return { sessions: {} }
}

function migrateRaw(raw) {
  if (raw?.sessions && typeof raw.sessions === 'object') {
    return { sessions: raw.sessions }
  }
  if (raw?.roles && typeof raw.roles === 'object') {
    return { sessions: { [FALLBACK_SESSION]: { roles: { ...raw.roles } } } }
  }
  return emptyState()
}

export function loadState() {
  const path = getStatePath()
  try {
    if (!existsSync(path)) return emptyState()
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const migrated = migrateRaw(raw)
    const sessions = {}
    for (const [sid, bucket] of Object.entries(migrated.sessions || {})) {
      sessions[sid] = {
        roles:
          bucket?.roles && typeof bucket.roles === 'object'
            ? { ...bucket.roles }
            : {},
      }
    }
    return { sessions }
  } catch {
    return emptyState()
  }
}

export function saveState(state) {
  const path = getStatePath()
  mkdirSync(dirname(path), { recursive: true })
  const sessions = {}
  for (const [sid, bucket] of Object.entries(state.sessions || {})) {
    sessions[sid] = { roles: { ...(bucket.roles || {}) } }
  }
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ sessions }, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

export function lockPath() {
  return `${getStatePath()}.lockdir`
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(sab), 0, 0, ms)
}

/**
 * Exclusive lock around load→mutate→save (Cursor + Claude adapters share state).
 * Uses mkdir (atomic) rather than open(wx). Fail-closed on timeout — does not steal.
 */
export function withStateLock(fn) {
  const path = lockPath()
  mkdirSync(dirname(getStatePath()), { recursive: true })
  const start = Date.now()
  const timeout = lockTimeoutMs()
  let held = false
  while (!held) {
    try {
      mkdirSync(path)
      held = true
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err
      if (Date.now() - start > timeout) {
        let staleHint = ''
        try {
          const st = statSync(path)
          staleHint = ` lock_mtime_age_ms=${Date.now() - st.mtimeMs}`
        } catch {
          /* ignore */
        }
        throw new Error(
          `agent-kit gate: state lock timeout after ${timeout}ms (fail-closed; remove orphan ${path} if stuck).${staleHint}`,
        )
      }
      sleepSync(LOCK_RETRY_MS)
    }
  }
  try {
    return fn()
  } finally {
    try {
      rmSync(path, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/** JSONL path for structured run events (gitignored). */
export function getRunEventsPath(date = new Date()) {
  if (process.env.AGENT_KIT_RUN_EVENTS_PATH) {
    return process.env.AGENT_KIT_RUN_EVENTS_PATH
  }
  const day = date.toISOString().slice(0, 10)
  if (process.env.AGENT_KIT_STATE_PATH) {
    return join(dirname(getStatePath()), 'runs', `${day}.jsonl`)
  }
  // .agents/hooks/state → .agents/memory/runs
  return join(__dirname, '..', 'memory', 'runs', `${day}.jsonl`)
}

/**
 * Append one run event. Optional AGENT_KIT_TELEMETRY_URL POST (best-effort, no throw).
 */
export function appendRunEvent(event) {
  if (process.env.AGENT_KIT_RUN_EVENTS === '0') return
  const row = {
    ts: new Date().toISOString(),
    ...event,
  }
  try {
    const path = getRunEventsPath()
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8')
  } catch {
    /* ignore */
  }
  const url = process.env.AGENT_KIT_TELEMETRY_URL
  if (url) {
    try {
      // Fire-and-forget; ignore result (Node 18+ fetch)
      void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(row),
      }).catch(() => {})
    } catch {
      /* ignore */
    }
  }
}

/** Explicit session id only (no conversation fallback). */
export function sessionIdOf(normalized) {
  return normalized.sessionId || FALLBACK_SESSION
}

/**
 * Prefer explicit sessionId; else session that already maps parent/caller/subagent;
 * else conversationId if it is already a session key; else _default.
 */
export function resolveSessionId(state, normalized) {
  if (normalized.sessionId) return normalized.sessionId

  const lookupIds = [
    normalized.parentConversationId,
    normalized.callerAgentId,
    normalized.subagentId,
  ].filter(Boolean)

  for (const [sid, bucket] of Object.entries(state.sessions || {})) {
    const roles = bucket?.roles || {}
    for (const id of lookupIds) {
      if (roles[id]) return sid
    }
  }

  if (
    normalized.conversationId &&
    state.sessions?.[normalized.conversationId]
  ) {
    return normalized.conversationId
  }

  return FALLBACK_SESSION
}

export function ensureSession(state, sessionId) {
  const id = sessionId || FALLBACK_SESSION
  if (!state.sessions[id]) state.sessions[id] = { roles: {} }
  return state.sessions[id]
}

export function rememberRole(state, id, role, sessionId = FALLBACK_SESSION) {
  if (!id || !role) return
  const bucket = ensureSession(state, sessionId)
  bucket.roles[id] = role
}

export function clearRole(state, id, sessionId = FALLBACK_SESSION) {
  if (!id) return
  const bucket = state.sessions[sessionId]
  if (!bucket?.roles?.[id]) return
  delete bucket.roles[id]
}

/**
 * Record child role; alias conversationId → role when it is not the session root.
 */
export function recordChildRole(state, sid, subagentId, role, conversationId) {
  if (!subagentId || !role) return
  rememberRole(state, subagentId, role, sid)
  if (
    !conversationId ||
    conversationId === sid ||
    conversationId === subagentId
  ) {
    return
  }
  const existing = state.sessions[sid]?.roles?.[conversationId]
  if (existing === ROOT_ROLE) return
  rememberRole(state, conversationId, role, sid)
}

export function callerRole(state, ids, sessionId = FALLBACK_SESSION) {
  const roles = ensureSession(state, sessionId).roles
  for (const id of ids) {
    if (id && roles[id]) return roles[id]
  }
  return ROOT_ROLE
}

/**
 * Resolve effective caller role for spawn gating.
 */
export function resolveEffectiveCaller(state, normalized) {
  const typed = normalized.callerAgentType
  if (WORKERS.has(typed) || typed === MANAGER) return typed
  if (typed === ROOT_ROLE || typed === 'root') return ROOT_ROLE

  const sid = resolveSessionId(state, normalized)
  const roles = ensureSession(state, sid).roles

  const parentOrCaller = [
    normalized.callerAgentId,
    normalized.parentConversationId,
  ].filter(Boolean)

  for (const id of parentOrCaller) {
    if (roles[id]) return roles[id]
  }
  if (normalized.sessionId && roles[normalized.sessionId]) {
    return roles[normalized.sessionId]
  }
  if (normalized.conversationId && roles[normalized.conversationId]) {
    return roles[normalized.conversationId]
  }
  // Fail-closed: do not invent root when caller identity is missing/unmapped
  return 'unknown'
}

function emitSpawnDecision(normalized, result, sessionId, callerRoleName) {
  if (result.action !== 'allow' && result.action !== 'deny') return
  appendRunEvent({
    event: result.action === 'deny' ? 'deny' : 'allow',
    sessionId: sessionId || FALLBACK_SESSION,
    role: callerRoleName || null,
    agent: normalized.target || null,
    status: result.action,
    hookEvent: normalized.event || null,
  })
}

export function normalizeCursorPayload(payload) {
  const event = String(payload.hook_event_name || '')
  const target = extractCursorTaskType(payload)
  const toolCallId = payload.tool_call_id ? String(payload.tool_call_id) : ''
  const subagentId = payload.subagent_id
    ? String(payload.subagent_id)
    : toolCallId
  let sessionId = payload.session_id ? String(payload.session_id) : ''
  if (
    !sessionId &&
    (event === 'sessionStart' || event === 'sessionEnd') &&
    payload.conversation_id
  ) {
    sessionId = String(payload.conversation_id)
  }
  return {
    event,
    target,
    conversationId: payload.conversation_id || '',
    parentConversationId: payload.parent_conversation_id || '',
    subagentId,
    toolCallId,
    callerAgentType: '',
    callerAgentId: '',
    sessionId,
    recordChild: true,
    gateOnStart: true,
  }
}

function extractCursorTaskType(payload) {
  if (payload.subagent_type) return String(payload.subagent_type)
  const input = payload.tool_input ?? payload.input ?? {}
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      return parsed.subagent_type ? String(parsed.subagent_type) : ''
    } catch {
      return ''
    }
  }
  if (input && typeof input === 'object' && input.subagent_type) {
    return String(input.subagent_type)
  }
  return ''
}

function extractClaudeSpawnTarget(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return ''
  if (toolInput.subagent_type) return String(toolInput.subagent_type)
  if (toolInput.agent_type) return String(toolInput.agent_type)
  if (typeof toolInput.description === 'string') {
    const m = toolInput.description.match(/^([a-z0-9-]+)\s*:/i)
    if (m) return m[1].toLowerCase()
  }
  return ''
}

export function normalizeClaudePayload(payload) {
  const event = String(payload.hook_event_name || '')
  const toolName = String(payload.tool_name || '')
  const base = {
    event,
    conversationId: payload.session_id || '',
    parentConversationId: '',
    subagentId: payload.agent_id || '',
    toolCallId: '',
    callerAgentType: String(payload.agent_type || ''),
    callerAgentId: String(payload.agent_id || ''),
    sessionId: payload.session_id || '',
    toolName,
    gateOnStart: false,
  }

  if (event === 'SubagentStart' || event === 'SubagentStop') {
    return { ...base, target: String(payload.agent_type || '') }
  }

  if (event === 'PreToolUse') {
    const isSpawnTool = /^(Agent|Task)$/i.test(toolName)
    if (!isSpawnTool) {
      return { ...base, target: '', skipGate: true, recordChild: false }
    }
    return {
      ...base,
      subagentId: '',
      target: extractClaudeSpawnTarget(payload.tool_input),
      skipGate: false,
      recordChild: false,
    }
  }

  return { ...base, target: '', recordChild: false }
}

function isSessionStart(event) {
  return event === 'sessionStart' || event === 'SessionStart'
}

function isSessionEnd(event) {
  return event === 'sessionEnd' || event === 'SessionEnd'
}

function isSubagentStart(event) {
  return event === 'subagentStart' || event === 'SubagentStart'
}

function isSubagentStop(event) {
  return event === 'subagentStop' || event === 'SubagentStop'
}

function clearIds(normalized, sid) {
  const ids = [normalized.subagentId, normalized.toolCallId]
  if (
    normalized.conversationId &&
    normalized.conversationId !== sid
  ) {
    ids.push(normalized.conversationId)
  }
  return ids.filter(Boolean)
}

function denyNestMessage(effectiveRole) {
  const who =
    effectiveRole === 'unknown'
      ? 'unknown caller (parent/caller id not in role map)'
      : `worker \`${effectiveRole}\``
  return `Blocked: ${who} cannot spawn subagents. Return to manager with status: blocked (nesting/policy) — manager re-dispatches.`
}

function maybeDenySpawn(state, normalized) {
  const effectiveRole = resolveEffectiveCaller(state, normalized)
  if (WORKERS.has(effectiveRole) || effectiveRole === 'unknown') {
    return {
      action: 'deny',
      message: denyNestMessage(effectiveRole),
    }
  }
  return null
}

function decideUnlocked(normalized) {
  const state = loadState()
  const event = normalized.event

  if (isSessionStart(event)) {
    const id =
      normalized.sessionId ||
      (normalized.conversationId && normalized.conversationId) ||
      ''
    if (id) {
      ensureSession(state, id)
      rememberRole(state, id, ROOT_ROLE, id)
      saveState(state)
    }
    return {
      action: 'noop',
      record: id ? { id, role: ROOT_ROLE } : undefined,
    }
  }

  const sid = resolveSessionId(state, normalized)

  if (isSessionEnd(event)) {
    const endId = normalized.sessionId || normalized.conversationId || sid
    if (state.sessions[endId]) {
      delete state.sessions[endId]
      saveState(state)
    }
    return { action: 'noop', clearId: endId }
  }

  if (isSubagentStop(event)) {
    for (const id of clearIds(normalized, sid)) {
      clearRole(state, id, sid)
    }
    saveState(state)
    return { action: 'noop', clearId: normalized.subagentId || '' }
  }

  if (isSubagentStart(event)) {
    if (normalized.gateOnStart) {
      const effectiveRole = resolveEffectiveCaller(state, normalized)
      const denied = maybeDenySpawn(state, normalized)
      if (denied) {
        emitSpawnDecision(normalized, denied, sid, effectiveRole)
        return denied
      }
    }
    const role = normalized.target
    const id = normalized.subagentId
    if (PROJECT_AGENTS.has(role) && id) {
      // Alias conversationId here (child conv), not on preToolUse (caller conv)
      recordChildRole(state, sid, id, role, normalized.conversationId)
      saveState(state)
    }
    if (normalized.gateOnStart) {
      const allowed = {
        action: 'allow',
        record: id && role ? { id, role } : undefined,
      }
      emitSpawnDecision(
        normalized,
        allowed,
        sid,
        resolveEffectiveCaller(state, normalized),
      )
      return allowed
    }
    return {
      action: 'noop',
      record: id && role ? { id, role } : undefined,
    }
  }

  if (normalized.skipGate) {
    return { action: 'allow' }
  }

  const effectiveRole = resolveEffectiveCaller(state, normalized)
  const denied = maybeDenySpawn(state, normalized)
  if (denied) {
    emitSpawnDecision(normalized, denied, sid, effectiveRole)
    return denied
  }

  const target = normalized.target
  const subagentId = normalized.subagentId
  if (
    normalized.recordChild !== false &&
    PROJECT_AGENTS.has(target) &&
    subagentId
  ) {
    // preToolUse conversation_id is the caller — do not alias it to the child
    rememberRole(state, subagentId, target, sid)
    saveState(state)
  }

  const allowed = { action: 'allow' }
  emitSpawnDecision(normalized, allowed, sid, effectiveRole)
  return allowed
}

/**
 * @returns {{ action: 'allow'|'deny'|'noop', message?: string, record?: { id: string, role: string }, clearId?: string }}
 */
export function decide(normalized) {
  return withStateLock(() => decideUnlocked(normalized))
}

export async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => resolve(chunks.join('')))
    process.stdin.on('error', reject)
  })
}
