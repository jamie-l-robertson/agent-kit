# Agent kit

Portable multi-agent setup for **Cursor**, **Claude Code**, and **GitHub Copilot**: manager-orchestrated specialists, call-graph gate (where supported), agent-memory, and shared rules.

This folder is a **copy-friendly template**. Drop its contents into a project root, fill in `AGENTS.md`, then run the sync script if you edit canonical sources.

## What you get

| Path | Role |
|------|------|
| `.agents/agents/` | Canonical specialists (`manager`, `planner`, `frontend`, …); protocol markers composed at sync |
| `.agents/protocols/` | Shared worker protocol variants (`implement`, `readonly`, `document`) + ref-resolution |
| `.agents/skills/` | `setup`, `sync-project-skills`, `agent-memory`, `brief-hygiene`, `verify-evidence`, `issue-intake`, … |
| `.agents/rules/` | Always-on: TDD, Karpathy, Context7. Path-only stub: `design-system.md` (via `AGENTS.md` pointer) |
| `.agents/memory/decisions.md` | Append-only product/design decision log |
| `.agents/memory/mcp-usage.md` | Append-only MCP telemetry (server/tool/outcome) |
| `.agents/memory/install-audit.md` | When install kept project `AGENTS.md` / `CLAUDE.md` |
| `.agents/hooks/` | Call-graph gate core + Cursor/Claude adapters |
| `.cursor/` | Generated Cursor adapters (agents, skills, rules, hooks) |
| `.claude/` | Generated Claude adapters (agents, skills, `settings.json`) |
| `.github/agents/` + `.github/skills/` + `.github/instructions/` | Generated Copilot adapters |
| `AGENTS.md` | Shared stack card (customize per project) |
| `CLAUDE.md` | Thin Claude entrypoint pointing at `AGENTS.md` + rules |
| `scripts/sync-tool-adapters.mjs` | Regenerate / `--check` tool adapters from `.agents/` |
| `scripts/sync-project-skills.mjs` | Inventory kit vs project skills → `AGENTS.md` + `.agents/memory/skills-inventory.md` |
| `.gitignore` | Ignores hook state dirs |

## Feature matrix

| Feature | Cursor | Claude Code | GitHub Copilot |
|---------|--------|-------------|----------------|
| Stack card (`AGENTS.md`) | yes | yes (via `CLAUDE.md` + `AGENTS.md`) | yes |
| Specialist agents | `.cursor/agents/` | `.claude/agents/` | `.github/agents/` |
| Skills | `.cursor/skills/` (generated) | `.claude/skills/` | `.github/skills/` |
| Always-on rules | `.cursor/rules/*.mdc` | `CLAUDE.md` + `.agents/rules/` | `.github/instructions/` |
| Decision memory | `.agents/memory/` | `.agents/memory/` | `.agents/memory/` |
| Call-graph gate (no worker nesting) | **hard when lifecycle ids present; verify with `AGENT_KIT_GATE_LOG=1`** (hooks; session-scoped + mkdir lock fail-closed; `subagentStart` + `preToolUse`; unmapped caller → deny; see `docs/agent-kit/maturity.md`) | **hard** (hooks; `SessionStart`/`SessionEnd`; same session-scoped state + fail-closed lock) | **soft** (prompt + synced agent text; CI markers via `check-agent-kit` — same worker-report rules) |
| Readonly agents (no file writes) | `readonly: true` frontmatter (hard) | **soft** (`disallowedTools: Write, Edit, NotebookEdit`; Bash may remain) | **soft** (prompt only) |
| Sync / install safety | Sync upserts kit agents/skills (`x-owner: agent-kit`); merges hooks. Install merges `.cursor/hooks.json` + `.claude/settings.json` (does not wipe foreign entries); docs → `docs/agent-kit/` | same | Upserts `.github/{agents,skills,instructions}` only — other `.github/` (e.g. workflows) preserved |
| Health check | `node scripts/check-agent-kit.mjs` (adapters + Cursor/Claude gate smoke + Copilot markers + validator) | same | same |
| Cloud agents (`environment: cloud`) | **Partial** — kit prompts + [phase-2-cloud-agents.md](docs/agent-kit/phase-2-cloud-agents.md); gate hard/soft TBD after smoke; commit kit trees for cloud clones | n/a (Cursor) | n/a |

