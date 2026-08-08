# Agent stack card

Quick reference for subagents. Prefer this over rediscovering the stack each run.

<!-- CUSTOMIZE: replace every placeholder below for the target project. -->

## Stack

- **App**: <!-- e.g. Next.js App Router + React + CMS -->
- **Database**: <!-- e.g. Postgres via DATABASE_URL -->
- **Package manager**: <!-- e.g. pnpm (lockfile) | npm | yarn | bun -->
- **UI**: <!-- e.g. SCSS modules | Tailwind | CSS modules -->
- **Server**: <!-- e.g. collections/, server actions, API routes, server libs — see ownership -->
- **Rules**: also see `.agents/rules/` (TDD, Karpathy guidelines, Context7 API validation) — synced to Cursor / Claude / Copilot adapters

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

For Playwright e2e/a11y (when used): attempt the run first (`webServer` can start the dev server; allow ~180s cold start). Reserve blocked for failed boot, auth, or missing required env secrets listed below.

### Required env (for boots / e2e)

<!-- e.g. DATABASE_URL — or none -->

## No owner (tell the user)

`.github/workflows/**`, production DNS/secrets provisioning, ad-hoc infra, and perf/Lighthouse — do not implement without an explicit specialist or user direction.

<!-- CUSTOMIZE: add project-specific no-owner zones here. -->

## Agents & routing

| Agent | Use for |
|-------|---------|
| `manager` | Orchestration, user Q&A, decision loop (readonly) |
| `planner` | Plans for multi-step / multi-domain / issue-backed work; MCP-only GitHub/Jira (+ children); manager-passed agent-memory (readonly) |
| `frontend` | UI components, layout, styling, motion |
| `backend` | CMS/schema, server actions, API, server libs |
| `accessibility` | WCAG audits/fixes, axe failures |
| `tester` | Tests, coverage, harness (no production fixes) |
| `reviewer` | Diff/code review (`audit-only`); does not implement |
| `documenter` | Docs + agent-memory appends when briefed |

`manager` · `planner` · `frontend` · `backend` · `accessibility` · `tester` · `reviewer` · `documenter` — canonical: `.agents/agents/` (synced to `.cursor/agents/`, `.claude/agents/`, `.github/agents/`).

Call-graph gate: `.agents/hooks/` — hard deny of worker nesting on **Cursor** and **Claude Code**; **Copilot** is prompt policy only.

## Memory

- Log: `.agents/memory/decisions.md`
- Skill: `.agents/skills/agent-memory/SKILL.md`
- **manager** (readonly) reads only; **documenter** appends when briefed with `Writable paths` limited to the log
