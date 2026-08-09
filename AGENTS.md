# Agent stack card

Quick reference for subagents. Prefer this over rediscovering the stack each run.

<!-- CUSTOMIZE: replace every placeholder below for the target project. -->

## Stack

- **App**: <!-- e.g. Next.js App Router + React + CMS -->
- **Database**: <!-- e.g. Postgres via DATABASE_URL -->
- **Package manager**: <!-- e.g. pnpm (lockfile) | npm | yarn | bun -->
- **UI**: <!-- e.g. SCSS modules | Tailwind | CSS modules -->
- **Design system**: <!-- repo path or https URL — e.g. `.agents/rules/design-system.md` — or n/a -->
- **Design system adherence**: <!-- strict | standard | loose — only when Design system is set; else n/a. Default if unset: standard -->
- **Frontend standards**: <!-- repo path or https URL — e.g. `docs/standards/frontend.md` — or n/a -->
- **Backend standards**: <!-- repo path or https URL — or n/a -->
- **API standards**: <!-- repo path or https URL — or n/a -->
- **Cloud platform**: <!-- aws | azure | gcp | multi | n/a -->
- **Cloud standards**: <!-- repo path or https URL — e.g. `.agents/rules/cloud-standards.md` — or n/a -->
- **DevOps standards**: <!-- repo path or https URL — e.g. `.agents/rules/devops-standards.md` — or n/a -->
- **Infrastructure standards**: <!-- repo path or https URL — e.g. `.agents/rules/infrastructure-standards.md` — or n/a -->
- **Security standards**: <!-- repo path or https URL — e.g. `.agents/rules/security-standards.md` — or n/a -->
- **Risk standards**: <!-- repo path or https URL — e.g. `.agents/rules/risk-standards.md` — or n/a -->
- **Standards MCP**: <!-- when any standards/design-system ref is a URL: MCP server id hint, e.g. notion | confluence | github — or n/a -->
- **Required MCP**: <!-- comma-separated server ids to prewarm, e.g. `github, notion, context7` — or `none` -->
- **Server**: <!-- e.g. collections/, server actions, API routes, server libs — see ownership -->
- **Rules**: always-on under `.agents/rules/` (TDD, Karpathy, Context7). Path-only stubs: design-system + `*-standards.md` when stack slots point there — not always-on.
- **Skills**: kit — `a11y-wcag`, `agent-memory`, `architecture-review`, `brief-hygiene`, `code-review`, `issue-intake`, `manager`, `perf-audit`, `setup`, `sync-project-skills`, `verify-evidence`; project — none. Inventory: `.agents/memory/skills-inventory.md`. Agent bodies compose `.agents/protocols/` at sync.

### Resolving Design system / standards refs

| Ref | How to load | Forbidden |
|-----|-------------|-----------|
| Repo path | Read from the workspace | — |
| `http(s)://…` URL | **MCP only** — discover/auth the doc MCP (see **Standards MCP** / **Required MCP**), then fetch | `curl`, `gh`, raw REST, WebFetch, browser, install scripts |
| `n/a` / empty / `<!-- … -->` | Skip | — |

URL + no suitable MCP after one auth attempt → `blocked` (name the MCP). Prefer vendoring standards as local paths when possible.

When **Design system** is a real ref, `frontend` loads it before UI work and `reviewer` checks UI diffs against it. **Design system adherence**:

| Value | Meaning |
|-------|---------|
| `strict` | Do not invent outside the system. New tokens/patterns/components → `needs-decision` unless the brief explicitly names the exception. |
| `standard` | Follow by default. Brief or settled decisions may override; note material deviations. |
| `loose` | Guide only; siblings + brief may diverge; summarize intentional deviations. |
| `n/a` | Use when **Design system** is `n/a`. |

**Who loads standards when set:** Frontend standards → `frontend` (+ `reviewer` on FE diffs). Backend standards → `backend` (+ `reviewer` on server diffs). API standards → `backend` and `frontend` when touching contracts (+ `reviewer`). Cloud standards → `infrastructure` + `devops` when platform-touched (+ `reviewer`). DevOps standards → `devops` (+ `reviewer`). Infrastructure standards → `infrastructure` (+ `reviewer`). Security standards → `security` (+ `reviewer`). Risk standards → `risk` (+ `reviewer`).

## Path ownership

