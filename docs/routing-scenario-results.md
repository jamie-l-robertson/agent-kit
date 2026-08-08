# Routing scenario results

Dry-run against kit docs after roster change (2026-08-08). Pass = routed owners ⊆ expect set.

| id | expected | actual | pass/fail | notes |
|----|----------|--------|-----------|-------|
| 1 | manager, planner | manager → planner | pass | multi-domain |
| 2 | planner | planner | pass | plan-only |
| 3 | frontend | frontend | pass | UI restyle; not risk |
| 4 | backend | backend | pass | API no PII; not risk |
| 5 | frontend | frontend (+ a11y-wcag) | pass | WCAG fix; harness would be tester |
| 6 | tester | tester | pass | harness-only |
| 7 | reviewer | reviewer (+ code-review) | pass | no edits |
| 8 | documenter | documenter | pass | memory/handoff |
| 9 | security | security | pass | not risk |
| 10 | planner, documenter | planner (+ architecture-review); ADR → documenter | pass | not implementers |
| 11 | frontend | frontend (+ perf-audit) | pass | UI perf |
| 12 | backend | backend (+ perf-audit) | pass | query perf |
| 13 | devops | devops | pass | CI |
| 14 | infrastructure | infrastructure | pass | IaC; human-approve for prod apply |
| 15 | risk | risk | pass | PII; not security alone |
| 16 | no-owner | no-owner / blocked | pass | console-only |
| 17 | planner, backend, frontend, risk, tester, reviewer | planner order: backend + frontend + risk → tester → reviewer | pass | security only if auth (not required here) |
| 18 | risk | risk | pass | not security |
| 19 | devops | devops | pass | not infrastructure |

**Summary:** 19/19 pass on dry-run against current manager/planner/AGENTS routing.
