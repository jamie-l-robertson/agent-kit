---
name: perf-audit
description: >-
  Performance audit checklist for CWV, bundle size, caching, and query/N+1
  smells. Use for Lighthouse/bundle/query perf work. UI/CWV → frontend; server
  queries → backend. Prefer project commands via verify-evidence.
---

# Perf audit

Prefer `AGENTS.md`. Load when the brief is perf-scoped.

## Steps

1. Require a **named scope** and success metric when possible (LCP, bundle kB, query count).
2. Pick owner: UI/CWV/bundle/client caching → **`frontend`**; query/N+1/server runtime → **`backend`**.
3. Find narrow commands from `AGENTS.md` / `package.json` (perf, lighthouse, bundle analyze).
4. Baseline; separate **pre-existing** vs introduced issues.
5. Audit or implement per Mode. Prefer **verify-evidence** (`.agents/skills/verify-evidence/SKILL.md`).
6. Broad product redesign → stay in owning implementer; do not invent new architecture.

## Findings shape

```text
Findings: <severity> — <path> — <metric/issue> — <why> — <fix|deferred>
```
