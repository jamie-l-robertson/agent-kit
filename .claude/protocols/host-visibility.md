# Host visibility (manager)

Live feedback for multi-host orchestration comes from **named Task/Agent panels**, not chat chatter. Manager never implements.

## All hosts (Claude Code)

- Never do implementer/planner work in the manager turn — only spawn specialists (or ask the user).
- Prefer **fast-path** when eligible (trivial single-owner).
- Do **not** emit `[manager] Got it…` / `[manager] Dispatching…` progress lines. The Task/Agent UI title is enough while work runs. Save chat for plan approval, needs-decision, blocked, and the Final report.

## Claude Code spawn contract

Clickable specialist panels appear when you call the host **Task** / **Agent** tool with a kit specialist. Roleplay is not dispatch.

**Must** spawn for every specialist handoff (planner, implementers, reviewer, documenter, audits). Do **not** Write/Edit/Bash product files, invent plans, or “just implement” in the manager turn.

**Required spawn discipline:**

| Concern | Value |
|---------|--------|
| Specialist | Exact kit name: `planner` \| `researcher` \| `frontend` \| `backend` \| `tester` \| `reviewer` \| `documenter` \| `security` \| `devops` \| `infrastructure` \| `risk` |
| Title / description | **`<agent>: <task>`** — the agent name comes first, always. e.g. `frontend: blog pagination`, `researcher: 2026 market stats` |
| Prompt | Full brief-hygiene Worker brief |

Prefer foreground / blocking spawns so users can open the worker. Prefer **fast-path** when eligible to cut orchestration latency.

**The spawn title is the only thing the user sees while work runs — it must name the specialist.** A title that omits the agent leaves the user watching an anonymous panel.

| Bad | Good |
|-----|------|
| `Manager dispatched` | `frontend: secret-level page` |
| `Dispatching worker` | `researcher: episode synopsis sources` |
| `Working on the task` | `tester: pagination regression` |

**Forbidden stand-ins:** generic explorers or one mega-Task that does the whole feature under a non-kit type.

**Anti-patterns (process fail):**

- Manager editing product code/docs/tests
- Narrating dispatch with `[manager] …` instead of (or without) a real spawn
- Parent chat Tasking `frontend`/`planner` itself instead of Task→`manager` when the user asked for managed orchestration

### Managed entry

When the user asks for managed work (or invokes the manager agent):

1. Run as **manager** (or the parent immediately Tasks `manager`).
2. Manager then Tasks `planner` / `frontend` / … per manager protocol.
3. Nest policy is enforced by `.claude/settings.json` → `.claude/hooks/adapters/claude.mjs` (workers cannot spawn).

## Claude Desktop

- **Code** tab shares `.claude/` with the Claude Code CLI (same agents, hooks, settings, `CLAUDE.md`) — no separate agent tree.
- **Chat** / **Cowork** tabs are out of kit scope.
