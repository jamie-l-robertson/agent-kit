---
name: setup
description: >-
  Interactive setup for this multi-tool agent kit. Detects missing or placeholder
  values in AGENTS.md, infers stack details from the repo when possible, then
  questions the user one field at a time and writes a filled AGENTS.md. Use when
  AGENTS.md still has CUSTOMIZE/placeholder comments, after copying the kit into
  a project, or when the user asks to set up, customize, or configure the agent
  stack card.
x-owner: agent-kit
---

# Agent kit setup (AGENTS.md)

Fill the stack card so specialists stop rediscovering the project. Prefer this over leaving `<!-- e.g. ... -->` placeholders.

## When to run

Run immediately when any of these are true:

1. User asks to set up / customize / configure the kit or `AGENTS.md`.
2. `AGENTS.md` still contains `CUSTOMIZE`, `<!-- e.g.`, or empty required cells.
3. You are about to use stack/commands/ownership from `AGENTS.md` and those fields are still placeholders — pause and run this skill first (or tell the user the card is incomplete).

Do **not** invent stack facts. Infer from the repo, then ask.

**Do not** fetch standards/design-system URLs during setup via curl, `gh`, WebFetch, or browser. Record the URL and optional MCP hint only.

## Workflow

Copy and track:

```
Setup progress:
- [ ] 0. Existing AGENTS.md / CLAUDE.md — offer append blocks if project-owned
- [ ] 1. Scan AGENTS.md + repo
- [ ] 2. Confirm inferred defaults
- [ ] 3. Stack fields (incl. design system + standards + MCP)
- [ ] 4. Path ownership
- [ ] 5. Narrow commands
- [ ] 6. Required env + no-owner
- [ ] 7. Optional agent model overrides
- [ ] 8. Write AGENTS.md
- [ ] 9. Sync project skills inventory (required)
- [ ] 10. Post-setup checks
```

### 0. Existing AGENTS.md / CLAUDE.md (project-owned)

If `.claude/memory/install-audit.md` has `kept-project` for `AGENTS.md` / `CLAUDE.md`, **or** kit-required sections are missing:

**AGENTS.md kit sections (check these):** `### Resolving Design system / standards refs`, `## Agents & routing`, `## Memory`, Stack bullet `**Skills**:` (not a heading), `## No owner`.  
**CLAUDE.md kit sections:** `## Always-on rules`, Agents & skills / sync notes (see append-blocks). Do **not** require an AGENTS heading named “Always-on rules” or “Skills”.

1. Tell the user clearly: the project is using **its own** file(s); kit-required sections may be missing and must be **appended** (not silently overwritten).
2. Read [`.claude/skills/setup/append-blocks.md`](append-blocks.md). For each missing block, show the fenced copy-paste content and ask them to paste — or confirm you may append with their permission.
3. Prefer append-at-end / insert under the right heading. Never delete project content unless they explicitly ask to replace (`--force` / “overwrite with kit template”).

### 1. Scan

Read `AGENTS.md`. List every field that is still a placeholder or empty. Also note missing kit-required sections from step 0.

Then explore the repo (do not ask what you can detect):

| Signal | Infer |
|--------|--------|
| `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` / `bun.lock` / `bun.lockb` | Package manager |
| `package.json` `scripts` | Unit/int, e2e, a11y, lint, codegen, full test commands |
| `app/`, `src/app/`, `pages/`, Next/Expo/Vite config | App framework |
| CSS/Tailwind/SCSS layout | UI approach |
| ORM/CMS/DB client config, `DATABASE_URL` in `.env.example` | Database / server shape |
| Directory layout | Likely frontend vs backend path ownership |
| `.env.example` / `.env*.example` **names only** | Required env **names** (never values) |
| `docs/standards/{frontend,backend,api}.md` or similar | Standards local paths |
| `.claude/rules/design-system.md` or `docs/design-system.md` | Design system path candidate |

Never read or store secret values from `.env`.

### 2. Questioning rules

- Ask **one question at a time**. Wait for the answer before the next.
- For each question: state what you inferred (if anything), your **recommended** answer, and a short why.
- Accept “skip” / “n/a” for optional rows (e.g. A11y, Codegen, Database, standards).
- If the user gives a partial answer, confirm the exact string you will write into `AGENTS.md`.
- Batch only when the user explicitly says “fill the rest from your recommendations”.

### 3. Field order

Ask only for fields still missing after inference. Suggested order:

