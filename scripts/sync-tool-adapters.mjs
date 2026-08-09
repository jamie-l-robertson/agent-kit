#!/usr/bin/env node
/**
 * Generate tool-specific adapter trees from canonical `.agents/` sources.
 *
 * Edit only under `.agents/` (and gate adapters), then run:
 *   node scripts/sync-tool-adapters.mjs
 *   node scripts/sync-tool-adapters.mjs --check
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  existsSync,
  statSync,
} from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKERS, MANAGER } from '../.agents/hooks/gate-core.mjs'
import { KNOWN_KIT_SKILL_NAMES } from './kit-skill-names.mjs'
import { mergeCursorHooks, mergeClaudeSettings } from './merge-host-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const AGENTS_DIR = join(ROOT, '.agents', 'agents')
const SKILLS_DIR = join(ROOT, '.agents', 'skills')
const RULES_DIR = join(ROOT, '.agents', 'rules')
const PROTOCOLS_DIR = join(ROOT, '.agents', 'protocols')

const MARKER_RE = /<!--\s*(?:protocol|include):[a-z0-9_-]+\s*-->/i

/** Kit agent basenames ever shipped — stale cleanup without touching foreign agent files. */
const KNOWN_KIT_AGENT_NAMES = new Set([
  MANAGER,
  ...WORKERS,
  // retired peers (merged into skills / never shipped)
  'accessibility',
  'architect',
  'performance',
  'cloud',
])

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
    throw new Error(`Missing protocol .agents/protocols/${name}.md`)
  }
  stack.add(name)
  const expanded = expandIncludes(read(p).trimEnd(), stack)
  stack.delete(name)
  return expanded
}

/**
 * Expand protocol markers and nested includes for adapter output.
 * Canonical sources keep `<!-- protocol:name -->` / `<!-- include:name -->`.
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
    throw new Error(`Missing manager agent at .agents/agents/${MANAGER}.md`)
  }
  for (const w of WORKERS) {
    if (!names.has(w)) {
      throw new Error(`WORKERS entry "${w}" missing .agents/agents/${w}.md`)
    }
  }
  for (const n of names) {
    if (n !== MANAGER && !WORKERS.has(n)) {
      throw new Error(
        `Agent "${n}" exists but is not in WORKERS/MANAGER — add to gate-core.mjs or remove .agents/agents/${n}.md`,
      )
    }
  }
}

function expectedClaudeAgent(name, description, body, readonly, model) {
  const fm = { name, description }
  if (model) fm.model = model
  // Soft readonly: Claude cannot match Cursor readonly:true; Bash may remain available.
  if (readonly) fm.disallowedTools = 'Write, Edit, NotebookEdit'
  return formatFrontmatter(fm) + body
}

function expectedCopilotAgent(name, description, body) {
  return formatFrontmatter({ name, description }) + body
}

function removeStaleKitAgents(dir, kitBasenames) {
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const base = basename(f, '.md')
    if (KNOWN_KIT_AGENT_NAMES.has(base) && !kitBasenames.has(base)) {
      rmSync(join(dir, f), { force: true })
    }
  }
}

function skillHasKitOwnerMarker(skillDir) {
  const skillMd = join(skillDir, 'SKILL.md')
  if (!existsSync(skillMd)) return false
  return /(?:^|\n)x-owner:\s*agent-kit(?:\n|$)/.test(read(skillMd))
}

function stampKitSkillOwner(skillDir) {
  const skillMd = join(skillDir, 'SKILL.md')
  if (!existsSync(skillMd)) return
  const raw = read(skillMd)
  if (/(?:^|\n)x-owner:\s*agent-kit(?:\n|$)/.test(raw)) return
  if (!raw.startsWith('---\n')) return
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return
  const stamped = `---\n${raw.slice(4, end)}\nx-owner: agent-kit\n---\n${raw.slice(end + 5)}`
  write(skillMd, stamped.endsWith('\n') ? stamped : `${stamped}\n`)
}

function removeStaleKitSkills(destRoot, kitSkills) {
  if (!existsSync(destRoot)) return
  for (const name of readdirSync(destRoot)) {
    const p = join(destRoot, name)
    if (!statSync(p).isDirectory()) continue
    // Only delete when x-owner: agent-kit is present (never basename alone)
    if (!skillHasKitOwnerMarker(p)) continue
    if (!kitSkills.has(name)) {
      rmSync(p, { recursive: true, force: true })
    }
  }
}

function syncSkills() {
  // Only sync skills listed in the kit manifest (or present under .agents/skills and in manifest)
  const onDisk = listKitSkillNames()
  const kitSkills = new Set(
    onDisk.filter((n) => KNOWN_KIT_SKILL_NAMES.has(n)),
  )

  // Stamp provenance on canonical sources so --check matches adapters
  for (const name of kitSkills) {
    stampKitSkillOwner(join(SKILLS_DIR, name))
  }

  for (const destRoot of [
    join(ROOT, '.cursor', 'skills'),
    join(ROOT, '.claude', 'skills'),
    join(ROOT, '.github', 'skills'),
  ]) {
    ensureDir(destRoot)
    for (const name of kitSkills) {
      const src = join(SKILLS_DIR, name)
      const dest = join(destRoot, name)
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
      cpSync(src, dest, { recursive: true })
    }
    removeStaleKitSkills(destRoot, kitSkills)
  }
}

function buildAgentOutputs() {
  /** @type {Map<string, { cursor: string, claude: string, github: string }>} */
  const out = new Map()
  for (const file of listAgentFiles()) {
    const raw = read(join(AGENTS_DIR, file))
    const composed = composedAgentSource(raw)
    const { frontmatter, body } = parseFrontmatter(composed)
    const name = frontmatter.name || basename(file, '.md')
    const description = frontmatter.description || ''
    const readonly = frontmatter.readonly === true
    const model =
      typeof frontmatter.model === 'string' && frontmatter.model
        ? frontmatter.model
        : 'inherit'
    out.set(file, {
      cursor: composed,
      claude: expectedClaudeAgent(name, description, body, readonly, model),
      github: expectedCopilotAgent(name, description, body),
    })
  }
  return out
}

