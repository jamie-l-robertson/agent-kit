---
name: a11y-wcag
description: >-
  WCAG audit and surgical a11y remediation checklist. Use when fixing axe/a11y
  failures, focus order/traps, names/labels, ARIA, contrast via existing tokens,
  or skip links. Default bar WCAG 2.2 AA unless the brief says otherwise.
x-owner: agent-kit
---

# A11y / WCAG

Prefer `AGENTS.md`. Owner is usually **`frontend`** (fixes) or **`tester`** (harness only). Default bar **WCAG 2.2 AA** unless briefed otherwise.

## Checklist (triage)

- [ ] Keyboard: operable without mouse; no traps; visible focus
- [ ] Name/role/value: controls have accessible names; images alt or decorative
- [ ] Forms: labels, errors announced, required indicated
- [ ] Structure: headings/landmarks sensible; skip link if app shell
- [ ] Contrast: text/UI via existing tokens (new tokens → needs-decision)
- [ ] Motion: respect `prefers-reduced-motion` for motion you add
- [ ] Target size / reflow: no critical content loss at zoom/narrow widths
- [ ] Live regions: status/errors announced when dynamic

## Steps

1. Require a **named scope**. Whole-site audit without scope → `needs-decision`.
2. Map each issue to **WCAG id** + severity + location.
3. Mode omitted or audit ask → findings only. `implement` → surgical fixes only.
4. Prefer **verify-evidence** for a11y/e2e commands. Never claim AT verification you did not perform.
5. Harness/config/flake only → `tester`.

## Findings shape

```text
Put severity list in JSON `findings`: <severity> — <path> — <WCAG id> — <issue> — <fix|deferred>
```
