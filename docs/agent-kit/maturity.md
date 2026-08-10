# Agent kit maturity

Living status for kit correctness vs platform-shaped next steps.

## Phase 0 — Re-rate leftovers (done in tree; capture still ops)

| Item | Status |
|------|--------|
| `verify-only` / `document` + `changed` bypass | **Done** — validator + schema (`verify-only` empty changed; `document` path pattern) + protocol |
| Lock-steal timeout | **Done** — mkdir lock, fail-closed (no steal); `AGENT_KIT_LOCK_TIMEOUT_MS` |
| Concurrency test theater | **Done** — multiprocess shared-state test |
| Caller identity / invent-root | **Done** — unmapped parent → `unknown` deny; empty parent / missing ids → `root` (lean Cursor Task allow; noon semantics); **`conversationId` before `sessionId`** so worker conv aliases beat session root |
| sessionId-before-conversationId fail-open | **Done** — nest without parent + worker `conversationId` alias denies (tests + check smoke) |
| Real 
### 
# In Cursor: manager → worker, then have that worker try to spawn (expect deny)
# Inspect: .claude/hooks/state/gate-log.jsonl
```

Record here after a real capture (redact ids):

- Date:
- `session_id` present? (yes/no)
- `subagent_id` / `tool_call_id` present?
- Nest deny observed? (yes/no)
- Matrix claim after capture: Cursor nest gate is hard on Task `preToolUse`; `subagentStart` is record-only

## Phase 1 — Instrument

| Item | Status |
|------|--------|
| Run-event JSONL | **Done** — gate emit deny/allow; schema `.claude/schemas/run-event.schema.json`; dir `.claude/memory/runs/` (gitignored). Disable: `AGENT_KIT_RUN_EVENTS=0`. Optional POST: `AGENT_KIT_TELEMETRY_URL` |
| Kit version in `check` | **Done** — `.claude/.kit-version` |
| Honest host matrix | See README feature matrix |
| Manager Final report + Token costs | **Done** — mandatory close template; optional worker-report `usage`; never invent $ |

## Phase 2 — Cloud agents

Checklist: [`phase-2-cloud-agents.md`](phase-2-cloud-agents.md).

| Item | Status |
|------|--------|
| Phase 2 doc + manager/code-review cloud notes | **Done** (doc + prompt wiring) |
| README matrix Cloud agents row | **Partial** — stub until smoke |
| Cloud gate hard vs soft | **Ops** — smoke nest-deny on cloud VM; update matrix |
| Cloud MCP / secrets smoke | **Ops** |
| End-to-end cloud smoke (planner → cloud implementer → close) | **Ops** — record below |

### Cloud smoke log (operator)

- Date:
- Gate on cloud: hard / soft / unknown
- MCP: ok / blocked (servers):
- Usage in Final report: present / n/a (reason):
- Merge-back: done / deferred

## Phase 3 — CI eval loop (deferred)

Deterministic `npm run eval`, adversarial cases, optional LLM routing — **not started**.

## Phase 4 — Demo consumer (deferred)

Filled stack-card example app — **not started**.
