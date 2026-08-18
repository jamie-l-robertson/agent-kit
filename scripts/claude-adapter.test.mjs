import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

/** A kit agent running one command, so its pass/fail has something behind it. */
function ranCommand(dir, agent = 'frontend', agentId = 'fe-1') {
  return runAdapter(
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      session_id: 's1',
      agent_id: agentId,
      agent_type: agent,
      tool_input: { command: 'npx vitest run src/a.test.tsx' },
    },
    dir,
  )
}

test('SubagentStop passes a valid worker report through', () => {
  withStateDir((dir) => {
    ranCommand(dir)
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

test('SubagentStop flags a pass that no command backs', () => {
  withStateDir((dir) => {
    // No ranCommand: the agent graded a test run it never performed.
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
    assert.match(
      out.hookSpecificOutput.additionalContext,
      /counted zero commands/,
    )
    assert.equal(out.decision, undefined, 'advisory only — must not block')
  })
})

test('SubagentStop stays silent on a verificationResult of n/a', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'rv-1',
        agent_type: 'reviewer',
        last_assistant_message: fence({
          status: 'done',
          agent: 'reviewer',
          mode: 'audit-only',
          goal: 'x',
          changed: [],
          recommendNext: 'none',
          humanApprove: 'n/a',
          verificationResult: 'n/a',
          findings: '',
          findingsSeverity: 'none',
        }),
      },
      dir,
    )
    assert.deepEqual(out, {}, 'nothing was graded, so there is nothing to back')
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

test('SubagentStart emits no chatter — the pulse channel is invisible', () => {
  withStateDir((dir) => {
    for (const agent_type of ['frontend', 'Explore']) {
      const out = runAdapter(
        {
          hook_event_name: 'SubagentStart',
          session_id: 's1',
          agent_id: 'a-1',
          agent_type,
        },
        dir,
      )
      assert.deepEqual(out, {}, `no systemMessage for ${agent_type}`)
    }
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

// --- access integrity (Phase 2) ---

const bashCall = (command, agent_type = 'planner') => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  session_id: 's1',
  agent_id: 'pl-1',
  agent_type,
  tool_input: { command },
})

test('kit agent shelling out to a tracker is denied, with routing', () => {
  withStateDir((dir) => {
    const out = runAdapter(bashCall('gh issue view 42'), dir)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
    const reason = out.hookSpecificOutput.permissionDecisionReason
    assert.match(reason, /gh issue/)
    assert.match(reason, /MCP/)
    assert.match(reason, /blocked/, 'must name the way out')
  })
})

test('tracker deny leaves ordinary commands and non-kit callers alone', () => {
  withStateDir((dir) => {
    assert.deepEqual(runAdapter(bashCall('npm test'), dir), {})
    assert.deepEqual(runAdapter(bashCall('gh pr create --fill'), dir), {})
    assert.deepEqual(
      runAdapter(bashCall('gh issue view 42', ''), dir),
      {},
      'the main agent is not a kit worker',
    )
  })
})

test('a report quoting a forbidden fallback goes advisory, not block', () => {
  withStateDir((dir) => {
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'pl-1',
        agent_type: 'planner',
        last_assistant_message: fence({
          ...plannerReport,
          mcpUsed: 'none — fell back to `gh issue view 42`',
        }),
      },
      dir,
    )
    assert.equal(out.decision, undefined, 'valid schema must not be blocked')
    assert.match(out.hookSpecificOutput.additionalContext, /gh issue/)
    assert.match(out.hookSpecificOutput.additionalContext, /bounce/i)
  })
})

// --- audit fix-loops (Phase 3) ---

const auditReport = (over = {}) => ({
  status: 'done',
  agent: 'reviewer',
  mode: 'audit-only',
  goal: 'review the pager',
  changed: [],
  recommendNext: 'frontend: fix the off-by-one',
  humanApprove: 'n/a',
  verificationResult: 'n/a',
  findings: 'off-by-one on the last page',
  findingsSeverity: 'critical',
  ...over,
})

const stop = (agent, report) => ({
  hook_event_name: 'SubagentStop',
  session_id: 's1',
  agent_id: `${agent}-1`,
  agent_type: agent,
  last_assistant_message: fence(report),
})

const managerClose = {
  hook_event_name: 'SubagentStop',
  session_id: 's1',
  agent_id: 'mgr-1',
  agent_type: 'manager',
  last_assistant_message: fence({
    status: 'done',
    agent: 'manager',
    mode: 'audit-only',
    goal: 'ship the pager',
    changed: [],
    recommendNext: 'none',
    humanApprove: 'n/a',
    verificationResult: 'n/a',
  }),
}

test('a critical review holds the managed close, naming the owner', () => {
  withStateDir((dir) => {
    runAdapter(stop('reviewer', auditReport()), dir)
    const out = runAdapter(managerClose, dir)
    assert.equal(out.decision, 'block')
    assert.match(out.reason, /review/)
    assert.match(out.reason, /frontend/, 'must name who fixes it')
  })
})

test('warning and none do not hold the close', () => {
  withStateDir((dir) => {
    runAdapter(
      stop('reviewer', auditReport({ findingsSeverity: 'warning' })),
      dir,
    )
    assert.deepEqual(runAdapter(managerClose, dir), {})
  })
})

test('a clean re-review clears the gate and lets the close through', () => {
  withStateDir((dir) => {
    runAdapter(stop('reviewer', auditReport()), dir)
    assert.equal(runAdapter(managerClose, dir).decision, 'block')
    runAdapter(
      stop('reviewer', auditReport({ findingsSeverity: 'none', findings: '' })),
      dir,
    )
    assert.deepEqual(runAdapter(managerClose, dir), {})
  })
})

test('security and risk open their own gate, independent of review', () => {
  withStateDir((dir) => {
    runAdapter(stop('security', auditReport({ agent: 'security' })), dir)
    assert.match(runAdapter(managerClose, dir).reason, /secRisk/)
    runAdapter(
      stop('security', auditReport({ agent: 'security', findingsSeverity: 'none', findings: '' })),
      dir,
    )
    assert.deepEqual(runAdapter(managerClose, dir), {})
  })
})

const testerReport = (over = {}) => ({
  status: 'done',
  agent: 'tester',
  mode: 'verify-only',
  goal: 'regression run',
  changed: [],
  recommendNext: 'frontend: fix the pager query',
  humanApprove: 'n/a',
  verificationResult: 'fail',
  evidence: 'vitest → 1 failed',
  ...over,
})

test('a failing test that blames product code holds the close', () => {
  withStateDir((dir) => {
    runAdapter(stop('tester', testerReport()), dir)
    const out = runAdapter(managerClose, dir)
    assert.equal(out.decision, 'block')
    assert.match(out.reason, /test/)
  })
})

test('tester failures that blame nobody do not open a loop', () => {
  withStateDir((dir) => {
    runAdapter(stop('tester', testerReport({ recommendNext: 'none' })), dir)
    assert.deepEqual(
      runAdapter(managerClose, dir),
      {},
      'harness-only work is the tester own fix',
    )
  })
})

test('a blocked tester escalates instead of looping', () => {
  withStateDir((dir) => {
    runAdapter(
      stop('tester', testerReport({ status: 'blocked', needs: 'no dev server' })),
      dir,
    )
    assert.deepEqual(runAdapter(managerClose, dir), {})
  })
})

test('past the round cap the gate stops blocking and becomes the user call', () => {
  withStateDir((dir) => {
    for (let i = 0; i <= 2; i++) {
      runAdapter(stop('reviewer', auditReport()), dir)
    }
    const out = runAdapter(managerClose, dir)
    assert.equal(out.decision, undefined, 'must not hostage the close forever')
    assert.match(out.hookSpecificOutput.additionalContext, /ask the user/i)
  })
})

// --- git write policy ---

const bashAs = (agent_type, command) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  session_id: 's1',
  agent_id: agent_type ? `${agent_type}-1` : '',
  agent_type,
  tool_input: { command },
})

test('a worker cannot move the repo, and is told who can', () => {
  withStateDir((dir) => {
    const out = runAdapter(bashAs('frontend', 'git commit -m "wip"'), dir)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
    const reason = out.hookSpecificOutput.permissionDecisionReason
    assert.match(reason, /commit/)
    assert.match(reason, /manager/, 'must name who does commit')
    assert.match(reason, /blocked/, 'must name the way out')
  })
})

test('workers keep read-only git', () => {
  withStateDir((dir) => {
    for (const cmd of ['git status', 'git diff', 'git log --oneline -3']) {
      assert.deepEqual(runAdapter(bashAs('tester', cmd), dir), {}, cmd)
    }
  })
})

test('the manager may stage and commit locally', () => {
  withStateDir((dir) => {
    assert.deepEqual(runAdapter(bashAs('manager', 'git add -A'), dir), {})
    assert.deepEqual(runAdapter(bashAs('manager', 'git commit -m "ship"'), dir), {})
  })
})

test('the manager may not push, branch, or rewrite history', () => {
  withStateDir((dir) => {
    for (const cmd of ['git push', 'git branch feature-x', 'git reset --hard HEAD~1']) {
      const out = runAdapter(bashAs('manager', cmd), dir)
      assert.equal(
        out.hookSpecificOutput.permissionDecision,
        'deny',
        `manager must not run: ${cmd}`,
      )
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /Final report/)
    }
  })
})

