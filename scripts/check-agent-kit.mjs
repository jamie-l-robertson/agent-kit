#!/usr/bin/env node
/**
 * Claude Code kit health check for installed / kit repos.
 *   node scripts/check-agent-kit.mjs
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decide,
  normalizeClaudePayload,
  emptyState,
  saveState,
  DEFAULT_STATE_PATH,
  parseAgentsStackValue,
  normalizeStackRef,
} from '../.claude/hooks/gate-core.mjs'
import { validateWorkerReport } from './validate-worker-report.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const ADHERENCE_OK = new Set(['strict', 'standard', 'loose'])

function run(cmd, args) {
  const r = spawnSync(process.execPath, [cmd, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    console.error(r.stdout || '')
    console.error(r.stderr || '')
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`)
  }
}

/** @param {string} text */
export function parseKitVersion(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  /** @type {Record<string, string>} */
  const map = {}
  for (const line of lines) {
    const m = /^([a-zA-Z][\w-]*):\s*(.+)$/.exec(line)
    if (m) map[m[1]] = m[2].trim()
  }
  return map
}

/** @param {string} text */
export function assertKitVersion(text) {
  const errors = []
  const trimmed = String(text || '').trim()
  if (!trimmed || trimmed === 'unknown') {
    errors.push('.claude/.kit-version missing or unknown')
    return { ok: false, errors, fields: {} }
  }
  if (/^\d+\.\d+(\.\d+)?$/.test(trimmed)) {
    errors.push(
      '.claude/.kit-version must use kit: <label> lines (not bare semver)',
    )
    return { ok: false, errors, fields: {} }
  }
  const fields = parseKitVersion(trimmed)
  if (!fields.kit || !fields.kit.trim()) {
    errors.push('.claude/.kit-version missing non-empty kit: line')
  }
  return { ok: errors.length === 0, errors, fields }
}

// Stack-card parsing lives in gate-core: the hooks read the card too, and the
// import only runs one way (check-agent-kit → gate-core). Re-exported so this
// module's public surface is unchanged.
export { parseAgentsStackValue, normalizeStackRef }

/**
 * Empty / placeholder design-system stub (headings only, no filled bullets).
 * @param {string} root
 * @param {string} ref
 */
