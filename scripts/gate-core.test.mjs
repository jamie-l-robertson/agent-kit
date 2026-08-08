import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STATE_PATH,
  emptyState,
  saveState,
  loadState,
  decide,
  resolveEffectiveCaller,
  rememberRole,
  normalizeCursorPayload,
  normalizeClaudePayload,
  MANAGER,
  PROJECT_AGENTS,
} from '../.agents/hooks/gate-core.mjs'

const stateDir = dirname(STATE_PATH)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

beforeEach(() => {
  mkdirSync(stateDir, { recursive: true })
  saveState(emptyState())
})

afterEach(() => {
  if (existsSync(STATE_PATH)) rmSync(STATE_PATH, { force: true })
})

test('root may spawn manager', () => {
  const d = decide({
    event: 'preToolUse',
    target: MANAGER,
    conversationId: 'root-1',
    parentConversationId: '',
    subagentId: 'mgr-1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'allow')
  assert.equal(loadState().roles['mgr-1'], MANAGER)
})

test('manager may spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'mgr-1', MANAGER)
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'frontend',
    conversationId: 'c',
    parentConversationId: 'mgr-1',
    subagentId: 'fe-1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'allow')
  assert.equal(loadState().roles['fe-1'], 'frontend')
})

test('worker cannot spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend')
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'backend',
    conversationId: 'c',
    parentConversationId: 'fe-1',
    subagentId: 'be-1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'deny')
  assert.match(d.message, /status: blocked/)
})

test('unknown parent id fails closed when role map is non-empty', () => {
  const state = emptyState()
  rememberRole(state, 'root-sess', 'root')
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'frontend',
    conversationId: 'c',
    parentConversationId: 'ghost-parent',
    subagentId: 'fe-x',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'deny')
  assert.match(d.message, /unknown/i)
})

test('unmapped parent with empty map bootstraps as root', () => {
  const d = decide({
    event: 'preToolUse',
    target: MANAGER,
    conversationId: 'c',
    parentConversationId: 'ghost-parent',
    subagentId: 'mgr-x',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'allow')
})

test('resolveEffectiveCaller: empty parent is root', () => {
  assert.equal(
    resolveEffectiveCaller(emptyState(), {
      callerAgentType: '',
      callerAgentId: '',
      parentConversationId: '',
      conversationId: 'sess',
    }),
    'root',
  )
})

test('SubagentStop clears role', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend')
  saveState(state)
  decide({
    event: 'SubagentStop',
    subagentId: 'fe-1',
    conversationId: '',
    parentConversationId: '',
    target: 'frontend',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(loadState().roles['fe-1'], undefined)
})

test('subagentStop camelCase clears role', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend')
  rememberRole(state, 'fe-conv', 'frontend')
  saveState(state)
  decide({
    event: 'subagentStop',
    subagentId: 'fe-1',
    conversationId: 'fe-conv',
    parentConversationId: '',
    target: 'frontend',
    callerAgentType: '',
    callerAgentId: '',
  })
  const roles = loadState().roles
  assert.equal(roles['fe-1'], undefined)
  assert.equal(roles['fe-conv'], undefined)
})

test('sessionStart seeds root; sessionEnd wipes map', () => {
  decide({
    event: 'sessionStart',
    sessionId: 'sess-abc',
    conversationId: 'sess-abc',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(loadState().roles['sess-abc'], 'root')

  rememberRole(loadState(), 'mgr-1', MANAGER)
  const s = loadState()
  rememberRole(s, 'mgr-1', MANAGER)
  saveState(s)

  decide({
    event: 'sessionEnd',
    sessionId: 'sess-abc',
    conversationId: 'sess-abc',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.deepEqual(loadState().roles, {})
})

test('corrupt state file loads as empty', () => {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(STATE_PATH, '{not-json', 'utf8')
  const s = loadState()
  assert.deepEqual(s.roles, {})
})

test('Cursor fixture: root → manager → worker → deny nest; stop clears', () => {
  // sessionStart seeds root
  decide(
    normalizeCursorPayload({
      hook_event_name: 'sessionStart',
      conversation_id: 'root-conv',
      session_id: 'root-conv',
    }),
  )
  assert.equal(loadState().roles['root-conv'], 'root')

  // subagentStart manager under root
  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      conversation_id: 'mgr-conv',
      parent_conversation_id: 'root-conv',
      subagent_id: 'mgr-1',
      subagent_type: 'manager',
    }),
  )
  assert.equal(loadState().roles['mgr-1'], MANAGER)
  assert.equal(loadState().roles['mgr-conv'], MANAGER)

  // manager spawns frontend (preToolUse Task)
  const allowFe = decide(
    normalizeCursorPayload({
      hook_event_name: 'preToolUse',
      conversation_id: 'mgr-conv',
      parent_conversation_id: 'mgr-1',
      subagent_id: 'fe-1',
      tool_input: { subagent_type: 'frontend' },
    }),
  )
  assert.equal(allowFe.action, 'allow')

  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      conversation_id: 'fe-conv',
      parent_conversation_id: 'mgr-conv',
      subagent_id: 'fe-1',
      subagent_type: 'frontend',
    }),
  )
  assert.equal(loadState().roles['fe-1'], 'frontend')

  // worker cannot nest
  const denyNest = decide(
    normalizeCursorPayload({
      hook_event_name: 'preToolUse',
      conversation_id: 'fe-conv',
      parent_conversation_id: 'fe-1',
      subagent_id: 'be-1',
      tool_input: { subagent_type: 'backend' },
    }),
  )
  assert.equal(denyNest.action, 'deny')

  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStop',
      conversation_id: 'fe-conv',
      subagent_id: 'fe-1',
      subagent_type: 'frontend',
    }),
  )
  assert.equal(loadState().roles['fe-1'], undefined)
  assert.equal(loadState().roles['fe-conv'], undefined)
})

