import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PLUGIN_KEY,
  detectNext,
  currentState,
  setPluginEnabled,
  localSettingsPath,
} from './vercel-plugin.mjs'

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'kit-vp-'))
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const readLocal = (root) => JSON.parse(readFileSync(localSettingsPath(root), 'utf8'))

test('detectNext reads the dependency and the config file', () => {
  withRoot((root) => {
    assert.equal(detectNext(root).isNext, false, 'empty dir is not Next')

    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ dependencies: { next: '15.0.0' } }),
      'utf8',
    )
    const byDep = detectNext(root)
    assert.equal(byDep.isNext, true)
    assert.match(byDep.reasons[0], /next@15\.0\.0/)

    writeFileSync(join(root, 'next.config.ts'), 'export default {}', 'utf8')
    assert.equal(detectNext(root).reasons.length, 2)
  })
})

test('detectNext survives an unreadable package.json', () => {
  withRoot((root) => {
    writeFileSync(join(root, 'package.json'), '{ not json', 'utf8')
    assert.equal(detectNext(root).isNext, false)
  })
})

test('detectNext ignores a project that merely mentions vercel', () => {
  withRoot((root) => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ devDependencies: { vercel: '59.1.3' } }),
      'utf8',
    )
    assert.equal(detectNext(root).isNext, false, 'the CLI alone is not a Next app')
  })
})

test('setPluginEnabled writes the toggle and round-trips through currentState', () => {
  withRoot((root) => {
    assert.equal(currentState(root), undefined, 'no file → inherits user scope')
    setPluginEnabled(root, false)
    assert.equal(currentState(root), false)
    assert.equal(readLocal(root).enabledPlugins[PLUGIN_KEY], false)
    setPluginEnabled(root, true)
    assert.equal(currentState(root), true)
  })
})

test('setPluginEnabled preserves other local settings and other plugins', () => {
  withRoot((root) => {
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(
      localSettingsPath(root),
      JSON.stringify({
        permissions: { allow: ['Bash(ls:*)'] },
        enabledPlugins: { 'other@thing': true },
      }),
      'utf8',
    )
    setPluginEnabled(root, false)
    const doc = readLocal(root)
    assert.deepEqual(doc.permissions, { allow: ['Bash(ls:*)'] })
    assert.equal(doc.enabledPlugins['other@thing'], true)
    assert.equal(doc.enabledPlugins[PLUGIN_KEY], false)
  })
})

test('setPluginEnabled refuses to clobber a broken file', () => {
  withRoot((root) => {
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(localSettingsPath(root), '{ not json', 'utf8')
    assert.throws(() => setPluginEnabled(root, false), /Invalid JSON/)
    assert.equal(readFileSync(localSettingsPath(root), 'utf8'), '{ not json')
  })
})

test('currentState treats a non-boolean value as inherit', () => {
  withRoot((root) => {
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(
      localSettingsPath(root),
      JSON.stringify({ enabledPlugins: { [PLUGIN_KEY]: 'yes' } }),
      'utf8',
    )
    assert.equal(currentState(root), undefined)
  })
})
