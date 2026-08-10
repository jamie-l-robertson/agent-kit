import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractWorkerReportJson,
  validateWorkerReport,
  SCHEMA_REQUIRED,
  loadSchemaRequired,
  schemaAgentEnum,
} from './validate-worker-report.mjs'
import { PROJECT_AGENTS } from '../.claude/hooks/gate-core.mjs'

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
  assert.equal(
    validateWorkerReport({
      ...valid,
      changed: [],
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

test('verify-only requires changed: []', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      mode: 'verify-only',
      changed: ['src/Button.tsx'],
      verificationResult: 'pass',
      evidence: 'vitest: 3 passed',
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      mode: 'verify-only',
      changed: [],
      verificationResult: 'pass',
      evidence: 'vitest: 3 passed',
    }).ok,
    true,
  )
})

test('document rejects product paths in changed', () => {
  assert.equal(
    validateWorkerReport({
      ...valid,
      agent: 'documenter',
      mode: 'document',
      changed: ['src/Button.tsx'],
      verificationResult: 'n/a',
      evidence: null,
    }).ok,
    false,
  )
  assert.equal(
    validateWorkerReport({
      ...valid,
      agent: 'documenter',
      mode: 'document',
      changed: ['.claude/memory/decisions.md', 'docs/agent-kit/notes.md'],
      verificationResult: 'n/a',
      evidence: null,
    }).ok,
    true,
  )
})

const research = {
  status: 'done',
  agent: 'researcher',
  mode: 'audit-only',
  goal: 'source the 2026 stats',
  changed: [],
  recommendNext: 'none',
  humanApprove: 'n/a',
  verificationResult: 'n/a',
  findings: 'Adoption sat at 41% in Q1 [S1].',
  sources: [{ title: 'Vendor report 2026', url: 'https://example.com/r' }],
}

test('researcher done requires non-empty sources', () => {
  assert.equal(validateWorkerReport(research).ok, true)
  const noSources = { ...research }
  delete noSources.sources
  assert.equal(validateWorkerReport(noSources).ok, false)
  assert.equal(validateWorkerReport({ ...research, sources: [] }).ok, false)
})

test('researcher is readonly and never implements', () => {
  assert.equal(
    validateWorkerReport({
      ...research,
      mode: 'implement',
      changed: ['src/a.ts'],
      verificationResult: 'pass',
      evidence: 'x',
    }).ok,
    false,
  )
})

test('sources entries need a title and a url or ref', () => {
  const bad = (sources) => validateWorkerReport({ ...research, sources }).ok
  assert.equal(bad([{ url: 'https://example.com' }]), false, 'title required')
  assert.equal(bad([{ title: 'No locator' }]), false, 'url or ref required')
  assert.equal(bad([{ title: 'Repo', ref: '.claude/memory/decisions.md' }]), true)
  assert.equal(bad(['just a string']), false)
  assert.equal(bad('not an array'), false)
})

test('a blocked researcher run needs no sources', () => {
  const blocked = {
    ...research,
    status: 'blocked',
    needs: 'no primary source found for the 2026 threshold',
  }
  delete blocked.sources
  assert.equal(validateWorkerReport(blocked).ok, true)
})
