import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  mkdtempSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_STATE_PATH,
  getStatePath,
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let tmpStateDir = ''

beforeEach(() => {
  tmpStateDir = mkdtempSync(join(tmpdir(), 'kit-gate-'))
  process.env.AGENT_KIT_STATE_PATH = join(tmpStateDir, 'agent-roles.json')
  saveState(emptyState())
})

afterEach(() => {
  delete process.env.AGENT_KIT_STATE_PATH
  if (tmpStateDir && existsSync(tmpStateDir)) {
    rmSync(tmpStateDir, { recursive: true, force: true })
  }
})

function rolesOf(sessionId) {
  return loadState().sessions[sessionId]?.roles || {}
}

test('getStatePath honors AGENT_KIT_STATE_PATH', () => {
  assert.equal(getStatePath(), process.env.AGENT_KIT_STATE_PATH)
})

test('root may spawn manager', () => {
  const d = decide({
    event: 'preToolUse',
    target: MANAGER,
    conversationId: 'root-1',
    parentConversationId: '',
    subagentId: 'mgr-1',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'allow')
  assert.equal(rolesOf('s1')['mgr-1'], MANAGER)
})

test('manager may spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'mgr-1', MANAGER, 's1')
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'frontend',
    conversationId: 'c',
    parentConversationId: 'mgr-1',
    subagentId: 'fe-1',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'allow')
  assert.equal(rolesOf('s1')['fe-1'], 'frontend')
})

test('worker cannot spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend', 's1')
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'backend',
    conversationId: 'c',
    parentConversationId: 'fe-1',
    subagentId: 'be-1',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'deny')
  assert.match(d.message, /status: blocked/)
})

test('unknown parent id fails closed when role map is non-empty', () => {
  const state = emptyState()
  rememberRole(state, 'root-sess', 'root', 's1')
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'frontend',
    conversationId: 'c',
    parentConversationId: 'ghost-parent',
    subagentId: 'fe-x',
    sessionId: 's1',
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
    sessionId: 's1',
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
      sessionId: 'sess',
    }),
    'root',
  )
})

test('SubagentStop clears role', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend', 's1')
  saveState(state)
  decide({
    event: 'SubagentStop',
    subagentId: 'fe-1',
    conversationId: '',
    parentConversationId: '',
    sessionId: 's1',
    target: 'frontend',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(rolesOf('s1')['fe-1'], undefined)
})

test('subagentStop camelCase clears role via tool_call_id when no subagent_id', () => {
  const state = emptyState()
  rememberRole(state, 'tc-99', 'frontend', 's1')
  saveState(state)
  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStop',
      session_id: 's1',
      conversation_id: 'fe-conv',
      tool_call_id: 'tc-99',
      subagent_type: 'frontend',
    }),
  )
  assert.equal(rolesOf('s1')['tc-99'], undefined)
})

test('sessionStart seeds root; sessionEnd wipes that session only', () => {
  decide({
    event: 'sessionStart',
    sessionId: 'sess-a',
    conversationId: 'sess-a',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  decide({
    event: 'sessionStart',
    sessionId: 'sess-b',
    conversationId: 'sess-b',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const s = loadState()
  rememberRole(s, 'mgr-1', MANAGER, 'sess-a')
  rememberRole(s, 'mgr-2', MANAGER, 'sess-b')
  saveState(s)

  assert.equal(rolesOf('sess-a')['sess-a'], 'root')
  assert.equal(rolesOf('sess-a')['mgr-1'], MANAGER)
  assert.equal(rolesOf('sess-b')['mgr-2'], MANAGER)

  decide({
    event: 'sessionEnd',
    sessionId: 'sess-a',
    conversationId: 'sess-a',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(loadState().sessions['sess-a'], undefined)
  assert.equal(rolesOf('sess-b')['mgr-2'], MANAGER)
})

test('two sessions stay isolated for nest deny', () => {
  decide(
    normalizeCursorPayload({
      hook_event_name: 'sessionStart',
      session_id: 'A',
      conversation_id: 'A',
    }),
  )
  decide(
    normalizeCursorPayload({
      hook_event_name: 'sessionStart',
      session_id: 'B',
      conversation_id: 'B',
    }),
  )
  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      session_id: 'A',
      conversation_id: 'fe-a',
      parent_conversation_id: 'A',
      subagent_id: 'fe-a',
      subagent_type: 'frontend',
    }),
  )
  // Session B still allows root→manager
  const allowB = decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      session_id: 'B',
      conversation_id: 'mgr-b',
      parent_conversation_id: 'B',
      subagent_id: 'mgr-b',
      subagent_type: 'manager',
    }),
  )
  assert.equal(allowB.action, 'allow')
  // Session A worker cannot nest
  const denyA = decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      session_id: 'A',
      conversation_id: 'be-a',
      parent_conversation_id: 'fe-a',
      subagent_id: 'be-a',
      subagent_type: 'backend',
    }),
  )
  assert.equal(denyA.action, 'deny')
})

test('corrupt state file loads as empty', () => {
  mkdirSync(dirname(getStatePath()), { recursive: true })
  writeFileSync(getStatePath(), '{not-json', 'utf8')
  const s = loadState()
  assert.deepEqual(s.sessions, {})
})