| Paths | Owner |
|-------|--------|
| <!-- e.g. server libs, collections, API routes --> | `backend` |
| <!-- e.g. components, styles, pages --> | `frontend` |
| <!-- shared isomorphic utils — set Writable paths when both frontend and backend are in flight --> | **Shared** |

## Narrow commands

Detect the package manager from the lockfile. Prefer commands listed here over inventing new scripts.

| Intent | Command |
|--------|---------|
| Unit/int | <!-- e.g. pnpm test:int or pnpm exec vitest run <path> --> |
| E2E | <!-- e.g. pnpm test:e2e --> |
| A11y | <!-- e.g. pnpm test:a11y --> |
| Lint path | <!-- e.g. pnpm exec eslint <path> --> |
| Codegen / types | <!-- e.g. pnpm generate:types — or n/a --> |
| Full suite | <!-- e.g. pnpm test — only when explicitly asked --> |

For Playwright e2e/a11y (when used): attempt first; cold-start / blocked rules → **verify-evidence** (`.agents/skills/verify-evidence/SKILL.md`). Missing required env secrets listed below → blocked.

### Required env (for boots / e2e)

<!-- e.g. DATABASE_URL — or none -->

## No owner (tell the user)

Pure cloud-console DNS/secrets/ops with no IaC, CLI, or usable credentials — do not implement; tell the user. DNS-as-code / Terraform / secret-store automation → `infrastructure`. In-repo CI/workflows → `devops`. Auth/vulns audit → `security` (fixes via manager → owning implementer; lockfile/CVE bumps → `backend`). PII/compliance audit → `risk`. `reviewer` may flag incidental smells and route via Recommend next.

<!-- CUSTOMIZE: add project-specific no-owner zones here. -->

## Agents & routing

| Agent | Use for |
|-------|---------|
| `manager` | Orchestration, user Q&A, planner gap relay + plan approval before implementers (readonly); MCP prewarm |
| `planner` | Plans for multi-step / multi-domain / issue-backed / non-trivial managed work (plus direct plan-only asks); manager may fast-path trivial single-owner; gap scan + UI design exists/align/understanding check; architecture-review skill; MCP-only GitHub/Jira (+ children); manager-passed agent-memory (readonly); returns plan for manager→user approval |
| `frontend` | UI, layout, styling, motion; a11y-wcag + perf-audit skills |
| `backend` | CMS/schema, server actions, API, server libs; perf-audit for queries |
| `tester` | Tests, coverage, harness (no production fixes) |
| `reviewer` | Diff/code review (`audit-only`) via code-review skill; does not implement |
| `documenter` | Docs + agent-memory appends when briefed |
| `security` | Threats, auth, secrets-in-code, CVE hygiene (`audit-only`; manager routes fixes) |
| `devops` | CI workflows, in-repo deploy/Docker, pipeline env wiring |
| `infrastructure` | DNS-as-code, Terraform/Pulumi/CDK, cloud secret stores/automation |
| `risk` | PII, retention, data classification / compliance (`audit-only`; manager routes fixes) |

Dependency / lockfile / CVE **remediation** (after `security` audit) → `backend`. Auth product fixes may also go `backend` / `frontend` per ownership.

`manager` · `planner` · `frontend` · `backend` · `tester` · `reviewer` · `documenter` · `security` · `devops` · `infrastructure` · `risk` — canonical: `.agents/agents/` (synced to `.cursor/agents/`, `.claude/agents/`, `.github/agents/`). Optional per-agent `model:` in those files (kit default `inherit`); sync after edits. **Destructive** work requires brief `Human approve: granted`.

Call-graph gate: `.agents/hooks/` — hard deny of worker nesting on **Cursor** and **Claude Code**; **Copilot** is prompt policy only.

Routing regression drills: [`docs/agent-kit/routing-scenarios.md`](docs/agent-kit/routing-scenarios.md) (JSON twin for fixture CI).

## Memory

- Decisions: `.agents/memory/decisions.md` (product/design choices)
- MCP usage: `.agents/memory/mcp-usage.md` (server/tool/outcome only — not decisions)
- Skills inventory: `.agents/memory/skills-inventory.md` (from `node scripts/sync-project-skills.mjs`)
- Install keep-audit: `.agents/memory/install-audit.md` (when install kept project `AGENTS.md` / `CLAUDE.md`)
- Skill: `.agents/skills/agent-memory/SKILL.md`
- **manager** (readonly) reads only; **documenter** appends when briefed with `Writable paths` limited to the target log
