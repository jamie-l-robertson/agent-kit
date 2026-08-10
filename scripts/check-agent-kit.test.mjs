import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertKitVersion,
  parseKitVersion,
  parseAgentsStackValue,
  normalizeStackRef,
  isEmptyOrPlaceholderDesignSystem,
  checkDesignSystemAdherence,
} from './check-agent-kit.mjs'

test('parseKitVersion reads kit: and source:', () => {
  const fields = parseKitVersion('kit: cursor-agent-kit@0.2.0\nsource: repo\n')
  assert.equal(fields.kit, 'cursor-agent-kit@0.2.0')
  assert.equal(fields.source, 'repo')
})

test('assertKitVersion rejects bare semver and missing kit:', () => {
  assert.equal(assertKitVersion('0.2.0').ok, false)
  assert.equal(assertKitVersion('').ok, false)
  assert.equal(assertKitVersion('source: repo\n').ok, false)
  assert.equal(assertKitVersion('kit: cursor-agent-kit@0.2.0\nsource: repo\n').ok, true)
})

test('checkDesignSystemAdherence: empty stub requires n/a adherence', () => {
  const root = mkdtempSync(join(tmpdir(), 'akit-ds-'))
  try {
    mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
    writeFileSync(
      join(root, '.claude', 'rules', 'design-system.md'),
      '---\ndescription: stub\n---\n\n# Design system\n\n## Tokens\n\n- Color:\n',
      'utf8',
    )
    const bad = checkDesignSystemAdherence(
      root,
      [
        '- **Design system**: `.claude/rules/design-system.md`',
        '- **Design system adherence**: standard',
      ].join('\n'),
    )
    assert.equal(bad.ok, false)
    const ok = checkDesignSystemAdherence(
      root,
      [
        '- **Design system**: n/a',
        '- **Design system adherence**: n/a',
      ].join('\n'),
    )
    assert.equal(ok.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkDesignSystemAdherence: real DS requires strict|standard|loose', () => {
  const root = mkdtempSync(join(tmpdir(), 'akit-ds-'))
  try {
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'design.md'),
      '# Design\n\n- Color: navy\n- Type: display serif\n',
      'utf8',
    )
    const bad = checkDesignSystemAdherence(
      root,
      [
        '- **Design system**: docs/design.md',
        '- **Design system adherence**: n/a',
      ].join('\n'),
    )
    assert.equal(bad.ok, false)
    const ok = checkDesignSystemAdherence(
      root,
      [
        '- **Design system**: docs/design.md',
        '- **Design system adherence**: standard',
      ].join('\n'),
    )
    assert.equal(ok.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('parseAgentsStackValue + normalizeStackRef strip comments', () => {
  const md = '- **Design system**: <!-- e.g. path — or n/a -->\n'
  const raw = parseAgentsStackValue(md, 'Design system')
  assert.match(raw, /<!--/)
  assert.equal(normalizeStackRef(raw), '')
  assert.equal(isEmptyOrPlaceholderDesignSystem(process.cwd(), raw), true)
})
