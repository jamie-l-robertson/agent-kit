---
name: code-review
description: >-
  Diff/PR review checklist: run project lint/typecheck for Evidence, then
  judgment Findings against AGENTS.md standards refs. Use always from reviewer;
  optional implementer self-check. Readonly — never edit to silence tooling.
---

# Code review

Prefer `AGENTS.md`. **`reviewer`** always loads this skill. Standards adherence is **inherited** from stack refs / the brief — this skill does not invent a parallel style guide.

## Standards (when defined)

Resolve when the diff touches that domain (same ref-resolution as implementers):

- **Design system** + **Design system adherence** (`strict` | `standard` | `loose`)
- **Frontend / Backend / API standards**
- **Cloud / DevOps / Infrastructure / Security / Risk standards** when reviewing those paths

URL refs → MCP only. Missing MCP → `blocked` or Findings that standards were unverified — never curl/`gh`/WebFetch. If refs are `n/a`, review on tooling + general correctness/security/maintainability only.

Adherence severity (design system): `strict` stated-rule breaks → Critical; `standard` clear conflicts → Warning; `loose` → Nit (or Warning when fighting documented do/don’t).

## Steps

1. Gather Scope / diffs (read-only git). Leave unrelated WIP untouched.
2. **Tooling Evidence** — From `AGENTS.md` Narrow commands: Lint path (scoped), and typecheck/codegen if listed and relevant. Run via **verify-evidence** (`.agents/skills/verify-evidence/SKILL.md`). Quote commands + exit + short quote. Split pre-existing vs introduced. Full test suite → `tester` unless briefed. No lint/typecheck command → `Evidence: n/a — no lint command in AGENTS.md` and continue.
3. **Judgment Findings** — Correctness, security smells, missing tests, standards/design-system drift against loaded refs. Severity Critical / Warning / Nit with path + why + suggested fix + `Recommend next`.
4. Clean tooling does **not** skip judgment. Never edit files to silence lint.
5. Implementer self-check is optional and does **not** replace a `reviewer` pass after substantive changes.

## Findings shape

```text
Findings:
- Critical: <path — issue — why — suggested fix — Recommend next: agent>
- Warning: …
- Nit: …
```
