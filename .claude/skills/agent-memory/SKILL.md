---
name: agent-memory
description: >-
  Persists and retrieves multi-agent decisions for the manager. Use when the
  manager records a user decision, resumes a worker after needs-decision, plans
  a multi-step task, or needs prior choices (Mode, copy, schema, Writable paths).
  MCP telemetry goes to mcp-usage.md, not this log. Manager reads before dispatch;
  documenter appends when briefed.
x-owner: agent-kit
---

# Agent memory (decisions log)

Store durable **product/design** decisions so the manager and resumed workers do not re-ask or contradict prior answers.

## Canonical locations

| Log | Path | Contents |
|-----|------|----------|
| Decisions | `.claude/memory/decisions.md` | Settled product/design choices |
| MCP usage | `.claude/memory/mcp-usage.md` | Server/tool/outcome telemetry only |

## Roles

| Role | Responsibility |
|------|----------------|
| **manager** (readonly) | Read decisions before plan/dispatch/resume. Never edit. Dispatch `documenter` for decision appends and batched MCP usage appends. |
| **documenter** | Append when briefed (`Mode: document`, Writable paths limited to the target log). |
| Other workers | Do not write logs unless briefed. Report `mcpUsed` in JSON so manager can batch. |

## When to read (manager)

1. Start of a managed task (before first dispatch).
2. Before resume after `needs-decision` / `blocked`.
3. When the user says “as we decided” / “same as before”.

Filter by **Applies to** / titles. Paste anchors into `Related agent-memory`.

## When to write decisions

Append **one entry** when a decision is settled (user answered, or reversible default flagged). Prefer `Supersedes` over editing.

### Entry format (decisions)

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

## When to write MCP usage

Batch at manager close (or after prewarm). **Not** into `decisions.md`.

```markdown
## YYYY-MM-DDTHH:mm:ssZ — mcp:<server>/<tool>

- **Task**: <one-line goal>
- **Outcome**: ok | auth-failed | error
- **Why**: <ref fetched or reason blocked; no secrets/PII/bodies>
- **Worker IDs**: <id or none>
```

## Rules

- Never store secrets, tokens, `.env` values, or PII.
- Append-only. Do not rewrite history except via `Supersedes`.
- Manager never edits either log.
