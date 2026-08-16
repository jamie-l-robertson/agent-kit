---
name: agent-memory
description: >-
  Persists and retrieves multi-agent decisions for the manager. Use when the
  manager records a user decision, resumes a worker after needs-decision, plans
  a multi-step task, or needs prior choices (Mode, copy, schema, Writable paths).
  MCP telemetry goes to mcp-usage.md; task outcomes/tokens go to tasks.md (gate hook).
  Manager reads before dispatch; documenter appends decisions/mcp-usage when briefed.
x-owner: agent-kit
---

# Agent memory

Store durable **product/design** decisions, MCP telemetry, and (via the gate) recent task outcomes so the manager and resumed workers do not re-ask or contradict prior answers — and so token counts for a run can be rolled up without inventing numbers.

## Canonical locations

| Log | Path | Contents | Writer |
|-----|------|----------|--------|
| Decisions | `.claude/memory/decisions.md` | Settled product/design choices | **documenter** (briefed) |
| MCP usage | `.claude/memory/mcp-usage.md` | Server/tool/outcome telemetry only | **documenter** (briefed) |
| Tasks | `.claude/memory/tasks.md` | Recent worker outcomes + token **count** | **gate hook** on valid SubagentStop |
| Tasks archive | `.claude/memory/tasks-archive/YYYY-MM.md` | Overflow past live cap (50) | **gate hook** |

## Roles

| Role | Responsibility |
|------|----------------|
| **manager** (readonly) | Read decisions before plan/dispatch/resume. Skim tasks.md for this run / open needs-decision — **never paste the whole log or archive**. Never edit logs. Dispatch `documenter` for decision and batched MCP usage appends only. |
| **documenter** | Append decisions / mcp-usage when briefed, via `scripts/append-memory.mjs`. Do **not** own tasks.md (hook writes it). |
| Other workers | Do not write logs unless briefed. Report `mcpUsed` in JSON so manager can batch. Optional `usage.totalTokens` (count only) when the host exposes it. |
| **gate hook** | On validated worker report: append tasks.md + rich `report` run-event (incl. `tokens` count or null). |

## When to read (manager)

1. Start of a managed task (before first dispatch) — decisions.
2. Before resume after `needs-decision` / `blocked` — decisions + skim tasks titles.
3. Final report **Token costs** — this run’s worker fences and/or newest matching tasks.md rows (counts only); not the archive.
4. When the user says “as we decided” / “same as before”.

Filter by **Applies to** / titles. Paste anchors into `Related agent-memory`. Default tasks skim: last ~20 entries or current session id.

## When to write decisions

Append **one entry** when a decision is settled (user answered, or reversible default flagged). Prefer `Supersedes` over editing.

### How to append

Use the script — it owns the shape, you own what is worth recording:

```bash
echo '<json>' | node scripts/append-memory.mjs decisions
echo '<json>' | node scripts/append-memory.mjs mcp
```

`decisions` needs `title, task, status, decision, options, why, appliesTo` (optional `workerIds`, `supersedes`); `mcp` needs `server, tool, task, outcome, why` (optional `workerIds`). It refuses to write and names every missing field, so a rejection is a fix-and-rerun, not a reason to hand-write the block. Never pass secrets, tokens, PII, or response bodies.

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

## Tasks log (hook-maintained)

Live file capped at **50** entries; older peel to `tasks-archive/YYYY-MM.md`. Entry shape (count only — no in/out/USD):

```markdown
## YYYY-MM-DDTHH:mm:ssZ — <agent>: <short goal>

- **Status**: done | needs-decision | blocked | out-of-scope
- **Mode**: …
- **Verification**: pass | fail | n/a
- **Changed**: path1, path2 | none
- **Tokens**: 12345 | n/a
- **Session**: <sessionId or n/a>
- **Needs**: <if needs-decision/blocked>
```

## Rules

- Never store secrets, `.env` values, or PII. Token **counts** in tasks.md are fine; never invent them.
- Append-only. Do not rewrite history except via `Supersedes` (decisions) or hook archive peel (tasks).
- Manager never edits any log.
- Do not paste whole tasks.md / archive / runs JSONL into briefs.
