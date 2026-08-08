---
name: architecture-review
description: >-
  Boundaries, module structure, cross-cutting design tradeoffs, and ADR options.
  Use from planner (plans) or reviewer/documenter (smells / ADR prose). Does not
  implement product features.
---

# Architecture review

Prefer `AGENTS.md`. Apply **SOLID / DRY / KISS / YAGNI** — smallest clear boundaries, nothing speculative.

## Steps

1. Name the decision or boundary under review.
2. List options with tradeoffs; recommend a default when safe.
3. **Planner:** fold into Worker briefs (owners, order, Writable paths). Do not implement.
4. **Reviewer:** flag boundary smells; `Recommend next` to `frontend` / `backend` / `documenter` as appropriate.
5. **ADR / architecture docs:** `documenter` (or planner `Recommend next: documenter`) — do not have implementers write ADRs unless briefed.
6. Do not run product test suites as proof of architecture advice.

## Output notes

Keep `Changed: none` for advice-only passes. Point ADR paths explicitly when recommending documentation.
