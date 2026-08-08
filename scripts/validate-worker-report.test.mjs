import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractWorkerReportJson, validateWorkerReport } from './validate-worker-report.mjs'

const valid = {
  status: 'done',
  agent: 'frontend',
  mode: 'implement',
  goal: 'Ship button',
  changed: ['src/Button.tsx'],
  recommendNext: 'none',
  humanApprove: 'n/a',
}

test('validateWorkerReport accepts valid report', () => {
  const r = validateWorkerReport(valid)
  assert.equal(r.ok, true)
})

test('validateWorkerReport rejects missing fields', () => {
  const r = validateWorkerReport({ status: 'done' })
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('missing')))
})

test('validateWorkerReport rejects bad status', () => {
  const r = validateWorkerReport({ ...valid, status: 'ok' })
  assert.equal(r.ok, false)
})

test('extractWorkerReportJson finds last matching fence', () => {
  const text = `
Status: done
\`\`\`json
{"status":"done","agent":"reviewer","mode":"audit-only","goal":"Review","changed":[],"recommendNext":"none"}
\`\`\`
`
  const report = extractWorkerReportJson(text)
  assert.equal(report.agent, 'reviewer')
  assert.equal(validateWorkerReport(report).ok, true)
})
