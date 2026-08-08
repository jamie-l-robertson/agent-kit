# Routing scenarios

Consistent routing regression drills for this agent kit. **JSON twin** [`routing-scenarios.json`](routing-scenarios.json) is authoritative for CI; keep this table in sync in the same change.

## Purpose

Catch wrong-owner routes when agents, skills, or standards slots change.

## How to run

1. For each row: treat `ask` as the user request.
2. Decide first owner(s) using `AGENTS.md` + manager/planner routing (dry-run / brief-level — not a full product build).
3. Record expected vs actual in the result log.

Skills (`a11y-wcag`, `perf-audit`, `architecture-review`, `code-review`) are **not** agents — they must not appear as routed owners.

## Pass / fail

- Each row has `primary` and `expect[]` (allowed agents for that scenario, including orchestrator steps).
- **Any route to an agent outside `expect` is a fail.**
- `risk` only when listed in `expect` (PII/compliance asks — e.g. #15, #17, #18).
- `no-owner` means tell the user / `blocked` — not an agent spawn.

## Coverage rule

Every member of `WORKERS` in `.agents/hooks/gate-core.mjs` plus `manager` must appear as **`primary` at least once** (CI enforces this). Keep a `no-owner` negative case. Optional negative rows for peer confusion (security≠risk, devops≠infra) are encouraged.

## Scenarios

| # | Ask | Primary | Expect (allowed) |
|---|-----|---------|------------------|
| 1 | Multi-domain ship with unclear split | `manager` → `planner` | manager, planner |
| 18 | PII in logs (retention/redaction), not an auth bug | `risk` | risk (not security) |
| 19 | GH Actions secret *reference* wiring | `devops` | devops (not infrastructure) |
| 2 | Issue-backed / multi-step plan only | `planner` | planner |
| 3 | Restyle landing hero / UI | `frontend` | frontend |
| 4 | API route / schema (no PII) | `backend` | backend |
| 5 | Fix axe/WCAG failure | `frontend` (+ a11y-wcag) | frontend |
| 6 | Unit/e2e / flake harness | `tester` | tester |
| 7 | Diff/PR review | `reviewer` (+ code-review) | reviewer |
| 8 | Agent-memory / handoff doc | `documenter` | documenter |
| 9 | Session/cookie / secrets / CVE | `security` | security |
| 10 | Module boundaries / ADR | `planner` (+ architecture-review; ADR → documenter) | planner, documenter |
| 11 | Lighthouse / bundle / UI perf | `frontend` (+ perf-audit) | frontend |
| 12 | Query/N+1 / server perf | `backend` (+ perf-audit) | backend |
| 13 | Failing GitHub Action | `devops` | devops |
| 14 | Terraform/DNS/secret-store | `infrastructure` | infrastructure |
| 15 | PII in logs / retention | `risk` | risk |
| 16 | Pure cloud-console DNS, no IaC/CLI | no-owner | no-owner |
| 17 | Mixed: API email field + UI form | `planner` order | planner, backend, frontend, risk, tester, reviewer |

## Result log template

| id | expected | actual | pass/fail | notes |
|----|----------|--------|-----------|-------|
| 1 | | | | |

## When adding an agent

1. Prefer a **skill** or **standards slot** over a new worker (**specialist-cap**).
2. New agent only if: clear non-overlapping owner; row + JSON fixture; manager/planner/`AGENTS.md` wired; `WORKERS` + sync green.
3. Add ≥1 primary scenario; add a negative note if easy to confuse with a peer.
4. Re-run the full table (and `node --test scripts/routing-scenarios.test.mjs`).

## When adding standards / Cloud platform

Note which scenarios must carry those brief fields (e.g. #13–14 for platform/ops standards; #7 for lint Evidence when Lint path is set).

## Specialist-cap policy

Default bias: **do not add agents**. Prefer skills (`a11y-wcag`, `perf-audit`, `architecture-review`, `code-review`, …) and `AGENTS.md` standards refs.