function syncAgents() {
  const cursorDir = join(ROOT, '.cursor', 'agents')
  const claudeDir = join(ROOT, '.claude', 'agents')
  const githubDir = join(ROOT, '.github', 'agents')
  for (const d of [cursorDir, claudeDir, githubDir]) ensureDir(d)

  const outputs = buildAgentOutputs()
  const kitBasenames = new Set(
    [...outputs.keys()].map((f) => basename(f, '.md')),
  )
  for (const n of kitBasenames) KNOWN_KIT_AGENT_NAMES.add(n)

  for (const [file, parts] of outputs) {
    write(join(cursorDir, file), parts.cursor)
    write(join(claudeDir, file), parts.claude)
    write(join(githubDir, file), parts.github)
  }

  removeStaleKitAgents(cursorDir, kitBasenames)
  removeStaleKitAgents(claudeDir, kitBasenames)
  removeStaleKitAgents(githubDir, kitBasenames)
}

function syncRules() {
  const cursorRules = join(ROOT, '.cursor', 'rules')
  const githubInstr = join(ROOT, '.github', 'instructions')
  ensureDir(cursorRules)
  ensureDir(githubInstr)

  for (const f of readdirSync(RULES_DIR).filter((x) => x.endsWith('.md'))) {
    const base = basename(f, '.md')
    const raw = read(join(RULES_DIR, f))
    const { frontmatter, body } = parseFrontmatter(raw)

    if (!isAlwaysOnRule(frontmatter)) {
      for (const stale of [
        join(cursorRules, `${base}.mdc`),
        join(githubInstr, `${base}.instructions.md`),
      ]) {
        if (existsSync(stale)) rmSync(stale, { force: true })
      }
      continue
    }

    const description = frontmatter.description || base
    write(
      join(cursorRules, `${base}.mdc`),
      formatFrontmatter({ description, alwaysApply: true }) + body.trimStart(),
    )
    write(
      join(githubInstr, `${base}.instructions.md`),
      formatFrontmatter({ applyTo: '**' }) + body.trimStart(),
    )
  }
}