test('Claude fixture: root → manager → frontend allow; nest deny; stop clears', () => {
  decide(
    normalizeClaudePayload({
      hook_event_name: 'SessionStart',
      session_id: 'claude-sess',
    }),
  )
  // SessionStart not historically wired — use empty caller PreToolUse as root
  const allowMgr = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      session_id: 'claude-sess',
      tool_input: { subagent_type: 'manager' },
    }),
  )
  assert.equal(allowMgr.action, 'allow')

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStart',
      agent_id: 'mgr-1',
      agent_type: 'manager',
      session_id: 'claude-sess',
    }),
  )
  assert.equal(loadState().roles['mgr-1'], MANAGER)

  const allowFe = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      agent_id: 'mgr-1',
      agent_type: 'manager',
      session_id: 'claude-sess',
      tool_input: { subagent_type: 'frontend' },
    }),
  )
  assert.equal(allowFe.action, 'allow')

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStart',
      agent_id: 'fe-1',
      agent_type: 'frontend',
      session_id: 'claude-sess',
    }),
  )

  const denyNest = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      agent_id: 'fe-1',
      agent_type: 'frontend',
      session_id: 'claude-sess',
      tool_input: { subagent_type: 'backend' },
    }),
  )
  assert.equal(denyNest.action, 'deny')

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStop',
      agent_id: 'fe-1',
      agent_type: 'frontend',
      session_id: 'claude-sess',
    }),
  )
  assert.equal(loadState().roles['fe-1'], undefined)

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SessionEnd',
      session_id: 'claude-sess',
    }),
  )
  assert.deepEqual(loadState().roles, {})
})

test('Copilot synced agents include nesting forbid + worker-report markers', () => {
  const agentsDir = join(root, '.github', 'agents')
  for (const name of PROJECT_AGENTS) {
    if (name === MANAGER) continue
    const body = readFileSync(join(agentsDir, `${name}.md`), 'utf8')
    assert.match(body, /No nesting|cannot spawn|Do not spawn/i, name)
    assert.match(body, /worker-report|humanApprove|verificationResult|"status"/i, name)
  }
  const mgr = readFileSync(join(agentsDir, 'manager.md'), 'utf8')
  assert.match(mgr, /worker-report|validate-worker-report|JSON fence/i)
})
