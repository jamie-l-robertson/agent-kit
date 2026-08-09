---
name: code-review
description: >-
  Diff/PR review checklist: run project lint/typecheck for Evidence, check
  available runtime/related logs as a metric, then judgment Findings against
  AGENTS.md standards refs. Use always from reviewer; optional implementer
  self-check. Readonly — never edit to silence tooling.
x-owner: agent-kit
---

# Code review

Prefer `AGENTS.md`. **`reviewer`** always loads this skill. Standards adherence is **inherited** from stack refs / the brief — this skill does not invent a parallel style guide.

## Standards (when defined)

Resolve when the diff touches that domain (same ref-resolution as implementers):

- **Design system** + **Design system adherence** (`strict` | `standard` | `loose`)
- **Frontend / Backend / API standards**
- **Cloud / DevOps / Infrastructure / Security / Risk standards** when reviewing those paths

URL refs → MCP only. **Missing local file or URL without usable MCP → `blocked`** (do not mark `done` as “unverified”). If refs are `n/a`/placeholder, skip that check and review on tooling + logs (when available) + general correctness/security/maintainability only.

Adherence severity (design system): `strict` stated-rule breaks → Critical; `standard` clear conflicts → Warning; `loose` → Nit (or Warning when fighting documented do/don’t). Default `standard` when path/URL set but adherence empty.

## Steps

1. Gather Scope / diffs (read-only git). Leave unrelated WIP untouched.
2. **Tooling Evidence** — From `AGENTS.md` Narrow commands: Lint path (scoped), and typecheck/codegen if listed and relevant. Run via **verify-evidence**. Quote in JSON `evidence`. Split pre-existing vs introduced. Full test suite → `tester` unless briefed. No lint/typecheck command → `evidence: "n/a — no lint command in AGENTS.md"` and continue.
3. **Logs metric** — Scan **available** logs tied to the implementation under review (do not invent a log-scraping stack). Prefer sources already on disk or already produced in-session, e.g.:
   - Current session terminals / recent command stderr/stdout (when present)
   - Worker/implementer JSON `evidence` / quoted run output already in the brief or thread
   - Project-documented log paths or local log files clearly related to Scope (e.g. app `logs/`, framework build logs) — docker/compose logs only if already running or the brief allows a read-only peek
   - CI failure logs when the brief or MCP already surfaces them (GitHub MCP — never `gh`/curl/WebFetch/browser fallback)
   Look for errors, stack traces, repeated warnings, auth/boot failures, and behavior that contradicts claimed Success or the diff. Promote log-backed issues into JSON `findings` (severity + path/component + short quote + suggested fix + `recommendNext`). Attribute pre-existing noise vs introduced by this change when possible. No usable logs → note `logs: n/a — none available` (or similar) in `evidence`; do **not** `blocked` solely for missing logs. Never claim green from logs you did not read; never edit logs; never paste secrets/PII — summarize.
4. **Judgment Findings** — Correctness, security smells, missing tests, standards/design-system drift (and any log-backed issues not already filed). Severity Critical / Warning / Nit with path + why + suggested fix + recommendNext owner. Put the list in JSON `findings`.
5. Clean tooling/logs do **not** skip judgment. Never edit files to silence lint.
6. Implementer self-check is optional and does **not** replace a `reviewer` pass after substantive changes.

## Findings shape

```text
- Critical: <path — issue — why — suggested fix — recommendNext: agent> (put severity list in JSON `findings`)
- Warning: …
- Nit: …
```
