import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MANAGER, WORKERS, PROJECT_AGENTS } from '../.agents/hooks/gate-core.mjs'
import { parseFrontmatter } from './sync-tool-adapters.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const scenarios = JSON.parse(
  readFileSync(join(root, 'docs/agent-kit/routing-scenarios.json'), 'utf8'),
)

const RETIRED = new Set(['accessibility', 'performance', 'architect', 'cloud'])
const ALLOWED = new Set([...PROJECT_AGENTS, 'no-owner'])

function agentModels() {
  /** @type {Map<string, string>} */
  const map = new Map()
  const dir = join(root, '.agents', 'agents')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const { frontmatter } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
    const name = frontmatter.name || f.replace(/\.md$/, '')
    map.set(name, String(frontmatter.model || ''))
  }
  return map
}

test('routing scenarios cover manager and every WORKER as primary at least once', () => {
  const primaries = new Set(scenarios.map((s) => s.primary))
  assert.ok(primaries.has(MANAGER), 'missing manager primary')
  for (const w of WORKERS) {
    assert.ok(primaries.has(w), `missing primary scenario for worker: ${w}`)
  }
})

test('routing scenarios include a no-owner case', () => {
  assert.ok(scenarios.some((s) => s.primary === 'no-owner' || s.expect.includes('no-owner')))
})

test('risk only on PII/compliance scenarios', () => {
  const riskAllowed = new Set(
    scenarios.filter((s) => /pii|retention|classification|email field/i.test(s.ask)).map((s) => s.id),
  )
  for (const s of scenarios) {
    const hasRisk = s.expect.includes('risk') || s.primary === 'risk'
    if (hasRisk) {
      assert.ok(riskAllowed.has(s.id), `risk unexpected in scenario ${s.id}: ${s.ask}`)
    }
  }
})

test('markdown twin lists same ids/primary/expect as JSON', () => {
  const md = readFileSync(join(root, 'docs/agent-kit/routing-scenarios.md'), 'utf8')
  for (const s of scenarios) {
    const row = md.split('\n').find((line) => line.startsWith(`| ${s.id} |`))
    assert.ok(row, `missing markdown row for scenario ${s.id}`)
    assert.ok(row.includes(`\`${s.primary}\``) || row.includes(s.primary), `md primary mismatch ${s.id}`)
    if (s.model && s.model !== 'n/a') {
      assert.ok(row.includes(s.model), `md model mismatch ${s.id}`)
    }
    for (const name of s.expect) {
      assert.ok(
        row.includes(name),
        `md expect missing ${name} for scenario ${s.id}`,
      )
    }
  }
})

test('scenario model matches primary agent frontmatter', () => {
  const models = agentModels()
  for (const s of scenarios) {
    assert.ok(typeof s.model === 'string' && s.model.length > 0, `scenario ${s.id} missing model`)
    if (s.primary === 'no-owner') {
      assert.equal(s.model, 'n/a', `scenario ${s.id} no-owner model`)
      continue
    }
    const fm = models.get(s.primary)
    assert.ok(fm, `no frontmatter model for primary ${s.primary}`)
    assert.equal(s.model, fm, `scenario ${s.id} model !== ${s.primary} frontmatter`)
  }
})

test('no retired agent names in fixtures', () => {
  for (const s of scenarios) {
    for (const name of [s.primary, ...s.expect]) {
      assert.ok(!RETIRED.has(name), `retired agent ${name} in scenario ${s.id}`)
      assert.ok(ALLOWED.has(name), `unknown agent ${name} in scenario ${s.id}`)
    }
  }
})

test('expect is non-empty and includes primary when primary is an agent', () => {
  for (const s of scenarios) {
    assert.ok(Array.isArray(s.expect) && s.expect.length > 0, `scenario ${s.id} expect empty`)
    if (s.primary !== 'no-owner' && s.primary !== 'manager') {
      assert.ok(s.expect.includes(s.primary), `scenario ${s.id} expect missing primary`)
    }
  }
})
