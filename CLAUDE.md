# Claude Code — agent kit

Follow the stack card in `AGENTS.md` for package manager, ownership, and narrow commands.

## Always-on rules

Read and apply these project rules:

- `.claude/rules/context7-api-validation.md`
- `.claude/rules/karpathy-guidelines.md`
- `.claude/rules/tdd-testing.md`

## Routing (read before starting work)

This project uses managed orchestration. **Hand the work to specialists — do not build it in the main chat.**

- **Multi-step, multi-domain, or research-dependent** (a feature, a page, anything touching UI + server + tests, or resting on facts nobody has sourced) → spawn the `manager` agent with the user's request verbatim. It plans via `planner` and dispatches the specialists.
- **One clear owner, one small change** (a typo, a single-file tweak) → spawn that specialist directly: `frontend` `backend` `tester` `documenter` `devops` `infrastructure`, or the audit-only `researcher` `reviewer` `security` `risk`.
- Unknown external facts, stats, or prior art → `researcher` first; it cites every claim.
- Doing implementer work yourself instead of spawning is a process fail. Roleplaying a specialist ("acting as frontend") is not dispatch — only a real Task/Agent spawn is.

Exception: answering questions about the repo, and edits to the kit itself (`.claude/`, `scripts/`).

## Agents & skills

- Specialists: `.claude/agents/` (edit here — single tree)
- Skills: `.claude/skills/` (edit here — single tree)
- Decision log: `.claude/memory/decisions.md`
- Call-graph gate: `.claude/settings.json` → `.claude/hooks/adapters/claude.mjs` (workers cannot nest)

After editing agents/skills, run `node scripts/sync-tool-adapters.mjs --check` (and `npm test` / `check-agent-kit` as needed).
Skills inventory: `node scripts/sync-project-skills.mjs` / `--check`.
