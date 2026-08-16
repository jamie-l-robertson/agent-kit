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
  normalizeClaudePayload,
  MANAGER,
  PROJECT_AGENTS,
  FALLBACK_SESSION,
  lockPath,
  setPlanPending,
  readPlanApproval,
  approvePlan,
  planGateEnabled,
  PLAN_SUMMARY_MAX,
  detectTrackerBypass,
  detectGitWrite,
  MANAGER_GIT_ALLOWED,
  setGate,
  clearGate,
  readGates,
  MAX_GATE_ROUNDS,
  getRunEventsPath,
  projectRoot,
} from '../.claude/hooks/gate-core.mjs'

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
    event: 'SessionStart',
    sessionId: 's1',
    conversationId: 's1',
    subagentId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const d = decide({
    event: 'PreToolUse',
    target: MANAGER,
    conversationId: 's1',
    subagentId: '',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(d.action, 'allow')
  // Roles land on SubagentStart, not on the spawn request.
  decide({
    event: 'SubagentStart',
    target: MANAGER,
    conversationId: 's1',
    subagentId: 'mgr-1',
    sessionId: 's1',
    callerAgentType: MANAGER,
    callerAgentId: 'mgr-1',
  })
  assert.equal(rolesOf('s1')['mgr-1'], MANAGER)
})

test('manager may spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'mgr-1', MANAGER, 's1')
  saveState(state)
  const d = decide({
    event: 'PreToolUse',
    target: 'frontend',
    conversationId: 's1',
    subagentId: '',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: 'mgr-1',
  })
  assert.equal(d.action, 'allow')
  decide({
    event: 'SubagentStart',
    target: 'frontend',
    conversationId: 's1',
    subagentId: 'fe-1',
    sessionId: 's1',
    callerAgentType: 'frontend',
    callerAgentId: 'fe-1',
  })
  assert.equal(rolesOf('s1')['fe-1'], 'frontend')
})

test('worker cannot spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend', 's1')
  saveState(state)
  const d = decide({
    event: 'PreToolUse',
    target: 'backend',
    conversationId: 's1',
    subagentId: '',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: 'fe-1',
  })
  assert.equal(d.action, 'deny')
  assert.match(d.message, /status: blocked/)
})

test('unknown parent id fails closed when role map is non-empty', () => {
  const state = emptyState()
  rememberRole(state, 'root-sess', 'root', 's1')
  saveState(state)
  const d = decide({
    event: 'PreToolUse',
    target: 'frontend',
    conversationId: 's1',
    subagentId: '',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: 'ghost-parent',
  })
  assert.equal(d.action, 'deny')
  assert.match(d.message, /unknown/i)
})

test('unmapped parent with empty map fails closed (no root invent)', () => {
  const d = decide({
    event: 'PreToolUse',
    target: MANAGER,
    conversationId: 's1',
    subagentId: '',
    sessionId: 's1',
    callerAgentType: '',
    callerAgentId: 'ghost-parent',
  })
  assert.equal(d.action, 'deny')
  assert.match(d.message, /unknown/i)
})

test('resolveEffectiveCaller: empty parent is root (main agent)', () => {
  assert.equal(
    resolveEffectiveCaller(emptyState(), {
      callerAgentType: '',
      callerAgentId: '',
      conversationId: 'sess',
      sessionId: 'sess',
    }),
    'root',
  )
})

test('resolveEffectiveCaller: sessionId mapped to root allows', () => {
  const state = emptyState()
  rememberRole(state, 'sess', 'root', 'sess')
  assert.equal(
    resolveEffectiveCaller(state, {
      callerAgentType: '',
      callerAgentId: '',
      conversationId: 'other',
      sessionId: 'sess',
    }),
    'root',
  )
})

test('main-agent spawn with session root conversation still allows', () => {
  const sid = 'main-root'
  decide(
    normalizeClaudePayload({ hook_event_name: 'SessionStart', session_id: sid }),
  )
  const allow = decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStart',
      session_id: sid,
      agent_id: 'mgr-1',
      agent_type: 'manager',
    }),
  )
  assert.equal(allow.action, 'noop')
  assert.equal(rolesOf(sid)['mgr-1'], MANAGER)
})

