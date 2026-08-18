---
name: issue-intake
description: >-
  MCP-only intake for GitHub Issues and Jira (parent + child tickets). Use when
  the planner (or manager) must ingest issue-backed work. Never use gh, curl,
  REST, WebFetch, or browser as fallback. Prefer manager MCP prewarm; report
  mcpUsed for manager mcp-usage batching.
x-owner: agent-kit
---

# Issue intake (MCP only)

Ingest GitHub / Jira sources into planning. **No CLI or HTTP fallbacks.**

## When to use

- Brief `Sources` includes `github` or `jira` (or legacy `Source` / `Source ref`).
- Manager expects child tickets checked before planning.

## Prerequisites

- **Ticket scope is enforced.** A `PreToolUse` hook checks every tracker MCP call against **Jira project key** / **GitHub repo** in `AGENTS.md` and denies anything outside them — and denies tracker calls outright while those fields are unset. A ref from another project is not something to work around: return `blocked` naming the ref, and let the manager ask the user whether to widen the scope.
- Prefer brief `MCP prewarmed: <servers>`. If empty, discover/auth once.
- Missing/disconnected MCP or auth failure after one attempt → `Status: blocked` (name the server). Do **not** use `gh`, Jira CLI, `curl`, WebFetch, or browser.

## Steps

1. **Discover** — MCP tool discovery for GitHub or Jira/Atlassian servers. Fetch schemas before calling.
2. **Auth** — If `needsAuth` or auth error: call that server’s `mcp_auth` (empty args) once, then retry. Do not loop.
3. **Fetch parent** — Smallest read that yields title, body, labels, status, comments/acceptance criteria.
4. **Fetch children** (one level only unless brief says otherwise):
   - **GitHub**: sub-issues / child issues / tracked-by (whatever the installed MCP exposes). Resolve `#n` / URLs listed as subtasks via MCP too.
   - **Jira**: subtasks and parent/child links. Fetch key, summary, status, acceptance points per child.
   - Completeness:
     - Lookup succeeded and empty → `Child tickets: none found`
     - No relationship capability and parent lists none → `Child tickets: unknown — relationship lookup unsupported` (note under Notes; `blocked` only if brief requires completeness)
     - Known child ref unreadable via MCP → `blocked` for that ref
5. **Cite** — Record `{type, ref, summary, children}` and acceptance points used.
6. **mcpUsed** — List meaningful calls under JSON `mcpUsed` (e.g. `<server>/<tool> — ok|auth-failed|error`) so the manager can batch to mcp-usage (no payloads/secrets).

## Priority vs pasted brief

If the brief also has pasted **Decisions already made** / **Related agent-memory** / **Constraints**, those win over the issue body.

## Multi-source

Fetch each ref via MCP (including children), merge into one plan, note conflicts under `Needs` / `Assumptions`.
