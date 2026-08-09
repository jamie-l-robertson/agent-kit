/**
 * Dependency-free validator for worker-report JSON fences.
 * Mirrors .agents/schemas/worker-report.schema.json bounce-critical rules.
 * Usage: node scripts/validate-worker-report.mjs '<json>' | --stdin
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// fileURLToPath used for isMain
import { PROJECT_AGENTS } from '../.agents/hooks/gate-core.mjs'

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
const VERIFY = new Set(['pass', 'fail', 'n/a'])
const AUDIT_FINDINGS_AGENTS = new Set(['reviewer', 'security', 'risk'])
/** Agents that must report audit-only + empty changed on done */
const READONLY_DONE_AGENTS = new Set([
  'security',
  'risk',
  'reviewer',
  'planner',
  'manager',
])
const AUDIT_ONLY_AGENTS = new Set(['security', 'risk'])

/** Schema required keys — kept in sync with worker-report.schema.json */
export const SCHEMA_REQUIRED = [
  'status',
  'agent',
  'mode',
  'goal',
  'changed',
  'recommendNext',
  'humanApprove',
  'verificationResult',
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
  if (report.agent != null) {
    if (typeof report.agent !== 'string' || !report.agent.trim()) {
      errors.push('agent must be a non-empty string')
    } else if (!PROJECT_AGENTS.has(report.agent)) {
      errors.push(`invalid agent: ${report.agent}`)
    }
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
  if (report.recommendNext != null) {
    if (typeof report.recommendNext !== 'string') {
      errors.push('recommendNext must be a string')
    } else if (!report.recommendNext.trim()) {
      errors.push('recommendNext must be non-empty (use "none" on done)')
    }
  }
  if (report.humanApprove != null && !HUMAN.has(report.humanApprove)) {
    errors.push(`invalid humanApprove: ${report.humanApprove}`)
  }
  if (
    report.verificationResult != null &&
    !VERIFY.has(report.verificationResult)
  ) {
    errors.push(`invalid verificationResult: ${report.verificationResult}`)
  }

  if (
    report.verificationResult === 'pass' ||
    report.verificationResult === 'fail'
  ) {
    if (typeof report.evidence !== 'string' || !report.evidence.trim()) {
      errors.push(
        'verificationResult pass|fail requires non-empty evidence',
      )
    }
  }

  if (report.status === 'done' && report.humanApprove === 'required') {
    errors.push('status done cannot have humanApprove required (use needs-decision)')
  }

  if (report.status === 'done') {
    if (
      typeof report.recommendNext === 'string' &&
      !report.recommendNext.trim()
    ) {
      errors.push('recommendNext must be non-empty (use "none" on done)')
    }
  }

  if (
    report.status === 'done' &&
    report.mode === 'audit-only' &&
    AUDIT_FINDINGS_AGENTS.has(report.agent)
  ) {
    if (typeof report.findings !== 'string' || !report.findings.trim()) {
      errors.push('findings must be a non-empty string for audit-only done')
    }
  }

  if (READONLY_DONE_AGENTS.has(report.agent) && report.status === 'done') {
    if (report.mode !== 'audit-only') {
      errors.push(`${report.agent} done reports must use mode: audit-only`)
    }
    if (Array.isArray(report.changed) && report.changed.length > 0) {
      errors.push(`${report.agent} done reports must have changed: []`)
    }
  }

  if (AUDIT_ONLY_AGENTS.has(report.agent) && report.status === 'done') {
    if (report.mode !== 'audit-only') {
      errors.push(`${report.agent} done reports must use mode: audit-only`)
    }
    if (Array.isArray(report.changed) && report.changed.length > 0) {
      errors.push(`${report.agent} done reports must have changed: []`)
    }
  }

  if (report.status === 'blocked') {
    const needsOk =
      typeof report.needs === 'string' && report.needs.trim()
    const evidenceOk =
      typeof report.evidence === 'string' && report.evidence.trim()
    if (!needsOk && !evidenceOk) {
      errors.push('blocked requires non-empty needs or evidence')
    }
  }

  if (report.humanApprove === 'granted') {
    if (
      typeof report.approvedAction !== 'string' ||
      !report.approvedAction.trim()
    ) {
      errors.push(
        'humanApprove granted requires non-empty approvedAction (or "n/a")',
      )
    }
  }

  if (report.status === 'out-of-scope') {
    const next = report.recommendNext
    if (typeof next !== 'string' || !next.trim() || next === 'none') {
      errors.push('out-of-scope requires recommendNext other than none')
    }
  }

  if (report.status === 'needs-decision') {
    if (typeof report.needs !== 'string' || !report.needs.trim()) {
      errors.push('needs-decision requires non-empty needs')
    }
  }

  if (report.status === 'done' && report.mode === 'implement') {
    if (report.verificationResult !== 'pass') {
      errors.push(
        'implement done requires verificationResult pass (use needs-decision or fix; n/a and fail are invalid)',
      )
    }
    if (typeof report.evidence !== 'string' || !report.evidence.trim()) {
      errors.push('implement done requires non-empty evidence')
    }
    if (!Array.isArray(report.changed) || report.changed.length < 1) {
      errors.push('implement done requires non-empty changed')
    }
  }

  // verify-only / document must not smuggle product edits via changed[]
  if (report.mode === 'verify-only') {
    if (Array.isArray(report.changed) && report.changed.length > 0) {
      errors.push('verify-only requires changed: []')
    }
  }
  if (report.mode === 'document' && Array.isArray(report.changed)) {
    for (const p of report.changed) {
      if (typeof p !== 'string' || !isDocumentWritablePath(p)) {
        errors.push(
          `document changed path not allowed (docs/memory only): ${p}`,
        )
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

/** Paths document mode may list in changed (docs / agent memory / stack cards). */
export function isDocumentWritablePath(p) {
  if (typeof p !== 'string' || !p.trim()) return false
  if (p === 'AGENTS.md' || p === 'CLAUDE.md' || p === 'README.md') return true
  if (p.startsWith('docs/')) return true
  if (p.startsWith('.agents/memory/')) return true
  if (p.startsWith('.agents/') && p.endsWith('.md')) return true
  return false
}

/** Schema agent.enum must match PROJECT_AGENTS (sorted). */
export function schemaAgentEnum() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  return schema.properties?.agent?.enum || []
}

async function main() {
  let raw = process.argv[2]
  if (raw === '--stdin' || raw === '-') {
    const chunks = []
    for await (const c of process.stdin) chunks.push(c)
    raw = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
  }
  if (!raw) {
    console.error('Usage: validate-worker-report.mjs \'<json>\' | --stdin')
    process.exit(2)
  }
  let report
  try {
    report = JSON.parse(raw)
  } catch {
    const extracted = extractWorkerReportJson(raw)
    if (!extracted) {
      console.error('invalid JSON')
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

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  main()
}
