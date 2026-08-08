---
name: brief-hygiene
description: >-
  Manager checklist before dispatching workers: Mode, memory paste, Verify with,
  design system, standards refs, MCP prewarmed, Writable paths when parallel.
  Use when the manager (or planner emitting Worker briefs) is about to dispatch.
---

# Brief hygiene

Fill every field that applies before dispatch. Prefer planner Worker briefs **unchanged** when available.

## Required checklist

Copy and tick:

```
Brief hygiene:
- [ ] Mode set (never omit; never assume implement)
- [ ] Success checkable (behavior, command, or artifact)
- [ ] Scope / Out of scope concrete
- [ ] Related agent-memory: pasted anchors/titles or explicit none
- [ ] Verify with: narrow command from AGENTS.md or n/a
- [ ] Design system + adherence when UI/review and AGENTS.md has a real ref
- [ ] Frontend / Backend / API standards refs when domain work and refs are real
- [ ] MCP prewarmed: server ids or none
- [ ] Writable paths when parallel, dirty WIP, or shared libs
- [ ] Ticket / Depends when issue-backed or sequenced
- [ ] No curl/gh/WebFetch/browser instructions for URL standards or issues
```

## Field meanings

| Field | Rule |
|-------|------|
| `Related agent-memory` | Always set on **planner**, implementer, and reviewer briefs. Explicit `none` = do not re-scan the log. |
| `Verify with` | Narrowest command from `AGENTS.md` / `package.json`, or `n/a`. |
| `Design system` | Path or URL from `AGENTS.md`, or `n/a`. URL → MCP only. |
| `Design system adherence` | `strict` \| `standard` \| `loose` \| `n/a`. |
| Standards refs | Matching FE/BE/API slots when set in `AGENTS.md`. |
| `MCP prewarmed` | Servers manager already discovered/authed for this task. |
| `Writable paths` | Required when parallel workers, unrelated dirty WIP, or Shared ownership paths. |

## Anti-patterns

- Re-summarizing a planner brief into a thinner one
- Omitting memory because “the worker can read the log”
- Instructing URL fetch via curl, `gh`, WebFetch, or browser
- Dispatching MCP-dependent work when Required MCP failed prewarm
