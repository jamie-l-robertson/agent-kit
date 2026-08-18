/**
 * Merge kit Claude settings into a project root without wiping foreign entries.
 * Shared by install and sync-tool-adapters.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** ${CLAUDE_PROJECT_DIR} — hook cwd is not guaranteed (Desktop, subdir sessions). */
export const CLAUDE_GATE =
  'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/adapters/claude.mjs"'

/** Any prior spelling of the kit gate command (relative path, unquoted, …). */
const LEGACY_GATE_RE = /adapters[/\\]claude\.mjs/

/**
 * SubagentStop fires for every agent type — scope the report gate to kit names.
 * Literal (not derived from gate-core) so the installer can run standalone;
 * merge-host-config.test.mjs asserts it stays in sync with PROJECT_AGENTS.
 */
export const KIT_AGENT_MATCHER =
  'backend|devops|documenter|frontend|infrastructure|manager|planner|researcher|reviewer|risk|security|tester'

/** Kit scripts the manager/workers run constantly; allowlisted to cut prompts. */
export const KIT_PERMISSIONS = [
  'Bash(node scripts/validate-worker-report.mjs:*)',
  'Bash(node scripts/check-agent-kit.mjs:*)',
  'Bash(node scripts/sync-tool-adapters.mjs:*)',
  'Bash(node scripts/sync-project-skills.mjs:*)',
  'Bash(node scripts/append-memory.mjs:*)',
  'Bash(node scripts/format-final-report.mjs:*)',
]

/** Agent|Task = call-graph gate; Bash = tracker-bypass deny (access integrity). */
// Write|Edit|NotebookEdit|MultiEdit carry the write-lease check. Without them
// the hook never sees a file write, so overlapping Writable paths were
// unenforceable and collisions only showed up as workers clobbering each other.
/**
 * `mcp__.*` is here for the ticket-scope guard: without it the hook never sees
 * a tracker call, and an agent can read or update the wrong Jira project or
 * GitHub repo unchallenged. It means the hook runs on every MCP call, so the
 * ticket path gates on the tool *name* before it touches AGENTS.md.
 */
export const PRETOOL_MATCHER =
  'Agent|Task|Bash|Write|Edit|NotebookEdit|MultiEdit|mcp__.*'

/** Secrets stay out of agent context — names and refs only. */
export const KIT_DENY = ['Read(./.env)', 'Read(./.env.*)']

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
   * Any legacy spelling of the kit command is swept first so upgrades replace
   * rather than duplicate (a duplicate gate fires the hook twice per event).
   */
  const mergeByCommand = (arr, matcher, command) => {
    const list = (Array.isArray(arr) ? arr : [])
      .map((e) => {
        const inner = Array.isArray(e?.hooks) ? e.hooks : []
        const kept = inner.filter(
          (h) => !LEGACY_GATE_RE.test(String(h?.command || '')),
        )
        return kept.length === inner.length ? e : { ...e, hooks: kept }
      })
      .filter((e) => (Array.isArray(e?.hooks) ? e.hooks.length > 0 : true))

    const kitHook = { type: 'command', command }
    const idx = list.findIndex((e) =>
      matcher ? e?.matcher === matcher : !e?.matcher,
    )
    if (idx < 0) {
      list.push(matcher ? { matcher, hooks: [kitHook] } : { hooks: [kitHook] })
      return list
    }
    const entry = { ...list[idx] }
    entry.hooks = [...(Array.isArray(entry.hooks) ? entry.hooks : []), kitHook]
    if (matcher) entry.matcher = matcher
    list[idx] = entry
    return list
  }

  hooks.SessionStart = mergeByCommand(hooks.SessionStart, null, CLAUDE_GATE)
  hooks.PreToolUse = mergeByCommand(hooks.PreToolUse, PRETOOL_MATCHER, CLAUDE_GATE)
  hooks.SubagentStart = mergeByCommand(hooks.SubagentStart, null, CLAUDE_GATE)
  hooks.SubagentStop = mergeByCommand(
    hooks.SubagentStop,
    KIT_AGENT_MATCHER,
    CLAUDE_GATE,
  )
  hooks.SessionEnd = mergeByCommand(hooks.SessionEnd, null, CLAUDE_GATE)

  const permissions = { ...(existing.permissions || {}) }
  const allow = Array.isArray(permissions.allow) ? [...permissions.allow] : []
  for (const rule of KIT_PERMISSIONS) {
    if (!allow.includes(rule)) allow.push(rule)
  }
  permissions.allow = allow

  const deny = Array.isArray(permissions.deny) ? [...permissions.deny] : []
  for (const rule of KIT_DENY) {
    if (!deny.includes(rule)) deny.push(rule)
  }
  permissions.deny = deny

  existing.hooks = hooks
  existing.permissions = permissions
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8')
  return existing
}
