# Agent kit maturity

Living status for kit correctness vs platform-shaped next steps.

## Phase 0 — Re-rate leftovers (done in tree; capture still ops)

| Item | Status |
|------|--------|
| `verify-only` / `document` + `changed` bypass | **Done** — validator + schema + protocol |
| Lock-steal timeout | **Done** — mkdir lock, fail-closed (no steal); `AGENT_KIT_LOCK_TIMEOUT_MS` |
| Concurrency test theater | **Done** — multiprocess shared-state test |
| `_default` / fail-open invent-root | **Done** — unmapped/missing caller → `unknown` deny; need `sessionStart` (or mapped session) first |
| Real Cursor gate-log capture | **Ops** — set `AGENT_KIT_GATE_LOG=1`, attempt a worker nest, redact notes below |
| Kit release tag | **Ops** — user-approved git tag (setup never auto-tags); pin via `AGENT_KIT_REF` |

### Cursor gate-log capture (operator)

```bash
export AGENT_KIT_GATE_LOG=1
# In Cursor: manager → worker, then have that worker try to spawn (expect deny)
# Inspect: .agents/hooks/state/gate-log.jsonl
```

Record here after a real capture (redact ids):

- Date:
- `session_id` present? (yes/no)
- `subagent_id` / `tool_call_id` present?
- Nest deny observed? (yes/no)
- Matrix claim after capture: keep “hard when lifecycle ids present” until yes/yes/yes

## Phase 1 — Instrument

| Item | Status |
|------|--------|
| Run-event JSONL | **Done** — gate emit deny/allow; schema `.agents/schemas/run-event.schema.json`; dir `.agents/memory/runs/` (gitignored). Disable: `AGENT_KIT_RUN_EVENTS=0`. Optional POST: `AGENT_KIT_TELEMETRY_URL` |
| Kit version in `check` | **Done** — `.agents/.kit-version` |
| Honest host matrix | See README feature matrix |

## Phase 2 — CI eval loop (deferred)

Deterministic `npm run eval`, adversarial cases, optional LLM routing — **not started**.

## Phase 3 — Demo consumer (deferred)

Filled stack-card example app — **not started**.
