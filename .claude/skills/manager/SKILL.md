---
name: manager
description: >-
  Slash /manager entrypoint for Cursor. Orchestrate kit specialists with visible
  depth-1 Task panels. Use only when the user invokes /manager (explicit slash).
disable-model-invocation: true
x-owner: agent-kit
---

# /manager (Cursor orchestrator)

You are running the **manager workflow in this chat** (parent Agent). Do **not** wrap work in `Task(subagent_type="manager")` — that nests workers under a Stopped manager and the UI only shows “Waiting for subagent” with nothing to open.

## Hard rules (first actions)

1. **Do not** explore the repo, read `.cursor/agents/manager.md`, or implement anything before dispatching.
2. **Do not** call `Task` with `subagent_type` `manager`, `explore`, `shell`, `browser`, or `generalPurpose`.
3. Emit one `[manager]` line, then call `Task` for the first specialist (usually `planner`, or fast-path owner).
4. Follow the manager protocol in `.agents/agents/manager.md` / composed `.cursor/agents/manager.md` for routing, plan approval, briefs, bounce, and Final report — but **you** are the orchestrator in this thread.

## Cursor Task spawn (every worker)

For each specialist:

- `subagent_type`: kit name only (`planner` | `frontend` | `backend` | `tester` | `reviewer` | `documenter` | `security` | `devops` | `infrastructure` | `risk`)
- `description`: `<agent> [<model>]: <short task>`
- `prompt`: brief-hygiene Worker brief
- Foreground: `run_in_background: false` or omit

Workers appear as **sibling** panels under this chat — that is the visibility fix.

## User text after `/manager`

Treat everything after `/manager` as the goal / Behaviour / constraints for the run.
