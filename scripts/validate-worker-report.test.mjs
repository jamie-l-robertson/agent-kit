import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractWorkerReportJson,
  validateWorkerReport,
  SCHEMA_REQUIRED,
  loadSchemaRequired,
  schemaAgentEnum,
} from './validate-worker-report.mjs'
import { PROJECT_AGENTS } from '../.agents/hooks/gate-core.mjs'

const valid = {
  status: 'done',
  agent: 'frontend',
  mode: 'implement',
  goal: 'Ship button',
  changed: ['src/Button.tsx'],
  recommendNext: 'none',
  humanApprove: 'n/a',
  verificationResult: 'pass',
  evidence: 'vitest: 3 passed',
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

test('validateWorkerReport rejects unknown agent', () => {
  assert.equal(validateWorkerReport({ ...valid, agent: 'fronend' }).ok, false)
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
    verificationResult: 'n/a',
  })
  assert.equal(r.ok, false)
  assert.equal(
    validateWorkerReport({
      ...valid,
      agent: 'reviewer',
      mode: 'audit-only',
      changed: [],
      findings: 'none',
      verificationResult: 'n/a',
    }).ok,
    true,
  )
})

test('planner done must have empty changed and audit-only', () => {
  const r = validateWorkerReport({
    ...valid,
    agent: 'planner',
    mode: 'audit-only',
    changed: ['x'],
    verificationResult: 'n/a',
  })
  assert.equal(r.ok, false)
})

test('reviewer done must be audit-only', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      agent: 'reviewer',
      mode: 'implement',
      changed: ['x'],
      findings: 'x',
      verificationResult: 'n/a',
    }).ok,
    false,
  )
})

test('pass|fail requires evidence', () => {
  assert.equal(
    validateWorkerReport({ ...valid, evidence: '' }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      mode: 'audit-only',
      changed: [],
      verificationResult: 'n/a',
      evidence: null,
    }).ok,
    true,
  )
})

test('blocked requires needs or evidence', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      status: 'blocked',
      verificationResult: 'n/a',
      evidence: null,
      needs: null,
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      status: 'blocked',
      verificationResult: 'n/a',
      evidence: null,
      needs: 'waiting on MCP',
    }).ok,
    true,
  )
})

test('granted requires approvedAction', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      humanApprove: 'granted',
      approvedAction: null,
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      humanApprove: 'granted',
      approvedAction: 'n/a',
    }).ok,
    true,
  )
})

test('recommendNext empty string invalid', () => {
  assert.equal(
    validateWorkerReport({ ...valid, recommendNext: '' }).ok,
    false,
  )
})

test('schema agent enum matches PROJECT_AGENTS', () => {
  const fromSchema = [...schemaAgentEnum()].sort()
  const fromGate = [...PROJECT_AGENTS].sort()
  assert.deepEqual(fromSchema, fromGate)
})

test('security done must be audit-only with empty changed', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      agent: 'security',
      mode: 'implement',
      changed: ['x'],
      findings: 'crit',
      verificationResult: 'n/a',
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      agent: 'security',
      mode: 'audit-only',
      changed: [],
      findings: 'crit',
      verificationResult: 'n/a',
    }).ok,
    true,
  )
})

test('out-of-scope requires recommendNext', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      status: 'out-of-scope',
      recommendNext: 'none',
      verificationResult: 'n/a',
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      status: 'out-of-scope',
      recommendNext: 'backend',
      verificationResult: 'n/a',
    }).ok,
    true,
  )
})

test('needs-decision requires needs', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      status: 'needs-decision',
      needs: null,
      verificationResult: 'n/a',
    }).ok,
    false,
  )
})

test('implement done requires pass + evidence (1A)', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      verificationResult: 'fail',
      evidence: 'x',
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      verificationResult: 'n/a',
      evidence: null,
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      verificationResult: 'pass',
      evidence: '',
    }).ok,
    false,
  )
  assert.equal(validateWorkerReport(valid).ok, true)
})

test('extractWorkerReportJson finds last matching fence', () => {
  const text = `
Status: done
\`\`\`json
{"status":"done","agent":"reviewer","mode":"audit-only","goal":"Review","changed":[],"recommendNext":"none","humanApprove":"n/a","findings":"none","verificationResult":"n/a"}
\`\`\`
`
  const report = extractWorkerReportJson(text)
  assert.equal(report.agent, 'reviewer')
  assert.equal(validateWorkerReport(report).ok, true)
})
