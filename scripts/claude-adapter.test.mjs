import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ADAPTER = join(__dirname, '..', '.claude', 'hooks', 'adapters', 'claude.mjs')

/** Run the adapter as the host does: JSON on stdin, JSON on stdout. */
function runAdapter(payload, stateDir, env = {}) {
  const r = spawnSync(process.execPath, [ADAPTER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENT_KIT_STATE_PATH: join(stateDir, 'agent-roles.json'),
      AGENT_KIT_RUN_EVENTS: '0',
      // Valid reports append task memory — keep the repo's tasks.md out of it.
      AGENT_KIT_TASKS_PATH: join(stateDir, 'tasks.md'),
      AGENT_KIT_TASKS_ARCHIVE_DIR: join(stateDir, 'archive'),
      ...env,
    },
  })
  assert.equal(r.status, 0, `adapter exited ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout.trim() || '{}')
}

function withStateDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-adapter-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const doneReport = {
  status: 'done',
  agent: 'frontend',
  mode: 'implement',
  goal: 'x',
  changed: ['src/a.tsx'],
  recommendNext: 'none',
  humanApprove: 'n/a',
  verificationResult: 'pass',
  evidence: 'vitest → exit 0',
}

const fence = (obj) => `summary\n\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``

test('PreToolUse allow path never force-approves the spawn', () => {
  withStateDir((dir) => {
    runAdapter(
      { hook_event_name: 'SessionStart', session_id: 's1' },
      dir,
    )
    const out = runAdapter(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        session_id: 's1',
        tool_input: { subagent_type: 'frontend' },
      },
      dir,
    )
    assert.deepEqual(out, {}, 'allow must be a no-op, not permissionDecision')
  })
})

test('PreToolUse denies a worker spawning another worker, with routing', () => {
  withStateDir((dir) => {
    runAdapter({ hook_event_name: 'SessionStart', session_id: 's1' }, dir)
    const out = runAdapter(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
        tool_input: { subagent_type: 'backend' },
      },
      dir,
    )
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(
      out.hookSpecificOutput.permissionDecisionReason,
      /cannot spawn subagents/,
    )
    assert.match(
      out.hookSpecificOutput.permissionDecisionReason,
      /manager re-dispatches/,
    )
  })
})

test('PreToolUse ignores non-spawn tools', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
        tool_input: { command: 'ls' },
      },
      dir,
    )
    assert.deepEqual(out, {})
  })
})

test('SubagentStop passes a valid worker report through', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
        last_assistant_message: fence(doneReport),
      },
      dir,
    )
    assert.deepEqual(out, {})
  })
})

test('SubagentStop blocks an invalid report, then goes advisory', () => {
  withStateDir((dir) => {
    const bad = fence({ ...doneReport, changed: [] })
    const payload = {
      hook_event_name: 'SubagentStop',
      session_id: 's1',
      agent_id: 'fe-1',
      agent_type: 'frontend',
      last_assistant_message: bad,
    }
    const first = runAdapter(payload, dir)
    assert.equal(first.decision, 'block')
    assert.match(first.reason, /changed/)

    assert.equal(runAdapter(payload, dir).decision, 'block')

    const third = runAdapter(payload, dir)
    assert.equal(third.decision, undefined, 'must not block forever')
    assert.match(
      third.hookSpecificOutput.additionalContext,
      /gave up after 2 retries/,
    )
  })
})

test('SubagentStop blocks a missing fence', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'be-1',
        agent_type: 'backend',
        last_assistant_message: 'all done, no fence here',
      },
      dir,
    )
    assert.equal(out.decision, 'block')
    assert.match(out.reason, /missing worker-report JSON fence/)
  })
})

test('SubagentStop ignores non-kit agents', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'ex-1',
        agent_type: 'Explore',
        last_assistant_message: 'no fence, and none expected',
      },
      dir,
    )
    assert.deepEqual(out, {})
  })
})

test('invalid stdin denies rather than crashing', () => {
  const r = spawnSync(process.execPath, [ADAPTER], {
    input: '{not json',
    encoding: 'utf8',
    env: { ...process.env, AGENT_KIT_RUN_EVENTS: '0' },
  })
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout.trim())
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
})

test('SubagentStart names the specialist for the user', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStart',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
      },
      dir,
    )
    assert.match(out.systemMessage, /frontend/)
  })
})

test('SubagentStart stays quiet for non-kit agents', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStart',
        session_id: 's1',
        agent_id: 'ex-1',
        agent_type: 'Explore',
      },
      dir,
    )
    assert.deepEqual(out, {}, 'no chatter for built-in agents')
  })
})

// --- plan gate (Phase 1) ---

const plannerReport = {
  status: 'done',
  agent: 'planner',
  mode: 'audit-only',
  goal: 'add blog pagination',
  changed: [],
  recommendNext: 'frontend: pager component',
  humanApprove: 'n/a',
  verificationResult: 'n/a',
}

/** Session with a planner plan waiting for approval. */
function seedPendingPlan(dir, report = plannerReport, env = {}) {
  runAdapter({ hook_event_name: 'SessionStart', session_id: 's1' }, dir)
  runAdapter(
    {
      hook_event_name: 'SubagentStop',
      session_id: 's1',
      agent_id: 'pl-1',
      agent_type: 'planner',
      last_assistant_message: fence(report),
    },
    dir,
    env,
  )
}

const spawnImplementer = (target = 'frontend') => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  session_id: 's1',
  agent_id: 'mgr-1',
  agent_type: 'manager',
  tool_input: { subagent_type: target },
})

test('planner done makes the next implementer spawn ask, quoting the plan', () => {
  withStateDir((dir) => {
    seedPendingPlan(dir)
    const out = runAdapter(spawnImplementer(), dir)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'ask')
    const reason = out.hookSpecificOutput.permissionDecisionReason
    assert.match(reason, /add blog pagination/, 'ask must carry the plan')
    assert.match(reason, /frontend/, 'ask must name the target')
  })
})

test('SubagentStart approves the plan; later spawns do not re-ask', () => {
  withStateDir((dir) => {
    seedPendingPlan(dir)
    runAdapter(
      {
        hook_event_name: 'SubagentStart',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
      },
      dir,
    )
    assert.deepEqual(runAdapter(spawnImplementer('backend'), dir), {})
  })
})

test('planner blocked does not set a pending plan', () => {
  withStateDir((dir) => {
    seedPendingPlan(dir, {
      ...plannerReport,
      status: 'blocked',
      needs: 'design file',
    })
    assert.deepEqual(runAdapter(spawnImplementer(), dir), {})
  })
})

test('AGENT_KIT_PLAN_GATE=off skips the ask', () => {
  withStateDir((dir) => {
    seedPendingPlan(dir)
    assert.deepEqual(
      runAdapter(spawnImplementer(), dir, { AGENT_KIT_PLAN_GATE: 'off' }),
      {},
    )
  })
})

test('plan gate ignores audit-only targets and non-manager callers', () => {
  withStateDir((dir) => {
    seedPendingPlan(dir)
    assert.deepEqual(runAdapter(spawnImplementer('reviewer'), dir), {})
    assert.deepEqual(
      runAdapter({ ...spawnImplementer(), agent_id: '', agent_type: '' }, dir),
      {},
      'root spawning an implementer is not a managed dispatch',
    )
  })
})

test('plan gate never turns a nest deny into an ask', () => {
  withStateDir((dir) => {
    seedPendingPlan(dir)
    const out = runAdapter(
      { ...spawnImplementer('backend'), agent_id: 'fe-1', agent_type: 'frontend' },
      dir,
    )
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  })
})
