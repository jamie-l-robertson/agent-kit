import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  formatDecisionEntry,
  formatMcpEntry,
  validateEntry,
  appendEntry,
  DECISIONS_HEADER,
  MCP_HEADER,
} from './append-memory.mjs'

const at = new Date('2026-08-15T12:00:00Z')

const decision = {
  title: 'Pager over infinite scroll',
  task: 'blog pagination',
  status: 'decided',
  decision: 'Numbered pager',
  options: 'pager | infinite scroll',
  why: 'shareable URLs',
  appliesTo: 'app/blog/**, frontend',
}

const mcp = {
  server: 'github',
  tool: 'get_issue',
  task: 'ingest #42',
  outcome: 'ok',
  why: 'fetched issue body + children',
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-mem-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('formatDecisionEntry emits every canonical field, defaulting the optional ones', () => {
  const out = formatDecisionEntry(decision, at)
  assert.match(out, /^## 2026-08-15T12:00:00\.000Z — Pager over infinite scroll$/m)
  for (const field of [
    'Task',
    'Status',
    'Decision',
    'Options considered',
    'Why',
    'Applies to',
    'Worker IDs',
    'Supersedes',
  ]) {
    assert.match(out, new RegExp(`\\*\\*${field}\\*\\*:`), `missing ${field}`)
  }
  assert.match(out, /\*\*Worker IDs\*\*: none/)
  assert.match(out, /\*\*Supersedes\*\*: none/)
})

test('formatMcpEntry titles the entry by server/tool', () => {
  const out = formatMcpEntry(mcp, at)
  assert.match(out, /^## 2026-08-15T12:00:00\.000Z — mcp:github\/get_issue$/m)
  assert.match(out, /\*\*Outcome\*\*: ok/)
  assert.match(out, /\*\*Worker IDs\*\*: none/)
})

test('validateEntry names every missing required field at once', () => {
  const errs = validateEntry('decisions', { title: 'x' })
  assert.ok(errs.length >= 4, 'should report all gaps, not just the first')
  assert.ok(errs.some((e) => /decision/.test(e)))
  assert.equal(validateEntry('decisions', decision).length, 0)
  assert.equal(validateEntry('mcp', mcp).length, 0)
})

test('validateEntry rejects values outside the documented enums', () => {
  assert.ok(
    validateEntry('decisions', { ...decision, status: 'maybe' }).some((e) =>
      /status/.test(e),
    ),
  )
  assert.ok(
    validateEntry('mcp', { ...mcp, outcome: 'fine' }).some((e) => /outcome/.test(e)),
  )
})

test('appendEntry creates the log with its header, then appends without rewriting', () => {
  withDir((dir) => {
    const path = join(dir, 'decisions.md')
    appendEntry(path, DECISIONS_HEADER, formatDecisionEntry(decision, at))
    const first = readFileSync(path, 'utf8')
    assert.ok(first.startsWith(DECISIONS_HEADER.trimStart().slice(0, 20)))

    appendEntry(
      path,
      DECISIONS_HEADER,
      formatDecisionEntry({ ...decision, title: 'Second' }, at),
    )
    const second = readFileSync(path, 'utf8')
    assert.equal(second.match(/^## /gm).length, 2)
    assert.ok(second.startsWith(first.trimEnd().slice(0, 40)), 'history preserved')
  })
})

test('appendEntry leaves a hand-written header alone', () => {
  withDir((dir) => {
    const path = join(dir, 'mcp-usage.md')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, '# My own header\n\nkeep me\n', 'utf8')
    appendEntry(path, MCP_HEADER, formatMcpEntry(mcp, at))
    const text = readFileSync(path, 'utf8')
    assert.match(text, /# My own header/)
    assert.match(text, /keep me/)
    assert.doesNotMatch(text, /# MCP usage log/)
  })
})
