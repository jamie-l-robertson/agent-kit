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

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
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
const FALLBACK_SESSION = '_default'

export function emptyState() {
  return { sessions: {} }
}

function migrateRaw(raw) {
  if (raw?.sessions && typeof raw.sessions === 'object') {
    return { sessions: raw.sessions }
  }
  // Legacy flat { roles } → single fallback session
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
  writeFileSync(path, `${JSON.stringify({ sessions }, null, 2)}\n`, 'utf8')
}

export function sessionIdOf(normalized) {
  return normalized.sessionId || normalized.conversationId || FALLBACK_SESSION
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

export function callerRole(state, ids, sessionId = FALLBACK_SESSION) {
  const roles = ensureSession(state, sessionId).roles
  for (const id of ids) {
    if (id && roles[id]) return roles[id]
  }
  return ROOT_ROLE
}

/**
 * Resolve effective caller role for spawn gating.
 * - Claude callerAgentType wins when it is manager/worker
 * - Mapped parent/caller/conversation ids → that role
 * - Unmapped parent/caller + empty role map → `root` (bootstrap; avoids deny-all)
 * - Unmapped parent/caller + non-empty map → `unknown` (fail closed)
 * - No parent/caller id → `root`
 */
export function resolveEffectiveCaller(state, normalized) {
  const typed = normalized.callerAgentType
  if (WORKERS.has(typed) || typed === MANAGER) return typed

  const sid = sessionIdOf(normalized)
  const roles = ensureSession(state, sid).roles

  const parentOrCaller = [
    normalized.callerAgentId,
    normalized.parentConversationId,
  ].filter(Boolean)

  for (const id of parentOrCaller) {
    if (roles[id]) return roles[id]
  }
  if (normalized.conversationId && roles[normalized.conversationId]) {
    return roles[normalized.conversationId]
  }
  if (parentOrCaller.length > 0) {
    return Object.keys(roles).length === 0 ? ROOT_ROLE : 'unknown'
  }
  return ROOT_ROLE
}

/**
 * Normalize a tool-specific payload into:
 * {
 *   event: string,
 *   target: string,
 *   conversationId: string,
 *   parentConversationId: string,
 *   subagentId: string,
 *   callerAgentType: string,
 *   callerAgentId: string,
 *   sessionId: string,
 *   toolCallId: string,
 * }
 */
export function normalizeCursorPayload(payload) {
  const event = String(payload.hook_event_name || '')
  const target = extractCursorTaskType(payload)
  const toolCallId = payload.tool_call_id ? String(payload.tool_call_id) : ''
  const subagentId = payload.subagent_id
    ? String(payload.subagent_id)
    : toolCallId
  // Prefer host session_id. sessionStart/End may only send conversation_id.
  // Other events without session_id share FALLBACK_SESSION (document caveat).
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
    // Never stamp child role onto conversation_id (parent/session id)
    recordChild: true,
    stampConversationId: false,
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
    stampConversationId: false,
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
      // agent_id on PreToolUse is the caller, not the child — do not record
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

function clearIds(normalized) {
  return [normalized.subagentId, normalized.toolCallId].filter(Boolean)
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

/**
 * @returns {{ action: 'allow'|'deny'|'noop', message?: string, record?: { id: string, role: string }, clearId?: string }}
 */
export function decide(normalized) {
  const state = loadState()
  const event = normalized.event
  const sid = sessionIdOf(normalized)

  if (isSessionStart(event)) {
    const id = sid === FALLBACK_SESSION ? '' : sid
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

  if (isSessionEnd(event)) {
    if (state.sessions[sid]) {
      delete state.sessions[sid]
      saveState(state)
    }
    return { action: 'noop', clearId: sid }
  }

  if (isSubagentStop(event)) {
    for (const id of clearIds(normalized)) {
      clearRole(state, id, sid)
    }
    saveState(state)
    return { action: 'noop', clearId: normalized.subagentId || '' }
  }

  // SubagentStart — Cursor can deny; Claude records only (gateOnStart false)
  if (isSubagentStart(event)) {
    if (normalized.gateOnStart) {
      const denied = maybeDenySpawn(state, normalized)
      if (denied) return denied
    }
    const role = normalized.target
    const id = normalized.subagentId
    if (PROJECT_AGENTS.has(role) && id) {
      rememberRole(state, id, role, sid)
      if (normalized.stampConversationId && normalized.conversationId) {
        rememberRole(state, normalized.conversationId, role, sid)
      }
      saveState(state)
    }
    if (normalized.gateOnStart) {
      return {
        action: 'allow',
        record: id && role ? { id, role } : undefined,
      }
    }
    return {
      action: 'noop',
      record: id && role ? { id, role } : undefined,
    }
  }

  if (normalized.skipGate) {
    return { action: 'allow' }
  }

  const denied = maybeDenySpawn(state, normalized)
  if (denied) return denied

  const target = normalized.target
  const subagentId = normalized.subagentId
  if (
    normalized.recordChild !== false &&
    PROJECT_AGENTS.has(target) &&
    subagentId
  ) {
    rememberRole(state, subagentId, target, sid)
    if (normalized.stampConversationId && normalized.conversationId) {
      rememberRole(state, normalized.conversationId, target, sid)
    }
    saveState(state)
  }

  return { action: 'allow' }
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
