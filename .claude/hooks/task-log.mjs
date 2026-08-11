/**
 * Append-only task outcome log (human skim) + helpers for token totals.
 * Written by the Claude SubagentStop hook on valid worker reports.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const TASKS_LIVE_CAP = 50

export const TASKS_HEADER = `# Agent tasks log

Append-only. Written by the call-graph gate on valid worker reports (SubagentStop).
<!-- Skim titles / last session / open needs-decision; paste anchors into briefs — do not paste the whole log. Older entries: .claude/memory/tasks-archive/ -->

<!-- Entries go below this line -->

`

/** @param {string} [root] project root; default = kit root (.. from hooks) */
export function getTasksMemoryPath(root) {
  if (process.env.AGENT_KIT_TASKS_PATH) return process.env.AGENT_KIT_TASKS_PATH
  const base = root || join(__dirname, '..', 'memory')
  return join(base, 'tasks.md')
}

/** @param {string} [root] */
export function getTasksArchiveDir(root) {
  if (process.env.AGENT_KIT_TASKS_ARCHIVE_DIR) {
    return process.env.AGENT_KIT_TASKS_ARCHIVE_DIR
  }
  const base = root || join(__dirname, '..', 'memory')
  return join(base, 'tasks-archive')
}

/**
 * Prefer a single total token count. Never invent.
 * @param {Record<string, unknown> | null | undefined} report
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {number | null}
 */
export function resolveTokenCount(report, payload = {}) {
  const fromUsage = report?.usage
  if (fromUsage && typeof fromUsage === 'object') {
    const u = /** @type {Record<string, unknown>} */ (fromUsage)
    for (const key of ['totalTokens', 'total_tokens', 'tokens']) {
      const n = Number(u[key])
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  if (report && typeof report.tokens === 'number' && Number.isFinite(report.tokens)) {
    return report.tokens
  }
  const p = payload || {}
  for (const key of [
    'total_tokens',
    'totalTokens',
    'token_count',
    'tokens',
  ]) {
    const n = Number(p[key])
    if (Number.isFinite(n) && n >= 0) return n
  }
  const nested = p.usage
  if (nested && typeof nested === 'object') {
    const u = /** @type {Record<string, unknown>} */ (nested)
    for (const key of ['total_tokens', 'totalTokens', 'tokens']) {
      const n = Number(u[key])
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  return null
}

/**
 * @param {Record<string, unknown>} report
 * @param {{ sessionId?: string, tokens?: number | null, now?: Date }} [opts]
 */
export function formatTaskEntry(report, opts = {}) {
  const now = opts.now || new Date()
  const ts = now.toISOString()
  const agent = String(report.agent || 'unknown')
  const goal = String(report.goal || '(no goal)').replace(/\s+/g, ' ').trim()
  const shortGoal = goal.length > 80 ? `${goal.slice(0, 77)}…` : goal
  const status = String(report.status || 'n/a')
  const mode = String(report.mode || 'n/a')
  const verification = String(report.verificationResult || 'n/a')
  const changed = Array.isArray(report.changed) ? report.changed : []
  const changedLine =
    changed.length === 0 ? 'none' : changed.map(String).join(', ')
  const tokens =
    opts.tokens === undefined ? resolveTokenCount(report) : opts.tokens
  const tokensLine = tokens == null ? 'n/a' : String(tokens)
  const session = opts.sessionId || 'n/a'
  const lines = [
    `## ${ts} — ${agent}: ${shortGoal}`,
    '',
    `- **Status**: ${status}`,
    `- **Mode**: ${mode}`,
    `- **Verification**: ${verification}`,
    `- **Changed**: ${changedLine}`,
    `- **Tokens**: ${tokensLine}`,
    `- **Session**: ${session}`,
  ]
  if (
    (status === 'needs-decision' || status === 'blocked') &&
    report.needs
  ) {
    lines.push(`- **Needs**: ${String(report.needs).replace(/\s+/g, ' ').trim()}`)
  }
  lines.push('')
  return lines.join('\n')
}

/** Split markdown into header + `## ` entry blocks (entries keep leading ##). */
export function splitTaskEntries(text) {
  const raw = String(text || '')
  const idx = raw.indexOf('\n## ')
  // also allow file starting with ##
  let header
  let body
  if (raw.startsWith('## ')) {
    header = ''
    body = raw
  } else if (idx === -1) {
    return { header: raw.endsWith('\n') ? raw : `${raw}\n`, entries: [] }
  } else {
    header = raw.slice(0, idx + 1)
    body = raw.slice(idx + 1)
  }
  const entries = []
  const parts = body.split(/\n(?=## )/)
  for (const p of parts) {
    const t = p.trimEnd()
    if (t.startsWith('## ')) entries.push(t.endsWith('\n') ? t : `${t}\n`)
  }
  if (!header.endsWith('\n')) header += '\n'
  return { header, entries }
}

/**
 * @param {string} livePath
 * @param {string[]} overflowEntries oldest first
 * @param {Date} [now]
 */
export function archiveOverflow(livePath, overflowEntries, now = new Date()) {
  if (!overflowEntries.length) return
  const archiveDir =
    process.env.AGENT_KIT_TASKS_ARCHIVE_DIR ||
    join(dirname(livePath), 'tasks-archive')
  mkdirSync(archiveDir, { recursive: true })
  const month = now.toISOString().slice(0, 7)
  const archivePath = join(archiveDir, `${month}.md`)
  let prefix = ''
  if (!existsSync(archivePath)) {
    prefix = `# Tasks archive ${month}\n\n`
  }
  appendFileSync(archivePath, prefix + overflowEntries.join('\n'), 'utf8')
}

/**
 * Append one task entry; peel oldest into monthly archive when over cap.
 * Best-effort: never throws.
 * @param {Record<string, unknown>} report
 * @param {{ sessionId?: string, tokens?: number | null, root?: string, cap?: number, now?: Date }} [opts]
 */
export function appendTaskMemory(report, opts = {}) {
  try {
    const path = getTasksMemoryPath(opts.root)
    mkdirSync(dirname(path), { recursive: true })
    if (!existsSync(path)) {
      writeFileSync(path, TASKS_HEADER, 'utf8')
    }
    const tokens =
      opts.tokens === undefined ? resolveTokenCount(report) : opts.tokens
    const entry = formatTaskEntry(report, {
      sessionId: opts.sessionId,
      tokens,
      now: opts.now,
    })
    const existing = readFileSync(path, 'utf8')
    const { header, entries } = splitTaskEntries(existing)
    const next = [...entries, entry]
    const cap = opts.cap ?? TASKS_LIVE_CAP
    let live = next
    if (next.length > cap) {
      const overflow = next.slice(0, next.length - cap)
      archiveOverflow(path, overflow, opts.now || new Date())
      live = next.slice(next.length - cap)
    }
    const joined = `${header.trimEnd()}\n\n${live.join('\n')}`
    writeFileSync(path, joined.endsWith('\n') ? joined : `${joined}\n`, 'utf8')
  } catch {
    /* ignore */
  }
}
