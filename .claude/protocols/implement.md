## Shared worker protocol

<!-- include:shared-invariants -->

- **No user-facing chat**. Report only to the manager. Your final message is what the parent relays — keep reports self-contained per invocation.
- **Statuses**:
  - `done` — Success criteria met; repo left consistent. Deferred must not include Success items. Never `done` when Success required verification and commands were not run. Never `done` with `verificationResult: fail` under `mode: implement`
  - `needs-decision` — product/design/copy choice (max 3 questions; each with why, options, safest default), **or** destructive work awaiting `Human approve: granted`, **or** implement verification failed and a product choice is needed
  - `blocked` — missing secrets, access, MCP, or tooling after a genuine attempt; **or** Success-required verification failed due to **infra/tooling** (boot/auth/missing env — quote under `evidence`). Playwright cold-start / blocked rules → **verify-evidence**
  - Assertion/product test failure with a real run under `verify-only` / `audit-only` → prefer `done` with `verificationResult: fail` and quoted `evidence` / `tests`. Under `implement`, required verification failure → not `done` (use `needs-decision` or keep fixing)
  - `out-of-scope` — wrong specialist; set `recommendNext`
- **Mode** (required from brief; if omitted assume safest read-only — never assume `implement`):
  - `audit-only` → zero file writes (findings/report only)
  - `verify-only` → run commands and report only; zero file writes
  - `implement` → edit within Scope / optional Writable paths (including tests when Scoped)
  - `document` → docs only. If you are not `documenter`, return `out-of-scope` + `recommendNext: documenter`
- **Writable paths** (optional): if present, only edit those paths under `implement` or `document`.
- **Before `needs-decision`**: prefer **no edits**. If partial work was unavoidable, list under `changed` and leave the repo consistent.
- **On resume**: continue from prior `needs` — do not re-discover from scratch.
- **Git**: read-only `status` / `diff` / `log` / `show` only. **Never** commit, add, push, branch, checkout, stash, reset, or rebase — there is no brief that grants it, and the hook denies it. Leave your work in the tree and report; the manager integrates and commits.
- **Lint**: prefer the narrow path lint command from `AGENTS.md` (or project equivalent) over repo-wide lint.
- **Evidence**: When Success implies tests/commands, fill JSON `evidence` and set `verificationResult` to `pass` or `fail`. Prefer **verify-evidence**. Never claim green without output.
- **MCP**: Prefer brief `MCP prewarmed` servers. After meaningful MCP calls, list under JSON `mcpUsed` (manager may batch to mcp-usage log). URL standards → MCP only (see ref-resolution).
- **Identity**: Prefix interim commentary with `[<name>]`.
- **Work commentary**: short, result-driven, always prefixed with `[<name>]`.
- **Direct invocation**: if no manager, still return worker-report JSON plus a concise user-facing summary; put user-visible questions under `needs`.

<!-- include:human-approve -->

<!-- include:ref-resolution -->

<!-- include:worker-report -->
