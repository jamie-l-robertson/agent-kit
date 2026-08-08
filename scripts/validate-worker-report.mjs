/**
 * Dependency-free validator for worker-report JSON fences.
 * Mirrors .agents/schemas/worker-report.schema.json bounce-critical rules.
 * Usage: node scripts/validate-worker-report.mjs '<json>' | --stdin
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(
  __dirname,
  '..',
  '.agents',
  'schemas',
  'worker-report.schema.json',
)

const STATUS = new Set(['done', 'needs-decision', 'blocked', 'out-of-scope'])
const MODE = new Set(['audit-only', 'implement', 'verify-only', 'document'])
const HUMAN = new Set(['required', 'granted', 'n/a'])
const AUDIT_FINDINGS_AGENTS = new Set(['reviewer', 'security', 'risk'])

/** Schema required keys — kept in sync with worker-report.schema.json */
export const SCHEMA_REQUIRED = [
  'status',
  'agent',
  'mode',
  'goal',
  'changed',
  'recommendNext',
  'humanApprove',
]

export function loadSchemaRequired() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  return schema.required || []
}

export function extractWorkerReportJson(text) {
  if (!text || typeof text !== 'string') return null
  const re = /```(?:json)?\s*\n([\s\S]*?)\n```/g
  let match
  let last = null
  while ((match = re.exec(text)) !== null) {
    const body = match[1].trim()
    try {
      const parsed = JSON.parse(body)
      if (
        parsed &&
        typeof parsed === 'object' &&
        'status' in parsed &&
        'agent' in parsed
      ) {
        last = parsed
      }
    } catch {
      // keep scanning
    }
  }
  return last
}

export function validateWorkerReport(report) {
  const errors = []
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return { ok: false, errors: ['report must be an object'] }
  }
  for (const key of SCHEMA_REQUIRED) {
    if (!(key in report)) errors.push(`missing required field: ${key}`)
  }
  if (report.status != null && !STATUS.has(report.status)) {
    errors.push(`invalid status: ${report.status}`)
  }
  if (report.mode != null && !MODE.has(report.mode)) {
    errors.push(`invalid mode: ${report.mode}`)
  }
  if (
    report.agent != null &&
    (typeof report.agent !== 'string' || !report.agent.trim())
  ) {
    errors.push('agent must be a non-empty string')
  }
  if (
    report.goal != null &&
    (typeof report.goal !== 'string' || !report.goal.trim())
  ) {
    errors.push('goal must be a non-empty string')
  }
  if (report.changed != null && !Array.isArray(report.changed)) {
    errors.push('changed must be an array of strings')
  } else if (
    Array.isArray(report.changed) &&
    report.changed.some((p) => typeof p !== 'string')
  ) {
    errors.push('changed items must be strings')
  }
  if (
    report.recommendNext != null &&
    typeof report.recommendNext !== 'string'
  ) {
    errors.push('recommendNext must be a string')
  }
  if (report.humanApprove != null && !HUMAN.has(report.humanApprove)) {
    errors.push(`invalid humanApprove: ${report.humanApprove}`)
  }

  // allOf: done + humanApprove required is invalid
  if (report.status === 'done' && report.humanApprove === 'required') {
    errors.push('status done cannot have humanApprove required (use needs-decision)')
  }

  // audit agents need findings string on done + audit-only
  if (
    report.status === 'done' &&
    report.mode === 'audit-only' &&
    AUDIT_FINDINGS_AGENTS.has(report.agent)
  ) {
    if (typeof report.findings !== 'string' || !report.findings.trim()) {
      errors.push('findings must be a non-empty string for audit-only done')
    }
  }

  // planner done → empty changed
  if (
    report.status === 'done' &&
    report.agent === 'planner' &&
    Array.isArray(report.changed) &&
    report.changed.length > 0
  ) {
    errors.push('planner done reports must have changed: []')
  }

  return { ok: errors.length === 0, errors }
}

async function main() {
  let raw = process.argv[2]
  if (raw === '--stdin' || raw === '-') {
    const chunks = []
    for await (const c of process.stdin) chunks.push(c)
    raw = Buffer.concat(chunks).toString('utf8')
  }
  if (!raw) {
    console.error(
      "Usage: node scripts/validate-worker-report.mjs '<json>' | --stdin",
    )
    process.exit(2)
  }
  let report
  try {
    report = JSON.parse(raw)
  } catch {
    const extracted = extractWorkerReportJson(raw)
    if (!extracted) {
      console.error('Invalid JSON and no worker-report fence found')
      process.exit(1)
    }
    report = extracted
  }
  const result = validateWorkerReport(report)
  if (!result.ok) {
    console.error(result.errors.join('\n'))
    process.exit(1)
  }
  console.log('ok')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
