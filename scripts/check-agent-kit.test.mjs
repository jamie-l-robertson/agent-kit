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
  checkAppendBlocksArePointers,
} from './check-agent-kit.mjs'

test('parseKitVersion reads kit: and source:', () => {
  const fields = parseKitVersion('kit: agent-kit@0.2.0\nsource: repo\n')
  assert.equal(fields.kit, 'agent-kit@0.2.0')
  assert.equal(fields.source, 'repo')
})

test('assertKitVersion rejects bare semver and missing kit:', () => {
  assert.equal(assertKitVersion('0.2.0').ok, false)
  assert.equal(assertKitVersion('').ok, false)
  assert.equal(assertKitVersion('source: repo\n').ok, false)
  assert.equal(assertKitVersion('kit: agent-kit@0.2.0\nsource: repo\n').ok, true)
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

// --- append-blocks must point, never copy ---------------------------------
// The pasted version drifted: standards rows lost their example paths, No owner
// lost `researcher`, and the CLAUDE.md block lost `## Routing` entirely.

const POINTERS = `# Kit-required append blocks

| Block | Source | Section |
|-------|--------|---------|
| Stack | \`.claude/skills/setup/AGENTS.template.md\` | \`## Stack\` |
| Entry | \`CLAUDE.md\` | whole file |
`

function withKitRoot(appendBlocks, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-ab-'))
  try {
    mkdirSync(join(dir, '.claude', 'skills', 'setup'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'skills', 'setup', 'AGENTS.template.md'), '# card\n')
    writeFileSync(join(dir, 'CLAUDE.md'), '# entry\n')
    writeFileSync(
      join(dir, '.claude', 'skills', 'setup', 'append-blocks.md'),
      appendBlocks,
    )
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('checkAppendBlocksArePointers accepts a pointer-only file', () => {
  withKitRoot(POINTERS, (dir) => {
    assert.deepEqual(checkAppendBlocksArePointers(dir), [])
  })
})

test('checkAppendBlocksArePointers rejects a re-pasted stack row', () => {
  const pasted = `${POINTERS}\n- **DevOps standards**: <!-- repo path — or n/a -->\n`
  withKitRoot(pasted, (dir) => {
    const errors = checkAppendBlocksArePointers(dir)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /pastes a stack row/)
  })
})

test('checkAppendBlocksArePointers rejects a re-pasted section body', () => {
  const pasted = `${POINTERS}\n## No owner\n\nPure cloud-console ops...\n`
  withKitRoot(pasted, (dir) => {
    assert.match(checkAppendBlocksArePointers(dir)[0], /pastes the "## No owner"/)
  })
})

test('checkAppendBlocksArePointers catches a pointer to a file that is gone', () => {
  withKitRoot(POINTERS, (dir) => {
    rmSync(join(dir, '.claude', 'skills', 'setup', 'AGENTS.template.md'))
    assert.match(
      checkAppendBlocksArePointers(dir).join('\n'),
      /AGENTS.template.md, which does not exist/,
    )
  })
})
