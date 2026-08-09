#!/usr/bin/env node
/**
 * Install this agent kit into the current project (cwd).
 *
 * From GitHub (default):
 *   AGENT_KIT_REPO=jamie-l-robertson/agent-kit node scripts/install.mjs
 *
 * From a local kit checkout:
 *   node scripts/install.mjs --from=/path/to/agent-kit
 *
 * Env:
 *   AGENT_KIT_REPO  owner/name (default: jamie-l-robertson/agent-kit)
 *   AGENT_KIT_REF   branch/tag/sha (default: main)
 *   AGENT_KIT_FORCE=1  overwrite existing AGENTS.md / CLAUDE.md / differing scripts
 *
 * Pin installs with AGENT_KIT_REF=<tag> after the kit tags a release (DEFAULT_REF
 * stays main until you tag; prefer a tag in production consumers).
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mergeCursorHooks,
  mergeClaudeSettings,
} from './merge-host-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KIT_ROOT_WHEN_LOCAL = resolve(__dirname, '..')

const DEFAULT_REPO = 'jamie-l-robertson/agent-kit'
const DEFAULT_REF = 'main'

const MEMORY_PRESERVE = [
  'install-audit.md',
  'decisions.md',
  'mcp-usage.md',
]

const RULE_KEEP_NAMES = [
  'design-system.md',
  'frontend-standards.md',
  'backend-standards.md',
  'api-standards.md',
  'cloud-standards.md',
  'devops-standards.md',
  'infrastructure-standards.md',
  'security-standards.md',
  'risk-standards.md',
]

function parseArgs(argv) {
  let from = null
  let force = process.env.AGENT_KIT_FORCE === '1'
  for (const a of argv) {
    if (a.startsWith('--from=')) from = resolve(a.slice('--from='.length))
    else if (a === '--force') force = true
    else if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return { from, force }
}

function printHelp() {
  console.log(`Install agent kit into the current directory.

Usage:
  node scripts/install.mjs [--from=PATH] [--force]

Env:
  AGENT_KIT_REPO   GitHub owner/repo (default: jamie-l-robertson/agent-kit)
  AGENT_KIT_REF    ref (default: ${DEFAULT_REF})
  AGENT_KIT_FORCE  1 to overwrite AGENTS.md / CLAUDE.md
`)
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
}

function ensureInstallAuditHeader(target) {
  const dest = join(target, '.agents', 'memory', 'install-audit.md')
  ensureDir(dirname(dest))
  if (!existsSync(dest)) {
    writeFileSync(
      dest,
      `# Install audit log

Append-only. Records when install/rsync **kept** a project-owned file instead of writing the kit version.
Use for support, bug tracking, and knowing which stack-card files are project-local.

<!-- Entries go below this line -->
`,
      'utf8',
    )
  }
  return dest
}

function appendInstallKeep(target, { path, kit, force }) {
  const dest = ensureInstallAuditHeader(target)
  const ts = new Date().toISOString()
  const entry = `
## ${ts} — kept project file

- **Path**: ${path}
- **Action**: kept-project (kit version not written)
- **Kit**: ${kit}
- **Force**: ${force}
- **Why**: destination already existed; pass --force / AGENT_KIT_FORCE=1 to replace
- **Note**: Project is using its own version of this file — report kit bugs against kit sources; report project stack-card bugs against this path. Run the **setup** skill to merge missing kit-required sections (copy-paste append blocks).
`
  writeFileSync(dest, readFileSync(dest, 'utf8').replace(/\s*$/, '') + entry + '\n', 'utf8')
}

function mergeGitignore(target, kitGitignorePath) {
  if (!existsSync(kitGitignorePath)) return
  const kitLines = readFileSync(kitGitignorePath, 'utf8')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith('#'))

  const dest = join(target, '.gitignore')
  const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : ''
  const have = new Set(
    existing
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  )
  const add = kitLines.filter((l) => !have.has(l.trim()))
  if (add.length === 0) return

  const block = ['', '# agent kit', ...add, ''].join('\n')
  writeFileSync(dest, existing.replace(/\s*$/, '') + block, 'utf8')
  console.log('Merged kit ignore rules into .gitignore')
}

function copyDir(src, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true, force: true })
}

function copyTreeFiltered(src, dest, { skipFiles = new Set() } = {}, rel = '') {
  ensureDir(dest)
  for (const name of readdirSync(src)) {
    const from = join(src, name)
    const to = join(dest, name)
    const childRel = rel ? `${rel}/${name}` : name
    if (skipFiles.has(childRel)) continue
    if (statSync(from).isDirectory()) {
      copyTreeFiltered(from, to, { skipFiles }, childRel)
    } else {
      cpSync(from, to)
    }
  }
}

function snapshotMemoryFiles(target) {
  /** @type {Map<string, string>} */
  const out = new Map()
  const mem = join(target, '.agents', 'memory')
  for (const name of MEMORY_PRESERVE) {
    const p = join(mem, name)
    if (existsSync(p)) out.set(name, readFileSync(p, 'utf8'))
  }
  return out
}

