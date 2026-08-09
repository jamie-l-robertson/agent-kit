# Host visibility (manager)

Live feedback rules for multi-host orchestration. Manager never implements; users must still see who is working.

## All hosts

- Emit a `[manager]` line **before** every Task/Agent spawn (the tool call), not only after thinking. Include agent name, Model, and short goal.
- After each return: status (`done` / `needs-decision` / `blocked` / `out-of-scope`) + next step.
- Never do implementer/planner work in the manager turn. Silence without a prior dispatch line is a process fail.
- UI / spawn title: `<agent> [<model>]: <short task>` (or host equivalent `description`) on every spawn so panels are labeled.
- Prefer **fast-path** when eligible (trivial single-owner) to avoid an unlabeled long planner run.

## Cursor Task spawn contract (hard)

Clickable specialist panels appear **only** when you call the host **`Task`** tool with a kit `subagent_type`. Heartbeats do not create panels. Roleplay is not dispatch.

**Must** call `Task` for every specialist handoff (planner, implementers, reviewer, documenter, audits). Do **not** Write/Edit/Shell product files, invent plans, or “just implement” in the manager turn.

**Required Task args:**

| Arg | Value |
|-----|--------|
| `subagent_type` | Exact kit name: `planner` \| `frontend` \| `backend` \| `tester` \| `reviewer` \| `documenter` \| `security` \| `devops` \| `infrastructure` \| `risk` |
| `description` | Short UI title — prefer `<agent> [<model>]: <short task>` (≤ ~5–8 words if the host truncates) |
| `prompt` | Full brief-hygiene Worker brief |

**Foreground by default:** set `run_in_background: false` or omit it. Do **not** background planner, sequential implementers, or reviewer unless the user asked for parallel/async/cloud work — and even then keep `description` naming the kit agent.

**Forbidden `subagent_type` for kit workers:** `explore`, `shell`, `browser`, `generalPurpose`, or any non-kit name. Those show as anonymous “waiting on subagent” / wrong panels.

**Anti-patterns (process fail):**

- Manager editing product code/docs/tests
- One mega-Task that does the whole feature under a generic type
- Announcing `[manager] Dispatching…` without a `Task` tool call in the **same** turn
- Using built-in explorers to stand in for `planner` / `frontend` / etc.

## Cursor (parent chat)

- Subagent Task output often does **not** stream into the parent chat — silence until return is expected.
- `[manager]` heartbeats are the only live UX in the parent thread. Prefix every interim user-visible line with `[manager]`.
- Named kit `Task(subagent_type=…)` = labeled, openable panel; follow the spawn contract above.

## Claude Code

- Same title/description discipline; spawn the named project agent (`.claude/agents/`), not a generic helper.
- Prefer fast-path when eligible to cut orchestration latency.
- Prefer foreground / blocking spawns so users can open the worker.

## Claude Desktop

- **Code** tab shares `.claude/` with the Claude Code CLI (same agents, hooks, settings, `CLAUDE.md`) — no separate agent tree.
- **Chat** / **Cowork** tabs are out of kit scope (Cowork skills sync via claude.ai Customize, not project `.claude/`).
- On Code tab, still set spawn name/description; labeling quality is host-UI dependent.
