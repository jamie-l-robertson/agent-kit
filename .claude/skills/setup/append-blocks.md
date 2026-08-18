# Kit-required append blocks

When install **kept** a project's own `AGENTS.md` / `CLAUDE.md`, the kit-required
sections are missing from it. This lists which sections to merge and where they
come from. Setup offers only the blocks that are still missing.

**Every block is a pointer, never a copy.** Read the named section out of the
source file and show it to the user fenced. A pasted twin here would drift from
the real file — it did before, and the copy quietly lost the `researcher`
routing line and the whole `## Routing` section of `CLAUDE.md`, including the
"never pass `name`" warning. Read the source; do not retype it.

| Block | Source | Section |
|-------|--------|---------|
| Stack additions | `.claude/skills/setup/AGENTS.template.md` | `## Stack` — merge the bullets the project lacks (design system, standards refs, Cloud platform, Standards/Required MCP, Rules, Skills) |
| Resolving refs | `.claude/skills/setup/AGENTS.template.md` | `### Resolving Design system / standards refs` — copy whole, so adherence/`strict` meanings cannot drift |
| Agents & routing | `.claude/skills/setup/AGENTS.template.md` | `## Agents & routing` — full table incl. `manager`, audit-only `security`/`risk`, gate + routing drills note, and the `Human approve: granted` line |
| Memory | `.claude/skills/setup/AGENTS.template.md` | `## Memory` — covers `decisions.md`, `mcp-usage.md`, `tasks.md`, `skills-inventory.md`, `install-audit.md`, and who may write each |
| No owner | `.claude/skills/setup/AGENTS.template.md` | `## No owner (tell the user)` — replaces any older "security has no specialist" wording |
| CLAUDE.md entrypoint | `CLAUDE.md` | whole file — `## Always-on rules`, `## Routing`, `## Agents & skills` |

## Notes

- `.claude/skills/setup/AGENTS.template.md` is the card shipped to projects. The kit's own root
  `AGENTS.md` is filled in for kit development — never offer that one.
- The **Skills** line is generated. After appending, run
  `node scripts/sync-project-skills.mjs` rather than hand-writing it.
- Prefer append-at-end or insert under the matching heading. Never delete
  project content unless the user explicitly asks to replace
  (`--force` / "overwrite with kit template").
