#!/usr/bin/env node
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  composeBody,
  isAlwaysOnRule,
  validateWorkers,
  composedAgentSource,
  parseFrontmatter,
  protocolDrift,
  expectedProtocolBlocks,
} from './sync-tool-adapters.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('composeBody expands protocol + nested include and leaves no markers', () => {
  const out = composeBody('Intro\n\n<!-- protocol:readonly -->\n\nOutro\n')
  assert.match(out, /Shared worker protocol/)
  assert.match(out, /Shared invariants/)
  assert.match(out, /Resolving AGENTS\.md refs/)
  assert.doesNotMatch(out, /<!--\s*(protocol|include):/)
})

test('implement/readonly/document protocols share nesting + never-assume-implement + evidence invariants', () => {
  for (const name of ['implement', 'readonly', 'document']) {
    const out = composeBody(`<!-- protocol:${name} -->\n`)
    assert.match(out, /No nesting|Shared invariants/i, name)
    assert.match(out, /never assume|Never assume/i, name)
    assert.match(out, /evidence|verificationResult/i, name)
  }
})

test('composeBody detects include cycles', () => {
  assert.throws(
    () => composeBody('<!-- protocol:does-not-exist-xyz -->'),
    /Missing protocol/,
  )
})

test('isAlwaysOnRule: default and path-only', () => {
  assert.equal(isAlwaysOnRule({}), true)
  assert.equal(isAlwaysOnRule({ activation: 'always' }), true)
  assert.equal(isAlwaysOnRule({ activation: 'path-only' }), false)
})

test('design-system rule is path-only', () => {
  const raw = readFileSync(
    join(root, '.claude/rules/design-system.md'),
    'utf8',
  )
  const { frontmatter } = parseFrontmatter(raw)
  assert.equal(frontmatter.activation, 'path-only')
  assert.equal(isAlwaysOnRule(frontmatter), false)
})

test('validateWorkers passes for current kit roster', () => {
  assert.doesNotThrow(() => validateWorkers())
})

test('composedAgentSource expands protocol markers when present', () => {
  const raw = `---\nname: demo\nmodel: inherit\n---\n\nIntro\n\n<!-- protocol:readonly -->\n`
  const composed = composedAgentSource(raw)
  assert.match(composed, /^---\n/)
  assert.match(composed, /Shared worker protocol/)
  assert.doesNotMatch(composed, /<!--\s*protocol:/)
})

test('every .claude agent has model frontmatter and no leftover markers', () => {
  const dir = join(root, '.claude', 'agents')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const raw = readFileSync(join(dir, f), 'utf8')
    const { frontmatter } = parseFrontmatter(raw)
    assert.ok(
      typeof frontmatter.model === 'string' && frontmatter.model.length > 0,
      `${f} missing model:`,
    )
    assert.doesNotMatch(
      raw,
      /<!--\s*(protocol|include):/,
      `${f} still has protocol/include markers`,
    )
  }
})

test('protocolDrift catches a dropped protocol bullet, naming the missing line', () => {
  const expected = expectedProtocolBlocks()
  const raw = composedAgentSource(
    `---\nname: demo\nmodel: inherit\n---\n\nIntro\n\n<!-- protocol:readonly -->\n`,
  )
  assert.deepEqual(protocolDrift('demo.md', raw, expected), [])

  const stale = raw.replace(/^- \*\*No DIY bypass\*\*.*$\n/m, '')
  const drift = protocolDrift('demo.md', stale, expected)
  assert.equal(drift.length, 1)
  assert.match(drift[0], /demo\.md "## Shared invariants" is stale/)
  assert.match(drift[0], /missing: - \*\*No DIY bypass\*\*/)
})

test('protocolDrift allows agent-specific ### sub-sections after a block', () => {
  const expected = expectedProtocolBlocks()
  const raw =
    composedAgentSource(
      `---\nname: demo\nmodel: inherit\n---\n\nIntro\n\n<!-- protocol:implement -->\n`,
    ) + '\n### Standards\n\nExtra agent-specific prose.\n'
  assert.deepEqual(protocolDrift('demo.md', raw, expected), [])
})

test('protocolDrift flags a whole missing protocol section', () => {
  const expected = expectedProtocolBlocks()
  const raw = composedAgentSource(
    `---\nname: demo\nmodel: inherit\n---\n\nIntro\n\n<!-- protocol:implement -->\n`,
  ).replace(/## Worker-report JSON \(canonical\)[\s\S]*$/, '')
  const drift = protocolDrift('demo.md', raw, expected)
  assert.ok(
    drift.some((m) => /missing whole protocol sections/.test(m)),
    drift.join('\n'),
  )
})

test('live agents match .claude/protocols/ (protocol drift check)', () => {
  const expected = expectedProtocolBlocks()
  const dir = join(root, '.claude', 'agents')
  const drift = readdirSync(dir)
    .filter((x) => x.endsWith('.md'))
    .flatMap((f) => protocolDrift(f, readFileSync(join(dir, f), 'utf8'), expected))
  assert.deepEqual(drift, [], drift.join('\n'))
})
