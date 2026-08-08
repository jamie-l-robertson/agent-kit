# Kit-required append blocks

Copy-paste these into an existing project `AGENTS.md` / `CLAUDE.md` when install **kept** the project file. Setup skill offers only the blocks that are still missing.

**Keep in sync with kit `AGENTS.md` / `CLAUDE.md`** — prefer copying the matching section from those files rather than inventing shorter rows.

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
- **Skills**: kit — (run `node scripts/sync-project-skills.mjs` after append); project — none until inventory sync. Inventory: `.agents/memory/skills-inventory.md`. Agent bodies compose `.agents/protocols/` at sync.
```

---

## AGENTS.md — Resolving Design system / standards refs

Paste from kit `AGENTS.md` section **### Resolving Design system / standards refs** (ref table + adherence meanings + who-loads). Do not invent a shorter twin — copy that section verbatim so adherence/`strict` meanings cannot drift.

---

## AGENTS.md — Agents & routing

Paste from kit `AGENTS.md` section **## Agents & routing** (full table including `manager`, audit-only `security`/`risk`, gate + routing drills note). Keep identical to the kit stack card. That section includes: **Destructive** work requires brief `Human approve: granted`.

---

## AGENTS.md — Memory

```markdown
## Memory

- Decisions: `.agents/memory/decisions.md` (product/design choices)
- MCP usage: `.agents/memory/mcp-usage.md` (server/tool/outcome only — not decisions)
- Skills inventory: `.agents/memory/skills-inventory.md` (from `node scripts/sync-project-skills.mjs`)
- Install keep-audit: `.agents/memory/install-audit.md` (when install kept project `AGENTS.md` / `CLAUDE.md`)
- Skill: `.agents/skills/agent-memory/SKILL.md`
- **manager** (readonly) reads only; **documenter** appends when briefed with `Writable paths` limited to the target log
```

---

## AGENTS.md — No owner

Append under `## No owner` if missing (replace older “security has no specialist” wording):

```markdown
Pure cloud-console DNS/secrets/ops with no IaC, CLI, or usable credentials — do not implement; tell the user. DNS-as-code / Terraform / secret-store automation → `infrastructure`. In-repo CI/workflows → `devops`. Auth/vulns audit → `security` (fixes via manager → owning implementer; lockfile/CVE bumps → `backend`). PII/compliance audit → `risk`. `reviewer` may flag incidental smells and route via Recommend next.
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
Skills inventory (setup runs this): `node scripts/sync-project-skills.mjs` / `--check`.
```
