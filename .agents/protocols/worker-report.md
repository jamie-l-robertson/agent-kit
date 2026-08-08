## Worker-report JSON (canonical)

The fenced JSON object is the **authoritative** report. Manager bounce rules and `node scripts/validate-worker-report.mjs` validate it. Prose above the fence is a short human summary (≤10 lines) and **must not contradict** the JSON.

End your final message with a fenced object matching `.agents/schemas/worker-report.schema.json`. Prefer **sparse** fields — omit null optionals when unused:

```json
{
  "status": "done",
  "agent": "<your agent name>",
  "mode": "audit-only",
  "goal": "<one sentence>",
  "changed": [],
  "recommendNext": "none",
  "humanApprove": "n/a",
  "verificationResult": "n/a"
}
```

Rules:

- `status`: `done` | `needs-decision` | `blocked` | `out-of-scope`
- `verificationResult`: `pass` | `fail` | `n/a` (required). For `mode: implement` + `status: done`, `fail` is invalid — fix or use `needs-decision`.
- `changed`: string paths, or `[]` when none
- `humanApprove`: `required` | `granted` | `n/a`
- Optional `approvedAction`: short string naming the destructive action granted (when relevant)
- `status: done` with `humanApprove: required` is invalid (use `needs-decision`)
- Audit agents (`reviewer`, `security`, `risk`) on `done` + `audit-only` → non-null `findings` string (use `"none"` if clean)
- `security` / `risk` on `done` → `mode` must be `audit-only` and `changed` must be `[]`
- Planner on `done` → `changed` must be `[]`; put Worker briefs in **prose above the fence**, `notes` = short index only
- `out-of-scope` → `recommendNext` non-empty and not `"none"`
- `needs-decision` → non-empty `needs`
- When Success required verification commands → non-empty `evidence` and set `verificationResult` accordingly
- Manager runs `node scripts/validate-worker-report.mjs --stdin` on suspect fences (kit script, not a project test suite)
