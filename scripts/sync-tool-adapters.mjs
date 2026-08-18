#!/usr/bin/env node
/**
 * Claude-only kit checks (single tree).
 *
 * Edit agents/skills under `.claude/` directly. Optional:
 *   node scripts/sync-tool-adapters.mjs          # merge settings + refresh CLAUDE.md
 *   node scripts/sync-tool-adapters.mjs --check  # roster / settings / marker checks
 *
 * Agents ship pre-expanded; `--check` recomposes the protocol blocks and fails on drift.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKERS, MANAGER } from '../.claude/hooks/gate-core.mjs'
import { KNOWN_KIT_SKILL_NAMES } from './kit-skill-names.mjs'
import { mergeClaudeSettings } from './merge-host-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const AGENTS_DIR = join(ROOT, '.claude', 'agents')
const SKILLS_DIR = join(ROOT, '.claude', 'skills')
const RULES_DIR = join(ROOT, '.claude', 'rules')
const PROTOCOLS_DIR = join(ROOT, '.claude', 'protocols')

const MARKER_RE = /<!--\s*(?:protocol|include):[a-z0-9_-]+\s*-->/i

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
}

function read(p) {
  return readFileSync(p, 'utf8')
}

function write(p, content) {
  ensureDir(dirname(p))
  writeFileSync(p, content, 'utf8')
}

export function parseFrontmatter(md) {
  if (!md.startsWith('---\n')) return { frontmatter: {}, body: md, rawFm: '' }
  const end = md.indexOf('\n---\n', 4)
  if (end === -1) return { frontmatter: {}, body: md, rawFm: '' }
  const rawFm = md.slice(4, end)
  const body = md.slice(end + 5)
  const frontmatter = {}
  let key = null
  /** @type {string[] | null} */
  let folded = null
  const flush = () => {
    if (!key) return
    if (folded) {
      frontmatter[key] = folded.join(' ').replace(/\s+/g, ' ').trim()
    }
    key = null
    folded = null
  }
  for (const line of rawFm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (m) {
      flush()
      key = m[1]
      const rest = m[2]
      if (/^>(?:-|\+)?$/.test(rest) || rest === '|' || rest === '|-') {
        folded = []
        frontmatter[key] = ''
      } else if (rest === 'true' || rest === 'false') {
        frontmatter[key] = rest === 'true'
        folded = null
      } else {
        frontmatter[key] = rest.replace(/^["']|["']$/g, '')
        folded = null
      }
    } else if (key && folded) {
      folded.push(line.replace(/^\s+/, ''))
    }
  }
  flush()
  return { frontmatter, body, rawFm }
}

export function formatFrontmatter(fields) {
  const lines = ['---']
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'boolean') {
      lines.push(`${k}: ${v}`)
      continue
    }
    if (Array.isArray(v)) {
      lines.push(`${k}: ${JSON.stringify(v)}`)
      continue
    }
    const s = String(v)
    if (s.length > 80 || s.includes('\n')) {
      lines.push(`${k}: >-`)
      for (const part of wrap(s, 72)) lines.push(`  ${part}`)
    } else {
      lines.push(`${k}: ${s}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n')
}

function wrap(s, width) {
  const words = s.split(/\s+/)
  const out = []
  let line = ''
  for (const w of words) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= width) line += ` ${w}`
    else {
      out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

/** @param {Record<string, unknown>} frontmatter */
export function isAlwaysOnRule(frontmatter) {
  const a = frontmatter.activation
  if (a === undefined || a === null || a === '' || a === 'always') return true
  if (a === 'path-only') return false
  console.warn(
    `warn: unrecognized rules activation "${a}" — treating as always-on`,
  )
  return true
}

function listAgentFiles() {
  if (!existsSync(AGENTS_DIR)) return []
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
}

function listKitSkillNames() {
  if (!existsSync(SKILLS_DIR)) return []
  return readdirSync(SKILLS_DIR)
    .filter((n) => {
      try {
        return statSync(join(SKILLS_DIR, n)).isDirectory()
      } catch {
        return false
      }
    })
    .filter((n) => KNOWN_KIT_SKILL_NAMES.has(n))
    .sort()
}

function loadProtocol(name, stack) {
  if (stack.has(name)) {
    throw new Error(
      `Protocol include cycle detected: ${[...stack, name].join(' → ')}`,
    )
  }
  const p = join(PROTOCOLS_DIR, `${name}.md`)
  if (!existsSync(p)) {
    throw new Error(`Missing protocol .claude/protocols/${name}.md`)
  }
  stack.add(name)
  const expanded = expandIncludes(read(p).trimEnd(), stack)
  stack.delete(name)
  return expanded
}

/**
 * Expand protocol markers and nested includes (for docs/tests).
 * Live agents under `.claude/agents/` should already be expanded.
 */
export function composeBody(body) {
  let out = body
  out = out.replace(
    /<!--\s*protocol:([a-z0-9_-]+)\s*-->/gi,
    (_m, name) => loadProtocol(name, new Set()),
  )
  out = expandIncludes(out, new Set())
  if (MARKER_RE.test(out)) {
    throw new Error(
      `Leftover protocol/include markers after compose: ${out.match(MARKER_RE)?.[0]}`,
    )
  }
  return out
}

function expandIncludes(text, stack = new Set()) {
  return text.replace(/<!--\s*include:([a-z0-9_-]+)\s*-->/gi, (_m, name) =>
    loadProtocol(name, stack),
  )
}

/** Composite protocols an agent's expanded body can legitimately come from. */
const PROTOCOL_VARIANTS = ['implement', 'readonly', 'document']

/**
 * Split a markdown body into `## `-delimited blocks (heading → block text).
 * Content before the first `## ` is ignored — that is agent-specific preamble.
 */
export function protocolBlocks(text) {
  /** @type {Map<string, string>} */
  const out = new Map()
  let heading = null
  let buf = []
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      if (heading !== null) out.set(heading, buf.join('\n').trimEnd())
      heading = line.slice(3).trim()
      buf = [line]
    } else if (heading !== null) {
      buf.push(line)
    }
  }
  if (heading !== null) out.set(heading, buf.join('\n').trimEnd())
  return out
}

/**
 * Expected protocol blocks: heading → set of acceptable texts (one per variant),
 * plus each variant's full heading list for completeness checks.
 */
export function expectedProtocolBlocks() {
  /** @type {Map<string, Set<string>>} */
  const blocks = new Map()
  const variantHeadings = []
  for (const v of PROTOCOL_VARIANTS) {
    const b = protocolBlocks(loadProtocol(v, new Set()))
    variantHeadings.push([...b.keys()])
    for (const [heading, text] of b) {
      if (!blocks.has(heading)) blocks.set(heading, new Set())
      blocks.get(heading).add(text)
    }
  }
  return { blocks, variantHeadings }
}

/** Lines in `want` that `got` does not contain (ignoring blank lines). */
function missingLines(want, got) {
  const have = new Set(got.split('\n').map((l) => l.trim()))
  return want
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !have.has(l))
}

