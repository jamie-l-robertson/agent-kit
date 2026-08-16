import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { installFrom } from './install.mjs'
import { PRETOOL_MATCHER } from './merge-host-config.mjs'

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('installFrom copies runtime scripts, docs/agent-kit, preserves decisions.md', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    const mem = join(target, '.claude', 'memory')
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

test('install merges Claude settings and preserves foreign github workflow', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    mkdirSync(join(target, '.claude'), { recursive: true })
    mkdirSync(join(target, '.github', 'workflows'), { recursive: true })
    mkdirSync(join(target, '.claude', 'rules'), { recursive: true })

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
      join(target, '.claude', 'rules', 'design-system.md'),
      '# project design system\n\nkeep-tokens\n',
      'utf8',
    )
    mkdirSync(join(target, 'docs'), { recursive: true })
    writeFileSync(join(target, 'docs', 'routing-scenarios.md'), '# project routing\n')

    installFrom(kitRoot, { force: true, kitLabel: 'test', target })

    const settings = JSON.parse(
      readFileSync(join(target, '.claude', 'settings.json'), 'utf8'),
    )
    assert.ok(
      settings.permissions.allow.includes('Bash'),
      'foreign permission preserved',
    )
    assert.ok(
      settings.permissions.allow.includes(
        'Bash(node scripts/validate-worker-report.mjs:*)',
      ),
      'kit script allowlist added',
    )
    assert.equal(settings.env.FOO, 'bar')
    assert.ok(
      settings.hooks.PreToolUse.some((e) => e.matcher === 'Bash'),
      'foreign claude PreToolUse preserved',
    )
    assert.ok(
      settings.hooks.PreToolUse.some((e) => e.matcher === PRETOOL_MATCHER),
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
      readFileSync(join(target, '.claude', 'rules', 'design-system.md'), 'utf8'),
      '# project design system\n\nkeep-tokens\n',
    )
    const audit = readFileSync(
      join(target, '.claude', 'memory', 'install-audit.md'),
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
    const body = '# project agents\n\nno stack anchor here\n'
    writeFileSync(join(target, 'AGENTS.md'), body, 'utf8')
    installFrom(kitRoot, { force: false, kitLabel: 'test', target })
    assert.equal(
      readFileSync(join(target, 'AGENTS.md'), 'utf8'),
      body,
      'kept AGENTS.md must be byte-identical — "kept" means kept',
    )
    const audit = readFileSync(
      join(target, '.claude', 'memory', 'install-audit.md'),
      'utf8',
    )
    assert.match(audit, /AGENTS\.md/)
    assert.match(audit, /kept-project/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('install patches a kept AGENTS.md that has a Stack anchor', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    writeFileSync(
      join(target, 'AGENTS.md'),
      '# project agents\n\n## Stack\n\n- **App**: mine\n',
      'utf8',
    )
    installFrom(kitRoot, { force: false, kitLabel: 'test', target })
    const agents = readFileSync(join(target, 'AGENTS.md'), 'utf8')
    assert.match(agents, /# project agents/, 'kept project body')
    assert.match(agents, /## Stack\n\n- \*\*Skills\*\*:/, 'skills line anchored')
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('install skips differing scripts unless force; writes kit-version', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    mkdirSync(join(target, 'scripts'), { recursive: true })
    writeFileSync(
      join(target, 'scripts', 'sync-tool-adapters.mjs'),
      '// project custom\n',
      'utf8',
    )
    installFrom(kitRoot, { force: false, kitLabel: 'test@ref', target })
    assert.equal(
      readFileSync(join(target, 'scripts', 'sync-tool-adapters.mjs'), 'utf8'),
      '// project custom\n',
    )
    const ver = readFileSync(join(target, '.claude', '.kit-version'), 'utf8')
    assert.match(ver, /test@ref/)
    installFrom(kitRoot, { force: true, kitLabel: 'test@ref', target })
    assert.notEqual(
      readFileSync(join(target, 'scripts', 'sync-tool-adapters.mjs'), 'utf8'),
      '// project custom\n',
    )
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('install Claude merge keeps sibling hooks and adds SessionStart', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    mkdirSync(join(target, '.claude'), { recursive: true })
    writeFileSync(
      join(target, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: PRETOOL_MATCHER,
              hooks: [{ type: 'command', command: 'node sibling.mjs' }],
            },
          ],
        },
      }),
      'utf8',
    )
    installFrom(kitRoot, { force: true, kitLabel: 'test', target })
    const settings = JSON.parse(
      readFileSync(join(target, '.claude', 'settings.json'), 'utf8'),
    )
    const pre = settings.hooks.PreToolUse.find((e) => e.matcher === PRETOOL_MATCHER)
    const cmds = (pre?.hooks || []).map((h) => h.command)
    assert.ok(cmds.includes('node sibling.mjs'))
    assert.ok(cmds.some((c) => String(c).includes('claude.mjs')))
    assert.ok(settings.hooks.SessionStart?.length)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('install.mjs CLI entry runs when invoked via TMPDIR path', () => {
  // Regression: macOS argv path (/var/folders) vs import.meta.url (/private/var/...)
  // made isMain false, so curl|bash exited 0 with no install.
  const staging = mkdtempSync(join(tmpdir(), 'akit-cli-'))
  try {
    cpSync(join(kitRoot, 'scripts'), join(staging, 'scripts'), { recursive: true })
    const entry = join(staging, 'scripts', 'install.mjs')
    const r = spawnSync(process.execPath, [entry, '--help'], {
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr || 'non-zero exit')
    assert.match(
      r.stdout,
      /Install agent kit into the current directory/,
      `expected --help output; got ${JSON.stringify(r.stdout)}`,
    )
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
})

test('install refreshes stale skills-inventory.md (not preserved)', () => {
  const target = mkdtempSync(join(kitRoot, '.tmp-install-'))
  try {
    const mem = join(target, '.claude', 'memory')
    mkdirSync(mem, { recursive: true })
    writeFileSync(
      join(mem, 'skills-inventory.md'),
      '# stale inventory\n\nSTALE_MARKER_DO_NOT_KEEP\n',
    )
    writeFileSync(
      join(target, 'AGENTS.md'),
      '# Agent stack card\n\n## Stack\n\n- **Skills**: kit — none. Inventory: `.claude/memory/skills-inventory.md`.\n',
    )

    installFrom(kitRoot, {
      force: true,
      kitLabel: 'test',
      target,
    })

    const inv = readFileSync(join(mem, 'skills-inventory.md'), 'utf8')
    assert.ok(
      !inv.includes('STALE_MARKER_DO_NOT_KEEP'),
      'stale inventory must not be preserved',
    )
    assert.match(inv, /code-review/, 'inventory lists kit skills')

    const check = spawnSync(
      process.execPath,
      [join(target, 'scripts', 'sync-project-skills.mjs'), '--check'],
      { cwd: target, encoding: 'utf8' },
    )
    assert.equal(
      check.status,
      0,
      check.stderr || check.stdout || 'skills --check failed',
    )
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
