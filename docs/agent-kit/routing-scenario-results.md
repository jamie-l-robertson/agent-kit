# Routing scenario results

**Manual dry-run log** (not CI evidence). Re-run by hand when routing tables change. Pass = routed owners ⊆ expect set and primary model matches frontmatter.

| id | expected | model | actual | pass/fail | notes |
|----|----------|-------|--------|-----------|-------|
| 1 | manager, planner | inherit | manager → planner | pass | multi-domain |
| 2 | planner | inherit | planner | pass | plan-only |
| 3 | frontend | inherit | frontend | pass | UI restyle; not risk |
| 4 | backend | inherit | backend | pass | API no PII; not risk |
| 5 | frontend | inherit | frontend (+ a11y-wcag) | pass | WCAG fix; harness would be tester |
| 6 | tester | inherit | tester | pass | harness-only |
| 7 | reviewer | inherit | reviewer (+ code-review) | pass | no edits |
| 8 | documenter | inherit | documenter | pass | memory/handoff |
| 9 | security | inherit | security | pass | not risk |
| 10 | planner, documenter | inherit | planner (+ architecture-review); ADR → documenter | pass | not implementers |
| 11 | frontend | inherit | frontend (+ perf-audit) | pass | UI perf |
| 12 | backend | inherit | backend (+ perf-audit) | pass | query perf |
| 13 | devops | inherit | devops | pass | CI |
| 14 | infrastructure | inherit | infrastructure | pass | IaC; human-approve for prod apply |
| 15 | risk | inherit | risk | pass | PII; not security alone |
| 16 | no-owner | n/a | no-owner / blocked | pass | console-only |
| 17 | planner, backend, frontend, risk, tester, reviewer | inherit | planner order: backend + frontend + risk → tester → reviewer | pass | security only if auth (not required here) |
| 18 | risk | inherit | risk | pass | not security |
| 19 | devops | inherit | devops | pass | not infrastructure |
| 20 | backend, security | inherit | backend after security audit | pass | CVE remediations → backend |
| 21 | manager, frontend | inherit | manager → fast-path frontend (no planner) | pass | trivial single-owner |

**Summary:** 21/21 pass on dry-run against current manager/planner/AGENTS routing (default inherit models; #21 fast-path).