/**
 * Drift between an agent's pre-expanded protocol blocks and `.claude/protocols/`.
 * @param {string} file agent filename, for messages
 * @param {string} raw agent file contents
 * @param {ReturnType<typeof expectedProtocolBlocks>} expected
 */
export function protocolDrift(file, raw, expected) {
  const mismatches = []
  const { body } = parseFrontmatter(raw)
  const blocks = protocolBlocks(body)

  for (const [heading, text] of blocks) {
    const accepted = expected.blocks.get(heading)
    // Prefix, not equality: agents may append their own `###` sub-sections
    // after a protocol block, but must not alter or drop the protocol text.
    if (!accepted || [...accepted].some((want) => text.startsWith(want))) continue
    // Report against the closest variant (fewest missing lines).
    const missing = [...accepted]
      .map((want) => missingLines(want, text))
      .sort((a, b) => a.length - b.length)[0]
    const detail = missing.length
      ? missing.map((l) => `\n      missing: ${l}`).join('')
      : '\n      (wording differs — re-copy the protocol block)'
    mismatches.push(
      `.claude/agents/${file} "## ${heading}" is stale vs .claude/protocols/${detail}`,
    )
  }

  if (
    blocks.has('Shared worker protocol') &&
    !expected.variantHeadings.some((hs) => hs.every((h) => blocks.has(h)))
  ) {
    mismatches.push(
      `.claude/agents/${file} is missing whole protocol sections (has: ${[...blocks.keys()].join(', ')})`,
    )
  }

  return mismatches
}

