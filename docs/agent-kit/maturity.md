# Agent kit maturity

Living status for kit correctness vs platform-shaped next steps.

Scope note: this branch is **Claude Code only**. Cursor and Copilot adapter trees
are gone, and `gate-core.mjs` no longer carries a Cursor payload normalizer.
Anything below that reads as multi-host is history, not a plan.

## Correctness leftovers

| Item | Status |
|------|--------|
| `verify-only` / `document` + `changed` bypass | **Done** — validator + schema (`verify-only` empty changed; `document` path pattern) + protocol |
| Lock-steal timeout | **Done** — mkdir lock, fail-closed (no steal); `AGENT_KIT_LOCK_TIMEOUT_MS` |
| Concurrency test theater | **Done** — multiprocess shared-state test |
| Caller identity / invent-root | **Done** — unmapped caller → `unknown` deny; no caller id → `root` (a main-agent Task carries no `agent_id`) |
| Nest gate placement | **Done** — the gate is on `PreToolUse`; `SubagentStart` is record-only |

## Instrumentation

| Item | Status |
|------|--------|
| Run-event JSONL | **Done** — gate emits deny/allow; schema `.claude/schemas/run-event.schema.json`; dir `.claude/memory/runs/` (gitignored). Disable: `AGENT_KIT_RUN_EVENTS=0`. Optional POST: `AGENT_KIT_TELEMETRY_URL` |
| Kit version in `check` | **Done** — `.claude/.kit-version` |
| Honest host matrix | See README feature matrix |
| Manager Final report + Token costs | **Done** — mandatory close template; `scripts/format-final-report.mjs` renders the mechanical sections; counts come from the worker transcript and are marked `~` when measured one turn early |

## Stage gates

Shipped in full; per-phase build logs live in the stage-gate roadmap plan.

| Gate | Status |
|------|--------|
| Plan approval (`PreToolUse` ask quoting the planner plan) | **Done** — advisory: `AGENT_KIT_PLAN_GATE=off`, errors fall through, bypass modes exist |
| Access integrity (tracker bypass deny + report advisory) | **Done** |
| Worker-report validation on `SubagentStop` | **Done** — blocks until valid, capped at 2 retries then advisory |
| Audit fix-loops (`review` / `test` / `secRisk`) | **Done** — cap 2 rounds, then the user's call. **Only enforced when manager runs as a subagent** |
| Context practices | **Done** — `.claude/protocols/context-practices.md`, docs only |
| PoC playbook | **Done** — advisory, never gates a close |

## Deferred

- **CI eval loop** — deterministic `npm run eval`, adversarial routing cases. Not started.
- **Demo consumer** — filled stack-card example app. Not started.
