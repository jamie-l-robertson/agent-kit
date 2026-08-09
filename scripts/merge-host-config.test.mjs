import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import {
  mergeClaudeSettings,
  mergeCursorHooks,
  CLAUDE_GATE,
  CURSOR_GATE,
} from './merge-host-config.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('mergeClaudeSettings preserves sibling foreign hooks on same matcher', () => {
  const target = mkdtempSync(join(tmpdir(), 'kit-merge-'))
  try {
    mkdirSync(join(target, '.claude'), { recursive: true })
    writeFileSync(
      join(target, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Agent|Task',
              hooks: [
                { type: 'command', command: 'node foreign-audit.mjs' },
              ],
            },
          ],
          SessionEnd: [
            {
              hooks: [{ type: 'command', command: 'node foreign-end.mjs' }],
            },
          ],
        },
      }),
      'utf8',
    )
    mergeClaudeSettings(target)
    const doc = JSON.parse(
      readFileSync(join(target, '.claude', 'settings.json'), 'utf8'),
    )
    const pre = doc.hooks.PreToolUse.find((e) => e.matcher === 'Agent|Task')
    assert.ok(pre)
    const cmds = pre.hooks.map((h) => h.command)
    assert.ok(cmds.includes('node foreign-audit.mjs'))
    assert.ok(cmds.includes(CLAUDE_GATE))
    assert.ok(doc.hooks.SessionStart?.length)
    const sessionCmds = (doc.hooks.SessionStart[0].hooks || []).map(
      (h) => h.command,
    )
    assert.ok(sessionCmds.includes(CLAUDE_GATE))
    const endCmds = (doc.hooks.SessionEnd[0].hooks || []).map((h) => h.command)
    assert.ok(endCmds.includes('node foreign-end.mjs'))
    assert.ok(endCmds.includes(CLAUDE_GATE))
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('mergeCursorHooks keeps foreign sessionStart entries', () => {
  const target = mkdtempSync(join(tmpdir(), 'kit-merge-c-'))
  try {
    mkdirSync(join(target, '.cursor'), { recursive: true })
    writeFileSync(
      join(target, '.cursor', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ command: 'node other.js' }],
        },
      }),
      'utf8',
    )
    mergeCursorHooks(target)
    const doc = JSON.parse(
      readFileSync(join(target, '.cursor', 'hooks.json'), 'utf8'),
    )
    const cmds = doc.hooks.sessionStart.map((e) => e.command)
    assert.ok(cmds.includes('node other.js'))
    assert.ok(cmds.includes(CURSOR_GATE))
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
