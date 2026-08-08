# Kit-required append blocks

Copy-paste these into an existing project `AGENTS.md` / `CLAUDE.md` when install **kept** the project file. Setup skill offers only the blocks that are still missing.

Keep in sync with kit `AGENTS.md` / `CLAUDE.md` templates.

---

## AGENTS.md — Stack additions (merge under `## Stack`)

```markdown
- **Design system**: <!-- repo path or https URL — e.g. `.agents/rules/design-system.md` — or n/a -->
- **Design system adherence**: <!-- strict | standard | loose — only when Design system is set; else n/a. Default if unset: standard -->
- **Frontend standards**: <!-- repo path or https URL — e.g. `docs/standards/frontend.md` — or n/a -->
- **Backend standards**: <!-- repo path or https URL — or n/a -->
- **API standards**: <!-- repo path or https URL — or n/a -->
- **Cloud platform**: <!-- aws | azure | gcp | multi | n/a -->
- **Cloud standards**: <!-- repo path or https URL — e.g. `.agents/rules/cloud-standards.md` — or n/a -->
- **DevOps standards**: <!-- repo path or https URL — or n/a -->
- **Infrastructure standards**: <!-- repo path or https URL — or n/a -->
- **Security standards**: <!-- repo path or https URL — or n/a -->
- **Risk standards**: <!-- repo path or https URL — or n/a -->
- **Standards MCP**: <!-- when any standards/design-system ref is a URL: MCP server id hint, e.g. notion | confluence | github — or n/a -->
- **Required MCP**: <!-- comma-separated server ids to prewarm, e.g. `github, notion, context7` — or `none` -->
- **Rules**: always-on under `.agents/rules/` (TDD, Karpathy, Context7). Path-only stubs: design-system + `*-standards.md` when stack slots point there — not always-on.
- **Skills**: `.agents/skills/setup`, `agent-memory`, `brief-hygiene`, `verify-evidence`, `issue-intake`, `a11y-wcag`, `perf-audit`, `architecture-review`, `code-review` (each has `SKILL.md`). Agent bodies compose `.agents/protocols/` at sync.
```


---

## AGENTS.md — Resolving Design system / standards refs

```markdown
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

**Who loads standards when set:** Frontend standards → `frontend` (+ `reviewer` on FE diffs). Backend standards → `backend` (+ `reviewer` on server diffs). API standards → `backend` and `frontend` when touching contracts (+ `reviewer`). Cloud / DevOps / Infrastructure / Security / Risk standards → owning specialist (+ `reviewer` on matching diffs).
```

---

## AGENTS.md — Agents & routing

```markdown
## Agents & routing

| Agent | Use for |
|-------|---------|
| `manager` | Orchestration, user Q&A, decision loop (readonly); MCP prewarm |
| `planner` | Plans; architecture-review skill; MCP-only GitHub/Jira (+ children); manager-passed agent-memory |
| `frontend` | UI; a11y-wcag + perf-audit skills |
| `backend` | CMS/schema, API, server libs; perf-audit for queries |
| `tester` | Tests, coverage, harness (no production fixes) |
| `reviewer` | Diff/code review (`audit-only`) via code-review skill |
| `documenter` | Docs + agent-memory appends when briefed |
| `security` | Threats, auth, secrets-in-code, CVE hygiene |
| `devops` | CI workflows, in-repo deploy/Docker, pipeline env wiring |
| `infrastructure` | DNS-as-code, Terraform/Pulumi/CDK, cloud secret stores/automation |
| `risk` | PII, retention, data classification / compliance |

`manager` · `planner` · `frontend` · `backend` · `tester` · `reviewer` · `documenter` · `security` · `devops` · `infrastructure` · `risk` — canonical: `.agents/agents/` (synced to `.cursor/agents/`, `.claude/agents/`, `.github/agents/`).

Call-graph gate: `.agents/hooks/` — hard deny of worker nesting on **Cursor** and **Claude Code**; **Copilot** is prompt policy only.

Routing drills: `docs/routing-scenarios.md`.
```


---

## AGENTS.md — Memory

```markdown
## Memory

- Log: `.agents/memory/decisions.md`
- Install keep-audit: `.agents/memory/install-audit.md` (when install kept project `AGENTS.md` / `CLAUDE.md`)
- Skill: `.agents/skills/agent-memory/SKILL.md`
- **manager** (readonly) reads only; **documenter** appends when briefed with `Writable paths` limited to the log
- MCP calls that matter are logged via manager → documenter (server/tool/outcome only — no secrets or payloads)
```

---

## AGENTS.md — No owner

Append under `## No owner` if missing (replace older “security has no specialist” wording):

```markdown
Pure cloud-console DNS/secrets/ops with no IaC, CLI, or usable credentials — do not implement; tell the user. DNS-as-code / Terraform / secret-store automation → `infrastructure`. In-repo CI/workflows → `devops`. Auth/vulns → `security`. PII/compliance → `risk`. `reviewer` may flag incidental smells and route via Recommend next.
```


---

## CLAUDE.md — full kit entrypoint (if file is missing kit sections)

```markdown
# Claude Code — agent kit

Follow the stack card in `AGENTS.md` for package manager, ownership, and narrow commands.

## Always-on rules

Read and apply these project rules (also mirrored under `.cursor/rules/` and `.github/instructions/`):

- `.agents/rules/context7-api-validation.md`
- `.agents/rules/karpathy-guidelines.md`
- `.agents/rules/tdd-testing.md`

## Agents & skills

- Specialists: `.claude/agents/` (synced from `.agents/agents/`)
- Skills: `.claude/skills/` (synced from `.agents/skills/`)
- Decision log: `.agents/memory/decisions.md`
- Call-graph gate: `.claude/settings.json` → `.agents/hooks/adapters/claude.mjs` (workers cannot nest)

After editing canonical sources under `.agents/`, run `node scripts/sync-tool-adapters.mjs`.
Drift check: `node scripts/sync-tool-adapters.mjs --check`.
```
