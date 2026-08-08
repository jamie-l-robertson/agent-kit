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

export function callerRole(state, ids) {
  for (const id of ids) {
    if (id && state.roles[id]) return state.roles[id]
  }
  return 'root'
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

/**
 * @returns {{ action: 'allow'|'deny'|'noop', message?: string, record?: { id: string, role: string }, clearId?: string }}
 */
export function decide(normalized) {
  const state = loadState()
  const event = normalized.event

  if (event === 'sessionStart' || event === 'SessionStart') {
    return { action: 'noop' }
  }

  if (event === 'sessionEnd' || event === 'SessionEnd' || event === 'SubagentStop') {
    const id = normalized.subagentId || normalized.sessionId || normalized.conversationId
    if (id && state.roles[id]) {
      delete state.roles[id]
      saveState(state)
    }
    return { action: 'noop', clearId: id }
  }

  // Claude SubagentStart cannot block — record role mapping only
  if (event === 'SubagentStart') {
    const id = normalized.subagentId
    const role = normalized.target
    if (PROJECT_AGENTS.has(role) && id) {
      rememberRole(state, id, role)
      saveState(state)
    }
    return { action: 'noop', record: id && role ? { id, role } : undefined }
  }

  if (normalized.skipGate) {
    return { action: 'allow' }
  }

  const role = callerRole(state, [
    normalized.callerAgentId,
    normalized.parentConversationId,
    normalized.conversationId,
  ])
  // Claude: when hook fires inside a subagent, agent_type is the caller
  const effectiveRole =
    WORKERS.has(normalized.callerAgentType) || normalized.callerAgentType === MANAGER
      ? normalized.callerAgentType
      : role

  if (WORKERS.has(effectiveRole)) {
    return {
      action: 'deny',
      message: `Blocked: worker \`${effectiveRole}\` cannot spawn subagents. Return to manager with Status: blocked (nesting/policy) — manager re-dispatches.`,
    }
  }

  const target = normalized.target
  const subagentId = normalized.subagentId
  if (normalized.recordChild !== false && PROJECT_AGENTS.has(target) && subagentId) {
    rememberRole(state, subagentId, target)
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