export function composedAgentSource(raw) {
  const { body, rawFm } = parseFrontmatter(raw)
  const composed = composeBody(body)
  if (!raw.startsWith('---\n')) {
    return composed.endsWith('\n') ? composed : `${composed}\n`
  }
  const fmBlock = `---\n${rawFm}\n---\n`
  const out = fmBlock + composed
  return out.endsWith('\n') ? out : `${out}\n`
}

export function validateWorkers() {
  const names = new Set(listAgentFiles().map((f) => basename(f, '.md')))
  if (!names.has(MANAGER)) {
    throw new Error(`Missing manager agent at .claude/agents/${MANAGER}.md`)
  }
  for (const w of WORKERS) {
    if (!names.has(w)) {
      throw new Error(`WORKERS entry "${w}" missing .claude/agents/${w}.md`)
    }
  }
  for (const n of names) {
    if (n !== MANAGER && !WORKERS.has(n)) {
      throw new Error(
        `Agent "${n}" exists but is not in WORKERS/MANAGER — add to gate-core.mjs or remove .claude/agents/${n}.md`,
      )
    }
  }
}

function alwaysOnRuleNames() {
  if (!existsSync(RULES_DIR)) return []
  return readdirSync(RULES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
    .filter((n) => {
      const { frontmatter } = parseFrontmatter(read(join(RULES_DIR, `${n}.md`)))
      return isAlwaysOnRule(frontmatter)
    })
    .sort()
}

export function expectedClaudeMdBody() {
  const ruleNames = alwaysOnRuleNames()
  const ruleList = ruleNames.map((n) => `- \`.claude/rules/${n}.md\``).join('\n')
  return `# Claude Code — agent kit

Follow the stack card in \`AGENTS.md\` for package manager, ownership, and narrow commands.

## Always-on rules

Read and apply these project rules:

${ruleList}

## Routing (read before starting work)

This project uses managed orchestration. **Hand the work to specialists — do not build it in the main chat.**

- **Multi-step, multi-domain, or research-dependent** (a feature, a page, anything touching UI + server + tests, or resting on facts nobody has sourced) → spawn the \`manager\` agent with the user's request verbatim. It plans via \`planner\` and dispatches the specialists.
- **One clear owner, one small change** (a typo, a single-file tweak) → spawn that specialist directly: \`frontend\` \`backend\` \`tester\` \`documenter\` \`devops\` \`infrastructure\`, or the audit-only \`researcher\` \`reviewer\` \`security\` \`risk\`.
- Unknown external facts, stats, or prior art → \`researcher\` first; it cites every claim.
- Doing implementer work yourself instead of spawning is a process fail. Roleplaying a specialist ("acting as frontend") is not dispatch — only a real Task/Agent spawn is.
- **Never pass \`name\` when spawning.** Put \`<agent>: <task>\` in \`description\` and set \`subagent_type\` to the kit agent. \`name\` makes the child an addressable teammate: it cannot dispatch specialists (the roster is flat), and its \`agent_type\` stops matching the \`SubagentStop\` matcher in \`.claude/settings.json\`, so the worker-report gate never runs and it can finish silently having reported nothing.

Exception: answering questions about the repo, and edits to the kit itself (\`.claude/\`, \`scripts/\`).

## Agents & skills

- Specialists: \`.claude/agents/\` (edit here — single tree)
- Skills: \`.claude/skills/\` (edit here — single tree)
- Decision log: \`.claude/memory/decisions.md\`
- Call-graph gate: \`.claude/settings.json\` → \`.claude/hooks/adapters/claude.mjs\` (workers cannot nest)

After editing agents/skills, run \`node scripts/sync-tool-adapters.mjs --check\` (and \`npm test\` / \`check-agent-kit\` as needed).
Skills inventory: \`node scripts/sync-project-skills.mjs\` / \`--check\`.
`
}

function claudeMdIsKeptProject() {
  const audit = join(ROOT, '.claude', 'memory', 'install-audit.md')
  if (!existsSync(audit)) return false
  const text = read(audit)
  return (
    /kept-project[\s\S]{0,200}\*\*Path\*\*:\s*`?CLAUDE\.md`?/i.test(text) ||
    /\*\*Path\*\*:\s*`?CLAUDE\.md`?[\s\S]{0,200}kept-project/i.test(text)
  )
}

function syncClaudeMd() {
  const force = process.argv.includes('--force-claude-md')
  if (!force && claudeMdIsKeptProject()) {
    console.log(
      'Skipped CLAUDE.md (install-audit kept-project; pass --force-claude-md to rewrite)',
    )
    return
  }
  write(join(ROOT, 'CLAUDE.md'), expectedClaudeMdBody())
}

function syncClaudeSettings() {
  mergeClaudeSettings(ROOT, { failOnInvalidJson: true })
}

function checkDrift() {
  const mismatches = []

  try {
    validateWorkers()
  } catch (err) {
    mismatches.push(err instanceof Error ? err.message : String(err))
  }

  const expectedBlocks = expectedProtocolBlocks()

  for (const file of listAgentFiles()) {
    const path = join(AGENTS_DIR, file)
    const raw = read(path)
    mismatches.push(...protocolDrift(file, raw, expectedBlocks))
    if (MARKER_RE.test(raw)) {
      mismatches.push(
        `.claude/agents/${file} still has protocol/include markers — expand before commit`,
      )
    }
    const { frontmatter } = parseFrontmatter(raw)
    if (!(typeof frontmatter.model === 'string' && frontmatter.model)) {
      mismatches.push(`.claude/agents/${file} missing model:`)
    }
    if (frontmatter.readonly === true || frontmatter.readonly === 'true') {
      const tools = String(frontmatter.disallowedTools || '')
      for (const need of ['Write', 'Edit', 'NotebookEdit']) {
        if (!tools.includes(need)) {
          mismatches.push(
            `.claude/agents/${file} missing disallowedTools ${need}`,
          )
        }
      }
    }
  }

  const kitSkills = listKitSkillNames()
  for (const name of [...KNOWN_KIT_SKILL_NAMES].sort()) {
    if (!kitSkills.includes(name)) {
      mismatches.push(`missing kit skill .claude/skills/${name}`)
    }
  }

  const claudeMd = join(ROOT, 'CLAUDE.md')
  if (!existsSync(claudeMd)) {
    mismatches.push('missing CLAUDE.md')
  } else if (!claudeMdIsKeptProject()) {
    if (read(claudeMd) !== expectedClaudeMdBody()) {
      mismatches.push('drift CLAUDE.md')
    }
  }

  const claudeSettings = join(ROOT, '.claude', 'settings.json')
  if (!existsSync(claudeSettings)) {
    mismatches.push('missing .claude/settings.json')
  } else {
    try {
      const doc = JSON.parse(read(claudeSettings))
      const gateCmd = 'adapters/claude.mjs'
      for (const key of [
        'SessionStart',
        'SessionEnd',
        'SubagentStart',
        'SubagentStop',
        'PreToolUse',
      ]) {
        const list = doc.hooks?.[key]
        if (!Array.isArray(list) || list.length === 0) {
          mismatches.push(`.claude/settings.json missing hooks.${key}`)
          continue
        }
        const flat = list.flatMap((e) => e?.hooks || [])
        const hasGate = flat.some((h) =>
          String(h?.command || '').includes(gateCmd),
        )
        if (!hasGate) {
          mismatches.push(
            `.claude/settings.json hooks.${key} missing kit claude gate command`,
          )
        }
      }
    } catch (err) {
      mismatches.push(
        `invalid .claude/settings.json: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const appendBlocks = join(SKILLS_DIR, 'setup', 'append-blocks.md')
  if (existsSync(appendBlocks)) {
    const ab = read(appendBlocks)
    for (const needle of [
      'skills-inventory.md',
      'mcp-usage.md',
      'Human approve',
    ]) {
      if (!ab.includes(needle)) {
        mismatches.push(`append-blocks.md missing "${needle}"`)
      }
    }
  } else {
    mismatches.push('missing .claude/skills/setup/append-blocks.md')
  }

  return mismatches
}

function runSync() {
  validateWorkers()
  syncClaudeSettings()
  syncClaudeMd()
  console.log(
    'Claude kit refreshed (settings + CLAUDE.md). Agents/skills: edit .claude/ directly.',
  )
}

function main() {
  const check = process.argv.includes('--check')
  if (check) {
    const mismatches = checkDrift()
    if (mismatches.length) {
      console.error('Kit check failed:')
      for (const m of mismatches) console.error(`  - ${m}`)
      process.exit(1)
    }
    console.log('Adapter check OK (no drift)')
    return
  }
  runSync()
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  main()
}
