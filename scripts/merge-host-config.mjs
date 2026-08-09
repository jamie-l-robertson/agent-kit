/**
 * Merge kit Cursor/Claude hook configs into a project root without wiping
 * foreign entries. Shared by install and sync-tool-adapters.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const CURSOR_GATE = 'node .agents/hooks/adapters/cursor.mjs'
export const CLAUDE_GATE = 'node .agents/hooks/adapters/claude.mjs'

export function mergeHookEntries(existingList, kitEntries, sameFn) {
  const list = Array.isArray(existingList) ? [...existingList] : []
  for (const kit of kitEntries) {
    const idx = list.findIndex((e) => sameFn(e, kit))
    if (idx >= 0) list[idx] = { ...list[idx], ...kit }
    else list.push(kit)
  }
  return list
}

/**
 * @param {string} root project root
 * @param {{ failOnInvalidJson?: boolean }} [opts]
 */
export function mergeCursorHooks(root, { failOnInvalidJson = true } = {}) {
  const path = join(root, '.cursor', 'hooks.json')
  const kitHooks = {
    sessionStart: [{ command: CURSOR_GATE }],
    sessionEnd: [{ command: CURSOR_GATE }],
    subagentStart: [{ command: CURSOR_GATE, failClosed: true }],
    subagentStop: [{ command: CURSOR_GATE }],
    preToolUse: [
      { command: CURSOR_GATE, matcher: 'Task', failClosed: true },
    ],
  }

  let doc = { version: 1, hooks: {} }
  if (existsSync(path)) {
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'))
      if (!doc || typeof doc !== 'object') doc = { version: 1, hooks: {} }
      if (!doc.hooks || typeof doc.hooks !== 'object') doc.hooks = {}
    } catch (err) {
      if (failOnInvalidJson) {
        throw new Error(
          `Invalid JSON in ${path}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      doc = { version: 1, hooks: {} }
    }
  }
  if (doc.version == null) doc.version = 1

  const sameCmd = (a, b) => a?.command === b?.command
  const samePre = (a, b) =>
    a?.command === b?.command && a?.matcher === b?.matcher

  doc.hooks.sessionStart = mergeHookEntries(
    doc.hooks.sessionStart,
    kitHooks.sessionStart,
    sameCmd,
  )
  doc.hooks.sessionEnd = mergeHookEntries(
    doc.hooks.sessionEnd,
    kitHooks.sessionEnd,
    sameCmd,
  )
  doc.hooks.subagentStart = mergeHookEntries(
    doc.hooks.subagentStart,
    kitHooks.subagentStart,
    sameCmd,
  )
  doc.hooks.subagentStop = mergeHookEntries(
    doc.hooks.subagentStop,
    kitHooks.subagentStop,
    sameCmd,
  )
  doc.hooks.preToolUse = mergeHookEntries(
    doc.hooks.preToolUse,
    kitHooks.preToolUse,
    samePre,
  )

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return doc
}

/**
 * @param {string} root project root
 * @param {{ failOnInvalidJson?: boolean }} [opts]
 */
export function mergeClaudeSettings(root, { failOnInvalidJson = true } = {}) {
  const settingsPath = join(root, '.claude', 'settings.json')
  let existing = {}
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf8'))
    } catch (err) {
      if (failOnInvalidJson) {
        throw new Error(
          `Invalid JSON in ${settingsPath}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      existing = {}
    }
  }

  const hooks = { ...(existing.hooks || {}) }

  /**
   * Merge kit command into matcher entry without dropping sibling foreign hooks.
   */
  const mergeByCommand = (arr, matcher, command) => {
    const list = Array.isArray(arr) ? [...arr] : []
    const idx = list.findIndex((e) =>
      matcher ? e?.matcher === matcher : !e?.matcher,
    )
    const kitHook = { type: 'command', command }
    if (idx < 0) {
      list.push(
        matcher
          ? { matcher, hooks: [kitHook] }
          : { hooks: [kitHook] },
      )
      return list
    }
    const entry = { ...list[idx] }
    const inner = Array.isArray(entry.hooks) ? [...entry.hooks] : []
    const hIdx = inner.findIndex((h) => h?.command === command)
    if (hIdx >= 0) inner[hIdx] = { ...inner[hIdx], ...kitHook }
    else inner.push(kitHook)
    entry.hooks = inner
    if (matcher) entry.matcher = matcher
    list[idx] = entry
    return list
  }

  hooks.SessionStart = mergeByCommand(hooks.SessionStart, null, CLAUDE_GATE)
  hooks.PreToolUse = mergeByCommand(hooks.PreToolUse, 'Agent|Task', CLAUDE_GATE)
  hooks.SubagentStart = mergeByCommand(hooks.SubagentStart, null, CLAUDE_GATE)
  hooks.SubagentStop = mergeByCommand(hooks.SubagentStop, null, CLAUDE_GATE)
  hooks.SessionEnd = mergeByCommand(hooks.SessionEnd, null, CLAUDE_GATE)

  existing.hooks = hooks
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8')
  return existing
}