function syncCursorHooks() {
  mergeCursorHooks(ROOT, { failOnInvalidJson: true })
  write(
    join(ROOT, '.cursor', 'hooks', 'gate-subagents.mjs'),
    `#!/usr/bin/env node\nimport '../../.agents/hooks/adapters/cursor.mjs'\n`,
  )
}

function syncClaudeSettings() {
  mergeClaudeSettings(ROOT, { failOnInvalidJson: true })
}

function alwaysOnRuleNames() {
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
  const ruleList = ruleNames.map((n) => `- \`.agents/rules/${n}.md\``).join('\n')
  return `# Claude Code — agent kit

Follow the stack card in \`AGENTS.md\` for package manager, ownership, and narrow commands.

## Always-on rules

Read and apply these project rules (also mirrored under \`.cursor/rules/\` and \`.github/instructions/\`):

${ruleList}

## Agents & skills

- Specialists: \`.claude/agents/\` (synced from \`.agents/agents/\`)
- Skills: \`.claude/skills/\` (synced from \`.agents/skills/\`)
- Decision log: \`.agents/memory/decisions.md\`
- Call-graph gate: \`.claude/settings.json\` → \`.agents/hooks/adapters/claude.mjs\` (workers cannot nest)

After editing canonical sources under \`.agents/\`, run \`node scripts/sync-tool-adapters.mjs\`.
Drift check: \`node scripts/sync-tool-adapters.mjs --check\`.
Skills inventory (setup runs this): \`node scripts/sync-project-skills.mjs\` / \`--check\`.
`
}

function claudeMdIsKeptProject() {
  const audit = join(ROOT, '.agents', 'memory', 'install-audit.md')
  if (!existsSync(audit)) return false
  const text = read(audit)
  // Look for kept-project entries naming CLAUDE.md
  return /kept-project[\s\S]{0,200}\*\*Path\*\*:\s*`?CLAUDE\.md`?/i.test(text) ||
    /\*\*Path\*\*:\s*`?CLAUDE\.md`?[\s\S]{0,200}kept-project/i.test(text)
}

function syncClaudeMd() {
  const force = process.argv.includes('--force-claude-md')
  if (!force && claudeMdIsKeptProject()) {
    console.log('Skipped CLAUDE.md (install-audit kept-project; pass --force-claude-md to rewrite)')
    return
  }
  write(join(ROOT, 'CLAUDE.md'), expectedClaudeMdBody())
}

function removeLegacyMemory() {
  const legacy = join(ROOT, '.cursor', 'agent-memory')
  if (existsSync(legacy)) {
    rmSync(legacy, { recursive: true, force: true })
  }
}