test('SubagentStop clears role', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend', 's1')
  saveState(state)
  decide({
    event: 'SubagentStop',
    subagentId: 'fe-1',
    conversationId: '',
    sessionId: 's1',
    target: 'frontend',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(rolesOf('s1')['fe-1'], undefined)
})

test('sessionStart seeds root; sessionEnd wipes that session only', () => {
  decide({
    event: 'SessionStart',
    sessionId: 'sess-a',
    conversationId: 'sess-a',
    subagentId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  decide({
    event: 'SessionStart',
    sessionId: 'sess-b',
    conversationId: 'sess-b',
    subagentId: '',
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
    event: 'SessionEnd',
    sessionId: 'sess-a',
    conversationId: 'sess-a',
    subagentId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(loadState().sessions['sess-a'], undefined)
  assert.equal(rolesOf('sess-b')['mgr-2'], MANAGER)
})

test('two sessions stay isolated for nest deny', () => {
  for (const sid of ['A', 'B']) {
    decide(
      normalizeClaudePayload({ hook_event_name: 'SessionStart', session_id: sid }),
    )
  }
  decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStart',
      session_id: 'A',
      agent_id: 'fe-a',
      agent_type: 'frontend',
    }),
  )
  const startB = decide(
    normalizeClaudePayload({
      hook_event_name: 'SubagentStart',
      session_id: 'B',
      agent_id: 'mgr-b',
      agent_type: 'manager',
    }),
  )
  assert.equal(startB.action, 'noop')
  assert.equal(rolesOf('B')['mgr-b'], MANAGER)

  // A's worker cannot nest...
  const denyA = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      session_id: 'A',
      agent_id: 'fe-a',
      agent_type: 'frontend',
      tool_input: { subagent_type: 'backend' },
    }),
  )
  assert.equal(denyA.action, 'deny')

  // ...and that must not leak into B, where the same id means nothing.
  const allowB = decide(
    normalizeClaudePayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      session_id: 'B',
      agent_id: 'mgr-b',
      agent_type: 'manager',
      tool_input: { subagent_type: 'backend' },
    }),
  )
  assert.equal(allowB.action, 'allow')
  assert.equal(rolesOf('A')['mgr-b'], undefined)
})

test('corrupt state file loads as empty', () => {
  mkdirSync(dirname(getStatePath()), { recursive: true })
  writeFileSync(getStatePath(), '{not-json', 'utf8')
  const s = loadState()
  assert.deepEqual(s.sessions, {})
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
    event: 'SessionStart',
    sessionId: 'tmp-only',
    conversationId: 'tmp-only',
    subagentId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const after = existsSync(DEFAULT_STATE_PATH)
    ? readFileSync(DEFAULT_STATE_PATH, 'utf8')
    : null
  assert.equal(after, before)
})

