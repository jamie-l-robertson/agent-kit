---
applyTo: **
---
# Cursor /manager dispatch

When the user message starts with `/manager` or the **manager** skill was explicitly invoked:

1. Immediately `Task` with `subagent_type: manager`, short `description` (e.g. `manager: blog pagination`), `run_in_background: false`, **omit Task `model`**. `prompt` = user text after `/manager`.
2. Do **not** explore/implement first. Do **not** emit `[manager] Got it…` / `Dispatching…` chatter.
3. Do **not** Task `planner` / `frontend` / other kit workers from the parent — manager does that.
4. Forbid parent `explore` / `generalPurpose` / `shell` / `browser` as stand-ins for kit specialists.

The manager agent then follows its protocol (fast-path vs planner → approval → implementers) using the Cursor Task spawn contract in host-visibility.
