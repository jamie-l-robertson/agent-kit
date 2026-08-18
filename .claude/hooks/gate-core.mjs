/**
 * Call-graph gate core (tool-agnostic).
 *
 * - root (user / main agent) may spawn manager + workers + built-ins
 * - manager may spawn workers + built-ins
 * - workers may not spawn any subagents (including each other)
 *
 * State: .claude/hooks/state/agent-roles.json (gitignored), or AGENT_KIT_STATE_PATH.
 * Shape: { sessions: { [sessionId]: { roles: { [agentId]: role } } } }
 *
 * The adapter normalizes stdin payloads into a common shape and maps decisions
 * back to Claude hook JSON.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
  statSync,
  rmSync,
  renameSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Project root for kit state + memory.
 *
 * ponytail: CLAUDE_PROJECT_DIR is set by the host when it runs the hook, so this
 * is a no-op today — `__dirname` is already `<project>/.claude/hooks`. It matters
 * if the hooks ever live outside the project (plugin install, vendored copy,
 * symlink): without it every project's memory would land in one shared directory.
 */
export function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..', '..')
}

export const DEFAULT_STATE_PATH = join(
  projectRoot(),
  '.claude',
  'hooks',
  'state',
  'agent-roles.json',
)

/** Resolved each call so tests can set AGENT_KIT_STATE_PATH before load/save. */
export function getStatePath() {
  return process.env.AGENT_KIT_STATE_PATH || DEFAULT_STATE_PATH
}

/** Default on-disk path (ignore AGENT_KIT_STATE_PATH). Prefer getStatePath(). */
export const STATE_PATH = DEFAULT_STATE_PATH

export const MANAGER = 'manager'
export const WORKERS = new Set([
  'planner',
  'researcher',
  'frontend',
  'backend',
  'tester',
  'documenter',
  'reviewer',
  'security',
  'devops',
  'infrastructure',
  'risk',
])
export const PROJECT_AGENTS = new Set([MANAGER, ...WORKERS])

const ROOT_ROLE = 'root'
export const FALLBACK_SESSION = '_default'

const DEFAULT_LOCK_TIMEOUT_MS = 2000
const LOCK_RETRY_MS = 15

export function lockTimeoutMs() {
  const raw = process.env.AGENT_KIT_LOCK_TIMEOUT_MS
  if (raw == null || raw === '') return DEFAULT_LOCK_TIMEOUT_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOCK_TIMEOUT_MS
}

export function emptyState() {
  return { sessions: {} }
}

function migrateRaw(raw) {
  if (raw?.sessions && typeof raw.sessions === 'object') {
    return { sessions: raw.sessions }
  }
  if (raw?.roles && typeof raw.roles === 'object') {
    return { sessions: { [FALLBACK_SESSION]: { roles: { ...raw.roles } } } }
  }
  return emptyState()
}

/**
 * Plan-gate keys, preserved through every load/save.
 * The bucket is rebuilt key-by-key on both sides, so anything not listed here
 * is dropped by the next hook event.
 */
/**
 * Write leases survive a reload. loadState rebuilds each bucket from a
 * whitelist, so anything not named here is dropped — which silently turns the
 * lease check into a no-op.
 */
function leaseKeys(bucket) {
  if (!bucket?.leases || typeof bucket.leases !== 'object') return {}
  const leases = {}
  for (const [key, held] of Object.entries(bucket.leases)) {
    if (!held || typeof held !== 'object' || !held.agentId) continue
    leases[key] = {
      agentId: String(held.agentId),
      role: String(held.role || ''),
      ts: Number(held.ts) || 0,
    }
  }
  return Object.keys(leases).length ? { leases } : {}
}

/**
 * Per-agent Bash counts survive a reload, same whitelist rule as leases.
 * Counts only — command strings would drag secrets out of arg lists and into
 * state, and the only question asked of them is "did this agent run anything".
 */
function commandKeys(bucket) {
  if (!bucket?.commands || typeof bucket.commands !== 'object') return {}
  const commands = {}
  for (const [agentId, n] of Object.entries(bucket.commands)) {
    const count = Number(n)
    if (agentId && Number.isFinite(count) && count > 0) commands[agentId] = count
  }
  return Object.keys(commands).length ? { commands } : {}
}

function planKeys(bucket) {
  const out = {}
  if (bucket?.planApproval === 'pending' || bucket?.planApproval === 'approved') {
    out.planApproval = bucket.planApproval
  }
  if (typeof bucket?.planSummary === 'string') out.planSummary = bucket.planSummary
  if (bucket?.gates && typeof bucket.gates === 'object') {
    const gates = {}
    for (const key of GATE_KEYS) {
      const g = bucket.gates[key]
      if (g && typeof g === 'object') {
        gates[key] = { rounds: Number(g.rounds) || 1, owner: String(g.owner || '') }
      }
    }
    if (Object.keys(gates).length) out.gates = gates
  }
  return out
}