test('the human is never gated', () => {
  withStateDir((dir) => {
    assert.deepEqual(
      runAdapter(bashAs('', 'git push origin main'), dir),
      {},
      'the main chat is not a kit agent',
    )
  })
})

test('a tracker bypass still wins its own message', () => {
  withStateDir((dir) => {
    const out = runAdapter(bashAs('planner', 'gh issue view 42'), dir)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /MCP/)
  })
})

// --- Write-lease vs `changed` -------------------------------------------
// Leases are the hook's own record of what an agent wrote. These cover the
// two blocking directions and the deliberate non-block on the common case.

/** Record a Write the way the host would, so the lease is taken. */
function leaseWrite(dir, projectDir, file, agent = 'frontend', agentId = 'fe-1') {
  return runAdapter(
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      session_id: 's1',
      agent_id: agentId,
      agent_type: agent,
      cwd: projectDir,
      tool_input: { file_path: join(projectDir, file) },
    },
    dir,
  )
}

test('SubagentStop blocks a report that omits a file the agent wrote', () => {
  withStateDir((dir) => {
    const projectDir = join(dir, 'proj')
    leaseWrite(dir, projectDir, 'src/a.tsx')
    leaseWrite(dir, projectDir, 'src/secret.tsx')
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
        cwd: projectDir,
        last_assistant_message: fence(doneReport), // changed: ['src/a.tsx']
      },
      dir,
    )
    assert.equal(out.decision, 'block')
    assert.match(out.reason, /src\/secret\.tsx/)
    assert.doesNotMatch(out.reason, /src\/a\.tsx/, 'reported file must not be blamed')
  })
})