function restoreMemoryFiles(target, snap) {
  const mem = join(target, '.agents', 'memory')
  ensureDir(mem)
  for (const [name, content] of snap) {
    writeFileSync(join(mem, name), content, 'utf8')
  }
}

function snapshotRuleKeeps(target) {
  /** @type {Map<string, string>} */
  const out = new Map()
  const rules = join(target, '.agents', 'rules')
  for (const name of RULE_KEEP_NAMES) {
    const p = join(rules, name)
    if (existsSync(p)) out.set(name, readFileSync(p, 'utf8'))
  }
  return out
}

function restoreRuleKeeps(target, snap, kitLabel) {
  const rules = join(target, '.agents', 'rules')
  ensureDir(rules)
  for (const [name, content] of snap) {
    writeFileSync(join(rules, name), content, 'utf8')
    appendInstallKeep(target, {
      path: `.agents/rules/${name}`,
      kit: kitLabel,
      force: false,
    })
  }
}

function copyKitScripts(kitRoot, target, { force = false } = {}) {
  const srcDir = join(kitRoot, 'scripts')
  const destDir = join(target, 'scripts')
  ensureDir(destDir)
  if (!existsSync(srcDir)) return
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith('.mjs') && !name.endsWith('.sh')) continue
    if (name.endsWith('.test.mjs')) continue
    const src = join(srcDir, name)
    const dest = join(destDir, name)
    if (existsSync(dest) && !force) {
      const a = readFileSync(src)
      const b = readFileSync(dest)
      if (!a.equals(b)) {
        console.log(
          `Skipped scripts/${name} (differs from kit; pass --force to overwrite)`,
        )
        continue
      }
    }
    cpSync(src, dest)
  }
}

