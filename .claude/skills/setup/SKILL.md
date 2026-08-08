---
name: setup
description: >-
  Interactive setup for this multi-tool agent kit. Detects missing or placeholder
  values in AGENTS.md, infers stack details from the repo when possible, then
  questions the user one field at a time and writes a filled AGENTS.md. Use when
  AGENTS.md still has CUSTOMIZE/placeholder comments, after copying the kit into
  a project, or when the user asks to set up, customize, or configure the agent
  stack card.
---

# Agent kit setup (AGENTS.md)

Fill the stack card so specialists stop rediscovering the project. Prefer this over leaving `<!-- e.g. ... -->` placeholders.

## When to run

Run immediately when any of these are true:

1. User asks to set up / customize / configure the kit or `AGENTS.md`.
2. `AGENTS.md` still contains `CUSTOMIZE`, `<!-- e.g.`, or empty required cells.
3. You are about to use stack/commands/ownership from `AGENTS.md` and those fields are still placeholders — pause and run this skill first (or tell the user the card is incomplete).

Do **not** invent stack facts. Infer from the repo, then ask.

## Workflow

Copy and track:

```
Setup progress:
- [ ] 1. Scan AGENTS.md + repo
- [ ] 2. Confirm inferred defaults
- [ ] 3. Stack fields
- [ ] 4. Path ownership
- [ ] 5. Narrow commands
- [ ] 6. Required env + no-owner
- [ ] 7. Write AGENTS.md
- [ ] 8. Post-setup checks
```

### 1. Scan

Read `AGENTS.md`. List every field that is still a placeholder or empty.

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

Never read or store secret values from `.env`.

### 2. Questioning rules

- Ask **one question at a time**. Wait for the answer before the next.
- For each question: state what you inferred (if anything), your **recommended** answer, and a short why.
- Accept “skip” / “n/a” for optional rows (e.g. A11y, Codegen, Database).
- If the user gives a partial answer, confirm the exact string you will write into `AGENTS.md`.
- Batch only when the user explicitly says “fill the rest from your recommendations”.

### 3. Field order

Ask only for fields still missing after inference. Suggested order:

1. **App** — framework + major mode (e.g. Next.js App Router + React)
2. **Database** — or `none` / `n/a`
3. **Package manager** — confirm lockfile detection
4. **UI** — styling system
5. **Server** — where server logic lives (paths or pattern)
6. **Path ownership** — backend paths, frontend paths, shared paths (table rows)
7. **Narrow commands** — Unit/int → E2E → A11y → Lint path → Codegen / types → Full suite  
   Prefer real scripts from `package.json`. Use `n/a` when unused.
8. **Required env** — names needed for boots/e2e, or `none`
9. **No owner** — keep kit defaults unless the user adds project-specific zones

Keep the fixed sections (**Rules**, **Agents & routing**, **Memory**, call-graph note) unless the user asks to change agents.

### 4. Write

Update `AGENTS.md` in place:

- Replace every `<!-- e.g. ... -->` / `CUSTOMIZE` placeholder you filled.
- Remove the top `<!-- CUSTOMIZE: replace every placeholder... -->` once required fields are done.
- Keep structure, headings, and agent routing table intact.
- Do not invent commands that are not in the repo unless the user explicitly provided them.

Show a short diff summary of what changed; offer one follow-up edit pass if something looks wrong.

### 5. Post-setup checks (brief)

After writing, verify and report (fix only if broken; do not expand scope):

1. `.gitignore` ignores `.agents/hooks/state/` (and legacy `.cursor/hooks/state/` if present).
2. Canonical agents exist under `.agents/agents/`; adapter copies exist under `.cursor/agents/`, `.claude/agents/`, `.github/agents/`.
3. Worker names in `.agents/hooks/gate-core.mjs` (`WORKERS`) match `.agents/agents/*.md` basenames (excluding `manager`).
4. Cursor hooks point at `.agents/hooks/adapters/cursor.mjs`; Claude `.claude/settings.json` hooks point at `.agents/hooks/adapters/claude.mjs`.
5. If you edited `.agents/` sources, remind the user to run `node scripts/sync-tool-adapters.mjs` before commit.
6. Remind: Context7 MCP needed if the Context7 rule stays enabled.

## Done criteria

- No `CUSTOMIZE` / `<!-- e.g.` placeholders remain in required Stack, ownership, commands, or Required env sections (optional rows may be `n/a`).
- Package manager and commands match the lockfile / `package.json` unless the user overrode them.
- User got a concise “ready to use” confirmation with any remaining optional gaps called out.
