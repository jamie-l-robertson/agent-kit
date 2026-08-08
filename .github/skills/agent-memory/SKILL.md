---
name: agent-memory
description: >-
  Persists and retrieves multi-agent decisions for the manager. Use when the
  manager records a user decision, resumes a worker after needs-decision, plans
  a multi-step task, logs MCP usage, or needs prior choices (Mode, copy,
  breakpoints, schema, Writable paths). Manager reads before dispatch;
  documenter appends when briefed (manager is readonly and must not edit the log).
---

# Agent memory (decisions log)

Store durable decisions so the manager and resumed workers do not re-ask or contradict prior answers.

## Canonical location

- Log file: `.agents/memory/decisions.md`
- Create the directory/file if missing using the template below.

## Roles

| Role | Responsibility |
|------|----------------|
| **manager** (readonly) | **Read** before plan/dispatch/resume. Filter by **Applies to** / titles; paste **anchors/titles** into briefs — not the whole log. Never edit. After settled decisions, flagged defaults, or meaningful MCP usage, dispatch `documenter` with the memory-append brief. |
| **documenter** | **Append** one entry when briefed (`Mode: document`, `Writable paths` = the decisions log only). Confirm in `Changed`. |
| Other workers | Do not write the log unless the brief explicitly delegates it. Report `MCP used:` so the manager can append. |

## When to read (manager)

1. At the start of a managed task (before first dispatch).
2. Before resuming a worker after `needs-decision` / `blocked`.
3. When the user says “as we decided” / “same as before”.

Search/filter by **Applies to** (paths, agents, Modes, or `mcp`). Paste matching entry titles/anchors into `Related agent-memory`.

## When to write (documenter, via manager brief)

Append **one entry** when a decision is settled (user answered, or reversible default was applied and flagged), or when logging MCP usage.

If two decisions land in the same session, append two entries. Prefer `Supersedes` when contradicting an older entry rather than editing it.

Batch identical MCP reads in one session into one entry (“fetched standards via notion”) when useful; distinct servers/tools get distinct entries or one entry listing them.

## Entry format (decisions)

```markdown
## YYYY-MM-DDTHH:mm:ssZ — <short title>

- **Task**: <one-line goal>
- **Status**: decided | defaulted | superseded
- **Decision**: <what was chosen>
- **Options considered**: <a | b | …>
- **Why**: <one line>
- **Applies to**: <paths / agents / Modes>
- **Worker IDs**: <agent IDs if any, or none>
- **Supersedes**: <prior entry title/anchor, or none>
```

## Entry format (MCP calls)

Log **intent + outcome** only — never payloads, tokens, secrets, or document bodies.

```markdown
## YYYY-MM-DDTHH:mm:ssZ — mcp:<server>/<tool>

- **Task**: <one-line goal>
- **Status**: decided | defaulted | superseded
- **Decision**: MCP call <server>/<tool> — ok | auth-failed | error
- **Options considered**: n/a
- **Why**: <ref fetched or reason blocked; no secrets/PII/response bodies>
- **Applies to**: mcp | <paths>
- **Worker IDs**: <id or none>
- **Supersedes**: none
```

Title may list multiple tools when batched: `mcp:<server> — standards fetch`.

## File template (create if missing)

```markdown
# Agent decisions log

Append-only. Manager reads before dispatch; documenter appends when briefed.
<!-- Index: skim titles / Applies to; paste anchors into briefs — do not paste the whole log -->

```

## Rules

- Never store secrets, tokens, `.env` values, or PII.
- Prefer short, actionable decisions over narrative.
- If a new decision contradicts an old one, append with `Status: decided` and set `Supersedes` — do not delete the old entry.
- **Default writer is `documenter` under a manager brief** — not the readonly manager.
