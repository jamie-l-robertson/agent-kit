---
name: a11y-wcag
description: >-
  WCAG audit and surgical a11y remediation checklist. Use when fixing axe/a11y
  failures, focus order/traps, names/labels, ARIA, contrast via existing tokens,
  or skip links. Default bar WCAG 2.2 AA unless the brief says otherwise.
---

# A11y / WCAG

Prefer `AGENTS.md`. Owner is usually **`frontend`** (fixes) or **`tester`** (harness only).

## Steps

1. Require a **named scope**. Whole-site audit without scope → `needs-decision`.
2. Map each issue to **WCAG id** + severity + location.
3. Prefer existing design-system tokens for contrast; new tokens/layout redesign → note for frontend constraints / `needs-decision`.
4. Mode omitted or audit ask → findings only. `implement` → surgical fixes only.
5. Prefer **verify-evidence** (`.agents/skills/verify-evidence/SKILL.md`) for a11y/e2e commands. Never claim assistive-tech verification you did not perform.
6. Harness/config/flake only → owning agent is `tester`, not product UI rewrites.

## Findings shape

```text
Findings: <severity> — <path> — <WCAG id> — <issue> — <fix|deferred>
```