test('SubagentStop blocks an audit-only report from an agent that wrote files', () => {
  withStateDir((dir) => {
    const projectDir = join(dir, 'proj')
    leaseWrite(dir, projectDir, 'src/a.tsx', 'reviewer', 'rv-1')
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'rv-1',
        agent_type: 'reviewer',
        cwd: projectDir,
        last_assistant_message: fence({
          status: 'done',
          agent: 'reviewer',
          mode: 'audit-only',
          goal: 'x',
          changed: [],
          recommendNext: 'none',
          humanApprove: 'n/a',
          verificationResult: 'n/a',
          findings: 'looks fine',
          findingsSeverity: 'warning',
        }),
      },
      dir,
    )
    assert.equal(out.decision, 'block')
    assert.match(out.reason, /audit-only/)
    assert.match(out.reason, /src\/a\.tsx/)
  })
})

test('SubagentStop does not flag a changed path with no lease (Bash-written)', () => {
  withStateDir((dir) => {
    const projectDir = join(dir, 'proj')
    // No leaseWrite: the agent edited via Bash, which takes no lease. The Bash
    // call itself is still seen, which is what keeps the pass credible.
    runAdapter(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
        tool_input: { command: "sed -i '' s/a/b/ src/a.tsx && npx vitest run" },
      },
      dir,
    )
    const out = runAdapter(
      {
        hook_event_name: 'SubagentStop',
        session_id: 's1',
        agent_id: 'fe-1',
        agent_type: 'frontend',
        cwd: projectDir,
        last_assistant_message: fence(doneReport),
      },
      dir,
    )
    assert.deepEqual(out, {}, 'must stay silent — this is the common case')
  })
})

