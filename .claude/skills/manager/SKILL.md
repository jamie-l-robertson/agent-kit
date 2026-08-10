---
name: manager
description: >-
  Managed-orchestration entrypoint. Hand the user's request straight to the
  manager agent — do not plan, explore, or dispatch specialists from this
  chat. Use only when the user explicitly invokes it.
disable-model-invocation: true
x-owner: agent-kit
---

# Managed entry

Parent agent: hand off to the **manager** specialist. Do **not** run the manager workflow yourself and do **not** spawn `planner` / `frontend` / any other specialist from this chat — the manager child dispatches them.

## First actions

1. **Do not** explore the repo, read agent files, or implement anything.
2. **Do not** print `[manager] Got it…` / `[manager] Dispatching…`.
3. Spawn exactly one subagent:
   - agent: `manager`
   - description: 3–5 words, e.g. `manager: blog pagination` (no `[inherit]`)
   - prompt: everything the user wrote after the invocation, verbatim (goal / behaviour / constraints)
   - foreground / blocking, so the user can open the panel
   - omit any `model` override — `.claude/agents/manager.md` owns that
4. **Stop.**

## After return

Relay the manager's plan-approval question or Final report as-is. Resume the manager by agent id when the host provides one.

Protocol lives in `.claude/agents/manager.md` and `.claude/protocols/host-visibility.md` — do not restate it here.
