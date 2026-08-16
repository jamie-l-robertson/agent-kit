#!/usr/bin/env node
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resolveTokenCount,
  formatTaskEntry,
  appendTaskMemory,
  splitTaskEntries,
  TASKS_HEADER,
  tokensFromTranscript,
} from '../.claude/hooks/task-log.mjs'

const sampleReport = {
  status: 'done',
  agent: 'frontend',
  mode: 'implement',
  goal: 'Add blog pagination',
  changed: ['app/blog/page.tsx'],
  verificationResult: 'pass',
}

let tmp = ''
let prevTasks = ''
let prevArchive = ''

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'kit-tasks-'))
  prevTasks = process.env.AGENT_KIT_TASKS_PATH || ''
  prevArchive = process.env.AGENT_KIT_TASKS_ARCHIVE_DIR || ''
  process.env.AGENT_KIT_TASKS_PATH = join(tmp, 'tasks.md')
  process.env.AGENT_KIT_TASKS_ARCHIVE_DIR = join(tmp, 'tasks-archive')
})

afterEach(() => {
  if (prevTasks) process.env.AGENT_KIT_TASKS_PATH = prevTasks
  else delete process.env.AGENT_KIT_TASKS_PATH
  if (prevArchive) process.env.AGENT_KIT_TASKS_ARCHIVE_DIR = prevArchive
  else delete process.env.AGENT_KIT_TASKS_ARCHIVE_DIR
  rmSync(tmp, { recursive: true, force: true })
})

test('resolveTokenCount prefers usage.totalTokens; never invents', () => {
  assert.equal(resolveTokenCount({}), null)
  assert.equal(resolveTokenCount({ usage: { source: 'n/a' } }), null)
  assert.equal(
    resolveTokenCount({ usage: { totalTokens: 1200, sourceTokens: 1 } }),
    1200,
  )
  assert.equal(resolveTokenCount({ tokens: 99 }), 99)
  assert.equal(resolveTokenCount({}, { total_tokens: 50 }), 50)
})

test('formatTaskEntry writes Tokens count or n/a; no in/out/usd', () => {
  const withTokens = formatTaskEntry(sampleReport, {
    tokens: 4200,
    sessionId: 's1',
    now: new Date('2026-08-11T12:00:00.000Z'),
  })
  assert.match(withTokens, /\*\*Tokens\*\*: 4200/)
  assert.doesNotMatch(withTokens, /inputTokens|outputTokens|costUsd|in=/i)

  const noTokens = formatTaskEntry(sampleReport, {
    tokens: null,
    now: new Date('2026-08-11T12:00:00.000Z'),
  })
  assert.match(noTokens, /\*\*Tokens\*\*: n\/a/)
})

test('formatTaskEntry includes Needs for blocked/needs-decision', () => {
  const out = formatTaskEntry(
    {
      ...sampleReport,
      status: 'needs-decision',
      needs: 'Pick page size',
      verificationResult: 'n/a',
    },
    { tokens: null, now: new Date('2026-08-11T12:00:00.000Z') },
  )
  assert.match(out, /\*\*Needs\*\*: Pick page size/)
})

test('appendTaskMemory creates file and appends entry', () => {
  appendTaskMemory(sampleReport, {
    sessionId: 'sess-a',
    tokens: 100,
    now: new Date('2026-08-11T12:00:00.000Z'),
  })
  const text = readFileSync(process.env.AGENT_KIT_TASKS_PATH, 'utf8')
  assert.match(text, /Agent tasks log/)
  assert.match(text, /frontend: Add blog pagination/)
  assert.match(text, /\*\*Tokens\*\*: 100/)
  assert.match(text, /\*\*Session\*\*: sess-a/)
})

