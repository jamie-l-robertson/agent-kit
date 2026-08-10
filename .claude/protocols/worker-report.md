## Worker-report JSON (canonical)

The fenced JSON object is the **authoritative** report. Manager bounce rules and `node scripts/validate-worker-report.mjs` validate it. Prose above the fence is a short human summary (≤10 lines) and **must not contradict** the JSON.

End your final message with a fenced object matching `.claude/schemas/worker-report.schema.json`. Prefer **sparse** fields — omit null optionals when unused.

Audit-only example:

```json
{
  "status": "done",
  "agent": "<your agent name>",
  "mode": "audit-only",
  "goal": "<one sentence>",
  "changed": [],
  "recommendNext": "none",
  "humanApprove": "n/a",
  "verificationResult": "n/a",
  "findings": "none"
}
```

Implement example (must include pass + evidence + non-empty `changed`):

```json
{
  "status": "done",
  "agent": "frontend",
  "mode": "implement",
  "goal": "<one sentence>",
  "changed": ["src/Button.tsx"],
  "recommendNext": "none",
  "humanApprove": "n/a",
  "verificationResult": "pass",
  "evidence": "<quoted command output or path to log>"
}
```

Rules:

- `status`: `done` | `needs-decision` | `blocked` | `out-of-scope`
- `verificationResult`: `pass` | `fail` | `n/a` (required)
- `pass` or `fail` ⇒ non-empty `evidence`
- `mode: implement` + `status: done` ⇒ `verificationResult` must be `pass`, `evidence` non-empty, and `changed` non-empty (`n/a` and `fail` are invalid — fix or use `needs-decision`)
- `changed`: string paths, or `[]` when none (implement done forbids `[]`)
- `humanApprove`: `required` | `granted` | `n/a`
- `humanApprove: granted` ⇒ non-empty `approvedAction` (use `"n/a"` when not destructive-scoped)
- `status: done` with `humanApprove: required` is invalid (use `needs-decision`)
- `blocked` ⇒ non-empty `needs` or `evidence`
- `recommendNext` must be a non-empty string (use `"none"` on done)
- Readonly agents on `done` (`reviewer`, `security`, `risk`, `planner`, `researcher`, `manager`) ⇒ `mode: audit-only` and `changed: []`
- `researcher` on `done` ⇒ non-empty `sources` (each `{ title, url|ref, accessed? }`); nothing citable → `blocked`
- `mode: verify-only` ⇒ `changed: []` (no file writes; do not list product paths)
- `mode: document` ⇒ `changed` paths only under docs/memory/stack cards (`docs/`, `.claude/memory/`, `.claude/**/*.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`)
- Audit findings agents (`reviewer`, `security`, `risk`) on `done` + `audit-only` ⇒ non-empty `findings` (use `"none"` if clean)
- Planner on `done` ⇒ put Worker briefs in **prose above the fence**, `notes` = short index only
- `out-of-scope` ⇒ `recommendNext` non-empty and not `"none"`
- `needs-decision` ⇒ non-empty `needs`
- On Claude Code a `SubagentStop` hook validates this fence automatically and blocks your stop until it is valid (capped at 2 retries, then advisory). Manager runs `node scripts/validate-worker-report.mjs --stdin` as a fallback when the hook is unavailable (direct invocation, other hosts)
- Optional `usage` — best-effort token/cost object when the host exposes counts: `{ "inputTokens", "outputTokens", "totalTokens", "costUsd", "source" }` with `source`: `host` | `estimate` | `n/a`. Omit the whole object when unused, or set `"source": "n/a"`. Never invent dollar amounts. Manager rolls these into the Final report **Token costs** section.
