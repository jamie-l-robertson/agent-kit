---
description: Test-driven development — failing test first, narrowest verify, never claim green without output
---

# TDD and testing

## Default workflow

1. **Specify behavior** — For new logic or bugfixes, write a **failing test first** (red), unless the change is purely cosmetic with no behavioral contract.
2. **Implement** — Minimal code to pass (green).
3. **Refactor** — Keep tests green.
4. **Verify** — Run the **narrowest** relevant command for touched files. Do **not** claim green without real output.

## Commands

Prefer the command table in `AGENTS.md` for this project. Detect the package manager from the lockfile (`pnpm-lock.yaml` → pnpm, `package-lock.json` → npm, `yarn.lock` → yarn, `bun.lockb`/`bun.lock` → bun).

Generic examples (replace with project scripts in `AGENTS.md`):

| Intent | Example |
| -------- | --------- |
| Narrow unit/int | `<pm> exec vitest run path/to/file.test.tsx` |
| Integration suite | `<pm> test:int` (or project equivalent) |
| E2E | `<pm> test:e2e` (or project equivalent) |
| A11y | `<pm> test:a11y` (or project equivalent) |
| Full suite | only when explicitly asked |

For Playwright e2e/a11y when the project uses them: follow **verify-evidence** (`.claude/skills/verify-evidence/SKILL.md`) for cold-start and blocked rules. Do not silently skip.

## Where to put tests

- Match siblings: colocated `*.test.ts(x)` next to modules, or `tests/int` / `tests/e2e` (or whatever the repo already uses).
- Assert user-visible behavior and public contracts; prefer accessibility queries over implementation details.
- Pure styling with no behavioral contract: do not invent class-name/snapshot tests.

## Agent expectations

- Never weaken tests (`.skip`, lingering `.only`, loosened asserts, blessed snapshots) to force green.
- Attribute pre-existing failures separately from those introduced by the change.
- Full-suite or full e2e runs only when the user/manager asks.