export function loadState() {
  const path = getStatePath()
  try {
    if (!existsSync(path)) return emptyState()
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const migrated = migrateRaw(raw)
    const sessions = {}
    for (const [sid, bucket] of Object.entries(migrated.sessions || {})) {
      sessions[sid] = {
        roles:
          bucket?.roles && typeof bucket.roles === 'object'
            ? { ...bucket.roles }
            : {},
        blocks:
          bucket?.blocks && typeof bucket.blocks === 'object'
            ? { ...bucket.blocks }
            : {},
        ...planKeys(bucket),
        ...leaseKeys(bucket),
        ...commandKeys(bucket),
      }
    }
    return { sessions }
  } catch {
    return emptyState()
  }
}

/** SessionEnd is not guaranteed (crash/kill) — keep the newest MAX_SESSIONS. */
const MAX_SESSIONS = 20

export function saveState(state) {
  const path = getStatePath()
  mkdirSync(dirname(path), { recursive: true })
  const entries = Object.entries(state.sessions || {})
  const trimmed =
    entries.length > MAX_SESSIONS ? entries.slice(-MAX_SESSIONS) : entries
  const sessions = {}
  for (const [sid, bucket] of trimmed) {
    sessions[sid] = {
      roles: { ...(bucket.roles || {}) },
      blocks: { ...(bucket.blocks || {}) },
      ...planKeys(bucket),
      ...leaseKeys(bucket),
      ...commandKeys(bucket),
    }
  }
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ sessions }, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

export function lockPath() {
  return `${getStatePath()}.lockdir`
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(sab), 0, 0, ms)
}

/**
 * Exclusive lock around load→mutate→save (concurrent hook processes share state).
 * Uses mkdir (atomic) rather than open(wx). Fail-closed on timeout — does not steal.
 */