function checkDrift() {
  const mismatches = []
  const outputs = buildAgentOutputs()
  for (const [file, parts] of outputs) {
    const pairs = [
      [join(ROOT, '.cursor', 'agents', file), parts.cursor],
      [join(ROOT, '.claude', 'agents', file), parts.claude],
      [join(ROOT, '.github', 'agents', file), parts.github],
    ]
    for (const [path, expected] of pairs) {
      if (!existsSync(path)) {
        mismatches.push(`missing ${path}`)
        continue
      }
      if (read(path) !== expected) mismatches.push(`drift ${path}`)
    }
  }

  const kitSkills = listKitSkillNames()

  const claudeMd = join(ROOT, 'CLAUDE.md')
  if (!existsSync(claudeMd)) {
    mismatches.push('missing CLAUDE.md')
  } else if (!claudeMdIsKeptProject()) {
    if (read(claudeMd) !== expectedClaudeMdBody()) {
      mismatches.push('drift CLAUDE.md')
    }
  }

  const cursorHooks = join(ROOT, '.cursor', 'hooks.json')
  if (!existsSync(cursorHooks)) {
    mismatches.push('missing .cursor/hooks.json')
  } else {
    try {
      const doc = JSON.parse(read(cursorHooks))
      const gateCmd = 'adapters/cursor.mjs'
      for (const key of [
        'sessionStart',
        'sessionEnd',
        'subagentStart',
        'subagentStop',
        'preToolUse',
      ]) {
        const list = doc.hooks?.[key]
        if (!Array.isArray(list) || list.length === 0) {
          mismatches.push(`.cursor/hooks.json missing hooks.${key}`)
          continue
        }
        const hasGate = list.some((e) => String(e?.command || '').includes(gateCmd))
        if (!hasGate) {
          mismatches.push(
            `.cursor/hooks.json hooks.${key} missing kit cursor gate command`,
          )
        }
      }
    } catch (err) {
      mismatches.push(
        `invalid .cursor/hooks.json: ${err instanceof Error ? err.message : String(err)}`,
      )
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

  // Recursive skill file drift (including nested paths)
  for (const root of ['.cursor/skills', '.claude/skills', '.github/skills']) {
    for (const name of kitSkills) {
      const skillSrc = join(SKILLS_DIR, name)
      if (!existsSync(skillSrc)) continue
      const walk = (rel) => {
        const sp = rel ? join(skillSrc, rel) : skillSrc
        if (!existsSync(sp)) return
        if (statSync(sp).isDirectory()) {
          for (const f of readdirSync(sp)) {
            walk(rel ? join(rel, f) : f)
          }
          return
        }
        const dp = join(ROOT, root, name, rel)
        if (!existsSync(dp) || read(sp) !== read(dp)) {
          mismatches.push(`drift ${root}/${name}/${rel}`)
        }
      }
      walk('')
    }
  }

  // Claude readonly agents must carry soft write disallows
  for (const file of readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'))) {
    const raw = read(join(AGENTS_DIR, file))
    const { frontmatter } = parseFrontmatter(raw)
    if (frontmatter.readonly === true || frontmatter.readonly === 'true') {
      const claudePath = join(ROOT, '.claude', 'agents', file)
      if (!existsSync(claudePath)) {
        mismatches.push(`missing .claude/agents/${file}`)
        continue
      }
      const { frontmatter: cf } = parseFrontmatter(read(claudePath))
      const tools = String(cf.disallowedTools || '')
      for (const need of ['Write', 'Edit', 'NotebookEdit']) {
        if (!tools.includes(need)) {
          mismatches.push(
            `.claude/agents/${file} missing disallowedTools ${need}`,
          )
        }
      }
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
  }

  for (const n of alwaysOnRuleNames()) {
    const raw = read(join(RULES_DIR, `${n}.md`))
    const { frontmatter, body } = parseFrontmatter(raw)
    const description = frontmatter.description || n
    const cursorExpected =
      formatFrontmatter({ description, alwaysApply: true }) + body.trimStart()
    const ghExpected =
      formatFrontmatter({ applyTo: '**' }) + body.trimStart()
    const cp = join(ROOT, '.cursor', 'rules', `${n}.mdc`)
    const gp = join(ROOT, '.github', 'instructions', `${n}.instructions.md`)
    if (!existsSync(cp) || read(cp) !== cursorExpected) {
      mismatches.push(`drift .cursor/rules/${n}.mdc`)
    }
    if (!existsSync(gp) || read(gp) !== ghExpected) {
      mismatches.push(`drift .github/instructions/${n}.instructions.md`)
    }
  }

  return mismatches
}

function runSync() {
  validateWorkers()
  syncAgents()
  syncSkills()
  syncRules()
  syncCursorHooks()
  syncClaudeSettings()
  syncClaudeMd()
  removeLegacyMemory()
  console.log(
    'Synced tool adapters from .agents/ → .cursor/, .claude/, .github/',
  )
}

function main() {
  const check = process.argv.includes('--check')
  if (check) {
    validateWorkers()
    buildAgentOutputs()
    const mismatches = checkDrift()
    if (mismatches.length) {
      console.error('Adapter drift detected:')
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
