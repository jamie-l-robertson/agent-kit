import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installFrom } from './install.mjs'

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('installFrom copies runtime scripts, docs/agent-kit, preserves decisions.md', () => {
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
      existsSync(join(target, 'scripts', 'merge-host-config.mjs')),
      'merge-host-config.mjs',
    )
    assert.ok(
      existsSync(join(target, 'docs', 'agent-kit', 'routing-scenarios.json')),
      'docs/agent-kit/routing-scenarios.json',
    )
    assert.equal(readFileSync(join(mem, 'decisions.md'), 'utf8'), marker)
    const scriptNames = readdirSync(join(target, 'scripts'))
    assert.ok(
      !scriptNames.some((n) => n.endsWith('.test.mjs')),
      'must not copy *.test.mjs',
    )
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('install merges host configs and preserves foreign github workflow', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    mkdirSync(join(target, '.cursor'), { recursive: true })
    mkdirSync(join(target, '.claude'), { recursive: true })
    mkdirSync(join(target, '.github', 'workflows'), { recursive: true })
    mkdirSync(join(target, '.agents', 'rules'), { recursive: true })

    writeFileSync(
      join(target, '.cursor', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          afterFileEdit: [{ command: 'node format.js' }],
        },
      }),
      'utf8',
    )
    writeFileSync(
      join(target, '.claude', 'settings.json'),
      JSON.stringify({
        permissions: { allow: ['Bash'] },
        env: { FOO: 'bar' },
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'node audit.sh' }],
            },
          ],
        },
      }),
      'utf8',
    )
    writeFileSync(
      join(target, '.github', 'workflows', 'foo.yml'),
      'name: foo\n',
      'utf8',
    )
    writeFileSync(
      join(target, '.agents', 'rules', 'design-system.md'),
      '# project design system\n\nkeep-tokens\n',
      'utf8',
    )
    mkdirSync(join(target, 'docs'), { recursive: true })
    writeFileSync(join(target, 'docs', 'routing-scenarios.md'), '# project routing\n')

    installFrom(kitRoot, { force: true, kitLabel: 'test', target })

    const hooks = JSON.parse(
      readFileSync(join(target, '.cursor', 'hooks.json'), 'utf8'),
    )
    assert.ok(
      hooks.hooks.afterFileEdit?.some((e) => e.command === 'node format.js'),
      'foreign cursor hook preserved',
    )
    assert.ok(
      hooks.hooks.subagentStart?.some((e) =>
        String(e.command).includes('cursor.mjs'),
      ),
      'kit cursor gate merged',
    )

    const settings = JSON.parse(
      readFileSync(join(target, '.claude', 'settings.json'), 'utf8'),
    )
    assert.deepEqual(settings.permissions, { allow: ['Bash'] })
    assert.equal(settings.env.FOO, 'bar')
    assert.ok(
      settings.hooks.PreToolUse.some((e) => e.matcher === 'Bash'),
      'foreign claude PreToolUse preserved',
    )
    assert.ok(
      settings.hooks.PreToolUse.some((e) => e.matcher === 'Agent|Task'),
      'kit claude gate merged',
    )

    assert.equal(
      readFileSync(join(target, '.github', 'workflows', 'foo.yml'), 'utf8'),
      'name: foo\n',
    )
    assert.equal(
      readFileSync(join(target, 'docs', 'routing-scenarios.md'), 'utf8'),
      '# project routing\n',
    )
    assert.ok(
      existsSync(join(target, 'docs', 'agent-kit', 'routing-scenarios.md')),
    )
    assert.equal(
      readFileSync(join(target, '.agents', 'rules', 'design-system.md'), 'utf8'),
      '# project design system\n\nkeep-tokens\n',
    )
    const audit = readFileSync(
      join(target, '.agents', 'memory', 'install-audit.md'),
      'utf8',
    )
    assert.match(audit, /design-system\.md/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('install keep path logs AGENTS.md without overwrite', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    writeFileSync(join(target, 'AGENTS.md'), '# project agents\n', 'utf8')
    installFrom(kitRoot, { force: false, kitLabel: 'test', target })
    assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), '# project agents\n')
    const audit = readFileSync(
      join(target, '.agents', 'memory', 'install-audit.md'),
      'utf8',
    )
    assert.match(audit, /AGENTS\.md/)
    assert.match(audit, /kept-project/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
