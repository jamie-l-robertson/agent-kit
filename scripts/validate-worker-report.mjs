/**
 * Dependency-free validator for worker-report JSON fences.
 * Usage: node scripts/validate-worker-report.mjs '<json>' | --stdin
 */

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const STATUS = new Set(['done', 'needs-decision', 'blocked', 'out-of-scope'])
const MODE = new Set(['audit-only', 'implement', 'verify-only', 'document'])
const HUMAN = new Set(['required', 'granted', 'n/a'])

export function extractWorkerReportJson(text) {
  if (!text || typeof text !== 'string') return null
  const re = /```(?:json)?\s*\n([\s\S]*?)\n```/g
  let match
  let last = null
  while ((match = re.exec(text)) !== null) {
    const body = match[1].trim()
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && 'status' in parsed && 'agent' in parsed) {
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
  for (const key of ['status', 'agent', 'mode', 'goal', 'changed', 'recommendNext']) {
    if (!(key in report)) errors.push(`missing required field: ${key}`)
  }
  if (report.status != null && !STATUS.has(report.status)) {
    errors.push(`invalid status: ${report.status}`)
  }
  if (report.mode != null && !MODE.has(report.mode)) {
    errors.push(`invalid mode: ${report.mode}`)
  }
  if (report.agent != null && (typeof report.agent !== 'string' || !report.agent.trim())) {
    errors.push('agent must be a non-empty string')
  }
  if (report.goal != null && (typeof report.goal !== 'string' || !report.goal.trim())) {
    errors.push('goal must be a non-empty string')
  }
  if (report.changed != null && !Array.isArray(report.changed)) {
    errors.push('changed must be an array of strings')
  } else if (Array.isArray(report.changed) && report.changed.some((p) => typeof p !== 'string')) {
    errors.push('changed items must be strings')
  }
  if (report.recommendNext != null && typeof report.recommendNext !== 'string') {
    errors.push('recommendNext must be a string')
  }
  if (report.humanApprove != null && !HUMAN.has(report.humanApprove)) {
    errors.push(`invalid humanApprove: ${report.humanApprove}`)
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
    console.error('Usage: node scripts/validate-worker-report.mjs \'<json>\' | --stdin')
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
