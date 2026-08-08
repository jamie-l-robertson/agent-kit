---
name: perf-audit
description: >-
  Performance audit checklist for CWV, bundle size, caching, and query/N+1
  smells. Use for Lighthouse/bundle/query perf work. UI/CWV → frontend; server
  queries → backend. Prefer project commands via verify-evidence.
x-owner: agent-kit
---

# Perf audit

Prefer `AGENTS.md`. Load when the brief is perf-scoped.

## Checklist

- [ ] **CWV / UX**: LCP element, CLS sources, INP/long tasks (UI → frontend)
- [ ] **Bundle**: duplicate deps, oversized client imports, missing code-split
- [ ] **Caching**: cache headers / stale CDN / over-fetch on navigation
- [ ] **Queries**: N+1, missing indexes, over-select, unbounded lists (server → backend)
- [ ] **Waterfall**: serial awaits that could be parallel; blocking server round-trips

## Steps

1. Require a **named scope** and success metric when possible (LCP, bundle kB, query count).
2. Pick owner: UI/CWV/bundle/client → **`frontend`**; query/N+1/server → **`backend`**.
3. Find narrow commands from `AGENTS.md` / `package.json`.
4. Baseline; separate **pre-existing** vs introduced issues.
5. Prefer **verify-evidence**. Broad redesign → owning implementer; do not invent architecture.

## Findings shape

```text
Put severity list in JSON `findings`: <severity> — <path> — <metric/issue> — <why> — <fix|deferred>
```
