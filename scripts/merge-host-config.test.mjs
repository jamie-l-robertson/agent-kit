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
  CLAUDE_GATE,
  KIT_AGENT_MATCHER,
} from './merge-host-config.mjs'
import { PROJECT_AGENTS } from '../.claude/hooks/gate-core.mjs'

test('KIT_AGENT_MATCHER stays in sync with PROJECT_AGENTS', () => {
  assert.equal(KIT_AGENT_MATCHER, [...PROJECT_AGENTS].sort().join('|'))
})

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

test('mergeClaudeSettings upgrades a legacy gate command in place', () => {
  const target = mkdtempSync(join(tmpdir(), 'kit-merge-legacy-'))
  const legacy = 'node .claude/hooks/adapters/claude.mjs'
  try {
    mkdirSync(join(target, '.claude'), { recursive: true })
    writeFileSync(
      join(target, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          SubagentStop: [
            { hooks: [{ type: 'command', command: legacy }] },
          ],
          PreToolUse: [
            {
              matcher: 'Agent|Task',
              hooks: [
                { type: 'command', command: legacy },
                { type: 'command', command: 'node foreign-audit.mjs' },
              ],
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
    const all = Object.values(doc.hooks)
      .flat()
      .flatMap((e) => e.hooks || [])
      .map((h) => h.command)
    assert.equal(
      all.filter((c) => c === legacy).length,
      0,
      'legacy command must be swept',
    )
    assert.equal(
      all.filter((c) => c === CLAUDE_GATE).length,
      5,
      'exactly one kit gate per hook event',
    )
    assert.ok(all.includes('node foreign-audit.mjs'), 'foreign hook survives')
    // Old matcher-less SubagentStop entry replaced by the kit-agent matcher.
    assert.equal(doc.hooks.SubagentStop.length, 1)
    assert.match(doc.hooks.SubagentStop[0].matcher, /frontend/)
    assert.ok(doc.permissions.allow.length > 0)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
