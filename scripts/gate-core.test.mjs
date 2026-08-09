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
import { spawn } from 'node:child_process'
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
  FALLBACK_SESSION,
  lockPath,
} from '../.agents/hooks/gate-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let tmpStateDir = ''

beforeEach(() => {
  tmpStateDir = mkdtempSync(join(tmpdir(), 'kit-gate-'))
  process.env.AGENT_KIT_STATE_PATH = join(tmpStateDir, 'agent-roles.json')
  process.env.AGENT_KIT_RUN_EVENTS = '0'
  saveState(emptyState())
})

afterEach(() => {
  delete process.env.AGENT_KIT_STATE_PATH
  delete process.env.AGENT_KIT_LOCK_TIMEOUT_MS
  delete process.env.AGENT_KIT_RUN_EVENTS
  delete process.env.AGENT_KIT_RUN_EVENTS_PATH
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
  decide({
    event: 'sessionStart',
    sessionId: 's1',
    conversationId: 's1',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
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

test('unmapped parent with empty map fails closed (no root invent)', () => {
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
  assert.equal(d.action, 'deny')
  assert.match(d.message, /unknown/i)
})

test('resolveEffectiveCaller: empty parent without map is unknown', () => {
  assert.equal(
    resolveEffectiveCaller(emptyState(), {
      callerAgentType: '',
      callerAgentId: '',
      parentConversationId: '',
      conversationId: 'sess',
      sessionId: 'sess',
    }),
    'unknown',
  )
})

test('resolveEffectiveCaller: sessionId mapped to root allows', () => {
  const state = emptyState()
  rememberRole(state, 'sess', 'root', 'sess')
  assert.equal(
    resolveEffectiveCaller(state, {
      callerAgentType: '',
      callerAgentId: '',
      parentConversationId: '',
      conversationId: 'other',
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

test('Cursor fixture: root → manager → worker → deny nest; stop clears; conv aliases', () => {
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
  assert.equal(rolesOf(sid)['mgr-conv'], MANAGER)

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
      parent_conversation_id: 'mgr-conv',
      subagent_id: 'fe-1',
      subagent_type: 'frontend',
    }),
  )
  assert.equal(rolesOf(sid)['fe-1'], 'frontend')
  assert.equal(rolesOf(sid)['fe-conv'], 'frontend')

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
    assert.match(body, /evidence|verificationResult/, `${name} evidence contract`)
  }
  const mgr = readFileSync(join(agentsDir, 'manager.md'), 'utf8')
  assert.match(mgr, /worker-report|validate-worker-report|JSON fence/i)
  assert.match(mgr, /implement done requires verificationResult pass|pass\+evidence|non-empty `evidence`/i)
})

test('resolveSessionId finds session via parent when session_id omitted', () => {
  decide(
    normalizeCursorPayload({
      hook_event_name: 'sessionStart',
      session_id: 'S1',
      conversation_id: 'S1',
    }),
  )
  decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      session_id: 'S1',
      conversation_id: 'mgr-conv',
      parent_conversation_id: 'S1',
      subagent_id: 'mgr-1',
      subagent_type: 'manager',
    }),
  )
  // No session_id — resolve via parent mgr-1
  const allow = decide(
    normalizeCursorPayload({
      hook_event_name: 'subagentStart',
      conversation_id: 'fe-conv',
      parent_conversation_id: 'mgr-1',
      subagent_id: 'fe-1',
      subagent_type: 'frontend',
    }),
  )
  assert.equal(allow.action, 'allow')
  assert.equal(rolesOf('S1')['fe-1'], 'frontend')
  assert.equal(loadState().sessions[FALLBACK_SESSION], undefined)
})

test('conversation alias allows parent_conversation_id = mgr-conv', () => {
  const sid = 'alias-root'
  decide(
    normalizeCursorPayload({
      hook_event_name: 'sessionStart',
      session_id: sid,
      conversation_id: sid,
    }),
  )
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
  const allow = decide(
    normalizeCursorPayload({
      hook_event_name: 'preToolUse',
      session_id: sid,
      conversation_id: 'fe-conv',
      parent_conversation_id: 'mgr-conv',
      subagent_id: 'fe-1',
      tool_input: { subagent_type: 'frontend' },
    }),
  )
  assert.equal(allow.action, 'allow')
})

test('concurrent decide calls do not corrupt state JSON', async () => {
  decide({
    event: 'sessionStart',
    sessionId: 'conc',
    conversationId: 'conc',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const jobs = []
  for (let i = 0; i < 8; i++) {
    jobs.push(
      Promise.resolve().then(() =>
        decide({
          event: 'subagentStart',
          sessionId: 'conc',
          conversationId: `c-${i}`,
          parentConversationId: 'conc',
          subagentId: `w-${i}`,
          target: 'frontend',
          callerAgentType: '',
          callerAgentId: '',
          gateOnStart: true,
        }),
      ),
    )
  }
  await Promise.all(jobs)
  const raw = readFileSync(getStatePath(), 'utf8')
  assert.doesNotThrow(() => JSON.parse(raw))
  const roles = rolesOf('conc')
  assert.equal(roles.conc, 'root')
  for (let i = 0; i < 8; i++) {
    assert.equal(roles[`w-${i}`], 'frontend')
  }
})

test('withStateLock fail-closed on timeout (no steal)', () => {
  process.env.AGENT_KIT_LOCK_TIMEOUT_MS = '80'
  const path = lockPath()
  mkdirSync(dirname(path), { recursive: true })
  mkdirSync(path)
  try {
    assert.throws(
      () =>
        decide({
          event: 'sessionStart',
          sessionId: 'lock-t',
          conversationId: 'lock-t',
          subagentId: '',
          parentConversationId: '',
          target: '',
          callerAgentType: '',
          callerAgentId: '',
        }),
      /lock timeout|fail-closed/i,
    )
  } finally {
    rmSync(path, { recursive: true, force: true })
  }
})

test('multiprocess decide under shared lock does not corrupt JSON', async () => {
  const statePath = process.env.AGENT_KIT_STATE_PATH
  decide({
    event: 'sessionStart',
    sessionId: 'mp',
    conversationId: 'mp',
    subagentId: '',
    parentConversationId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const worker = `
import { decide } from ${JSON.stringify(join(root, '.agents/hooks/gate-core.mjs'))};
process.env.AGENT_KIT_STATE_PATH = ${JSON.stringify(statePath)};
process.env.AGENT_KIT_RUN_EVENTS = '0';
const i = process.argv[2];
decide({
  event: 'subagentStart',
  sessionId: 'mp',
  conversationId: 'c-' + i,
  parentConversationId: 'mp',
  subagentId: 'w-' + i,
  target: 'frontend',
  callerAgentType: '',
  callerAgentId: '',
  gateOnStart: true,
});
`
  const scriptPath = join(tmpStateDir, 'mp-worker.mjs')
  writeFileSync(scriptPath, worker, 'utf8')
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [scriptPath, String(i)], {
          env: {
            ...process.env,
            AGENT_KIT_STATE_PATH: statePath,
            AGENT_KIT_RUN_EVENTS: '0',
          },
        })
        let err = ''
        child.stderr.on('data', (c) => {
          err += c
        })
        child.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`worker ${i} exited ${code}: ${err}`))
        })
      }),
    ),
  )
  const raw = readFileSync(getStatePath(), 'utf8')
  assert.doesNotThrow(() => JSON.parse(raw))
  const roles = rolesOf('mp')
  assert.equal(roles.mp, 'root')
  for (let i = 0; i < 8; i++) {
    assert.equal(roles[`w-${i}`], 'frontend')
  }
})

