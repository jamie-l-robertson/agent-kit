/**
 * Call-graph gate core (tool-agnostic).
 *
 * - root (user / main agent) may spawn manager + workers + built-ins
 * - manager may spawn workers + built-ins
 * - workers may not spawn any subagents (including each other)
 *
 * State: .agents/hooks/state/agent-roles.json (gitignored)
 *
 * Adapters normalize stdin payloads into a common shape and map decisions
 * back to Cursor / Claude hook JSON.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const STATE_PATH = join(__dirname, 'state', 'agent-roles.json')

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

export function emptyState() {
  return { roles: {} }
}

export function loadState() {
  try {
    if (!existsSync(STATE_PATH)) return emptyState()
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    return {
      roles: raw?.roles && typeof raw.roles === 'object' ? raw.roles : {},
    }
  } catch {
    return emptyState()
  }
}

export function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, `${JSON.stringify({ roles: state.roles }, null, 2)}\n`, 'utf8')
}

export function rememberRole(state, id, role) {
  if (!id || !role) return
  state.roles[id] = role
}

export function clearRole(state, id) {
  if (!id || !state.roles[id]) return
  delete state.roles[id]
}

export function callerRole(state, ids) {
  for (const id of ids) {
    if (id && state.roles[id]) return state.roles[id]
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

  const parentOrCaller = [
    normalized.callerAgentId,
    normalized.parentConversationId,
  ].filter(Boolean)

  for (const id of parentOrCaller) {
    if (state.roles[id]) return state.roles[id]
  }
  if (
    normalized.conversationId &&
    state.roles[normalized.conversationId]
  ) {
    return state.roles[normalized.conversationId]
  }
  if (parentOrCaller.length > 0) {
    return Object.keys(state.roles).length === 0 ? ROOT_ROLE : 'unknown'
  }
  return ROOT_ROLE
}

/**
 * Normalize a tool-specific payload into:
 * {
 *   event: string,
 *   target: string,          // agent type being spawned
 *   conversationId: string,
 *   parentConversationId: string,
 *   subagentId: string,
 *   callerAgentType: string, // Claude: agent_type of current caller when inside subagent
 *   callerAgentId: string,
 * }
 */
export function normalizeCursorPayload(payload) {
  const event = String(payload.hook_event_name || '')
  const target = extractCursorTaskType(payload)
  return {
    event,
    target,
    conversationId: payload.conversation_id || '',
    parentConversationId: payload.parent_conversation_id || '',
    subagentId: payload.subagent_id || '',
    callerAgentType: '',
    callerAgentId: '',
    sessionId: payload.session_id || payload.conversation_id || '',
    recordChild: true,
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
    callerAgentType: String(payload.agent_type || ''),
    callerAgentId: String(payload.agent_id || ''),
    sessionId: payload.session_id || '',
    toolName,
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

function recordAgentRole(state, normalized, role) {
  const ids = [normalized.subagentId, normalized.conversationId].filter(Boolean)
  for (const id of ids) rememberRole(state, id, role)
  return ids
}

function clearAgentRole(state, normalized) {
  const ids = [normalized.subagentId, normalized.conversationId].filter(Boolean)
  for (const id of ids) clearRole(state, id)
  return ids
}

/**
 * @returns {{ action: 'allow'|'deny'|'noop', message?: string, record?: { id: string, role: string }, clearId?: string }}
 */
export function decide(normalized) {
  const state = loadState()
  const event = normalized.event

  if (isSessionStart(event)) {
    const id =
      normalized.sessionId ||
      normalized.conversationId ||
      normalized.subagentId
    if (id) {
      rememberRole(state, id, ROOT_ROLE)
      saveState(state)
    }
    return {
      action: 'noop',
      record: id ? { id, role: ROOT_ROLE } : undefined,
    }
  }

  if (isSessionEnd(event)) {
    state.roles = {}
    saveState(state)
    return { action: 'noop', clearId: '*' }
  }

  if (isSubagentStop(event)) {
    const cleared = clearAgentRole(state, normalized)
    saveState(state)
    return { action: 'noop', clearId: cleared[0] || '' }
  }

  // SubagentStart (Cursor/Claude) cannot block — record role mapping only
  if (isSubagentStart(event)) {
    const role = normalized.target
    const id = normalized.subagentId
    if (PROJECT_AGENTS.has(role) && id) {
      recordAgentRole(state, normalized, role)
      saveState(state)
    }
    return { action: 'noop', record: id && role ? { id, role } : undefined }
  }

  if (normalized.skipGate) {
    return { action: 'allow' }
  }

  const effectiveRole = resolveEffectiveCaller(state, normalized)

  if (WORKERS.has(effectiveRole) || effectiveRole === 'unknown') {
    const who =
      effectiveRole === 'unknown'
        ? 'unknown caller (parent/caller id not in role map)'
        : `worker \`${effectiveRole}\``
    return {
      action: 'deny',
      message: `Blocked: ${who} cannot spawn subagents. Return to manager with status: blocked (nesting/policy) — manager re-dispatches.`,
    }
  }

  const target = normalized.target
  const subagentId = normalized.subagentId
  if (normalized.recordChild !== false && PROJECT_AGENTS.has(target) && subagentId) {
    rememberRole(state, subagentId, target)
    if (normalized.conversationId) {
      rememberRole(state, normalized.conversationId, target)
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