1. **App** — framework + major mode (e.g. Next.js App Router + React)
2. **Database** — or `none` / `n/a`
3. **Package manager** — confirm lockfile detection
4. **UI** — styling system
5. **Design system** — repo path or `https://` URL, or `n/a`. Prefer an existing project doc with real content. Kit stub `.claude/rules/design-system.md` is empty headings only — **default `n/a`** until the stub (or another file) has substantive content. If URL: do not fetch it; note workers need MCP.
6. **Design system adherence** — only if Design system is a real ref: `strict` | `standard` | `loose` (recommend `standard`). If Design system is `n/a`, write `n/a`.
7. **Frontend standards** — path, URL, or `n/a` (infer `docs/standards/frontend.md` if present and non-empty)
8. **Backend standards** — path, URL, or `n/a`
9. **API standards** — path, URL, or `n/a`
10. **Cloud platform** — `aws` | `azure` | `gcp` | `multi` | `n/a` (infer from `*.tf` / Pulumi / CDK / Bicep when possible)
11. **Cloud / DevOps / Infrastructure / Security / Risk standards** — each path, URL, or `n/a`. Untouched kit stubs under `.claude/rules/*-standards.md` (empty headings) → write **`n/a`**, do not point stack slots at empty stubs.
12. **Standards MCP** — if any standards/design-system ref is a URL: MCP server id hint (e.g. `notion`, `confluence`, `github`) or `unknown` (workers `blocked` until MCP exists). Else `n/a`.
13. **Required MCP** — comma-separated server ids to prewarm (e.g. `github, notion, context7`) or `none`. Include Standards MCP + issue trackers the team uses.
14. **Server** — where server logic lives (paths or pattern)
15. **Path ownership** — backend paths, frontend paths, shared paths (table rows)
16. **Narrow commands** — Unit/int → E2E → A11y → Lint path → Codegen / types → Full suite
   Prefer real scripts from `package.json`. Use `n/a` when unused.
17. **Required env** — names needed for boots/e2e, or `none`
18. **No owner** — keep kit defaults unless the user adds project-specific zones
19. **Agent models (optional)** — kit default is `inherit` on every `.claude/agents/<name>.md`. Ask if the project wants any per-agent pins (picker-available slugs only). Skip keeps all `inherit`. If pinning: edit those agents’ `model:` frontmatter, then `node scripts/sync-tool-adapters.mjs`.

Keep the fixed sections (**Rules**, **Agents & routing**, **Memory**, call-graph note, ref-resolution table) unless the user asks to change agents.

### 4. Write

Update `AGENTS.md` in place:

- Replace every `<!-- e.g. ... -->` / `CUSTOMIZE` placeholder you filled.
- Remove the top `<!-- CUSTOMIZE: replace every placeholder... -->` once required fields are done.
- Keep structure, headings, and agent routing table intact.
- Do not invent commands that are not in the repo unless the user explicitly provided them.
- Do not invent company standards content; only store refs.

Show a short diff summary of what changed; offer one follow-up edit pass if something looks wrong.

### 5. Sync project skills inventory (required)

**Do not skip.** After writing `AGENTS.md`, always run:

```bash
node scripts/sync-project-skills.mjs
```

Follow **sync-project-skills** (`.claude/skills/sync-project-skills/SKILL.md`). On success, report kit vs project skill counts in the setup summary. On failure → fix and re-run; do not mark setup Done.

This updates the **Skills** line and writes `.claude/memory/skills-inventory.md` (non-destructive; never deletes skill dirs).

### 6. Post-setup checks (brief)

After skills sync, **always** run:

```bash
node scripts/check-agent-kit.mjs
```

That covers adapter drift (Claude), skills inventory, Claude gate smoke, and validator. Fix failures before Done.

Also verify/report:

1. `.gitignore` ignores `.claude/hooks/state/`.
2. Worker names in `.claude/hooks/gate-core.mjs` (`WORKERS`) match `.claude/agents/*.md` basenames (excluding `manager`) — see `docs/agent-kit/routing-scenarios.md` specialist-cap.
3. If you edited `.claude/` (agents/skills/hooks/rules), run `node scripts/sync-tool-adapters.mjs --check` / `node scripts/sync-project-skills.mjs` before commit, then **commit** `.claude/`.
4. Remind: Context7 / other **Required MCP** must be installable for prewarm.
5. Point the user at `.claude/protocols/context-practices.md` — `/clear` between unrelated tasks, `/compact focus on …` mid-task, `/context` to diagnose. Do **not** bake compaction settings into the project; they are the user's call.

## Done criteria

- No `CUSTOMIZE` / `<!-- e.g.` placeholders remain in required Stack, ownership, commands, or Required env sections (optional rows may be `n/a`).
- Package manager and commands match the lockfile / `package.json` unless the user overrode them.
- Standards/design-system URLs (if any) have a Standards MCP hint or explicit `unknown` / risk acknowledged.
- `node scripts/sync-project-skills.mjs` succeeded; inventory file exists; **Skills** line is current.
- User got a concise “ready to use” confirmation with kit vs project skill counts and any remaining optional gaps called out.
