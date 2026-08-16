#!/usr/bin/env node
/**
 * Toggle the Vercel plugin for this project only.
 *
 * The plugin is enabled once at user scope (`~/.claude/settings.json`) and then
 * fires everywhere: SessionStart context, a PreToolUse hook on every
 * Read/Edit/Write/Bash, SubagentStart injection into every kit worker. In a
 * project that is not Next/Vercel that is pure context cost, and its
 * "you must run the Skill(bootstrap) tool" injection pulls workers off-brief.
 *
 * Project-scope `enabledPlugins` overrides user scope (verified by A/B on a
 * fresh headless session). The toggle is written to `.claude/settings.local.json`
 * — per-machine and gitignored, never shipped with the kit.
 *
 * Detection is a hint, not a decision: reporting is the default, and writing
 * takes an explicit flag so the user's answer is what actually decides.
 *
 *   node scripts/vercel-plugin.mjs          # report detection + current state
 *   node scripts/vercel-plugin.mjs --on     # keep the plugin in this project
 *   node scripts/vercel-plugin.mjs --off    # disable it here only
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const PLUGIN_KEY = 'vercel-plugin@vercel'

/** @param {string} root */
export function localSettingsPath(root) {
  return join(root, '.claude', 'settings.local.json')
}

/**
 * Is this plausibly a Next project? A hint for the question, never the answer —
 * a Next app that never deploys to Vercel still may not want the hosting half.
 * @param {string} root
 * @returns {{ isNext: boolean, reasons: string[] }}
 */
export function detectNext(root) {
  const reasons = []
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      if (deps.next) reasons.push(`package.json depends on next@${deps.next}`)
    } catch {
      // Unreadable package.json is not evidence either way.
    }
  }
  for (const f of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    if (existsSync(join(root, f))) reasons.push(`${f} present`)
  }
  return { isNext: reasons.length > 0, reasons }
}

/** @param {string} root @returns {boolean | undefined} undefined = inherits user scope */
export function currentState(root) {
  const path = localSettingsPath(root)
  if (!existsSync(path)) return undefined
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    const v = doc?.enabledPlugins?.[PLUGIN_KEY]
    return typeof v === 'boolean' ? v : undefined
  } catch {
    return undefined
  }
}

/**
 * Merge the toggle in without disturbing anything else in the file.
 * @param {string} root
 * @param {boolean} enabled
 */
export function setPluginEnabled(root, enabled) {
  const path = localSettingsPath(root)
  let doc = {}
  if (existsSync(path)) {
    try {
      doc = JSON.parse(readFileSync(path, 'utf8')) || {}
    } catch {
      throw new Error(`Invalid JSON in ${path} — fix or delete it, then re-run.`)
    }
  }
  doc.enabledPlugins = { ...(doc.enabledPlugins || {}), [PLUGIN_KEY]: enabled }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return path
}

const stateLabel = (v) =>
  v === undefined ? 'inherits user settings' : v ? 'enabled here' : 'disabled here'

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd()
  const on = process.argv.includes('--on')
  const off = process.argv.includes('--off')

  if (on && off) {
    console.error('Pass --on or --off, not both.')
    process.exit(1)
  }

  if (!on && !off) {
    const { isNext, reasons } = detectNext(root)
    console.log(`Vercel plugin (${PLUGIN_KEY}): ${stateLabel(currentState(root))}`)
    console.log(
      isNext
        ? `Looks like a Next project — ${reasons.join('; ')}.`
        : 'No Next markers found (no next dependency, no next.config.*).',
    )
    console.log('Ask the user, then re-run with --on or --off.')
    process.exit(0)
  }

  const path = setPluginEnabled(root, on)
  console.log(
    `Vercel plugin ${on ? 'enabled' : 'disabled'} for this project → ${path}`,
  )
  console.log('Takes effect on the next Claude Code session (settings load at start).')
}
