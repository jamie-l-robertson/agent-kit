---
name: agent-memory
description: >-
  Persists and retrieves multi-agent decisions for the manager. Use when the
  manager records a user decision, resumes a worker after needs-decision, plans
  a multi-step task, or needs prior choices (Mode, copy, breakpoints, schema,
  Writable paths). Manager reads before dispatch; documenter appends when
  briefed (manager is readonly and must not edit the log).
---

# Agent memory (decisions log)

Store durable decisions so the manager and resumed workers do not re-ask or contradict prior answers.

## Canonical location

- Log file: `.agents/memory/decisions.md`
- Create the directory/file if missing using the template below.

## Roles

| Role | Responsibility |
|------|----------------|
| **manager** (readonly) | **Read** the log before plan/dispatch/resume. Never edit files. After a settled decision, dispatch `documenter` with the memory-append brief. |
| **documenter** | **Append** one entry when briefed (`Mode: document`, `Writable paths` = the decisions log only). Confirm in `Changed`. |
| Other workers | Do not write the log unless the brief explicitly delegates it. |

## When to read (manager)

1. At the start of a managed task (before first dispatch).
2. Before resuming a worker after `needs-decision` / `blocked`.
3. When the user says “as we decided” / “same as before”.

## When to write (documenter, via manager brief)

Append **one entry** when a decision is settled (user answered, or reversible default was applied and flagged). Manager must brief you for **flagged defaults** as well as user answers — do not rewrite history; append only.

If two decisions land in the same session, append two entries. Prefer `Supersedes` when contradicting an older entry rather than editing it.

## Entry format

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

## File template (create if missing)

```markdown
# Agent decisions log

Append-only. Manager reads before dispatch; documenter appends when briefed.

```

## Rules

- Never store secrets, tokens, `.env` values, or PII.
- Prefer short, actionable decisions over narrative.
- If a new decision contradicts an old one, append with `Status: decided` and set `Supersedes` — do not delete the old entry.
- **Default writer is `documenter` under a manager brief** — not the readonly manager.
