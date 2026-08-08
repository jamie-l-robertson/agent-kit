---
name: architecture-review
description: >-
  Boundaries, module structure, cross-cutting design tradeoffs, and ADR options.
  Use from planner (plans) or reviewer/documenter (smells / ADR prose). Does not
  implement product features.
---

# Architecture review

Prefer `AGENTS.md`. Apply **SOLID / DRY / KISS / YAGNI** — smallest clear boundaries, nothing speculative.

## Heuristics (check each)

1. **Boundary** — Who owns this module? Can callers skip the public API?
2. **Coupling** — New dependency direction? Circular imports? Shared bag of utils?
3. **Cohesion** — Is this one job or a grab-bag?
4. **Cross-cutting** — Auth, logging, PII, caching — is ownership explicit?
5. **Migration risk** — Big-bang vs strangler; data backfill; rollback story.
6. **YAGNI** — Speculative abstraction or premature platform?

## Steps

1. Name the decision or boundary under review.
2. List **2–4 options** with tradeoffs (cost, risk, reversibility); recommend a default when safe.
3. **Planner:** fold into Worker briefs (owners, order, Writable paths). Do not implement.
4. **Reviewer:** flag boundary smells; `recommendNext` to owners.
5. **ADR:** `documenter` — use the template below when recommending documentation.
6. Do not run product test suites as proof of architecture advice.

## Minimal ADR option template

```markdown
### ADR: <title>
- Status: proposed
- Context: <1–2 sentences>
- Options: A / B / C (tradeoffs)
- Decision: <recommended>
- Consequences: <follow-ups, owners>
```

Advice-only passes: JSON `changed: []`.
