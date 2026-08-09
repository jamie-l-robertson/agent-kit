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

1. **Do not** explore the repo, read agent/skill files for theater, or implement anything before dispatching.
2. **Do not** call `Task` with `subagent_type` `manager`, `explore`, `shell`, `browser`, or `generalPurpose`.
3. **Do not** print `[manager] Got it…` / `[manager] Dispatching…` — call `Task` for the first specialist (usually `planner`, or fast-path owner).
4. Follow the manager protocol in `.agents/agents/manager.md` / composed `.cursor/agents/manager.md` for routing, plan approval, briefs, bounce, and Final report — but **you** are the orchestrator in this thread.

## Cursor Task spawn (every worker)

For each specialist:

- `subagent_type`: kit name only (`planner` | `frontend` | `backend` | `tester` | `reviewer` | `documenter` | `security` | `devops` | `infrastructure` | `risk`)
- `description`: **3–5 words**, e.g. `frontend: blog pagination` — do **not** put `[inherit]` in the title
- `prompt`: brief-hygiene Worker brief (include `Model: inherit` **inside the brief text** if needed)
- **Omit Task `model`** — do not pass `model: "inherit"` (Cursor often rejects it → subagent **Stopped** + parent stuck on Waiting for subagent). Only pass `model` when the host enum allows a concrete value (e.g. `fast`) and you intend it.
- Foreground: `run_in_background: false` (required on Cursor unless the user asked for parallel/async)

Workers appear as **sibling** panels under this chat — that is the visibility fix.

## User text after `/manager`

Treat everything after `/manager` as the goal / Behaviour / constraints for the run.
