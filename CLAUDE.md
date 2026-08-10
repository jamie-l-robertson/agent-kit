# Claude Code — agent kit

Follow the stack card in `AGENTS.md` for package manager, ownership, and narrow commands.

## Always-on rules

Read and apply these project rules:

- `.claude/rules/context7-api-validation.md`
- `.claude/rules/karpathy-guidelines.md`
- `.claude/rules/tdd-testing.md`

## Agents & skills

- Specialists: `.claude/agents/` (edit here — single tree)
- Skills: `.claude/skills/` (edit here — single tree)
- Decision log: `.claude/memory/decisions.md`
- Call-graph gate: `.claude/settings.json` → `.claude/hooks/adapters/claude.mjs` (workers cannot nest)

After editing agents/skills, run `node scripts/sync-tool-adapters.mjs --check` (and `npm test` / `check-agent-kit` as needed).
Skills inventory: `node scripts/sync-project-skills.mjs` / `--check`.
