---
name: browser-test
description: >-
  Browser smoke of UI changes: load affected routes/states, exercise the
  primary interaction, and capture pass/fail with real evidence. Use from
  frontend when verifying visual/functional UI work beyond unit tests. Prefer
  project Playwright / e2e / a11y commands from AGENTS.md; otherwise host
  browser tools (or agent-browser if available) for a narrow smoke only.
x-owner: agent-kit
---

# Browser test

Prefer `AGENTS.md` Narrow commands. Owner is usually **`frontend`** after UI implement. This skill owns **browser smoke of the change** — not WCAG remediation, not CWV/bundle, not how to quote evidence.

## Distinguishes from

| Skill | Owns |
|-------|------|
| **verify-evidence** | How to quote command output into JSON `evidence` / `verificationResult` |
| **a11y-wcag** | WCAG / axe remediation checklist |
| **perf-audit** | CWV, bundle, caching, query smells |
| **browser-test** (this) | Route loads, primary interaction, no console/page errors on the scoped path |

Always prefer **verify-evidence** when filling the worker-report fence after a smoke run.

## Checklist

- [ ] **Scope named**: routes / states / viewport tied to the change (not whole-site)
- [ ] **Loads**: affected URL(s) render expected primary UI (no blank/error shell)
- [ ] **Primary interaction**: one happy-path click/submit/nav that proves the change
- [ ] **Errors**: no new console errors or page-level crash for the scoped path
- [ ] **Evidence**: real command/tool output quoted via **verify-evidence** — never invent green

## Steps

1. Require a **named scope** (routes, states, or components under change). Whole-app browse without scope → `needs-decision`.
2. Pick the runner — **do not invent a new test stack**:
   - Prefer `AGENTS.md` Narrow commands: **E2E** / **A11y** (Playwright or project equivalent), narrowed to the changed surface when the harness allows.
   - If those slots are `n/a`, empty, or placeholders → use Claude Code / host **browser** tools, or **agent-browser** when available, for a **narrow** smoke of the scoped path only.
   - Missing required boot env / secrets from `AGENTS.md` → `blocked` (quote under `evidence`).
3. Smoke only what changed: load → primary interaction → check console/page errors for that path. Skip unrelated suites unless the brief asks.
4. Record results with **verify-evidence** (`.claude/skills/verify-evidence/SKILL.md`): exact command or tool steps, exit/pass-fail, short quote in JSON `evidence`; set `verificationResult`.
5. Harness/config/flake only → `tester`. WCAG product fixes → **a11y-wcag**. Perf metrics → **perf-audit**.

## Evidence shape

```text
<e2e|a11y|browser-tool> <scope> → exit <n> / pass|fail — "<short quote>"
```

Playwright cold-start / blocked rules → follow **verify-evidence** (~180s `webServer`; do not treat an early tool return as boot failure).

## Do not

- Invent green from memory, screenshots you did not capture, or prior sessions
- Add a new e2e framework or deps without `needs-decision`
- Substitute unit tests or lint for a required browser smoke when Success named UI verification
- Expand into full-suite e2e/a11y unless briefed (prefer narrow path)
