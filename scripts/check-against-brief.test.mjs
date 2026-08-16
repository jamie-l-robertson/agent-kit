import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBrief, checkAgainstBrief } from './validate-worker-report.mjs'

const brief = `Task: add the pager
Mode: implement
Model: inherit
Success: pager renders and tests pass
Writable paths: app/blog/**
Human approve: n/a
Approved destructive action: n/a
MCP prewarmed: none
`

const report = {
  status: 'done',
  agent: 'frontend',
  mode: 'implement',
  goal: 'add the pager',
  changed: ['app/blog/page.tsx'],
  recommendNext: 'none',
  humanApprove: 'n/a',
  verificationResult: 'pass',
  evidence: 'vitest → exit 0',
}

test('parseBrief reads the fields the checks need', () => {
  const b = parseBrief(brief)
  assert.equal(b.mode, 'implement')
  assert.equal(b.humanApprove, 'n/a')
  assert.equal(b.mcpPrewarmed, 'none')
})

test('no brief means no opinion — the check is soft by design', () => {
  assert.deepEqual(checkAgainstBrief(report, {}), [])
  assert.deepEqual(checkAgainstBrief(report, { brief: '' }), [])
})

test('a matching report raises nothing', () => {
  assert.deepEqual(checkAgainstBrief(report, { brief }), [])
})

test('a worker cannot grant itself destructive approval', () => {
  const warnings = checkAgainstBrief(
    { ...report, humanApprove: 'granted', approvedAction: 'drop the prod table' },
    { brief },
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /granted/)
  assert.match(warnings[0], /brief/)
})

test('a real grant in the brief is accepted', () => {
  const granted = brief.replace('Human approve: n/a', 'Human approve: granted')
  assert.deepEqual(
    checkAgainstBrief(
      { ...report, humanApprove: 'granted', approvedAction: 'reset staging db' },
      { brief: granted },
    ),
    [],
  )
})

test('a worker escalating its own Mode is flagged', () => {
  const auditBrief = brief.replace('Mode: implement', 'Mode: audit-only')
  const warnings = checkAgainstBrief(report, { brief: auditBrief })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /audit-only/)
  assert.match(warnings[0], /implement/)
})

test('required MCP with nothing used is flagged, and honest use is not', () => {
  const withMcp = brief.replace('MCP prewarmed: none', 'MCP prewarmed: github')
  assert.match(
    checkAgainstBrief({ ...report, mcpUsed: 'none' }, { brief: withMcp })[0],
    /MCP/,
  )
  assert.match(
    checkAgainstBrief(report, { brief: withMcp })[0],
    /MCP/,
    'a missing mcpUsed counts as none',
  )
  assert.deepEqual(
    checkAgainstBrief(
      { ...report, mcpUsed: 'github/get_issue' },
      { brief: withMcp },
    ),
    [],
  )
})

test('requiredMcp can come from context instead of the brief', () => {
  assert.match(
    checkAgainstBrief({ ...report, mcpUsed: 'none' }, { requiredMcp: 'jira' })[0],
    /jira/,
  )
})
