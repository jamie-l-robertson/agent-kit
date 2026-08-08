import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installFrom } from './install.mjs'

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('installFrom copies sync-project-skills, docs, and preserves decisions.md', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    const mem = join(target, '.agents', 'memory')
    mkdirSync(mem, { recursive: true })
    const marker = '# project decisions\n\nkeep-me\n'
    writeFileSync(join(mem, 'decisions.md'), marker)

    installFrom(kitRoot, {
      force: true,
      kitLabel: 'test',
      target,
    })

    assert.ok(
      existsSync(join(target, 'scripts', 'sync-project-skills.mjs')),
      'sync-project-skills.mjs',
    )
    assert.ok(
      existsSync(join(target, 'scripts', 'sync-tool-adapters.mjs')),
      'sync-tool-adapters.mjs',
    )
    assert.ok(
      existsSync(join(target, 'docs', 'routing-scenarios.json')),
      'docs/routing-scenarios.json',
    )
    assert.equal(readFileSync(join(mem, 'decisions.md'), 'utf8'), marker)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
