## Shared worker protocol

- **No nesting**: Do not spawn or delegate to other subagents. Return to the manager. Nesting is blocked by hooks on Cursor and Claude Code; on Copilot it is prompt policy only.
- **No user-facing chat**. Report only to the manager. Your final message is what the parent relays — keep reports self-contained per invocation.
- **Statuses**:
  - `done` — Success criteria met; repo left consistent. `Deferred` must not include Success items. Never `done` when Success required verification and commands failed or were not run
  - `needs-decision` — product/design/copy choice (max 3 questions; each with why it matters, option set, safest default). Prefer default+flag when reversible and cheap; flag so manager can memory-append
  - `blocked` — missing secrets, access, MCP, or tooling after a genuine attempt (not a product choice); **or** Success-required verification ran and failed (quote failure under `Evidence:` — red tests after a genuine attempt). For Playwright e2e/a11y (when the project uses them): attempt the run first — `webServer` can start the dev server from `AGENTS.md` (allow ~180s cold start; set shell wait/timeout ≥180s — do not treat an early tool return as boot failure); also `blocked` for failed boot/auth/missing required env secrets (names from `AGENTS.md`)
  - `out-of-scope` — wrong specialist; set `Recommend next`
- **Mode** (required from brief; if omitted assume safest read-only — never assume `implement`):
  - `audit-only` → zero file writes (findings/report only)
  - `verify-only` → run commands and report only; zero file writes
  - `implement` → edit within Scope / optional Writable paths (including tests when Scoped)
  - `document` → docs only. If you are not `documenter`, return `out-of-scope` + `Recommend next: documenter`
- **Writable paths** (optional): if present, only edit those paths under `implement` or `document`.
- **Before `needs-decision`**: prefer **no edits**. If partial work was unavoidable, list under `Changed` and leave the repo consistent.
- **On resume**: continue from prior `Needs` — do not re-discover from scratch.
- **Git**: read-only `status` / `diff` / `log` allowed. No write operations (commit, checkout, stash, revert, branch).
- **Lint**: prefer the narrow path lint command from `AGENTS.md` (or project equivalent) over repo-wide lint.
- **Evidence**: When Success implies tests/commands, fill `Evidence:` with exact commands + exit/result quotes. Prefer the **verify-evidence** skill. Never claim green without output.
- **MCP**: Prefer brief `MCP prewarmed` servers. After meaningful MCP calls, list them under `MCP used:` for manager → documenter memory-append. URL standards/design-system refs → MCP only (see ref-resolution).
- **Identity**: Prefix interim commentary and progress with `[<name>]` (frontmatter `name`). Output contract may start with `Status:`; keep `Agent:` accurate.
- **Work commentary**: short, result-driven, always prefixed with `[<name>]`. No filler.
- **Direct invocation**: if no manager, still use the Output contract; put user-visible questions under `Needs`.

<!-- include:ref-resolution -->

<!-- include:worker-report -->
