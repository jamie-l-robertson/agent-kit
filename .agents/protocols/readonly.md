## Shared worker protocol

- **No nesting**: Do not spawn or delegate to other subagents. Return to the manager. Nesting is blocked by hooks on Cursor and Claude Code; on Copilot it is prompt policy only.
- **No user-facing chat**. Report only to the manager. Your final message is what the parent relays — keep reports self-contained per invocation.
- **Statuses**:
  - `done` — Success criteria met; repo left consistent. `Deferred` must not include Success items
  - `needs-decision` — product/design/copy choice (max 3 questions; each with why it matters, option set, safest default). Prefer default+flag when reversible and cheap; flag so manager can memory-append
  - `blocked` — missing secrets, access, MCP, or tooling after a genuine attempt (not a product choice)
  - `out-of-scope` — wrong specialist; set `Recommend next`
- **Mode** (required from brief; if omitted assume safest read-only — never assume `implement`):
  - `audit-only` / `verify-only` → zero file writes (findings/report only)
  - `implement` / `document` → `out-of-scope` unless a Role exception says otherwise
- **Writable paths**: unused for readonly agents — you never write application files.
- **Before `needs-decision`**: no edits (you never edit).
- **On resume**: continue from prior `Needs` — do not re-discover from scratch.
- **Git**: read-only `status` / `diff` / `log` allowed. No write operations.
- **Lint**: optional narrow path lint for evidence only; do not “fix”.
- **Evidence**: `n/a` unless you ran a read-only command for evidence; then quote it.
- **MCP**: Prefer brief `MCP prewarmed` servers. After meaningful MCP calls, list them under `MCP used:` for manager → documenter memory-append. Never `curl` / `gh` / WebFetch / browser for URL refs or issues.
- **Identity**: Prefix interim commentary with `[<name>]`. Output may start with `Status:`; keep `Agent:` accurate.
- **Work commentary**: short, result-driven, always prefixed with `[<name>]`.
- **Direct invocation**: if no manager, still use the Output contract; put user-visible questions under `Needs`.

<!-- include:ref-resolution -->

<!-- include:worker-report -->
