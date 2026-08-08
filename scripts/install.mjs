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
 *   AGENT_KIT_FORCE=1  overwrite existing AGENTS.md / CLAUDE.md
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KIT_ROOT_WHEN_LOCAL = resolve(__dirname, '..')

const DEFAULT_REPO = 'jamie-l-robertson/agent-kit'
const DEFAULT_REF = 'main'

const TARGET = process.cwd()

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

function ensureInstallAuditHeader() {
  const dest = join(TARGET, '.agents', 'memory', 'install-audit.md')
  ensureDir(dirname(dest))
  if (!existsSync(dest)) {
    writeFileSync(
      dest,
      `# Install audit log

Append-only. Records when install/rsync **kept** a project-owned file instead of writing the kit version.
Use for support, bug tracking, and knowing which stack-card files are project-local.

`,
      'utf8',
    )
  }
  return dest
}

function appendInstallKeep({ path, kit, force }) {
  const dest = ensureInstallAuditHeader()
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

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
}

function mergeGitignore(kitGitignorePath) {
  if (!existsSync(kitGitignorePath)) return
  const kitLines = readFileSync(kitGitignorePath, 'utf8')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith('#'))

  const dest = join(TARGET, '.gitignore')
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

function installFrom(kitRoot, { force, kitLabel }) {
  const required = ['.agents', '.cursor', '.claude', 'scripts/sync-tool-adapters.mjs']
  for (const rel of required) {
    if (!existsSync(join(kitRoot, rel))) {
      throw new Error(`Kit incomplete: missing ${rel} under ${kitRoot}`)
    }
  }

  const auditPath = join(TARGET, '.agents', 'memory', 'install-audit.md')
  const priorAudit = existsSync(auditPath) ? readFileSync(auditPath, 'utf8') : null

  copyDir(join(kitRoot, '.agents'), join(TARGET, '.agents'))
  copyDir(join(kitRoot, '.cursor'), join(TARGET, '.cursor'))
  copyDir(join(kitRoot, '.claude'), join(TARGET, '.claude'))

  // Preserve project install-audit across .agents overwrite
  if (priorAudit) {
    ensureDir(dirname(auditPath))
    writeFileSync(auditPath, priorAudit, 'utf8')
  }

  mkdirSync(join(TARGET, '.github'), { recursive: true })
  for (const sub of ['agents', 'skills', 'instructions']) {
    const src = join(kitRoot, '.github', sub)
    if (existsSync(src)) copyDir(src, join(TARGET, '.github', sub))
  }

  mkdirSync(join(TARGET, 'scripts'), { recursive: true })
  cpSync(
    join(kitRoot, 'scripts', 'sync-tool-adapters.mjs'),
    join(TARGET, 'scripts', 'sync-tool-adapters.mjs'),
  )
  // Keep install script available for re-runs / docs
  if (existsSync(join(kitRoot, 'scripts', 'install.mjs'))) {
    cpSync(join(kitRoot, 'scripts', 'install.mjs'), join(TARGET, 'scripts', 'install.mjs'))
  }
  if (existsSync(join(kitRoot, 'scripts', 'install.sh'))) {
    cpSync(join(kitRoot, 'scripts', 'install.sh'), join(TARGET, 'scripts', 'install.sh'))
  }

  const label = kitLabel || kitRoot
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const dest = join(TARGET, file)
    const src = join(kitRoot, file)
    if (!existsSync(src)) continue
    if (existsSync(dest) && !force) {
      appendInstallKeep({ path: file, kit: label, force: false })
      console.log(
        `Kept existing ${file} (pass --force or AGENT_KIT_FORCE=1 to replace). Logged to .agents/memory/install-audit.md — run **setup** to merge kit-required sections.`,
      )
    } else {
      cpSync(src, dest)
      console.log(`Wrote ${file}`)
    }
  }

  mergeGitignore(join(kitRoot, '.gitignore'))
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
  let cleanup = null
  let kitRoot = from

  try {
    if (!kitRoot) {
      // If this file lives inside a full kit checkout, prefer that (local reinstall).
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
    installFrom(kitRoot, { force, kitLabel })
    console.log(`
Done.

Next — configure the stack card:
  Ask your coding agent to run the **setup** skill
  (e.g. “run setup” or /setup).
  If AGENTS.md / CLAUDE.md were kept, setup will offer copy-paste append blocks
  for any missing kit-required sections (see .agents/memory/install-audit.md).

Optional:
  node scripts/sync-tool-adapters.mjs          # after you edit .agents/
  node scripts/sync-tool-adapters.mjs --check  # detect adapter drift
`)
  } finally {
    if (cleanup) cleanup()
  }
}

main()