test('Cursor fixture: root → manager → worker → deny nest; stop clears; no conv stamp', () => {
  const sid = 'root-conv'
  decide(
    normalizeCursorPayload({
      hook_event_name: 'sessionStart',
      conversation_id: sid,
      session_id: sid,
    }),
  )
  assert.equal(rolesOf(sid)[sid], 'root')

  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      session_id: sid,
      conversation_id: 'mgr-conv',
      parent_conversation_id: sid,
      subagent_id: 'mgr-1',
      subagent_type: 'manager',
    }),
  )
  assert.equal(rolesOf(sid)['mgr-1'], MANAGER)
  assert.equal(rolesOf(sid)['mgr-conv'], undefined)

  const allowFe = decide(
    normalizeCursorPayload({
      hook_event_name: 'preToolUse',
      session_id: sid,
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
      session_id: sid,
      conversation_id: 'fe-conv',
      parent_conversation_id: 'mgr-1',
      subagent_id: 'fe-1',
      subagent_type: 'frontend',
    }),
  )
  assert.equal(rolesOf(sid)['fe-1'], 'frontend')
  assert.equal(rolesOf(sid)['fe-conv'], undefined)

  const denyNest = decide(
    normalizeCursorPayload({
      hook_event_name: 'preToolUse',
      session_id: sid,
      conversation_id: 'fe-conv',
      parent_conversation_id: 'fe-1',
      subagent_id: 'be-1',
      tool_input: { subagent_type: 'backend' },
    }),
  )
  assert.equal(denyNest.action, 'deny')

  const denyStart = decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      session_id: sid,
      conversation_id: 'be-conv',
      parent_conversation_id: 'fe-1',
      subagent_id: 'be-1',
      subagent_type: 'backend',
    }),
  )
  assert.equal(denyStart.action, 'deny')

  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStop',
      session_id: sid,
      conversation_id: 'fe-conv',
      subagent_id: 'fe-1',
      subagent_type: 'frontend',
    }),
  )
  assert.equal(rolesOf(sid)['fe-1'], undefined)
})

test('Claude fixture: root → manager → frontend allow; nest deny; stop clears; session wipe', () => {
  const sid = 'claude-sess'
  decide(
    normalizeClaudePayload({
      hook_event_name: 'SessionStart',
      session_id: sid,
    }),
  )
  assert.equal(rolesOf(sid)[sid], 'root')

  const allowMgr = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      session_id: sid,
      tool_input: { subagent_type: 'manager' },
    }),
  )
  assert.equal(allowMgr.action, 'allow')

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStart',
      agent_id: 'mgr-1',
      agent_type: 'manager',
      session_id: sid,
    }),
  )
  assert.equal(rolesOf(sid)['mgr-1'], MANAGER)
  assert.equal(rolesOf(sid)[sid], 'root')

  const allowFe = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      agent_id: 'mgr-1',
      agent_type: 'manager',
      session_id: sid,
      tool_input: { subagent_type: 'frontend' },
    }),
  )
  assert.equal(allowFe.action, 'allow')

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStart',
      agent_id: 'fe-1',
      agent_type: 'frontend',
      session_id: sid,
    }),
  )

  const denyNest = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      agent_id: 'fe-1',
      agent_type: 'frontend',
      session_id: sid,
      tool_input: { subagent_type: 'backend' },
    }),
  )
  assert.equal(denyNest.action, 'deny')

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStop',
      agent_id: 'fe-1',
      agent_type: 'frontend',
      session_id: sid,
    }),
  )
  assert.equal(rolesOf(sid)['fe-1'], undefined)

  decide(
    normalizeClaudePayload({
      hook_event_name: 'SessionEnd',
      session_id: sid,
    }),
  )
  assert.equal(loadState().sessions[sid], undefined)
})

test('tests do not touch DEFAULT_STATE_PATH', () => {
  const before = existsSync(DEFAULT_STATE_PATH)
    ? readFileSync(DEFAULT_STATE_PATH, 'utf8')
    : null
  decide({
    event: 'sessionStart',
    sessionId: 'tmp-only',
    conversationId: 'tmp-only',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const after = existsSync(DEFAULT_STATE_PATH)
    ? readFileSync(DEFAULT_STATE_PATH, 'utf8')
    : null
  assert.equal(after, before)
})

test('Copilot synced agents include nesting forbid + worker-report markers', () => {
  const agentsDir = join(root, '.github', 'agents')
  for (const name of PROJECT_AGENTS) {
    if (name === MANAGER) continue
    const body = readFileSync(join(agentsDir, `${name}.md`), 'utf8')
    assert.match(body, /No nesting|cannot spawn|Do not spawn/i, name)
    assert.match(
      body,
      /```(?:json)?\s*\n[\s\S]*?"status"\s*:/,
      `${name} fence shape`,
    )
  }
  const mgr = readFileSync(join(agentsDir, 'manager.md'), 'utf8')
  assert.match(mgr, /worker-report|validate-worker-report|JSON fence/i)
})
