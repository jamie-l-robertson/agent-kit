---
name: manager
description: >-
  Slash /manager entrypoint for Cursor. Immediately Task→manager with the user
  brief; do not implement or spawn specialists from the parent. Use only when
  the user invokes /manager (explicit slash).
disable-model-invocation: true
x-owner: agent-kit
---

# /manager (Cursor entrypoint)

Parent Agent: hand off to the **manager** specialist. Do **not** run the manager workflow yourself and do **not** Task `frontend` / `planner` from this chat.

## Hard rules (first actions)

1. **Do not** explore the repo, read agent files for theater, or implement anything.
2. **Do not** print `[manager] Got it…` / `[manager] Dispatching…`.
3. Immediately call `Task` once:
   - `subagent_type`: `manager`
   - `description`: **3–5 words**, e.g. `manager: blog pagination` (no `[inherit]` in the title)
   - `prompt`: everything the user wrote after `/manager` (goal / Behaviour / constraints)
   - **Omit Task `model`** (never pass `model: "inherit"`)
   - `run_in_background: false`
4. **Stop.** Do not also Task `planner` / `frontend` / other workers from the parent — the manager child dispatches them.

## After return

Relay manager plan approval / Final report as needed. Resume the manager by agent id when the host provides it.
