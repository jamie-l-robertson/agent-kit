# Host visibility (manager)

Live feedback for multi-host orchestration comes from **named Task panels**, not chat chatter. Manager never implements.

## All hosts

- Never do implementer/planner work in the manager turn — only `Task` specialists (or ask the user).
- Prefer **fast-path** when eligible (trivial single-owner).
- Do **not** emit `[manager] Got it…` / `[manager] Dispatching…` progress lines. The Task UI title is enough while work runs. Save chat for plan approval, needs-decision, blocked, and the Final report.

## Cursor Task spawn contract (hard)

Clickable specialist panels appear **only** when you call the host **`Task`** tool with a kit `subagent_type`. Roleplay is not dispatch.

**Must** call `Task` for every specialist handoff (planner, implementers, reviewer, documenter, audits). Do **not** Write/Edit/Shell product files, invent plans, or “just implement” in the manager turn.

**Required Task args:**

| Arg | Value |
|-----|--------|
| `subagent_type` | Exact kit name: `planner` \| `frontend` \| `backend` \| `tester` \| `reviewer` \| `documenter` \| `security` \| `devops` \| `infrastructure` \| `risk` |
| `description` | **3–5 words** UI title, e.g. `frontend: blog pagination` (no `[inherit]` in the title) |
| `prompt` | Full brief-hygiene Worker brief (`Model:` belongs **in the brief**, not as Task `model` unless host-valid) |

**Task `model` arg:** **Omit** by default so the subagent inherits the parent model. Do **not** pass `model: "inherit"` — Cursor’s Task schema often rejects it and the UI shows the worker **Stopped** while the parent hangs on “Waiting for subagent”. Only set Task `model` when the live tool enum accepts the value (e.g. `fast`) and you intentionally want that.

**Foreground by default:** set `run_in_background: false`. Do **not** background planner, sequential implementers, or reviewer unless the user asked for parallel/async/cloud work — and even then keep `description` naming the kit agent.

**Forbidden `subagent_type` for kit workers:** `explore`, `shell`, `browser`, `generalPurpose`, or any non-kit name. Those show as anonymous “waiting on subagent” / wrong panels.

**Anti-patterns (process fail):**

- Manager editing product code/docs/tests
- One mega-Task that does the whole feature under a generic type
- Narrating dispatch with `[manager] …` instead of (or without) a real `Task` tool call
- Using built-in explorers to stand in for `planner` / `frontend` / etc.
- On Cursor `/manager`: calling `Task(subagent_type="manager")` (nests workers; UI shows manager **Stopped** + anonymous “Waiting for subagent”)

### Cursor `/manager` slash (visibility)

Cursor often does **not** show nested Tasks under a manager subagent. When the user invokes **`/manager`**:

1. **Orchestrate in this chat** (parent Agent) using the manager workflow — do **not** `Task` → `manager`.
2. Spawn `planner` / `frontend` / … as **depth-1** Tasks so each is a labeled, openable panel.
3. Follow the **manager** skill (`.agents/skills/manager/SKILL.md`) and always-on rule `manager-slash-cursor`.

The `manager` **agent** file remains for Claude Code / Desktop Code / explicit Task→manager when nesting is acceptable.

## Cursor (parent chat)

- Subagent Task output often does **not** stream into the parent chat — silence until return is expected; that is fine.
- Named kit `Task(subagent_type=…)` = labeled, openable panel; follow the spawn contract above.

## Claude Code

- Same Task title/description discipline; spawn the named project agent (`.claude/agents/`), not a generic helper.
- Prefer fast-path when eligible to cut orchestration latency.
- Prefer foreground / blocking spawns so users can open the worker.
- Task→`manager` then manager→workers is OK when the host shows nested agents.

## Claude Desktop

- **Code** tab shares `.claude/` with the Claude Code CLI (same agents, hooks, settings, `CLAUDE.md`) — no separate agent tree.
- **Chat** / **Cowork** tabs are out of kit scope (Cowork skills sync via claude.ai Customize, not project `.claude/`).
- On Code tab, still set spawn name/description; labeling quality is host-UI dependent.
