#!/usr/bin/env node
/**
 * Multi-host health check for installed / kit repos.
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
  normalizeCursorPayload,
  normalizeClaudePayload,
  emptyState,
  saveState,
  DEFAULT_STATE_PATH,
  MANAGER,
  PROJECT_AGENTS,
} from '../.agents/hooks/gate-core.mjs'
import { validateWorkerReport } from './validate-worker-report.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

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

function smokeCursorGate() {
  withTempGateState(() => {
    const sid = 'chk-root'
    decide(
      normalizeCursorPayload({
        hook_event_name: 'sessionStart',
        conversation_id: sid,
        session_id: sid,
      }),
    )
    decide(
      normalizeCursorPayload({
        hook_event_name: 'subagentStart',
        session_id: sid,
        conversation_id: 'chk-mgr',
        parent_conversation_id: sid,
        subagent_id: 'chk-mgr-1',
        subagent_type: 'manager',
      }),
    )
    const allow = decide(
      normalizeCursorPayload({
        hook_event_name: 'preToolUse',
        session_id: sid,
        conversation_id: 'chk-mgr',
        parent_conversation_id: 'chk-mgr-1',
        subagent_id: 'chk-fe',
        tool_input: { subagent_type: 'frontend' },
      }),
    )
    if (allow.action !== 'allow') {
      throw new Error('Cursor smoke: manager→frontend denied')
    }

    decide(
      normalizeCursorPayload({
        hook_event_name: 'subagentStart',
        session_id: sid,
        conversation_id: 'chk-fe',
        parent_conversation_id: 'chk-mgr-1',
        subagent_id: 'chk-fe',
        subagent_type: 'frontend',
      }),
    )
    const deny = decide(
      normalizeCursorPayload({
        hook_event_name: 'preToolUse',
        session_id: sid,
        conversation_id: 'chk-fe',
        parent_conversation_id: 'chk-fe',
        subagent_id: 'chk-be',
        tool_input: { subagent_type: 'backend' },
      }),
    )
    if (deny.action !== 'deny') {
      throw new Error('Cursor smoke: worker nest not denied')
    }
    const denyStart = decide(
      normalizeCursorPayload({
        hook_event_name: 'subagentStart',
        session_id: sid,
        conversation_id: 'chk-be',
        parent_conversation_id: 'chk-fe',
        subagent_id: 'chk-be',
        subagent_type: 'backend',
      }),
    )
    if (denyStart.action !== 'deny') {
      throw new Error('Cursor smoke: subagentStart nest not denied')
    }
  })
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

function smokeCopilotMarkers() {
  const dir = join(ROOT, '.github', 'agents')
  for (const name of PROJECT_AGENTS) {
    if (name === MANAGER) continue
    const p = join(dir, `${name}.md`)
    if (!existsSync(p)) throw new Error(`missing Copilot agent ${name}`)
    const body = readFileSync(p, 'utf8')
    if (!/No nesting|cannot spawn|Do not spawn/i.test(body)) {
      throw new Error(`Copilot ${name}: missing nesting forbid`)
    }
    if (!/```(?:json)?\s*\n[\s\S]*?"status"\s*:/.test(body)) {
      throw new Error(`Copilot ${name}: missing worker-report fence shape`)
    }
  }
}

function smokeValidator() {
  const ok = validateWorkerReport({
    status: 'done',
    agent: 'frontend',
    mode: 'implement',
    goal: 'check',
    changed: [],
    recommendNext: 'none',
    humanApprove: 'n/a',
    verificationResult: 'n/a',
  })
  if (!ok.ok) {
    throw new Error(`validator sample failed: ${ok.errors.join('; ')}`)
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

function main() {
  const defaultBefore = existsSync(DEFAULT_STATE_PATH)
    ? readFileSync(DEFAULT_STATE_PATH, 'utf8')
    : null

  const errors = []
  try {
    run(join(__dirname, 'sync-tool-adapters.mjs'), ['--check'])
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    run(join(__dirname, 'sync-project-skills.mjs'), ['--check'])
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    smokeCursorGate()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    smokeClaudeGate()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    smokeCopilotMarkers()
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
    'check-agent-kit OK (sync, skills, Cursor/Claude gate smoke, Copilot markers, validator)',
  )
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