test('appendTaskMemory peels oldest into archive when over cap', () => {
  const now = new Date('2026-08-11T15:00:00.000Z')
  for (let i = 0; i < 3; i++) {
    appendTaskMemory(
      { ...sampleReport, goal: `Goal ${i}` },
      { tokens: i, cap: 2, now, sessionId: `s${i}` },
    )
  }
  const live = readFileSync(process.env.AGENT_KIT_TASKS_PATH, 'utf8')
  const { entries } = splitTaskEntries(live)
  assert.equal(entries.length, 2)
  assert.match(live, /Goal 1/)
  assert.match(live, /Goal 2/)
  assert.doesNotMatch(live, /Goal 0/)

  const archivePath = join(
    process.env.AGENT_KIT_TASKS_ARCHIVE_DIR,
    '2026-08.md',
  )
  assert.ok(existsSync(archivePath), 'archive month file exists')
  const archived = readFileSync(archivePath, 'utf8')
  assert.match(archived, /Goal 0/)
})

test('splitTaskEntries round-trips header and ## blocks', () => {
  const md =
    TASKS_HEADER +
    '## 2026-01-01T00:00:00.000Z — backend: one\n\n- **Status**: done\n\n' +
    '## 2026-01-02T00:00:00.000Z — frontend: two\n\n- **Status**: done\n'
  mkdirSync(tmp, { recursive: true })
  writeFileSync(join(tmp, 'sample.md'), md)
  const { header, entries } = splitTaskEntries(md)
  assert.match(header, /Agent tasks log/)
  assert.equal(entries.length, 2)
})

/** Shape of a real subagent transcript row (only the fields we read). */
const turn = (usage) => JSON.stringify({ type: 'assistant', message: { usage } })

test('tokensFromTranscript sums the last assistant turn, matching subagent_tokens', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-tx-'))
  try {
    const path = join(dir, 'agent-1.jsonl')
    writeFileSync(
      path,
      [
        JSON.stringify({ type: 'user' }),
        // An earlier turn must NOT be added in — the host's figure is the
        // final state, not a running total.
        turn({ input_tokens: 2, cache_creation_input_tokens: 23040, cache_read_input_tokens: 24013, output_tokens: 111 }),
        'not json — skipped',
        turn({ input_tokens: 2, cache_creation_input_tokens: 2872, cache_read_input_tokens: 47053, output_tokens: 333 }),
        '',
      ].join('\n'),
      'utf8',
    )
    assert.equal(tokensFromTranscript(path), 50260)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tokensFromTranscript never invents a number', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-tx-'))
  try {
    const empty = join(dir, 'empty.jsonl')
    writeFileSync(empty, `${JSON.stringify({ type: 'user' })}\n`, 'utf8')
    assert.equal(tokensFromTranscript(empty), null, 'no assistant turn')
    assert.equal(tokensFromTranscript(join(dir, 'missing.jsonl')), null)
    assert.equal(tokensFromTranscript(''), null)
    assert.equal(tokensFromTranscript(undefined), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveTokenCount falls back to the transcript, but the report wins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-tx-'))
  try {
    const path = join(dir, 'agent-1.jsonl')
    writeFileSync(`${path}`, `${turn({ input_tokens: 1, output_tokens: 9 })}\n`, 'utf8')
    const payload = { agent_transcript_path: path }
    assert.equal(resolveTokenCount({}, payload), 10)
    assert.equal(
      resolveTokenCount({ usage: { totalTokens: 7 } }, payload),
      7,
      'a self-reported count still wins',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a transcript-derived count is marked approximate', () => {
  const approx = formatTaskEntry(sampleReport, { tokens: 4200, tokensApprox: true })
  assert.match(approx, /\*\*Tokens\*\*: ~4200/)
  const exact = formatTaskEntry(sampleReport, { tokens: 4200 })
  assert.match(exact, /\*\*Tokens\*\*: 4200/)
  assert.doesNotMatch(exact, /~/)
  const none = formatTaskEntry(sampleReport, { tokens: null, tokensApprox: true })
  assert.match(none, /\*\*Tokens\*\*: n\/a/, 'no tilde on a missing number')
})

test('a programming error inside the writer is reported, not swallowed', () => {
  const booby = {
    ...sampleReport,
    get goal() {
      throw new TypeError('dropped import')
    },
  }
  const seen = []
  const realError = console.error
  console.error = (...args) => seen.push(args)
  try {
    appendTaskMemory(booby) // still non-fatal
  } finally {
    console.error = realError
  }
  assert.equal(seen.length, 1)
  assert.match(String(seen[0][0]), /appendTaskMemory failed/)
  assert.ok(seen[0][1] instanceof TypeError)
})