export function isEmptyOrPlaceholderDesignSystem(root, ref) {
  const n = normalizeStackRef(ref)
  if (!n || /^n\/a$/i.test(n)) return true
  if (/^https?:\/\//i.test(n)) return false
  const path = n.replace(/^\.\//, '')
  const abs = join(root, path)
  if (!existsSync(abs)) return true
  const body = readFileSync(abs, 'utf8')
  const filled = body.split(/\r?\n/).some((line) => {
    const t = line.trim()
    if (!t.startsWith('-')) return false
    const after = t
      .replace(/^-\s*/, '')
      .replace(/^[A-Za-z0-9 /|_-]+:\s*/, '')
      .trim()
    return after.length > 0
  })
  return !filled
}

/**
 * @param {string} root
 * @param {string} [agentsMd]
 */
export function checkDesignSystemAdherence(root, agentsMd) {
  const md =
    agentsMd ?? readFileSync(join(root, 'AGENTS.md'), 'utf8')
  const dsRaw = parseAgentsStackValue(md, 'Design system')
  const adRaw = parseAgentsStackValue(md, 'Design system adherence')
  const ds = normalizeStackRef(dsRaw)
  const ad = normalizeStackRef(adRaw).toLowerCase()
  const errors = []

  const emptyDs = isEmptyOrPlaceholderDesignSystem(root, dsRaw || ds)
  if (emptyDs) {
    if (ad && ad !== 'n/a') {
      errors.push(
        `Design system is n/a/empty stub but adherence is "${adRaw.trim()}" (must be n/a)`,
      )
    }
  } else if (!ADHERENCE_OK.has(ad)) {
    errors.push(
      `Design system is set (${ds}) but adherence must be strict|standard|loose (got "${adRaw.trim() || '(empty)'}"; prefer standard)`,
    )
  }
  return { ok: errors.length === 0, errors, designSystem: ds, adherence: ad }
}

function withTempGateState(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-check-gate-'))
  const prev = process.env.AGENT_KIT_STATE_PATH
  process.env.AGENT_KIT_STATE_PATH = join(dir, 'agent-roles.json')
  try {
    saveState(emptyState())
    fn()
  } finally {
    if (prev === undefined) delete process.env.AGENT_KIT_STATE_PATH
    else process.env.AGENT_KIT_STATE_PATH = prev
    rmSync(dir, { recursive: true, force: true })
  }
}


function smokeClaudeGate() {
  withTempGateState(() => {
    const sid = 'chk-sess'
    decide(
      normalizeClaudePayload({
        hook_event_name: 'SessionStart',
        session_id: sid,
      }),
    )
    decide(
      normalizeClaudePayload({
        hook_event_name: 'SubagentStart',
        agent_id: 'chk-mgr',
        agent_type: 'manager',
        session_id: sid,
      }),
    )
    const allow = decide(
      normalizeClaudePayload({
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        agent_id: 'chk-mgr',
        agent_type: 'manager',
        session_id: sid,
        tool_input: { subagent_type: 'frontend' },
      }),
    )
    if (allow.action !== 'allow') {
      throw new Error('Claude smoke: manager→frontend denied')
    }

    decide(
      normalizeClaudePayload({
        hook_event_name: 'SubagentStart',
        agent_id: 'chk-fe',
        agent_type: 'frontend',
        session_id: sid,
      }),
    )
    const deny = decide(
      normalizeClaudePayload({
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        agent_id: 'chk-fe',
        agent_type: 'frontend',
        session_id: sid,
        tool_input: { subagent_type: 'backend' },
      }),
    )
    if (deny.action !== 'deny') {
      throw new Error('Claude smoke: worker nest not denied')
    }
  })
}


function smokeValidator() {
  const ok = validateWorkerReport({
    status: 'done',
    agent: 'frontend',
    mode: 'implement',
    goal: 'check',
    changed: ['scripts/check-agent-kit.mjs'],
    recommendNext: 'none',
    humanApprove: 'n/a',
    verificationResult: 'pass',
    evidence: 'check-agent-kit smoke: ok',
  })
  if (!ok.ok) {
    throw new Error(`validator sample failed: ${ok.errors.join('; ')}`)
  }
  const emptyChanged = validateWorkerReport({
    status: 'done',
    agent: 'frontend',
    mode: 'implement',
    goal: 'check',
    changed: [],
    recommendNext: 'none',
    humanApprove: 'n/a',
    verificationResult: 'pass',
    evidence: 'x',
  })
  if (emptyChanged.ok) {
    throw new Error('validator should reject implement done with empty changed')
  }
  const na = validateWorkerReport({
    status: 'done',
    agent: 'frontend',
    mode: 'implement',
    goal: 'check',
    changed: ['x'],
    recommendNext: 'none',
    humanApprove: 'n/a',
    verificationResult: 'n/a',
  })
  if (na.ok) {
    throw new Error('validator should reject implement done with verificationResult n/a')
  }
  const bad = validateWorkerReport({
    status: 'done',
    agent: 'security',
    mode: 'implement',
    goal: 'x',
    changed: ['a'],
    recommendNext: 'none',
    humanApprove: 'n/a',
    verificationResult: 'n/a',
    findings: 'x',
  })
  if (bad.ok) throw new Error('validator should reject security implement done')
}

/**
 * append-blocks.md must point at the real files, never carry copies of them.
 *
 * It used to paste the sections verbatim under a "keep in sync" instruction,
 * and drifted: four standards rows lost their example paths, the No owner block
 * lost `researcher`, and the CLAUDE.md block lost the whole `## Routing`
 * section — so projects that installed over an existing CLAUDE.md got routing
 * guidance with the "never pass `name`" warning missing. A copy here is not a
 * style problem; it is that failure waiting to recur.
 *
 * @param {string} root
 * @returns {string[]} errors
 */
export function checkAppendBlocksArePointers(root) {
  const path = join(root, '.claude', 'skills', 'setup', 'append-blocks.md')
  if (!existsSync(path)) return []
  const md = readFileSync(path, 'utf8')
  const errors = []

  const stackRow = md.match(/^- \*\*[A-Za-z /]+\*\*:\s*<!--/m)
  if (stackRow) {
    errors.push(
      `append-blocks.md pastes a stack row (${stackRow[0].trim()}) — point at the \`## Stack\` section of .claude/skills/setup/AGENTS.template.md instead`,
    )
  }
  for (const marker of ['## Memory', '## No owner', '# Claude Code — agent kit']) {
    if (md.includes(`\n${marker}`)) {
      errors.push(
        `append-blocks.md pastes the "${marker}" body — name the source section instead`,
      )
    }
  }
  for (const src of ['.claude/skills/setup/AGENTS.template.md', 'CLAUDE.md']) {
    if (!md.includes(src)) {
      errors.push(`append-blocks.md never points at ${src}`)
    }
    if (!existsSync(join(root, src))) {
      errors.push(`append-blocks.md points at ${src}, which does not exist`)
    }
  }
  return errors
}

function main() {
  const kitVersionPath = join(ROOT, '.claude', '.kit-version')
  const kitVersionRaw = existsSync(kitVersionPath)
    ? readFileSync(kitVersionPath, 'utf8')
    : ''
  const kitVersionCheck = assertKitVersion(kitVersionRaw)
  const kitVersionLabel =
    kitVersionCheck.fields.kit || kitVersionRaw.trim() || 'unknown'

  const defaultBefore = existsSync(DEFAULT_STATE_PATH)
    ? readFileSync(DEFAULT_STATE_PATH, 'utf8')
    : null

  const errors = []
  if (!kitVersionCheck.ok) {
    errors.push(...kitVersionCheck.errors)
  }
  try {
    const ds = checkDesignSystemAdherence(ROOT)
    if (!ds.ok) errors.push(...ds.errors)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    run(join(__dirname, 'sync-tool-adapters.mjs'), ['--check'])
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
    errors.push('  fix: node scripts/sync-tool-adapters.mjs')
  }
  try {
    run(join(__dirname, 'sync-project-skills.mjs'), ['--check'])
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
    errors.push('  fix: node scripts/sync-project-skills.mjs')
  }
  try {
    errors.push(...checkAppendBlocksArePointers(ROOT))
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    smokeClaudeGate()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    smokeValidator()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  const defaultAfter = existsSync(DEFAULT_STATE_PATH)
    ? readFileSync(DEFAULT_STATE_PATH, 'utf8')
    : null
  if (defaultAfter !== defaultBefore) {
    errors.push('DEFAULT_STATE_PATH was mutated by check-agent-kit')
  }

  if (errors.length) {
    console.error('check-agent-kit failed:')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(
    `check-agent-kit OK (kit ${kitVersionLabel}; sync, skills, Claude gate smoke, validator)`,
  )
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