test('Claude synced agents include nesting forbid + worker-report markers', () => {
  const agentsDir = join(root, '.claude', 'agents')
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

test('resolveSessionId finds the session via the caller when session_id is omitted', () => {
  decide(
    normalizeClaudePayload({ hook_event_name: 'SessionStart', session_id: 'S1' }),
  )
  const state = loadState()
  rememberRole(state, 'mgr-1', MANAGER, 'S1')
  saveState(state)

  // No sessionId on the payload — resolve via the caller id, and do not
  // invent a _default bucket.
  const d = decide({
    event: 'SubagentStart',
    sessionId: '',
    conversationId: '',
    subagentId: 'mgr-1',
    target: MANAGER,
    callerAgentType: MANAGER,
    callerAgentId: 'mgr-1',
  })
  assert.equal(d.action, 'noop')
  assert.equal(rolesOf('S1')['mgr-1'], MANAGER)
  assert.equal(loadState().sessions[FALLBACK_SESSION], undefined)
})

test('concurrent decide calls do not corrupt state JSON', async () => {
  decide({
    event: 'SessionStart',
    sessionId: 'conc',
    conversationId: 'conc',
    subagentId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const jobs = []
  for (let i = 0; i < 8; i++) {
    jobs.push(
      Promise.resolve().then(() =>
        decide({
          event: 'SubagentStart',
          sessionId: 'conc',
          conversationId: `c-${i}`,
          subagentId: `w-${i}`,
          target: 'frontend',
          callerAgentType: '',
          callerAgentId: '',
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
          event: 'SessionStart',
          sessionId: 'lock-t',
          conversationId: 'lock-t',
          subagentId: '',
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
    event: 'SessionStart',
    sessionId: 'mp',
    conversationId: 'mp',
    subagentId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  const worker = `
import { decide } from ${JSON.stringify(join(root, '.claude/hooks/gate-core.mjs'))};
process.env.AGENT_KIT_STATE_PATH = ${JSON.stringify(statePath)};
process.env.AGENT_KIT_RUN_EVENTS = '0';
const i = process.argv[2];
decide({
  event: 'SubagentStart',
  sessionId: 'mp',
  conversationId: 'c-' + i,
  subagentId: 'w-' + i,
  target: 'frontend',
  callerAgentType: '',
  callerAgentId: '',
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
  // The nest gate lives on PreToolUse; SubagentStart is record-only.
  const d = decide({
    event: 'PreToolUse',
    sessionId: 'ev',
    conversationId: 'ev',
    subagentId: '',
    target: 'backend',
    callerAgentType: '',
    callerAgentId: 'fe-1',
  })
  assert.equal(d.action, 'deny')
  const lines = readFileSync(process.env.AGENT_KIT_RUN_EVENTS_PATH, 'utf8')
    .trim()
    .split('\n')
  const last = JSON.parse(lines.at(-1))
  assert.equal(last.event, 'deny')
  assert.equal(last.agent, 'backend')
})

test('planApproval + planSummary survive a subsequent saveState', () => {
  setPlanPending('s1', 'ship the thing')
  // Any later hook event does load → mutate → save; the flag must not be dropped.
  const state = loadState()
  rememberRole(state, 'fe-1', 'frontend', 's1')
  saveState(state)
  assert.deepEqual(readPlanApproval('s1'), {
    planApproval: 'pending',
    planSummary: 'ship the thing',
  })
})

test('planSummary is capped, not widened', () => {
  setPlanPending('s1', 'x'.repeat(PLAN_SUMMARY_MAX + 200))
  assert.equal(readPlanApproval('s1').planSummary.length, PLAN_SUMMARY_MAX)
})

test('approvePlan flips pending → approved and is idempotent', () => {
  setPlanPending('s1', 'plan')
  approvePlan('s1')
  assert.equal(readPlanApproval('s1').planApproval, 'approved')
  approvePlan('s1')
  assert.equal(readPlanApproval('s1').planApproval, 'approved')
})

test('approvePlan on a session with no pending plan stays undefined', () => {
  approvePlan('s-none')
  assert.equal(readPlanApproval('s-none').planApproval, undefined)
})

test('planGateEnabled honors AGENT_KIT_PLAN_GATE=off', () => {
  assert.equal(planGateEnabled(), true)
  process.env.AGENT_KIT_PLAN_GATE = 'off'
  assert.equal(planGateEnabled(), false)
  delete process.env.AGENT_KIT_PLAN_GATE
})

// --- access integrity (Phase 2) ---

test('detectTrackerBypass catches gh issue/api and tracker fetches', () => {
  for (const cmd of [
    'gh issue view 42',
    'gh api repos/o/r/issues/1',
    'cd /tmp && gh   issue list',
    'curl -s https://api.github.com/repos/o/r/issues/1',
    'wget https://acme.atlassian.net/rest/api/3/issue/ABC-1',
    'curl https://api.linear.app/graphql -d @q.json',
    'curl -H auth https://api.notion.com/v1/pages/x',
  ]) {
    assert.ok(detectTrackerBypass(cmd), `should flag: ${cmd}`)
  }
})

test('detectTrackerBypass leaves ordinary commands alone', () => {
  for (const cmd of [
    'gh pr create --fill',
    'gh run watch',
    'npm test',
    'curl -s http://localhost:3000/api/health',
    'git log --oneline -5',
    'echo api.github.com',
  ]) {
    assert.equal(detectTrackerBypass(cmd), '', `should allow: ${cmd}`)
  }
})

// --- audit fix-loop gates (Phase 3) ---

test('gates survive a subsequent saveState', () => {
  setGate('s1', 'review', 'frontend')
  const state = loadState()
  rememberRole(state, 'fe-1', 'frontend', 's1')
  saveState(state)
  assert.deepEqual(readGates('s1'), { review: { rounds: 1, owner: 'frontend' } })
})

test('setGate counts rounds so a loop cannot run forever', () => {
  setGate('s1', 'review', 'frontend')
  setGate('s1', 'review', 'backend')
  assert.deepEqual(readGates('s1').review, { rounds: 2, owner: 'backend' })
})

test('gates are independent and clear independently', () => {
  setGate('s1', 'review', 'frontend')
  setGate('s1', 'test', 'backend')
  setGate('s1', 'secRisk', 'backend')
  assert.deepEqual(Object.keys(readGates('s1')).sort(), ['review', 'secRisk', 'test'])
  clearGate('s1', 'test')
  assert.deepEqual(Object.keys(readGates('s1')).sort(), ['review', 'secRisk'])
  assert.equal(readGates('s1').test, undefined)
})

test('clearGate on an unset gate is a no-op, not a crash', () => {
  clearGate('s-none', 'review')
  assert.deepEqual(readGates('s-none'), {})
})

test('a gate past the round cap is reported, not silently dropped', () => {
  for (let i = 0; i <= MAX_GATE_ROUNDS; i++) setGate('s1', 'review', 'frontend')
  const g = readGates('s1').review
  assert.ok(g.rounds > MAX_GATE_ROUNDS, 'the count keeps climbing')
})

test('sessionEnd wipes gates with the session', () => {
  setGate('s-end', 'review', 'frontend')
  decide({
    event: 'SessionEnd',
    sessionId: 's-end',
    conversationId: 's-end',
    subagentId: '',
    target: '',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.deepEqual(readGates('s-end'), {})
})

// --- git write policy ---

test('detectGitWrite flags every way an agent could move the repo', () => {
  for (const [cmd, verb] of [
    ['git commit -m x', 'commit'],
    ['git push', 'push'],
    ['git push --force origin main', 'push'],
    ['cd /tmp && git reset --hard', 'reset'],
    ['git checkout -b feature', 'checkout'],
    ['git switch main', 'switch'],
    ['git merge main', 'merge'],
    ['git rebase -i HEAD~2', 'rebase'],
    ['git stash', 'stash'],
    ['git add -A', 'add'],
    ['git tag v1', 'tag'],
    ['git cherry-pick abc123', 'cherry-pick'],
  ]) {
    assert.equal(detectGitWrite(cmd), verb, `should flag: ${cmd}`)
  }
})

test('detectGitWrite leaves read-only git alone', () => {
  for (const cmd of [
    'git status',
    'git status --porcelain',
    'git diff HEAD~1',
    'git log --oneline -5',
    'git show abc123',
    'git blame src/a.ts',
    'npm test',
    'legit commit of prose',
  ]) {
    assert.equal(detectGitWrite(cmd), '', `should allow: ${cmd}`)
  }
})

test('git branch is a write only when it creates, deletes or renames', () => {
  for (const cmd of ['git branch feature-x', 'git branch -D old', 'git branch -m new']) {
    assert.equal(detectGitWrite(cmd), 'branch', `should flag: ${cmd}`)
  }
  for (const cmd of [
    'git branch --list',
    'git branch --show-current',
    'git branch -a',
    'git branch -r',
    'git branch -v',
    'git branch',
  ]) {
    assert.equal(detectGitWrite(cmd), '', `listing is read-only: ${cmd}`)
  }
})

test('MANAGER_GIT_ALLOWED is exactly the recoverable local pair', () => {
  assert.deepEqual([...MANAGER_GIT_ALLOWED].sort(), ['add', 'commit'])
})

// See task-log.test.mjs: no-op today, pinned so relocating the hooks cannot
// silently pool every project's run events into one shared directory.
test('run events follow CLAUDE_PROJECT_DIR, and AGENT_KIT_* still wins', () => {
  const prevProj = process.env.CLAUDE_PROJECT_DIR
  const prevEvents = process.env.AGENT_KIT_RUN_EVENTS_PATH
  const prevState = process.env.AGENT_KIT_STATE_PATH
  try {
    delete process.env.AGENT_KIT_RUN_EVENTS_PATH
    delete process.env.AGENT_KIT_STATE_PATH
    process.env.CLAUDE_PROJECT_DIR = '/tmp/proj-x'
    assert.equal(
      getRunEventsPath(new Date('2026-08-16T00:00:00.000Z')),
      join('/tmp/proj-x', '.claude', 'memory', 'runs', '2026-08-16.jsonl'),
    )
    assert.equal(
      projectRoot(),
      '/tmp/proj-x',
    )

    process.env.AGENT_KIT_RUN_EVENTS_PATH = '/tmp/events.jsonl'
    assert.equal(getRunEventsPath(), '/tmp/events.jsonl')

    delete process.env.CLAUDE_PROJECT_DIR
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
    assert.equal(projectRoot(), repo)
  } finally {
    for (const [k, v] of [
      ['CLAUDE_PROJECT_DIR', prevProj],
      ['AGENT_KIT_RUN_EVENTS_PATH', prevEvents],
      ['AGENT_KIT_STATE_PATH', prevState],
    ]) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})
