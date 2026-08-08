## Worker-report JSON (canonical)

The fenced JSON object is the **authoritative** report. Manager bounce rules and tooling validate it. Prose above the fence is a short human summary (≤10 lines) and **must not contradict** the JSON.

End your final message with a fenced object matching `.agents/schemas/worker-report.schema.json`:

```json
{
  "status": "done",
  "agent": "<your agent name>",
  "mode": "audit-only",
  "goal": "<one sentence>",
  "changed": [],
  "recommendNext": "none",
  "findings": null,
  "evidence": null,
  "mcpUsed": "none",
  "tests": null,
  "shipped": null,
  "deferred": null,
  "notes": null,
  "needs": null,
  "humanApprove": "n/a"
}
```

Rules:

- `status`: `done` | `needs-decision` | `blocked` | `out-of-scope`
- `changed`: string paths, or `[]` when none
- `humanApprove`: `required` | `granted` | `n/a`
- `status: done` with `humanApprove: required` is invalid (use `needs-decision`)
- Audit agents (`reviewer`, `security`, `risk`) on `done` + `audit-only` → non-null `findings` string (use `"none"` if empty)
- Planner on `done` → `changed` must be `[]`
- When Success required verification commands → non-empty `evidence` on `done` / `blocked` after a real run
- Manager bounces missing/invalid fences and schema violations
