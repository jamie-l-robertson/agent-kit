# Host visibility (manager)

Live feedback rules for multi-host orchestration. Manager never implements; users must still see who is working.

## All hosts

- Emit a `[manager]` line **before** every Task/Agent spawn (the tool call), not only after thinking. Include agent name, Model, and short goal.
- After each return: status (`done` / `needs-decision` / `blocked` / `out-of-scope`) + next step.
- Never do implementer/planner work in the manager turn. Silence without a prior dispatch line is a process fail.
- UI / spawn title: `<agent> [<model>]: <short task>` (or host equivalent `description`) on every spawn so panels are labeled.
- Prefer **fast-path** when eligible (trivial single-owner) to avoid an unlabeled long planner run.

## Cursor

- Subagent Task output often does **not** stream into the parent chat — silence until return is expected.
- `[manager]` heartbeats are the only live UX in the parent thread. Prefix every interim user-visible line with `[manager]`.
- Set the Task UI title to `<agent> [<model>]: <short task>` so the subagent panel is labeled.

## Claude Code

- Same title/description discipline as Cursor.
- Prefer fast-path when eligible to cut orchestration latency.
- Project agents live under `.claude/agents/` (synced from `.agents/agents/`).

## Claude Desktop

- **Code** tab shares `.claude/` with the Claude Code CLI (same agents, hooks, settings, `CLAUDE.md`) — no separate agent tree.
- **Chat** / **Cowork** tabs are out of kit scope (Cowork skills sync via claude.ai Customize, not project `.claude/`).
- On Code tab, still set spawn name/description; labeling quality is host-UI dependent.
