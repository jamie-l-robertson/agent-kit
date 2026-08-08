import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STATE_PATH,
  emptyState,
  saveState,
  loadState,
  decide,
  resolveEffectiveCaller,
  rememberRole,
  MANAGER,
} from '../.agents/hooks/gate-core.mjs'

const stateDir = dirname(STATE_PATH)

beforeEach(() => {
  mkdirSync(stateDir, { recursive: true })
  saveState(emptyState())
})

afterEach(() => {
  if (existsSync(STATE_PATH)) rmSync(STATE_PATH, { force: true })
})

test('root may spawn manager', () => {
  const d = decide({
    event: 'preToolUse',
    target: MANAGER,
    conversationId: 'root-1',
    parentConversationId: '',
    subagentId: 'mgr-1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'allow')
  assert.equal(loadState().roles['mgr-1'], MANAGER)
})

test('manager may spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'mgr-1', MANAGER)
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'frontend',
    conversationId: 'c',
    parentConversationId: 'mgr-1',
    subagentId: 'fe-1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'allow')
  assert.equal(loadState().roles['fe-1'], 'frontend')
})

test('worker cannot spawn worker', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend')
  saveState(state)
  const d = decide({
    event: 'preToolUse',
    target: 'backend',
    conversationId: 'c',
    parentConversationId: 'fe-1',
    subagentId: 'be-1',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'deny')
})

test('unknown parent id fails closed', () => {
  const d = decide({
    event: 'preToolUse',
    target: 'frontend',
    conversationId: 'c',
    parentConversationId: 'ghost-parent',
    subagentId: 'fe-x',
    callerAgentType: '',
    callerAgentId: '',
    recordChild: true,
  })
  assert.equal(d.action, 'deny')
  assert.match(d.message, /unknown/i)
})

test('resolveEffectiveCaller: empty parent is root', () => {
  assert.equal(
    resolveEffectiveCaller(emptyState(), {
      callerAgentType: '',
      callerAgentId: '',
      parentConversationId: '',
      conversationId: 'sess',
    }),
    'root',
  )
})

test('SubagentStop clears role', () => {
  const state = emptyState()
  rememberRole(state, 'fe-1', 'frontend')
  saveState(state)
  decide({
    event: 'SubagentStop',
    subagentId: 'fe-1',
    conversationId: '',
    parentConversationId: '',
    target: 'frontend',
    callerAgentType: '',
    callerAgentId: '',
  })
  assert.equal(loadState().roles['fe-1'], undefined)
})

test('corrupt state file loads as empty', () => {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(STATE_PATH, '{not-json', 'utf8')
  const s = loadState()
  assert.deepEqual(s.roles, {})
})