function assertValidKitJson(kitRoot) {
  const paths = [
    join(kitRoot, '.cursor', 'hooks.json'),
    join(kitRoot, '.claude', 'settings.json'),
  ]
  for (const p of paths) {
    if (!existsSync(p)) continue
    try {
      JSON.parse(readFileSync(p, 'utf8'))
    } catch (err) {
      throw new Error(
        `Kit preflight: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}

function writeKitVersion(target, kitLabel) {
  const dest = join(target, '.agents', '.kit-version')
  ensureDir(dirname(dest))
  const lines = [
    `kit: ${kitLabel}`,
    `installedAt: ${new Date().toISOString()}`,
    '',
  ]
  writeFileSync(dest, lines.join('\n'), 'utf8')
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

/**
 * @param {string} kitRoot
 * @param {{ force?: boolean, kitLabel?: string, target?: string }} opts
 */
export function installFrom(kitRoot, { force = false, kitLabel, target = process.cwd() } = {}) {
  const required = [
    '.agents',
    '.cursor',
    '.claude',
    'scripts/sync-tool-adapters.mjs',
    'scripts/sync-project-skills.mjs',
    'scripts/merge-host-config.mjs',
  ]
  for (const rel of required) {
    if (!existsSync(join(kitRoot, rel))) {
      throw new Error(`Kit incomplete: missing ${rel} under ${kitRoot}`)
    }
  }
  assertValidKitJson(kitRoot)

  const label = kitLabel || kitRoot
  const priorMemory = snapshotMemoryFiles(target)
  const priorRules = snapshotRuleKeeps(target)
  const priorCursorHooks = readJsonIfExists(join(target, '.cursor', 'hooks.json'))
  const priorClaudeSettings = readJsonIfExists(
    join(target, '.claude', 'settings.json'),
  )

  copyDir(join(kitRoot, '.agents'), join(target, '.agents'))
  writeKitVersion(target, label)
  copyTreeFiltered(join(kitRoot, '.cursor'), join(target, '.cursor'), {
    skipFiles: new Set(['hooks.json']),
  })
  copyTreeFiltered(join(kitRoot, '.claude'), join(target, '.claude'), {
    skipFiles: new Set(['settings.json']),
  })

  // Restore project host configs before merge so foreign entries survive
  if (priorCursorHooks != null) {
    ensureDir(join(target, '.cursor'))
    writeFileSync(join(target, '.cursor', 'hooks.json'), priorCursorHooks, 'utf8')
  } else {
    // seed from kit then merge (idempotent)
    const kitHooks = join(kitRoot, '.cursor', 'hooks.json')
    if (existsSync(kitHooks)) {
      ensureDir(join(target, '.cursor'))
      cpSync(kitHooks, join(target, '.cursor', 'hooks.json'))
    }
  }
  if (priorClaudeSettings != null) {
    ensureDir(join(target, '.claude'))
    writeFileSync(
      join(target, '.claude', 'settings.json'),
      priorClaudeSettings,
      'utf8',
    )
  } else {
    const kitSettings = join(kitRoot, '.claude', 'settings.json')
    if (existsSync(kitSettings)) {
      ensureDir(join(target, '.claude'))
      cpSync(kitSettings, join(target, '.claude', 'settings.json'))
    }
  }

  mergeCursorHooks(target, { failOnInvalidJson: true })
  mergeClaudeSettings(target, { failOnInvalidJson: true })

  // gate shim
  ensureDir(join(target, '.cursor', 'hooks'))
  writeFileSync(
    join(target, '.cursor', 'hooks', 'gate-subagents.mjs'),
    `#!/usr/bin/env node\nimport '../../.agents/hooks/adapters/cursor.mjs'\n`,
    'utf8',
  )

  restoreMemoryFiles(target, priorMemory)
  restoreRuleKeeps(target, priorRules, label)

  mkdirSync(join(target, '.github'), { recursive: true })
  for (const sub of ['agents', 'skills', 'instructions']) {
    const src = join(kitRoot, '.github', sub)
    if (existsSync(src)) copyDir(src, join(target, '.github', sub))
  }

  copyKitScripts(kitRoot, target, { force })

  const kitDocs = existsSync(join(kitRoot, 'docs', 'agent-kit'))
    ? join(kitRoot, 'docs', 'agent-kit')
    : existsSync(join(kitRoot, 'docs'))
      ? join(kitRoot, 'docs')
      : null
  if (kitDocs) {
    copyDir(kitDocs, join(target, 'docs', 'agent-kit'))
  }

  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const dest = join(target, file)
    const src = join(kitRoot, file)
    if (!existsSync(src)) continue
    if (existsSync(dest) && !force) {
      appendInstallKeep(target, { path: file, kit: label, force: false })
      console.log(
        `Kept existing ${file} (pass --force or AGENT_KIT_FORCE=1 to replace). Logged to .agents/memory/install-audit.md — run **setup** to merge kit-required sections.`,
      )
    } else {
      cpSync(src, dest)
      console.log(`Wrote ${file}`)
    }
  }

  mergeGitignore(target, join(kitRoot, '.gitignore'))

  refreshSkillsInventory(target, kitRoot)
}

/**
 * Regenerate skills-inventory + AGENTS.md Skills line for `target`.
 * Runs the *kit*'s sync-project-skills with --root so stale consumer scripts
 * cannot break refresh, and install.mjs stays loadable without .agents/.
 */
function refreshSkillsInventory(target, kitRoot) {
  const agentsMd = join(target, 'AGENTS.md')
  const script = join(kitRoot, 'scripts', 'sync-project-skills.mjs')
  if (!existsSync(agentsMd) || !existsSync(script)) {
    console.log('Skipped skills inventory refresh (missing AGENTS.md or kit sync script)')
    return
  }
  const r = spawnSync(
    process.execPath,
    [script, `--root=${target}`],
    { encoding: 'utf8' },
  )
  if (r.stdout?.trim()) console.log(r.stdout.trim())
  if (r.status !== 0) {
    if (r.stderr?.trim()) console.error(r.stderr.trim())
    throw new Error(
      `skills inventory refresh failed (exit ${r.status}). Run: node scripts/sync-project-skills.mjs`,
    )
  }
}

function downloadGithubKit(repo, ref) {
  const url = `https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(ref)}`
  const tmp = mkdtempSync(join(tmpdir(), 'agent-kit-'))
  const tarball = join(tmp, 'kit.tar.gz')

  console.log(`Downloading ${repo}@${ref} …`)
  try {
    execFileSync('curl', ['-fsSL', url, '-o', tarball], { stdio: 'inherit' })
  } catch {
    rmSync(tmp, { recursive: true, force: true })
    throw new Error(
      `Failed to download ${url}\nSet AGENT_KIT_REPO=owner/name and AGENT_KIT_REF=branch if needed.`,
    )
  }

  execFileSync('tar', ['-xzf', tarball, '-C', tmp], { stdio: 'inherit' })
  const entries = readdirSync(tmp).filter((n) => {
    const p = join(tmp, n)
    return statSync(p).isDirectory() && n !== '.' && n !== '..'
  })
  if (entries.length !== 1) {
    rmSync(tmp, { recursive: true, force: true })
    throw new Error('Unexpected tarball layout from GitHub')
  }
  return { kitRoot: join(tmp, entries[0]), cleanup: () => rmSync(tmp, { recursive: true, force: true }) }
}

function main() {
  const { from, force } = parseArgs(process.argv.slice(2))
  const TARGET = process.cwd()
  let cleanup = null
  let kitRoot = from

  try {
    if (!kitRoot) {
      const localAgents = join(KIT_ROOT_WHEN_LOCAL, '.agents')
      const repo = process.env.AGENT_KIT_REPO || DEFAULT_REPO
      const ref = process.env.AGENT_KIT_REF || DEFAULT_REF
      const preferLocal =
        existsSync(localAgents) &&
        !process.env.AGENT_KIT_REPO &&
        process.env.AGENT_KIT_USE_LOCAL !== '0'

      if (preferLocal && KIT_ROOT_WHEN_LOCAL !== TARGET) {
        kitRoot = KIT_ROOT_WHEN_LOCAL
        console.log(`Using local kit at ${kitRoot}`)
      } else if (preferLocal && KIT_ROOT_WHEN_LOCAL === TARGET) {
        console.log('Already inside the kit repo — nothing to install into itself.')
        console.log('Run from your project root, or pass --from=/path/to/kit')
        process.exit(1)
      } else {
        const dl = downloadGithubKit(repo, ref)
        kitRoot = dl.kitRoot
        cleanup = dl.cleanup
      }
    }

    const kitLabel = from
      ? `--from=${kitRoot}`
      : `${process.env.AGENT_KIT_REPO || DEFAULT_REPO}@${process.env.AGENT_KIT_REF || DEFAULT_REF}`
    console.log(`Installing into ${TARGET}`)
    installFrom(kitRoot, { force, kitLabel, target: TARGET })
    console.log(`
Done.

Next — configure the stack card:
  Ask your coding agent to run the **setup** skill
  (e.g. “run setup” or /setup).
  If AGENTS.md / CLAUDE.md were kept, setup will offer copy-paste append blocks
  for any missing kit-required sections (see .agents/memory/install-audit.md).

Optional:
  node scripts/check-agent-kit.mjs             # multi-host health
  node scripts/sync-tool-adapters.mjs          # after you edit .agents/
  node scripts/sync-tool-adapters.mjs --check  # detect adapter drift
  node scripts/sync-project-skills.mjs         # skills inventory (setup runs this)
`)
  } finally {
    if (cleanup) cleanup()
  }
}

/** True when this file is the process entry (realpath — macOS /var vs /private/var). */
function isMainModule(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false
  const self = fileURLToPath(metaUrl)
  try {
    return realpathSync(self) === realpathSync(argv1)
  } catch {
    return resolve(self) === resolve(argv1)
  }
}

if (isMainModule()) {
  main()
}