test('nest deny appends run event when enabled', () => {
  delete process.env.AGENT_KIT_RUN_EVENTS
  process.env.AGENT_KIT_RUN_EVENTS_PATH = join(tmpStateDir, 'events.jsonl')
  const st = emptyState()
  rememberRole(st, 'ev', 'root', 'ev')
  rememberRole(st, 'fe-1', 'frontend', 'ev')
  saveState(st)
  const d = decide({
    event: 'subagentStart',
    sessionId: 'ev',
    conversationId: 'c',
    parentConversationId: 'fe-1',
    subagentId: 'be-1',
    target: 'backend',
    callerAgentType: '',
    callerAgentId: '',
    gateOnStart: true,
  })
  assert.equal(d.action, 'deny')
  const lines = readFileSync(process.env.AGENT_KIT_RUN_EVENTS_PATH, 'utf8')
    .trim()
    .split('\n')
  const last = JSON.parse(lines.at(-1))
  assert.equal(last.event, 'deny')
  assert.equal(last.agent, 'backend')
})

test('spawn with no session identity fails closed to _default', () => {
  const d = decide({
    event: 'subagentStart',
    sessionId: '',
    conversationId: '',
    parentConversationId: '',
    subagentId: 'x',
    target: 'frontend',
    callerAgentType: '',
    callerAgentId: '',
    gateOnStart: true,
  })
  assert.equal(d.action, 'deny')
})
