import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseTaskEntries,
  rollupTokens,
  renderFinalReport,
} from './format-final-report.mjs'

const entry = ({
  ts = '2026-08-15T12:00:00.000Z',
  agent = 'frontend',
  goal = 'pager',
  status = 'done',
  mode = 'implement',
  verification = 'pass',
  changed = 'app/a.tsx',
  tokens = '1000',
  session = 's1',
}) => `## ${ts} — ${agent}: ${goal}

- **Status**: ${status}
- **Mode**: ${mode}
- **Verification**: ${verification}
- **Changed**: ${changed}
- **Tokens**: ${tokens}
- **Session**: ${session}
`

function withLog(text, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-fr-'))
  try {
    const path = join(dir, 'tasks.md')
    writeFileSync(path, `# Agent tasks log\n\n${text}`, 'utf8')
    return fn(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('parseTaskEntries reads the fields the report needs, scoped to a session', () => {
  const text = [
    entry({ agent: 'planner', goal: 'plan it', tokens: '500' }),
    entry({ agent: 'frontend', tokens: '~1200' }),
    entry({ agent: 'backend', session: 'other', tokens: '900' }),
  ].join('\n')
  withLog(text, (path) => {
    const all = parseTaskEntries(path)
    assert.equal(all.length, 3)
    const mine = parseTaskEntries(path, 's1')
    assert.deepEqual(
      mine.map((e) => e.agent),
      ['planner', 'frontend'],
      'other sessions must not leak into this run',
    )
    assert.equal(mine[1].tokens, 1200)
    assert.equal(mine[1].approx, true, 'the tilde must survive parsing')
    assert.equal(mine[0].approx, false)
  })
})

test('parseTaskEntries treats n/a as no number, not zero', () => {
  withLog(entry({ tokens: 'n/a' }), (path) => {
    const [e] = parseTaskEntries(path)
    assert.equal(e.tokens, null)
  })
})

test('rollupTokens never invents a total', () => {
  assert.deepEqual(rollupTokens([{ tokens: 100 }, { tokens: 200 }]), {
    total: 300,
    approx: false,
    incomplete: false,
  })
  assert.deepEqual(
    rollupTokens([{ tokens: 100, approx: true }, { tokens: 200 }]),
    { total: 300, approx: true, incomplete: false },
    'one approximate row makes the rollup approximate',
  )
  assert.deepEqual(
    rollupTokens([{ tokens: 100 }, { tokens: null }]),
    { total: 100, approx: false, incomplete: true },
    'a missing row must be flagged, not silently dropped',
  )
  assert.deepEqual(rollupTokens([]), {
    total: null,
    approx: false,
    incomplete: true,
  })
})

test('renderFinalReport fills the mechanical sections and leaves judgment to the manager', () => {
  const out = renderFinalReport(
    [
      { agent: 'planner', goal: 'plan it', mode: 'audit-only', status: 'done', tokens: 500, approx: false },
      { agent: 'frontend', goal: 'pager', mode: 'implement', status: 'done', tokens: 1200, approx: true },
    ],
    { session: 's1' },
  )
  for (const heading of [
    '### Agents used',
    '### Outcomes',
    '### Verification',
    '### Manual QA / follow-ups',
    '### Token costs',
  ]) {
    assert.ok(out.includes(heading), `missing ${heading}`)
  }
  assert.match(out, /`planner`/)
  assert.match(out, /`frontend`/)
  assert.match(out, /~1200/, 'approximate counts keep their tilde')
  assert.match(out, /\*\*Rollup\*\* — total tokens: ~1700/)
  assert.match(out, /Sources:/)
  assert.match(out, /<fill/, 'judgment sections stay as prompts for the manager')
})

test('renderFinalReport says n/a rather than 0 when the log had nothing', () => {
  const out = renderFinalReport([], { session: 's1' })
  assert.match(out, /\*\*Rollup\*\* — total tokens: n\/a/)
  assert.match(out, /### Agents used/)
})

test('renderFinalReport flags a partial rollup', () => {
  const out = renderFinalReport(
    [
      { agent: 'planner', goal: 'p', mode: 'audit-only', status: 'done', tokens: null },
      { agent: 'frontend', goal: 'f', mode: 'implement', status: 'done', tokens: 100 },
    ],
    { session: 's1' },
  )
  assert.match(out, /\*\*Rollup\*\* — total tokens: 100 \(partial/)
  assert.match(out, /`planner`.*n\/a/)
})
