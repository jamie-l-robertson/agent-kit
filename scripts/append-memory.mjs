#!/usr/bin/env node
/**
 * Append a canonical entry to decisions.md or mcp-usage.md.
 *
 * The shapes are documented in the agent-memory skill; hand-writing them drifts
 * (missing fields, renamed headings, invented statuses) and the manager reads
 * these logs by field. This script owns the shape — the documenter still owns
 * what is worth recording.
 *
 *   echo '<json>' | node scripts/append-memory.mjs decisions
 *   echo '<json>' | node scripts/append-memory.mjs mcp
 *
 * decisions: title, task, status, decision, options, why, appliesTo
 *            (+ optional workerIds, supersedes)
 * mcp:       server, tool, task, outcome, why (+ optional workerIds)
 *
 * Never pass secrets, tokens, PII, or response bodies — these logs are read
 * into agent context.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { projectRoot } from '../.claude/hooks/gate-core.mjs'

export const DECISIONS_HEADER = `# Agent decisions log

Append-only. Manager reads before dispatch; documenter appends when briefed.
<!-- Index: skim titles / Applies to (incl. mcp); paste anchors into briefs — do not paste the whole log -->

<!-- Entries go below this line -->

`

export const MCP_HEADER = `# MCP usage log

Append-only. Manager batches meaningful MCP outcomes here via \`documenter\` (not into \`decisions.md\`).
Log server/tool/outcome only — never payloads, tokens, secrets, or response bodies.

<!-- Index: skim titles; do not paste the whole log into briefs -->

`

const DECISION_STATUS = ['decided', 'defaulted', 'superseded']
const MCP_OUTCOME = ['ok', 'auth-failed', 'error']

const REQUIRED = {
  decisions: ['title', 'task', 'status', 'decision', 'options', 'why', 'appliesTo'],
  mcp: ['server', 'tool', 'task', 'outcome', 'why'],
}

export function logPathFor(kind, root) {
  const dir = join(root || projectRoot(), '.claude', 'memory')
  return join(dir, kind === 'mcp' ? 'mcp-usage.md' : 'decisions.md')
}

/** @returns {string[]} every problem, so one run fixes them all */
export function validateEntry(kind, entry) {
  const errors = []
  const e = entry || {}
  for (const field of REQUIRED[kind] || []) {
    const v = e[field]
    if (typeof v !== 'string' || !v.trim()) errors.push(`missing ${field}`)
  }
  if (kind === 'decisions' && e.status && !DECISION_STATUS.includes(e.status)) {
    errors.push(`status must be one of ${DECISION_STATUS.join(' | ')}`)
  }
  if (kind === 'mcp' && e.outcome && !MCP_OUTCOME.includes(e.outcome)) {
    errors.push(`outcome must be one of ${MCP_OUTCOME.join(' | ')}`)
  }
  return errors
}

const line = (k, v) => `- **${k}**: ${String(v ?? '').trim() || 'none'}`

export function formatDecisionEntry(entry, now = new Date()) {
  return [
    `## ${now.toISOString()} — ${entry.title}`,
    '',
    line('Task', entry.task),
    line('Status', entry.status),
    line('Decision', entry.decision),
    line('Options considered', entry.options),
    line('Why', entry.why),
    line('Applies to', entry.appliesTo),
    line('Worker IDs', entry.workerIds),
    line('Supersedes', entry.supersedes),
    '',
  ].join('\n')
}

export function formatMcpEntry(entry, now = new Date()) {
  return [
    `## ${now.toISOString()} — mcp:${entry.server}/${entry.tool}`,
    '',
    line('Task', entry.task),
    line('Outcome', entry.outcome),
    line('Why', entry.why),
    line('Worker IDs', entry.workerIds),
    '',
  ].join('\n')
}

/** Append-only by design: an existing file keeps whatever header it already has. */
export function appendEntry(path, header, entry) {
  mkdirSync(dirname(path), { recursive: true })
  if (!existsSync(path)) {
    writeFileSync(path, header, 'utf8')
  }
  const existing = readFileSync(path, 'utf8')
  appendFileSync(path, `${existing.endsWith('\n') ? '' : '\n'}${entry}`, 'utf8')
  return path
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const kind = process.argv[2]
  if (kind !== 'decisions' && kind !== 'mcp') {
    console.error("Usage: echo '<json>' | append-memory.mjs decisions|mcp")
    process.exit(1)
  }

  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  let entry
  try {
    entry = JSON.parse(chunks.join('') || '{}')
  } catch (err) {
    console.error(`Invalid JSON on stdin: ${err.message}`)
    process.exit(1)
  }

  const errors = validateEntry(kind, entry)
  if (errors.length) {
    console.error(`Cannot append ${kind} entry:\n- ${errors.join('\n- ')}`)
    process.exit(1)
  }

  const path = appendEntry(
    logPathFor(kind),
    kind === 'mcp' ? MCP_HEADER : DECISIONS_HEADER,
    kind === 'mcp' ? formatMcpEntry(entry) : formatDecisionEntry(entry),
  )
  console.log(`Appended ${kind} entry → ${path}`)
}