// --- Ticket scope ---------------------------------------------------------

/** A project dir whose stack card carries the given scope lines. */
function withProjectCard(lines, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-card-'))
  try {
    writeFileSync(
      join(dir, 'AGENTS.md'),
      `# Agent stack card\n\n## Stack\n\n${lines.join('\n')}\n`,
      'utf8',
    )
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function ticketCall(dir, projectDir, toolName, toolInput) {
  return runAdapter(
    {
      hook_event_name: 'PreToolUse',
      tool_name: toolName,
      session_id: 's1',
      agent_id: 'pl-1',
      agent_type: 'planner',
      tool_input: toolInput,
    },
    dir,
    { CLAUDE_PROJECT_DIR: projectDir },
  )
}

test('a tracker call outside the configured Jira project is denied', () => {
  withStateDir((dir) => {
    withProjectCard(['- **Jira project key**: PROJ'], (projectDir) => {
      const out = ticketCall(dir, projectDir, 'mcp__abc123__get_jira_issue', {
        issueKey: 'OTHER-42',
      })
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
      const why = out.hookSpecificOutput.permissionDecisionReason
      assert.match(why, /OTHER/, 'names the ref it refused')
      assert.match(why, /proj/i, 'and the scope it checked against')
    })
  })
})

test('a tracker call inside the configured project passes', () => {
  withStateDir((dir) => {
    withProjectCard(['- **Jira project key**: PROJ, OPS'], (projectDir) => {
      assert.deepEqual(
        ticketCall(dir, projectDir, 'mcp__abc123__get_jira_issue', {
          issueKey: 'OPS-7',
        }),
        {},
      )
    })
  })
})

test('a tracker call is denied when no project key is configured', () => {
  withStateDir((dir) => {
    withProjectCard(
      ['- **Jira project key**: <!-- e.g. PROJ — or n/a -->'],
      (projectDir) => {
        const out = ticketCall(dir, projectDir, 'mcp__abc123__get_jira_issue', {
          issueKey: 'ANY-1',
        })
        assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
        assert.match(out.hookSpecificOutput.permissionDecisionReason, /setup/)
      },
    )
  })
})

test('non-ticket MCP tools are never scope-checked', () => {
  withStateDir((dir) => {
    withProjectCard(['- **Jira project key**: PROJ'], (projectDir) => {
      // CVE-2024-1234 matches the Jira key shape — the tool-name gate is what
      // keeps that from being a false positive.
      assert.deepEqual(
        ticketCall(dir, projectDir, 'mcp__abc123__execute_sql', {
          query: "select * from advisories where id = 'CVE-2024-1234'",
        }),
        {},
      )
    })
  })
})

test('Bash mentioning a ticket-shaped string is untouched', () => {
  withStateDir((dir) => {
    withProjectCard(['- **Jira project key**: PROJ'], (projectDir) => {
      assert.deepEqual(
        ticketCall(dir, projectDir, 'Bash', {
          command: 'npm audit | grep CVE-2024-1234',
        }),
        {},
      )
    })
  })
})

test('the human is never ticket-gated', () => {
  withStateDir((dir) => {
    withProjectCard(['- **Jira project key**: PROJ'], (projectDir) => {
      const out = runAdapter(
        {
          hook_event_name: 'PreToolUse',
          tool_name: 'mcp__abc123__get_jira_issue',
          session_id: 's1',
          tool_input: { issueKey: 'OTHER-42' },
        },
        dir,
        { CLAUDE_PROJECT_DIR: projectDir },
      )
      assert.deepEqual(out, {}, 'main chat is not a kit agent')
    })
  })
})