export function withStateLock(fn) {
  const path = lockPath()
  mkdirSync(dirname(getStatePath()), { recursive: true })
  const start = Date.now()
  const timeout = lockTimeoutMs()
  let held = false
  while (!held) {
    try {
      mkdirSync(path)
      held = true
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err
      if (Date.now() - start > timeout) {
        let staleHint = ''
        try {
          const st = statSync(path)
          staleHint = ` lock_mtime_age_ms=${Date.now() - st.mtimeMs}`
        } catch {
          /* ignore */
        }
        throw new Error(
          `agent-kit gate: state lock timeout after ${timeout}ms (fail-closed; remove orphan ${path} if stuck).${staleHint}`,
        )
      }
      sleepSync(LOCK_RETRY_MS)
    }
  }
  try {
    return fn()
  } finally {
    try {
      rmSync(path, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/** JSONL path for structured run events (gitignored). */
export function getRunEventsPath(date = new Date()) {
  if (process.env.AGENT_KIT_RUN_EVENTS_PATH) {
    return process.env.AGENT_KIT_RUN_EVENTS_PATH
  }
  const day = date.toISOString().slice(0, 10)
  if (process.env.AGENT_KIT_STATE_PATH) {
    return join(dirname(getStatePath()), 'runs', `${day}.jsonl`)
  }
  return join(projectRoot(), '.claude', 'memory', 'runs', `${day}.jsonl`)
}

/** Append one run event to the local JSONL (best-effort, never throws). */
export function appendRunEvent(event) {
  if (process.env.AGENT_KIT_RUN_EVENTS === '0') return
  const row = {
    ts: new Date().toISOString(),
    ...event,
  }
  try {
    const path = getRunEventsPath()
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8')
  } catch (err) {
    // Non-fatal, but never silent — see appendTaskMemory in task-log.mjs.
    console.error('[agent-kit] appendRunEvent failed:', err)
  }
}

/** Explicit session id only (no conversation fallback). */
export function sessionIdOf(normalized) {
  return normalized.sessionId || FALLBACK_SESSION
}

/**
 * Prefer explicit sessionId; else session that already maps parent/caller/subagent;
 * else conversationId if it is already a session key; else _default.
 */
export function resolveSessionId(state, normalized) {
  if (normalized.sessionId) return normalized.sessionId

  const lookupIds = [normalized.callerAgentId, normalized.subagentId].filter(
    Boolean,
  )

  for (const [sid, bucket] of Object.entries(state.sessions || {})) {
    const roles = bucket?.roles || {}
    for (const id of lookupIds) {
      if (roles[id]) return sid
    }
  }

  if (
    normalized.conversationId &&
    state.sessions?.[normalized.conversationId]
  ) {
    return normalized.conversationId
  }

  return FALLBACK_SESSION
}

export function ensureSession(state, sessionId) {
  const id = sessionId || FALLBACK_SESSION
  if (!state.sessions[id]) state.sessions[id] = { roles: {}, blocks: {} }
  if (!state.sessions[id].blocks) state.sessions[id].blocks = {}
  return state.sessions[id]
}

/** Max SubagentStop blocks per agent before the report gate goes advisory. */
export const MAX_REPORT_BLOCKS = 2

/**
 * Count one worker-report rejection for `agentId`.
 * @returns {number} blocks recorded so far (including this one)
 */
export function bumpReportBlock(sessionId, agentId) {
  if (!agentId) return 1
  return withStateLock(() => {
    const state = loadState()
    const bucket = ensureSession(state, sessionId)
    const next = (bucket.blocks[agentId] || 0) + 1
    bucket.blocks[agentId] = next
    saveState(state)
    return next
  })
}

/** Plan summary lands in a permission dialog — truncate rather than widen. */
export const PLAN_SUMMARY_MAX = 400

/** Implementers held behind plan approval. Audit-only roles are never gated. */
export const PLAN_GATE_IMPLEMENTERS = new Set([
  'frontend',
  'backend',
  'tester',
  'documenter',
  'devops',
  'infrastructure',
])

export function planGateEnabled() {
  return process.env.AGENT_KIT_PLAN_GATE !== 'off'
}

/** planner done → the next implementer spawn asks the user to approve the plan. */
export function setPlanPending(sessionId, summary) {
  withStateLock(() => {
    const state = loadState()
    const bucket = ensureSession(state, sessionId || FALLBACK_SESSION)
    bucket.planApproval = 'pending'
    bucket.planSummary = String(summary || '').slice(0, PLAN_SUMMARY_MAX)
    saveState(state)
  })
}

export function readPlanApproval(sessionId) {
  const bucket = loadState().sessions[sessionId || FALLBACK_SESSION]
  return {
    planApproval: bucket?.planApproval,
    planSummary: bucket?.planSummary || '',
  }
}

/**
 * SubagentStart is the only "yes" signal the adapter gets — the host never
 * tells the hook how the user answered the ask.
 */
export function approvePlan(sessionId) {
  withStateLock(() => {
    const state = loadState()
    const bucket = state.sessions[sessionId || FALLBACK_SESSION]
    if (bucket?.planApproval !== 'pending') return
    bucket.planApproval = 'approved'
    saveState(state)
  })
}

/**
 * Access integrity: issue trackers and standards URLs are MCP-only. These are
 * the high-confidence DIY bypasses — not a blanket ban on `gh` or `curl`.
 * `gh pr` / `gh run` / localhost fetches stay allowed.
 */
const GH_TRACKER = /(?<![\w-])gh\s+(issue|api)\b/i
const FETCHER = /(?<![\w-])(curl|wget|http|xh)\b/i
const TRACKER_HOST =
  /(api\.github\.com|[a-z0-9-]+\.atlassian\.net|api\.linear\.app|api\.notion\.com)/i

/** @returns {string} what matched, or '' when the command is fine */
export function detectTrackerBypass(command) {
  const cmd = String(command || '')
  if (GH_TRACKER.test(cmd)) return `\`gh ${cmd.match(GH_TRACKER)[1]}\``
  const fetcher = cmd.match(FETCHER)
  if (fetcher && TRACKER_HOST.test(cmd)) {
    return `\`${fetcher[1]}\` to ${cmd.match(TRACKER_HOST)[1]}`
  }
  return ''
}

/**
 * Audit fix-loop gates. A pending gate holds the managed close until the owner
 * fixes and the auditor re-passes.
 *
 * `review`  — reviewer done with findingsSeverity: critical
 * `test`    — tester done with verificationResult: fail blaming product code
 * `secRisk` — security/risk done with findingsSeverity: critical
 */
export const GATE_KEYS = ['review', 'test', 'secRisk']

/** Rounds before a gate stops blocking and becomes the user's call. */
export const MAX_GATE_ROUNDS = 2

/** Owners a tester may hand a product failure to — a harness fix is tester's own. */
export const IMPLEMENTER_OWNERS = new Set([
  'frontend',
  'backend',
  'devops',
  'infrastructure',
  'documenter',
])

export function readGates(sessionId) {
  return loadState().sessions[sessionId || FALLBACK_SESSION]?.gates || {}
}

/** Open or re-open a gate; each call counts one round. */
export function setGate(sessionId, key, owner = '') {
  if (!GATE_KEYS.includes(key)) return
  withStateLock(() => {
    const state = loadState()
    const bucket = ensureSession(state, sessionId || FALLBACK_SESSION)
    const prev = bucket.gates?.[key]
    bucket.gates = {
      ...(bucket.gates || {}),
      [key]: { rounds: (prev?.rounds || 0) + 1, owner: String(owner || '') },
    }
    saveState(state)
  })
}

export function clearGate(sessionId, key) {
  withStateLock(() => {
    const state = loadState()
    const bucket = state.sessions[sessionId || FALLBACK_SESSION]
    if (!bucket?.gates?.[key]) return
    delete bucket.gates[key]
    if (!Object.keys(bucket.gates).length) delete bucket.gates
    saveState(state)
  })
}

/**
 * Git write policy: only the manager moves the repo, and only locally.
 * Workers report; the manager integrates; the human pushes.
 */
const GIT_WRITE_VERBS = [
  'commit',
  'push',
  'merge',
  'rebase',
  'reset',
  'revert',
  'cherry-pick',
  'tag',
  'stash',
  'checkout',
  'switch',
  'restore',
  'clean',
  'am',
  'add',
]
const GIT_WRITE = new RegExp(
  `(?<![\\w-])git\\s+(${GIT_WRITE_VERBS.join('|')})(?![\\w-])`,
  'i',
)

/**
 * `git branch` is the one ambiguous verb: bare or with a listing flag it only
 * reads, but a name or -d/-D/-m/-M/-c/-C creates, deletes or renames. Match the
 * writing forms only, so read-only inspection stays available to every agent.
 */
const GIT_BRANCH_WRITE =
  /(?<![\w-])git\s+branch\s+(-[dDmMcC](?![\w-])|(?!-)[^\s;&|]+)/i

/** What the manager may still do — local and recoverable. Never `push`. */
export const MANAGER_GIT_ALLOWED = new Set(['add', 'commit'])

/** @returns {string} the git subcommand that writes, or '' when read-only */
export function detectGitWrite(command) {
  const cmd = String(command || '')
  const m = cmd.match(GIT_WRITE)
  if (m) return m[1].toLowerCase()
  return GIT_BRANCH_WRITE.test(cmd) ? 'branch' : ''
}

/**
 * Bash writes that land on a `.env` file. Tool-level `Write`/`Read` denies in
 * settings.json do not see Bash, so `echo … | tee .env` walks straight past
 * them. Cover the three shapes a worker actually reaches for.
 *
 * ponytail: pattern-matched, not shell-parsed — `base64 -d`, a variable
 * holding the path, or a heredoc through `sh -c` all still get through. This
 * closes the accidental bypass, not a determined one. The durable fix is
 * secrets never being in the repo to write; escalate to a real sandbox if a
 * worker is adversarial.
 */
const ENV_FILE = String.raw`(?:\./)?\.env(?:\.[\w.-]+)?(?![\w.-])`
const ENV_REDIRECT = new RegExp(String.raw`>>?\s*${ENV_FILE}`, 'i')
const ENV_TEE = new RegExp(
  String.raw`(?<![\w-])tee(?:\s+-\S+)*\s+${ENV_FILE}`,
  'i',
)
const ENV_COPY = new RegExp(
  String.raw`(?<![\w-])(?:cp|mv|install)\s+\S+\s+${ENV_FILE}`,
  'i',
)

/**
 * Write leases — the mechanical form of "parallelize only when Writable paths
 * do not overlap". First kit agent to write a path holds it until it stops;
 * a second live agent writing the same path is denied rather than silently
 * clobbering. Config-free: it needs no ownership table and no brief parsing,
 * so it cannot deny on a misread of user-authored prose.
 *
 * ponytail: TTL is a backstop for agents that die without SubagentStop, not
 * the primary release — that happens in decide()'s stop branch. Raise it if a
 * legitimately long worker ever gets bumped mid-edit.
 */
export const WRITE_LEASE_TTL_MS = 30 * 60 * 1000

/** Tools whose tool_input.file_path names a file about to be written. */
const WRITE_TOOLS = /^(Write|Edit|NotebookEdit|MultiEdit)$/i

export function isWriteTool(toolName) {
  return WRITE_TOOLS.test(String(toolName || ''))
}

/** Absolute, so two agents naming the same file agree on the key. */
export function leaseKey(filePath) {
  const p = String(filePath || '')
  return p ? resolve(p) : ''
}

/**
 * @returns {{ ok: true } | { ok: false, holder: string, role: string }}
 */
export function acquireWriteLease(sessionId, filePath, agentId, role) {
  const key = leaseKey(filePath)
  if (!key || !agentId) return { ok: true }
  return withStateLock(() => {
    const state = loadState()
    const bucket = ensureSession(state, sessionId || FALLBACK_SESSION)
    bucket.leases ||= {}
    const held = bucket.leases[key]
    const fresh =
      held && Date.now() - Number(held.ts || 0) < WRITE_LEASE_TTL_MS
    if (fresh && held.agentId !== agentId) {
      return { ok: false, holder: held.agentId, role: held.role || 'another agent' }
    }
    bucket.leases[key] = { agentId, role: role || '', ts: Date.now() }
    saveState(state)
    return { ok: true }
  })
}

/** Drop every lease an agent holds. Called when its role clears at stop. */
export function releaseWriteLeases(state, sessionId, agentId) {
  const bucket = state.sessions[sessionId || FALLBACK_SESSION]
  if (!bucket?.leases || !agentId) return
  for (const [key, held] of Object.entries(bucket.leases)) {
    if (held?.agentId === agentId) delete bucket.leases[key]
  }
}

/**
 * Count a Bash command a kit agent is about to run.
 *
 * `evidence` is a string the model writes, so it proves nothing on its own.
 * This count is the cheapest independent signal that a `verificationResult`
 * was earned rather than asserted: an agent that graded a test run without
 * running a single command did not run the tests.
 */
export function recordAgentCommand(sessionId, agentId) {
  if (!agentId) return
  withStateLock(() => {
    const state = loadState()
    const bucket = ensureSession(state, sessionId || FALLBACK_SESSION)
    bucket.commands ||= {}
    bucket.commands[agentId] = Number(bucket.commands[agentId] || 0) + 1
    saveState(state)
  })
}

/** @returns {number} Bash commands this agent ran in this session. */
export function commandCountFor(sessionId, agentId) {
  if (!agentId) return 0
  const bucket = loadState().sessions[sessionId || FALLBACK_SESSION]
  return Number(bucket?.commands?.[agentId] || 0)
}

/** Drop an agent's command count. Paired with releaseWriteLeases at stop. */
export function releaseAgentCommands(state, sessionId, agentId) {
  const bucket = state.sessions[sessionId || FALLBACK_SESSION]
  if (!bucket?.commands || !agentId) return
  delete bucket.commands[agentId]
}

/**
 * Absolute paths an agent currently holds leases on. Read this at
 * SubagentStop *before* releaseWriteLeases drops them — it is the only
 * record of what the agent actually wrote, as opposed to what it claims.
 * @returns {string[]}
 */
export function leasedPathsFor(sessionId, agentId) {
  if (!agentId) return []
  const bucket = loadState().sessions[sessionId || FALLBACK_SESSION]
  if (!bucket?.leases) return []
  return Object.entries(bucket.leases)
    .filter(([, held]) => held?.agentId === agentId)
    .map(([key]) => key)
}

/**
 * Compare intercepted write leases against a worker report's `changed[]`.
 *
 * `unreported` is hard evidence: the hook saw a Write/Edit tool call the
 * report does not mention. `unleased` is softer — leases are only taken for
 * WRITE_TOOLS (gate-core `isWriteTool`), so a file written via Bash
 * (`sed -i`, heredoc, redirect) legitimately has no lease.
 *
 * @param {string[]} leasedAbsPaths
 * @param {unknown} changed
 * @param {string} projectDir
 * @returns {{ leased: string[], unreported: string[], unleased: string[] }}
 */
export function diffLeasesAgainstChanged(leasedAbsPaths, changed, projectDir) {
  const base = projectDir || process.cwd()
  const norm = (p) => {
    const raw = String(p || '').trim()
    if (!raw) return ''
    return relative(base, resolve(base, raw)).split(sep).join('/')
  }
  const leased = new Set((leasedAbsPaths || []).map(norm).filter(Boolean))
  const claimed = new Set(
    (Array.isArray(changed) ? changed : []).map(norm).filter(Boolean),
  )
  return {
    leased: [...leased],
    unreported: [...leased].filter((p) => !claimed.has(p)),
    unleased: [...claimed].filter((p) => !leased.has(p)),
  }
}

/* --- Stack card ---------------------------------------------------------- */

/**
 * Read one `- **Label**: value` bullet out of AGENTS.md.
 * Lives here rather than in scripts/ because the hooks read the card too, and
 * check-agent-kit already imports from this file — the dependency only runs
 * one way.
 * @param {string} agentsMd
 * @param {string} label e.g. "Design system"
 */
export function parseAgentsStackValue(agentsMd, label) {
  const re = new RegExp(
    `^-\\s+\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:\\s*(.+)$`,
    'mi',
  )
  const m = re.exec(agentsMd)
  return m ? m[1].trim() : ''
}

/** Strip HTML comments and normalize. An unfilled placeholder becomes ''. */
export function normalizeStackRef(raw) {
  return String(raw || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}

/* --- Ticket scope -------------------------------------------------------- */

/**
 * MCP tools that deal in tickets. Matched on the **tool** name, never the
 * server id: servers register under UUIDs (`mcp__34a8…__`) and via plugins, so
 * an id match would break on every reinstall.
 */
const TICKET_TOOL = /(jira|issue|ticket|atlassian)/i

/** `PROJ-123`. Also matches CVE-2024-1234 / UTF-8, hence the tool-name gate. */
const JIRA_KEY = /\b([A-Z][A-Z0-9]+)-\d+\b/g

/** `owner/repo`, plus the same inside a github.com URL. */
const GH_URL = /github\.com\/([\w.-]+\/[\w.-]+)/gi
const GH_SLUG = /\b([\w.-]+\/[\w.-]+)\b/g

export function isTicketTool(toolName) {
  const name = String(toolName || '')
  return name.startsWith('mcp__') && TICKET_TOOL.test(name)
}

/** Split a comma-separated stack-card value; '' / n/a / placeholder → []. */
export function parseScopeList(raw) {
  const v = normalizeStackRef(raw).toLowerCase()
  if (!v || v === 'n/a' || v === 'na' || v === 'none') return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Ticket refs mentioned anywhere in an MCP call's arguments.
 * Whole-payload scan on purpose: every tracker MCP names its parameters
 * differently, and a scan cannot be out of date the way a field list would be.
 * @returns {{ jira: string[], github: string[] }}
 */
export function extractTicketRefs(toolInput) {
  let text = ''
  try {
    text = JSON.stringify(toolInput ?? '')
  } catch {
    return { jira: [], github: [] }
  }
  const jira = new Set()
  for (const m of text.matchAll(JIRA_KEY)) jira.add(m[1].toUpperCase())
  const github = new Set()
  for (const m of text.matchAll(GH_URL)) github.add(m[1].toLowerCase())
  // Bare owner/repo only when no URL form was found, so a URL does not also
  // register its path segments as a second, bogus slug.
  if (!github.size) {
    for (const m of text.matchAll(GH_SLUG)) {
      const slug = m[1].toLowerCase()
      if (!slug.includes('.') || /\//.test(slug)) github.add(slug)
    }
  }
  return { jira: [...jira], github: [...github] }
}

/**
 * Fail closed: an unconfigured scope denies as loudly as a wrong one.
 *
 * A tracker call is a read or a write against someone's real project. Getting
 * it wrong means planning off the wrong ticket, or worse, commenting on it —
 * so "we never said which project" is not a reason to allow it through.
 *
 * @param {{ jira: string[], github: string[] }} refs
 * @param {{ jiraKeys: string[], githubRepos: string[] }} scope
 * @returns {string} deny reason, or '' to allow
 */
export function ticketScopeDenial(refs, scope) {
  const { jira = [], github = [] } = refs || {}
  if (!jira.length && !github.length) return ''

  const jiraKeys = scope?.jiraKeys || []
  const githubRepos = scope?.githubRepos || []

  if (jira.length && !jiraKeys.length) {
    return `Blocked: this call names ${jira.join(', ')}, but AGENTS.md has no **Jira project key**. Without it there is nothing to check the ticket against, and a call to the wrong board reads or edits someone else's project. Ask the user to run the **setup** skill and set the key (comma-separate several).`
  }
  if (github.length && !githubRepos.length) {
    return `Blocked: this call names ${github.join(', ')}, but AGENTS.md has no **GitHub repo**. Ask the user to run the **setup** skill and set it (comma-separate several).`
  }

  const badJira = jira.filter((k) => !jiraKeys.includes(k.toLowerCase()))
  if (badJira.length) {
    // Keys are compared lowercased but shown as people write them.
    const shown = jiraKeys.map((k) => k.toUpperCase()).join(', ')
    return `Blocked: ${badJira.join(', ')} is outside this project's Jira scope (${shown}). If the ticket really belongs to this work, ask the user to add its key to **Jira project key** in AGENTS.md; otherwise you have the wrong ticket.`
  }
  const badRepo = github.filter((r) => !githubRepos.includes(r))
  if (badRepo.length) {
    return `Blocked: ${badRepo.join(', ')} is outside this project's GitHub scope (${githubRepos.join(', ')}). If it belongs to this work, ask the user to add it to **GitHub repo** in AGENTS.md; otherwise you have the wrong repo.`
  }
  return ''
}

/** Ticket scope from the project's stack card. Missing card → empty scope. */
export function readTicketScope(root = projectRoot()) {
  let md = ''
  try {
    md = readFileSync(join(root, 'AGENTS.md'), 'utf8')
  } catch {
    return { jiraKeys: [], githubRepos: [] }
  }
  return {
    jiraKeys: parseScopeList(parseAgentsStackValue(md, 'Jira project key')),
    githubRepos: parseScopeList(parseAgentsStackValue(md, 'GitHub repo')),
  }
}

/** @returns {string} how the command writes a .env file, or '' when it does not */
export function detectEnvWrite(command) {
  const cmd = String(command || '')
  if (ENV_REDIRECT.test(cmd)) return 'a shell redirect'
  if (ENV_TEE.test(cmd)) return '`tee`'
  if (ENV_COPY.test(cmd)) return '`cp`/`mv`'
  return ''
}

export function rememberRole(state, id, role, sessionId = FALLBACK_SESSION) {
  if (!id || !role) return
  const bucket = ensureSession(state, sessionId)
  bucket.roles[id] = role
}

export function clearRole(state, id, sessionId = FALLBACK_SESSION) {
  if (!id) return
  const bucket = state.sessions[sessionId]
  if (!bucket?.roles?.[id]) return
  delete bucket.roles[id]
}

/**
 * Record child role; alias conversationId → role when it is not the session root.
 */
export function recordChildRole(state, sid, subagentId, role, conversationId) {
  if (!subagentId || !role) return
  rememberRole(state, subagentId, role, sid)
  if (
    !conversationId ||
    conversationId === sid ||
    conversationId === subagentId
  ) {
    return
  }
  const existing = state.sessions[sid]?.roles?.[conversationId]
  if (existing === ROOT_ROLE) return
  rememberRole(state, conversationId, role, sid)
}

export function callerRole(state, ids, sessionId = FALLBACK_SESSION) {
  const roles = ensureSession(state, sessionId).roles
  for (const id of ids) {
    if (id && roles[id]) return roles[id]
  }
  return ROOT_ROLE
}

/**
 * Resolve effective caller role for spawn gating.
 */
export function resolveEffectiveCaller(state, normalized) {
  const typed = normalized.callerAgentType
  if (WORKERS.has(typed) || typed === MANAGER) return typed
  if (typed === ROOT_ROLE || typed === 'root') return ROOT_ROLE

  const sid = resolveSessionId(state, normalized)
  const roles = ensureSession(state, sid).roles

  const parentOrCaller = [normalized.callerAgentId].filter(Boolean)

  for (const id of parentOrCaller) {
    if (roles[id]) return roles[id]
  }
  // conversationId before sessionId: session is always root after sessionStart;
  // worker aliases live on conversationId (nest without parent must still deny).
  if (normalized.conversationId && roles[normalized.conversationId]) {
    return roles[normalized.conversationId]
  }
  if (normalized.sessionId && roles[normalized.sessionId]) {
    return roles[normalized.sessionId]
  }
  // Unmapped parent/caller id → fail closed. No parent ids → root (main agent Task).
  if (parentOrCaller.length > 0) return 'unknown'
  return ROOT_ROLE
}

function emitSpawnDecision(normalized, result, sessionId, callerRoleName) {
  if (result.action !== 'allow' && result.action !== 'deny') return
  appendRunEvent({
    event: result.action === 'deny' ? 'deny' : 'allow',
    sessionId: sessionId || FALLBACK_SESSION,
    role: callerRoleName || null,
    agent: normalized.target || null,
    status: result.action,
    hookEvent: normalized.event || null,
  })
}

function extractClaudeSpawnTarget(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return ''
  if (toolInput.subagent_type) return String(toolInput.subagent_type)
  if (toolInput.agent_type) return String(toolInput.agent_type)
  if (typeof toolInput.description === 'string') {
    const m = toolInput.description.match(/^([a-z0-9-]+)\s*:/i)
    if (m) return m[1].toLowerCase()
  }
  return ''
}

/**
 * A spawn that passes `name` registers the child on the teammate roster
 * instead of as a subagent. Two consequences, both silent:
 *   - the roster is flat, so the child cannot dispatch specialists;
 *   - its agent_type stops matching the SubagentStop matcher in
 *     settings.json, so the worker-report gate never validates its report.
 * Only kit targets are denied — a named teammate of a non-kit type
 * (general-purpose, Explore) was never gated by this kit anyway.
 *
 * @returns {string} the teammate name to reject, or '' when the spawn is fine
 */
export function detectNamedSpawn(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return ''
  const name = String(toolInput.name || '').trim()
  if (!name) return ''
  return PROJECT_AGENTS.has(extractClaudeSpawnTarget(toolInput)) ? name : ''
}

export function normalizeClaudePayload(payload) {
  const event = String(payload.hook_event_name || '')
  const toolName = String(payload.tool_name || '')
  const base = {
    event,
    conversationId: payload.session_id || '',
    subagentId: payload.agent_id || '',
    callerAgentType: String(payload.agent_type || ''),
    callerAgentId: String(payload.agent_id || ''),
    sessionId: payload.session_id || '',
    toolName,
  }

  if (event === 'SubagentStart' || event === 'SubagentStop') {
    return { ...base, target: String(payload.agent_type || '') }
  }

  if (event === 'PreToolUse') {
    const isSpawnTool = /^(Agent|Task)$/i.test(toolName)
    if (!isSpawnTool) {
      return { ...base, target: '', skipGate: true }
    }
    return {
      ...base,
      subagentId: '',
      target: extractClaudeSpawnTarget(payload.tool_input),
      skipGate: false,
    }
  }

  return { ...base, target: '' }
}

const isSessionStart = (event) => event === 'SessionStart'
const isSessionEnd = (event) => event === 'SessionEnd'
const isSubagentStart = (event) => event === 'SubagentStart'
const isSubagentStop = (event) => event === 'SubagentStop'

function clearIds(normalized, sid) {
  const ids = [normalized.subagentId]
  if (
    normalized.conversationId &&
    normalized.conversationId !== sid
  ) {
    ids.push(normalized.conversationId)
  }
  return ids.filter(Boolean)
}

function denyNestMessage(effectiveRole) {
  const who =
    effectiveRole === 'unknown'
      ? 'unknown caller (parent/caller id not in role map)'
      : `worker \`${effectiveRole}\``
  return `Blocked: ${who} cannot spawn subagents. Return to manager with status: blocked (nesting/policy) — manager re-dispatches.`
}

function maybeDenySpawn(state, normalized) {
  // Missing session/caller ids → treat as root via resolveEffectiveCaller
  // (no parentOrCaller → ROOT). A main-agent Task carries no agent_id.
  const effectiveRole = resolveEffectiveCaller(state, normalized)
  if (WORKERS.has(effectiveRole) || effectiveRole === 'unknown') {
    return {
      action: 'deny',
      message: denyNestMessage(effectiveRole),
    }
  }
  return null
}

function decideUnlocked(normalized) {
  const state = loadState()
  const event = normalized.event

  if (isSessionStart(event)) {
    const id =
      normalized.sessionId ||
      (normalized.conversationId && normalized.conversationId) ||
      ''
    if (id) {
      ensureSession(state, id)
      rememberRole(state, id, ROOT_ROLE, id)
      saveState(state)
    }
    return {
      action: 'noop',
      record: id ? { id, role: ROOT_ROLE } : undefined,
    }
  }

  const sid = resolveSessionId(state, normalized)

  if (isSessionEnd(event)) {
    const endId = normalized.sessionId || normalized.conversationId || sid
    if (state.sessions[endId]) {
      delete state.sessions[endId]
      saveState(state)
    }
    return { action: 'noop', clearId: endId }
  }

  if (isSubagentStop(event)) {
    const bucket = ensureSession(state, sid)
    for (const id of clearIds(normalized, sid)) {
      clearRole(state, id, sid)
      delete bucket.blocks[id]
      // The agent is done, so whatever it was holding is free. This is the
      // real release; WRITE_LEASE_TTL_MS only covers agents that never stop.
      releaseWriteLeases(state, sid, id)
      releaseAgentCommands(state, sid, id)
    }
    saveState(state)
    return { action: 'noop', clearId: normalized.subagentId || '' }
  }

  if (isSubagentStart(event)) {
    const role = normalized.target
    const id = normalized.subagentId
    if (PROJECT_AGENTS.has(role) && id) {
      // Alias conversationId here (child conv), not on preToolUse (caller conv)
      recordChildRole(state, sid, id, role, normalized.conversationId)
      saveState(state)
    }
    // SubagentStart records only; the nest gate lives on PreToolUse.
    return {
      action: 'noop',
      record: id && role ? { id, role } : undefined,
    }
  }

  if (normalized.skipGate) {
    return { action: 'allow' }
  }

  const effectiveRole = resolveEffectiveCaller(state, normalized)
  const denied = maybeDenySpawn(state, normalized)
  if (denied) {
    emitSpawnDecision(normalized, denied, sid, effectiveRole)
    return denied
  }

  // Roles are recorded on SubagentStart, not here: a PreToolUse payload's
  // conversation id is the caller's, and aliasing it to the child would let a
  // worker inherit the manager's role.
  const allowed = { action: 'allow' }
  emitSpawnDecision(normalized, allowed, sid, effectiveRole)
  return allowed
}

/**
 * @returns {{ action: 'allow'|'deny'|'noop', message?: string, record?: { id: string, role: string }, clearId?: string }}
 */
export function decide(normalized) {
  return withStateLock(() => decideUnlocked(normalized))
}

export async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => resolve(chunks.join('')))
    process.stdin.on('error', reject)
  })
}
