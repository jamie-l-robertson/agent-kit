---
name: brief-hygiene
description: >-
  Manager checklist before dispatching workers: Mode, Human approve, Model,
  memory paste, Verify with, design system, standards refs, MCP prewarmed,
  Writable paths when parallel. Use when the manager (or planner emitting Worker
  briefs) is about to dispatch. Owns the canonical brief template.
x-owner: agent-kit
---

# Brief hygiene

Fill every field that applies before dispatch. Prefer planner Worker briefs **unchanged** when available (manager may fill missing `Model:` / `Human approve`). Manager and planner **link here** — do not redefine fields elsewhere.

## Canonical brief template

```
Task: <imperative goal>
Mode: audit-only | implement | verify-only | document
Model: <from .agents/agents/<name>.md, or inherit>
Success: <checkable outcomes>
Scope: <paths>
Writable paths: <optional>
Out of scope: <explicit>
Decisions already made: <… or none>
Related agent-memory: <anchors or none>
Verify with: <narrow command or n/a>
Design system: <path|URL|n/a>
Design system adherence: <strict|standard|loose|n/a>
Frontend / Backend / API standards: <each path|URL|n/a>
Cloud platform: <aws|azure|gcp|multi|n/a>
Cloud / DevOps / Infrastructure / Security / Risk standards: <each or n/a>
Human approve: <granted|n/a>
Approved destructive action: <command/env/resource or n/a>
MCP prewarmed: <ids or none>
Ticket / Depends: <optional>
Constraints: <…>
Report format: JSON worker-report fence (canonical) + short prose summary
```

Planner Source briefs may add `Sources:` (see planner). Never brief `security` / `risk` with `Mode: implement`.

## Required checklist

```
Brief hygiene:
- [ ] Task + Success checkable (behavior, command, or artifact)
- [ ] Mode set (never omit; never assume implement)
- [ ] Model set (from .agents/agents/<name>.md, default inherit)
- [ ] Human approve: granted | n/a (required on every implement brief; granted for destructive)
- [ ] Scope / Out of scope / Constraints concrete
- [ ] Decisions already made + Related agent-memory: pasted anchors/titles or explicit none
- [ ] Verify with: narrow command from AGENTS.md or n/a
- [ ] Report format: JSON worker-report fence
- [ ] Design system + adherence when UI/review and AGENTS.md has a real ref
- [ ] Frontend / Backend / API standards when domain work and refs are real
- [ ] Cloud platform + Cloud/DevOps/Infrastructure/Security/Risk standards when ops work
- [ ] MCP prewarmed: server ids or none
- [ ] Writable paths when parallel, dirty WIP, or shared libs
- [ ] Ticket / Depends when issue-backed or sequenced
- [ ] No curl/gh/WebFetch/browser instructions for URL standards or issues
```

## Field meanings

| Field | Rule |
|-------|------|
| `Task` / `Success` | Imperative goal; Success must be checkable. |
| `Mode` | Never omit. Never assume `implement`. |
| `Model` | Canonical `model:` from `.agents/agents/<name>.md`. |
| `Human approve` | `n/a` for non-destructive; `granted` required before destructive work. Definition: `.agents/protocols/human-approve.md`. |
| `Approved destructive action` | When `Human approve: granted`, name the exact action/env/resource (not a blanket grant). |
| `Decisions already made` | Settled choices for this task (or `none`). |
| `Related agent-memory` | Always set on planner, implementer, reviewer. Explicit `none` = do not re-scan. |
| `Constraints` | Hard limits (paths, deps, copy, time). |
| `Verify with` | Narrowest command from `AGENTS.md` / `package.json`, or `n/a`. |
| `Report format` | JSON worker-report fence (canonical) + short prose summary. |
| `MCP prewarmed` | Servers manager already discovered/authed. |
| `Writable paths` | Required when parallel workers, dirty WIP, or Shared ownership. |

## Anti-patterns

- Re-summarizing a planner brief into a thinner one
- Omitting memory because “the worker can read the log”
- Omitting Human approve on implement briefs
- Briefing `security` / `risk` with `Mode: implement`
- Instructing URL fetch via curl, `gh`, WebFetch, or browser
- Dispatching MCP-dependent work when Required MCP failed prewarm
