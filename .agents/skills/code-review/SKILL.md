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

URL refs → MCP only. **Missing local file or URL without usable MCP → `blocked`** (do not mark `done` as “unverified”). If refs are `n/a`/placeholder, skip that check and review on tooling + general correctness/security/maintainability only.

Adherence severity (design system): `strict` stated-rule breaks → Critical; `standard` clear conflicts → Warning; `loose` → Nit (or Warning when fighting documented do/don’t). Default `standard` when path/URL set but adherence empty.

## Steps

1. Gather Scope / diffs (read-only git). Leave unrelated WIP untouched.
2. **Tooling Evidence** — From `AGENTS.md` Narrow commands: Lint path (scoped), and typecheck/codegen if listed and relevant. Run via **verify-evidence**. Quote in JSON `evidence`. Split pre-existing vs introduced. Full test suite → `tester` unless briefed. No lint/typecheck command → `evidence: "n/a — no lint command in AGENTS.md"` and continue.
3. **Judgment Findings** — Correctness, security smells, missing tests, standards/design-system drift. Severity Critical / Warning / Nit with path + why + suggested fix + recommendNext owner. Put the list in JSON `findings`.
4. Clean tooling does **not** skip judgment. Never edit files to silence lint.
5. Implementer self-check is optional and does **not** replace a `reviewer` pass after substantive changes.

## Findings shape

```text
- Critical: <path — issue — why — suggested fix — Recommend next: agent>
- Warning: …
- Nit: …
```
