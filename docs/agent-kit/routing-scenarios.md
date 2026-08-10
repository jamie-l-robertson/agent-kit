# Routing scenarios

Consistent routing regression drills for this agent kit. **JSON twin** [`routing-scenarios.json`](routing-scenarios.json) is authoritative for fixture CI (coverage, md twin, model frontmatter) — not an LLM routing oracle. Keep this table in sync in the same change. Manual dry-runs go in [`routing-scenario-results.md`](routing-scenario-results.md).

## Purpose

Catch wrong-owner routes when agents, skills, or standards slots change.

## How to run

1. For each row: treat `ask` as the user request.
2. Decide first owner(s) using `AGENTS.md` + manager/planner routing (dry-run / brief-level — not a full product build).
3. Record expected vs actual in the result log.

Skills (`a11y-wcag`, `perf-audit`, `architecture-review`, `code-review`) are **not** agents — they must not appear as routed owners.

## Pass / fail

- Each row has `primary`, `model`, and `expect[]` (allowed agents for that scenario, including orchestrator steps).
- **Any route to an agent outside `expect` is a fail.**
- **Wrong model** vs the primary’s configured `model:` (kit default `inherit`) is a fail when dry-running spawn titles/dispatch.
- `model` must match the primary agent’s `model:` frontmatter (`n/a` for `no-owner`).
- `risk` only when listed in `expect` (PII/compliance asks — e.g. #15, #17, #18).
- `no-owner` means tell the user / `blocked` — not an agent spawn.

## Coverage rule

Every member of `WORKERS` in `.claude/hooks/gate-core.mjs` plus `manager` must appear as **`primary` at least once** (`scripts/routing-scenarios.test.mjs` in CI). Keep a `no-owner` negative case. Optional negative rows for peer confusion (security≠risk, devops≠infra) are encouraged.

## Scenarios

| # | Ask | Primary | Model | Expect (allowed) |
|---|-----|---------|-------|------------------|
| 1 | Multi-domain ship with unclear split | `manager` → `planner` (gap/ask + user plan approval before implementers; UI → design exists/align/understanding check) | `inherit` | manager, planner |
| 21 | Manager invoked for a simple single-owner fix (e.g. typo in one component) | `manager` → fast-path owner (e.g. `frontend`; no planner) | `inherit` | manager, frontend |
| 18 | PII in logs (retention/redaction), not an auth bug | `risk` | `inherit` | risk (not security) |
| 19 | GH Actions secret *reference* wiring | `devops` | `inherit` | devops (not infrastructure) |
| 2 | Issue-backed / multi-step plan only | `planner` | `inherit` | planner |
| 3 | Restyle landing hero / UI | `frontend` | `inherit` | frontend |
| 4 | API route / schema (no PII) | `backend` | `inherit` | backend |
| 5 | Fix axe/WCAG failure | `frontend` (+ a11y-wcag) | `inherit` | frontend |
| 6 | Unit/e2e / flake harness | `tester` | `inherit` | tester |
| 7 | Diff/PR review | `reviewer` (+ code-review) | `inherit` | reviewer |
| 8 | Agent-memory / handoff doc | `documenter` | `inherit` | documenter |
| 9 | Session/cookie / secrets / CVE | `security` | `inherit` | security |
| 10 | Module boundaries / ADR | `planner` (+ architecture-review; ADR → documenter) | `inherit` | planner, documenter |
| 11 | Lighthouse / bundle / UI perf | `frontend` (+ perf-audit) | `inherit` | frontend |
| 12 | Query/N+1 / server perf | `backend` (+ perf-audit) | `inherit` | backend |
| 13 | Failing GitHub Action | `devops` | `inherit` | devops |
| 14 | Terraform/DNS/secret-store | `infrastructure` | `inherit` | infrastructure |
| 15 | PII in logs / retention | `risk` | `inherit` | risk |
| 16 | Pure cloud-console DNS, no IaC/CLI | no-owner | n/a | no-owner |
| 17 | Mixed: API email field + UI form | `planner` order | `inherit` | planner, backend, frontend, risk, tester, reviewer |
| 20 | Vulnerable dep upgrade after security audit | `backend` (security audited) | `inherit` | backend, security |

## Result log template

| id | expected | model | actual | pass/fail | notes |
|----|----------|-------|--------|-----------|-------|
| 1 | | | | | |

## When adding an agent

1. Prefer a **skill** or **standards slot** over a new worker (**specialist-cap**).
2. New agent only if: clear non-overlapping owner; row + JSON fixture; manager/planner/`AGENTS.md` wired; `WORKERS` + sync green.
3. Add ≥1 primary scenario; add a negative note if easy to confuse with a peer.
4. Re-run the full table (and `node --test scripts/routing-scenarios.test.mjs`).

## When adding standards / Cloud platform

Note which scenarios must carry those brief fields (e.g. #13–14 for platform/ops standards; #7 for lint Evidence when Lint path is set).

## Specialist-cap policy

Default bias: **do not add agents**. Prefer skills (`a11y-wcag`, `perf-audit`, `architecture-review`, `code-review`, …) and `AGENTS.md` standards refs.
