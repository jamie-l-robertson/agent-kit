#!/usr/bin/env node
/**
 * Generate tool-specific adapter trees from canonical `.agents/` sources.
 *
 * Edit only under `.agents/` (and gate adapters), then run:
 *   node scripts/sync-tool-adapters.mjs
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  existsSync,
} from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKERS, MANAGER } from '../.agents/hooks/gate-core.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const AGENTS_DIR = join(ROOT, '.agents', 'agents')
const SKILLS_DIR = join(ROOT, '.agents', 'skills')
const RULES_DIR = join(ROOT, '.agents', 'rules')

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

function parseFrontmatter(md) {
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

function formatFrontmatter(fields) {
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

function listAgentFiles() {
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
}

function validateWorkers() {
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
      console.warn(
        `warn: agent "${n}" exists but is not in WORKERS/MANAGER — add to gate-core.mjs if it may spawn`,
      )
    }
  }
}

function syncSkills() {
  for (const dest of [
    join(ROOT, '.cursor', 'skills'),
    join(ROOT, '.claude', 'skills'),
    join(ROOT, '.github', 'skills'),
  ]) {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    ensureDir(dirname(dest))
    cpSync(SKILLS_DIR, dest, { recursive: true })
  }
}

function syncAgents() {
  const cursorDir = join(ROOT, '.cursor', 'agents')
  const claudeDir = join(ROOT, '.claude', 'agents')
  const githubDir = join(ROOT, '.github', 'agents')
  for (const d of [cursorDir, claudeDir, githubDir]) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true })
    ensureDir(d)
  }

  for (const file of listAgentFiles()) {
    const raw = read(join(AGENTS_DIR, file))
    const { frontmatter, body } = parseFrontmatter(raw)
    const name = frontmatter.name || basename(file, '.md')
    const description = frontmatter.description || ''
    const readonly = frontmatter.readonly === true

    // Cursor: canonical file is already Cursor-compatible
    write(join(cursorDir, file), raw.endsWith('\n') ? raw : `${raw}\n`)

    // Claude: name + description only
    write(
      join(claudeDir, file),
      formatFrontmatter({ name, description }) + body,
    )

    // Copilot: description required; soft-readonly via tools for orchestrators
    const copilotFm = { name, description }
    if (name === MANAGER) {
      copilotFm.tools = ['read', 'search', 'agent', 'todo', 'web']
    } else if (readonly || name === 'planner' || name === 'reviewer') {
      copilotFm.tools = ['read', 'search', 'web']
    }
    write(join(githubDir, file), formatFrontmatter(copilotFm) + body)
  }
}

function syncRules() {
  const cursorRules = join(ROOT, '.cursor', 'rules')
  const githubInstr = join(ROOT, '.github', 'instructions')
  ensureDir(cursorRules)
  ensureDir(githubInstr)

  // Remove previously generated rule adapters (keep unknown files)
  for (const f of readdirSync(RULES_DIR).filter((x) => x.endsWith('.md'))) {
    const base = basename(f, '.md')
    const raw = read(join(RULES_DIR, f))
    const { frontmatter, body } = parseFrontmatter(raw)
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
  write(
    join(ROOT, '.cursor', 'hooks.json'),
    `${JSON.stringify(
      {
        version: 1,
        hooks: {
          sessionEnd: [
            {
              command: 'node .agents/hooks/adapters/cursor.mjs',
            },
          ],
          subagentStart: [
            {
              command: 'node .agents/hooks/adapters/cursor.mjs',
              failClosed: true,
            },
          ],
          preToolUse: [
            {
              command: 'node .agents/hooks/adapters/cursor.mjs',
              matcher: 'Task',
              failClosed: true,
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  )

  // Thin shim for anyone still pointing at the old path
  write(
    join(ROOT, '.cursor', 'hooks', 'gate-subagents.mjs'),
    `#!/usr/bin/env node\nimport '../../.agents/hooks/adapters/cursor.mjs'\n`,
  )
}

function syncClaudeSettings() {
  const settingsPath = join(ROOT, '.claude', 'settings.json')
  let existing = {}
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(read(settingsPath))
    } catch {
      existing = {}
    }
  }

  const command = 'node .agents/hooks/adapters/claude.mjs'
  existing.hooks = {
    ...(existing.hooks || {}),
    PreToolUse: [
      {
        matcher: 'Agent|Task',
        hooks: [{ type: 'command', command }],
      },
    ],
    SubagentStart: [
      {
        hooks: [{ type: 'command', command }],
      },
    ],
    SubagentStop: [
      {
        hooks: [{ type: 'command', command }],
      },
    ],
    SessionEnd: [
      {
        hooks: [{ type: 'command', command }],
      },
    ],
  }

  write(settingsPath, `${JSON.stringify(existing, null, 2)}\n`)
}

function syncClaudeMd() {
  const ruleNames = readdirSync(RULES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
  const ruleList = ruleNames.map((n) => `- \`.agents/rules/${n}.md\``).join('\n')

  write(
    join(ROOT, 'CLAUDE.md'),
    `# Claude Code — agent kit

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
`,
  )
}

function removeLegacyMemory() {
  const legacy = join(ROOT, '.cursor', 'agent-memory')
  if (existsSync(legacy)) {
    rmSync(legacy, { recursive: true, force: true })
  }
}

function main() {
  validateWorkers()
  syncAgents()
  syncSkills()
  syncRules()
  syncCursorHooks()
  syncClaudeSettings()
  syncClaudeMd()
  removeLegacyMemory()
  console.log('Synced tool adapters from .agents/ → .cursor/, .claude/, .github/')
}

main()
