import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractWorkerReportJson,
  validateWorkerReport,
  SCHEMA_REQUIRED,
  loadSchemaRequired,
} from './validate-worker-report.mjs'

const valid = {
  status: 'done',
  agent: 'frontend',
  mode: 'implement',
  goal: 'Ship button',
  changed: ['src/Button.tsx'],
  recommendNext: 'none',
  humanApprove: 'n/a',
}

test('schema required keys match validator', () => {
  assert.deepEqual(loadSchemaRequired().sort(), [...SCHEMA_REQUIRED].sort())
})

test('validateWorkerReport accepts valid report', () => {
  assert.equal(validateWorkerReport(valid).ok, true)
})

test('validateWorkerReport rejects missing fields', () => {
  const r = validateWorkerReport({ status: 'done' })
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('missing')))
})

test('validateWorkerReport rejects bad status', () => {
  assert.equal(validateWorkerReport({ ...valid, status: 'ok' }).ok, false)
})

test('done + humanApprove required is invalid', () => {
  const r = validateWorkerReport({ ...valid, humanApprove: 'required' })
  assert.equal(r.ok, false)
})

test('reviewer audit-only done requires findings', () => {
  const r = validateWorkerReport({
    ...valid,
    agent: 'reviewer',
    mode: 'audit-only',
    changed: [],
    findings: null,
  })
  assert.equal(r.ok, false)
  assert.equal(
    validateWorkerReport({
      ...valid,
      agent: 'reviewer',
      mode: 'audit-only',
      changed: [],
      findings: 'none',
    }).ok,
    true,
  )
})

test('planner done must have empty changed', () => {
  const r = validateWorkerReport({
    ...valid,
    agent: 'planner',
    mode: 'audit-only',
    changed: ['x'],
  })
  assert.equal(r.ok, false)
})

test('extractWorkerReportJson finds last matching fence', () => {
  const text = `
Status: done
\`\`\`json
{"status":"done","agent":"reviewer","mode":"audit-only","goal":"Review","changed":[],"recommendNext":"none","humanApprove":"n/a","findings":"none"}
\`\`\`
`
  const report = extractWorkerReportJson(text)
  assert.equal(report.agent, 'reviewer')
  assert.equal(validateWorkerReport(report).ok, true)
})