## Install into a project

Recommended path: install from GitHub into the project root, then ask your agent to run **setup**.

Source: [jamie-l-robertson/agent-kit](https://github.com/jamie-l-robertson/agent-kit).

### Option A — GitHub (recommended)

From your **project root** (requires `curl`, `tar`, `node`):

```bash
curl -fsSL https://raw.githubusercontent.com/jamie-l-robertson/agent-kit/main/scripts/install.sh | bash
```

Optionally pin a branch/tag your project already cut (conventional commits / releases are project-level — setup does not commit or tag for you):

```bash
curl -fsSL https://raw.githubusercontent.com/jamie-l-robertson/agent-kit/main/scripts/install.sh \
  | AGENT_KIT_REF=main bash
```

From a local checkout of this kit:

```bash
/path/to/agent-kit/scripts/install.sh --from=/path/to/agent-kit
```

The installer copies `.agents/`, tool adapters (`.cursor/`, `.claude/`, `.github/{agents,skills,instructions}/`), runtime `scripts/` (not `*.test.mjs`), kit docs into `docs/agent-kit/`, `AGENTS.md`, and `CLAUDE.md`, and merges ignore rules into `.gitignore`. Host hook configs are **merged** (foreign Cursor/Claude hooks and Claude `permissions`/`env` survive). Existing `AGENTS.md` / `CLAUDE.md` / filled `.agents/rules/*` stubs are **kept** unless you pass `--force` — keeps are logged to `.agents/memory/install-audit.md`. Later `sync-tool-adapters` skips rewriting a kept-project `CLAUDE.md` unless `--force-claude-md`.

Then in the agent chat:

```text
run setup
```

(or `/setup` / “customize AGENTS.md”). The **setup** skill fills the stack card interactively. If `AGENTS.md` / `CLAUDE.md` were kept, setup offers **copy-paste append blocks** for any missing kit-required sections (see `.agents/skills/setup/append-blocks.md`).

### Option B — rsync

Plain `rsync -a` **overwrites** destination files and does **not** keep project `AGENTS.md` / `CLAUDE.md` or write install-audit. Prefer Option A for keep + audit.

If you still use rsync, exclude project-owned stack cards and document the keep in `.agents/memory/install-audit.md`:

```bash
TARGET=/path/to/your/project

rsync -a \
  --exclude README.md \
  --exclude AGENTS.md \
  --exclude CLAUDE.md \
  ./ "$TARGET/"
```

Then ask the agent to **run setup** (same as Option A) so missing kit sections can be appended.

### Option C — manual copy

Copy these paths from the kit into the **project root** (merge if a path already exists):

| Copy from kit | Into project |
|---------------|--------------|
| `.agents/` | `.agents/` |
| `.cursor/` | `.cursor/` |
| `.claude/` | `.claude/` |
| `.github/agents/` | `.github/agents/` |
| `.github/skills/` | `.github/skills/` |
| `.github/instructions/` | `.github/instructions/` |
| `scripts/*.mjs` + `scripts/*.sh` (skip `*.test.mjs`) | `scripts/` (at least `install.*` + `sync-tool-adapters.mjs`) |
| `AGENTS.md` | `AGENTS.md` (only if the project has no stack card yet) |
| `CLAUDE.md` | `CLAUDE.md` (Claude Code; skip if unused) |

Also merge the kit’s `.gitignore` lines into the project’s `.gitignore`.

Example with `cp` (macOS/Linux):

```bash
TARGET=/path/to/your/project
KIT=/path/to/agent-kit

cp -R "$KIT/.agents" "$TARGET/"
cp -R "$KIT/.cursor" "$TARGET/"
cp -R "$KIT/.claude" "$TARGET/"
mkdir -p "$TARGET/.github" "$TARGET/scripts"
cp -R "$KIT/.github/agents" "$KIT/.github/skills" "$KIT/.github/instructions" "$TARGET/.github/"
# copy runtime scripts only — do not copy *.test.mjs
for f in "$KIT/scripts/"*.mjs "$KIT/scripts/"*.sh; do
  case "$f" in *.test.mjs) continue ;; esac
  cp "$f" "$TARGET/scripts/"
done
cp "$KIT/AGENTS.md" "$KIT/CLAUDE.md" "$TARGET/"
# merge .gitignore by hand — do not overwrite the project’s existing file
```

If the project already has `.github/` content (workflows, etc.), copy only the three subfolders above — do not replace the whole `.github/` directory. Then **run setup** in the agent.

### After install

1. Ignore rules: the GitHub installer merges them; for rsync/manual, ensure `.gitignore` includes `.agents/hooks/state/` (and `.cursor/hooks/state/` if listed).
2. Fill `AGENTS.md` via the **setup** skill (`run setup`). Setup **always** runs `node scripts/sync-project-skills.mjs` after writing the stack card. If files were kept, complete append blocks from setup / `.agents/skills/setup/append-blocks.md`.
3. Confirm worker names in `.agents/hooks/gate-core.mjs` (`WORKERS`) match `.agents/agents/*.md` (excluding `manager`).
4. After any edit under `.agents/`, run:

```bash
node scripts/sync-tool-adapters.mjs
node scripts/check-agent-kit.mjs
```

5. **Cursor gate payload capture** (required before claiming unqualified hard): set `AGENT_KIT_GATE_LOG=1`, run a real nest attempt, record findings in [`docs/agent-kit/maturity.md`](docs/agent-kit/maturity.md). Normalized events append to `.agents/hooks/state/gate-log.jsonl` (or next to `AGENT_KIT_STATE_PATH`). Gate also appends structured deny/allow lines under `.agents/memory/runs/` (gitignored; `AGENT_KIT_RUN_EVENTS=0` to disable). Claude already uses stable `session_id`; Copilot has no hard gate.
6. **Kit version**: `.agents/.kit-version` is printed by `check-agent-kit`. Cutting a release **tag** is a deliberate project action (ask before commit/tag); pin installs with `AGENT_KIT_REF=<tag>`.

## How to use

- Multi-domain or multi-step work → invoke **`manager`** (it plans via `planner`, dispatches workers, relays decisions).
- Single clear specialist with known scope → you may invoke that agent directly; still use Modes and the worker-report JSON fence.
- Durable product choices → manager reads agent-memory; after a settled decision, manager briefs `documenter` to append.
- Sync upserts kit-owned agents/skills only (`x-owner: agent-kit` on synced skills); foreign files under `.cursor/agents/` (etc.) are left alone. Hooks/settings are merged, not wiped.

## Customize checklist

- [ ] Run **setup** skill (or fill `AGENTS.md` by hand): stack, ownership, narrow commands, required env — setup runs skills inventory sync
- [ ] If install kept `AGENTS.md` / `CLAUDE.md`: append missing kit sections (setup will offer copy-paste blocks); check `.agents/memory/install-audit.md`
- [ ] **Commit** kit host trees in the kit repo and in consumer repos after install/sync: `.cursor/`, `.claude/`, `.github/{agents,skills,instructions}/` (edit only under `.agents/`, then sync). Do not switch to generate-only adapters — clone/install must work without a sync step.
- [ ] Optional: pin agent `model:` in `.agents/agents/<name>.md` (kit default is all `inherit`) to slugs your host’s picker exposes, then sync adapters
- [ ] Optional: **Design system** + **Frontend / Backend / API** + **Cloud/DevOps/Infrastructure/Security/Risk standards** (path or URL). URLs load via **MCP only**
- [ ] Optional: **Cloud platform** (`aws` | `azure` | `gcp` | `multi` | `n/a`)
- [ ] Optional: **Required MCP** / **Standards MCP** so the manager can prewarm before dispatch
- [ ] Optional: fill path-only stubs under `.agents/rules/` (`design-system.md`, `*-standards.md`) or point stack slots at your docs
- [ ] Optional: extend “No owner” list
- [ ] Optional: trim agents — remove from `.agents/agents/`, `WORKERS`, routing; prefer skills over new agents (see `docs/agent-kit/routing-scenarios.md` specialist-cap)
- [ ] Confirm required MCPs (Context7, issue trackers, doc sources) are available when listed
- [ ] Re-run `node scripts/sync-tool-adapters.mjs` after canonical edits; use `--check` for drift
- [ ] After adding project skills: `node scripts/sync-project-skills.mjs` (or re-run setup)
- [ ] Routing drills: `docs/agent-kit/routing-scenarios.md` + `node --test scripts/routing-scenarios.test.mjs`
- [ ] Optional: capture real Cursor gate payloads with `AGENT_KIT_GATE_LOG=1` before treating the Cursor nest gate as unqualified hard

## Authoring (skills, rules, agents)

Edit only under `.agents/`, then sync. Do not hand-edit generated `.cursor/` / `.claude/` / `.github/` kit copies (foreign names are preserved).

### Skills

1. Add `.agents/skills/<name>/SKILL.md` with YAML `name` + `description`.
2. Run `node scripts/sync-tool-adapters.mjs` (copies to Cursor/Claude/GitHub skills).
3. In agent prose, cite **name** and path (e.g. `.agents/skills/<name>/SKILL.md`) when workers must load it.
4. Retiring a kit skill: delete the folder; sync removes known kit skill dirs from adapters.

### Rules

1. Add `.agents/rules/<name>.md`.
2. Frontmatter control:
   - omit `activation` or `activation: always` → always-on (Cursor `alwaysApply: true`, GitHub `applyTo: '**'`)
   - `activation: path-only` → **not** always-on; load only when `AGENTS.md` or a brief points at that path
3. Prefer company standards as **AGENTS.md** path/URL refs, not always-on rules.
4. Sync; verify with `--check`.

### Agents

1. Prefer a **skill** or **standards** slot over a new worker (specialist-cap — `docs/agent-kit/routing-scenarios.md`).
2. Add `.agents/agents/<name>.md` (`name`, `description`, optional `readonly: true`, `model:` slug or `inherit`).
3. Add the basename to `WORKERS` in `.agents/hooks/gate-core.mjs` (required or sync fails).
4. Update `AGENTS.md` **Agents & routing** (canonical); manager/planner keep notes only; set optional `model:` on the new agent (default `inherit`).
5. Add/update a row in `docs/agent-kit/routing-scenarios.md` + `docs/agent-kit/routing-scenarios.json` (include `model`); run `node --test scripts/routing-scenarios.test.mjs`.
6. Sync. Adapter sync preserves `model:` on Cursor copies; other hosts use the same pin for titles/briefs (enforcement only where the runtime supports it). Trim unused specialists the same way (remove file + `WORKERS` entry + routing rows).

### Project skills inventory

1. Run `node scripts/sync-project-skills.mjs` (setup always does this).
2. Reviews kit vs project skills; patches `AGENTS.md` **Skills** and writes `.agents/memory/skills-inventory.md`.
3. `--check` fails on drift. Never deletes foreign skill dirs.

Protocol markers: `<!-- protocol:implement|readonly|document -->` are inlined from `.agents/protocols/` at sync. Workers must end reports with a worker-report JSON fence (`.agents/schemas/worker-report.schema.json`).

## Not a live sync

This kit is a **portable snapshot**. Updating the kit does not update projects that already copied it (and vice versa).
