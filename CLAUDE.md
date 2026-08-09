# Claude Code — agent kit

Follow the stack card in `AGENTS.md` for package manager, ownership, and narrow commands.

## Always-on rules

Read and apply these project rules (also mirrored under `.cursor/rules/` and `.github/instructions/`):

- `.agents/rules/context7-api-validation.md`
- `.agents/rules/karpathy-guidelines.md`
- `.agents/rules/manager-slash-cursor.md`
- `.agents/rules/tdd-testing.md`

## Agents & skills

- Specialists: `.claude/agents/` (synced from `.agents/agents/`)
- Skills: `.claude/skills/` (synced from `.agents/skills/`)
- Decision log: `.agents/memory/decisions.md`
- Call-graph gate: `.claude/settings.json` → `.agents/hooks/adapters/claude.mjs` (workers cannot nest)

After editing canonical sources under `.agents/`, run `node scripts/sync-tool-adapters.mjs`.
Drift check: `node scripts/sync-tool-adapters.mjs --check`.
Skills inventory (setup runs this): `node scripts/sync-project-skills.mjs` / `--check`.
