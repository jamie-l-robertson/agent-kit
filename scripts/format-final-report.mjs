#!/usr/bin/env node
/**
 * Render the mechanical half of the manager's Final report from tasks.md.
 *
 * Headings, Agents used, Token costs and the Rollup are shape — freestyling
 * them drops sections and invents numbers. Outcomes, Verification narrative and
 * Manual QA are judgment and stay as `<fill …>` prompts for the manager.
 *
 *   node scripts/format-final-report.mjs --session <sessionId>
 *   node scripts/format-final-report.mjs                # every entry in the live log
 *
 * Scope to a session whenever you have one: the live log spans runs, and a
 * rollup that quietly includes another run's workers is worse than no rollup.
 */

import { existsSync, readFileSync } from 'node:fs'
import { getTasksMemoryPath } from '../.claude/hooks/task-log.mjs'

const FIELD = (block, name) =>
  block.match(new RegExp(`^- \\*\\*${name}\\*\\*: (.*)$`, 'm'))?.[1]?.trim() || ''

/**
 * @param {string} path tasks.md
 * @param {string} [session] keep only rows from this session
 * @returns {Array<{agent: string, goal: string, status: string, mode: string,
 *   verification: string, changed: string, tokens: number | null,
 *   approx: boolean, session: string}>}
 */
export function parseTaskEntries(path, session) {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf8')
  const entries = []
  for (const block of text.split(/\n(?=## )/)) {
    const head = block.match(/^## (\S+) — ([a-z-]+): (.*)$/m)
    if (!head) continue
    const raw = FIELD(block, 'Tokens')
    const approx = raw.startsWith('~')
    const n = Number(raw.replace(/^~/, ''))
    entries.push({
      ts: head[1],
      agent: head[2],
      goal: head[3].trim(),
      status: FIELD(block, 'Status'),
      mode: FIELD(block, 'Mode'),
      verification: FIELD(block, 'Verification'),
      changed: FIELD(block, 'Changed'),
      tokens: Number.isFinite(n) && raw !== '' && raw !== 'n/a' ? n : null,
      approx,
      session: FIELD(block, 'Session'),
    })
  }
  return session ? entries.filter((e) => e.session === session) : entries
}

/**
 * @returns {{ total: number | null, approx: boolean, incomplete: boolean }}
 * incomplete = at least one worker contributed no number; the total is a floor,
 * not a sum. Never guess the missing part.
 */
export function rollupTokens(entries) {
  const counted = entries.filter((e) => typeof e.tokens === 'number')
  return {
    total: counted.length ? counted.reduce((s, e) => s + e.tokens, 0) : null,
    approx: counted.some((e) => e.approx),
    incomplete: counted.length !== entries.length || entries.length === 0,
  }
}

const tokenCell = (e) =>
  typeof e.tokens === 'number' ? `${e.approx ? '~' : ''}${e.tokens}` : 'n/a'

export function renderFinalReport(entries, { session } = {}) {
  const { total, approx, incomplete } = rollupTokens(entries)
  const rollup =
    total == null
      ? 'n/a'
      : `${approx ? '~' : ''}${total}${incomplete ? ' (partial — some workers reported no count)' : ''}`

  return [
    '[manager] <fill: one-line outcome>',
    '',
    '### Agents used',
    ...(entries.length
      ? entries.map(
          (e) => `- \`${e.agent}\` — ${e.mode} — ${e.goal} (${e.status})`,
        )
      : ['- n/a — no worker reports recorded for this run']),
    '',
    '### Outcomes',
    '- <fill: what actually changed for the user>',
    '',
    '### Verification',
    '- <fill: evidence / verificationResult from the fences, or n/a>',
    '',
    '### Manual QA / follow-ups',
    '- <fill: what a human should check, and anything deferred>',
    '',
    '### Token costs',
    ...(entries.length
      ? entries.map((e) => `- \`${e.agent}\` — tokens: ${tokenCell(e)}`)
      : ['- n/a']),
    `- **Rollup** — total tokens: ${rollup}`,
    `- Sources: \`.claude/memory/tasks.md\`${session ? ` (session ${session})` : ' (whole live log — no session filter)'}${approx ? '; ~ = measured from the worker transcript, one turn early' : ''}`,
    '',
  ].join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--session')
  const session = i > -1 ? process.argv[i + 1] : undefined
  const entries = parseTaskEntries(getTasksMemoryPath(), session)
  if (!entries.length && session) {
    console.error(
      `No tasks.md entries for session ${session} — check the id, or run without --session.`,
    )
  }
  console.log(renderFinalReport(entries, { session }))
}
