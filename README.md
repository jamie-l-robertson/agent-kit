# Agent kit

Portable multi-agent setup for **Cursor**, **Claude Code**, and **GitHub Copilot**: manager-orchestrated specialists, call-graph gate (where supported), agent-memory, and shared rules.

This folder is a **copy-friendly template**. Drop its contents into a project root, fill in `AGENTS.md`, then run the sync script if you edit canonical sources.

## What you get

| Path | Role |
|------|------|
| `.agents/agents/` | Canonical specialists (`manager`, `planner`, `frontend`, …) |
| `.agents/skills/` | `agent-memory`, `setup` (Agent Skills standard) |
| `.agents/rules/` | TDD, Karpathy guidelines, Context7 API validation |
| `.agents/memory/decisions.md` | Append-only decision log |
| `.agents/hooks/` | Call-graph gate core + Cursor/Claude adapters |
| `.cursor/` | Generated Cursor adapters (agents, skills, rules, hooks) |
| `.claude/` | Generated Claude adapters (agents, skills, `settings.json`) |
| `.github/agents/` + `.github/skills/` + `.github/instructions/` | Generated Copilot adapters |
| `AGENTS.md` | Shared stack card (customize per project) |
| `CLAUDE.md` | Thin Claude entrypoint pointing at `AGENTS.md` + rules |
| `scripts/sync-tool-adapters.mjs` | Regenerate tool adapters from `.agents/` |
| `.gitignore` | Ignores hook state dirs |

## Feature matrix

| Feature | Cursor | Claude Code | GitHub Copilot |
|---------|--------|-------------|----------------|
| Stack card (`AGENTS.md`) | yes | yes (via `CLAUDE.md` + `AGENTS.md`) | yes |
| Specialist agents | `.cursor/agents/` | `.claude/agents/` | `.github/agents/` |
| Skills | `.cursor/skills/` | `.claude/skills/` | `.github/skills/` |
| Always-on rules | `.cursor/rules/*.mdc` | `CLAUDE.md` + `.agents/rules/` | `.github/instructions/` |
| Decision memory | `.agents/memory/` | `.agents/memory/` | `.agents/memory/` |
| Call-graph gate (no worker nesting) | **hard** (hooks) | **hard** (hooks) | **soft** (prompt only) |

## Install into a project

Recommended path: install from GitHub into the project root, then ask your agent to run **setup**.

Source: [jamie-l-robertson/agent-kit](https://github.com/jamie-l-robertson/agent-kit).

### Option A — GitHub (recommended)

From your **project root** (requires `curl`, `tar`, `node`):

```bash
curl -fsSL https://raw.githubusercontent.com/jamie-l-robertson/agent-kit/main/scripts/install.sh | bash
```

Pin a branch/tag:

```bash
curl -fsSL https://raw.githubusercontent.com/jamie-l-robertson/agent-kit/main/scripts/install.sh \
  | AGENT_KIT_REF=main bash
```

From a local checkout of this kit:

```bash
/path/to/agent-kit/scripts/install.sh --from=/path/to/agent-kit
```

The installer copies `.agents/`, tool adapters (`.cursor/`, `.claude/`, `.github/{agents,skills,instructions}/`), `scripts/`, `AGENTS.md`, and `CLAUDE.md`, and merges ignore rules into `.gitignore`. Existing `AGENTS.md` / `CLAUDE.md` are kept unless you pass `--force` or `AGENT_KIT_FORCE=1`.

Then in the agent chat:

```text
run setup
```

(or `/setup` / “customize AGENTS.md”). The **setup** skill fills the stack card interactively.

### Option B — rsync

From this kit directory:

```bash
TARGET=/path/to/your/project

rsync -a \
  --exclude README.md \
  ./ "$TARGET/"
```

Then ask the agent to **run setup** (same as Option A).

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
| `scripts/` | `scripts/` (at least `install.*` + `sync-tool-adapters.mjs`) |
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
cp "$KIT/scripts/"*.mjs "$KIT/scripts/"*.sh "$TARGET/scripts/"
cp "$KIT/AGENTS.md" "$KIT/CLAUDE.md" "$TARGET/"
# merge .gitignore by hand — do not overwrite the project’s existing file
```

If the project already has `.github/` content (workflows, etc.), copy only the three subfolders above — do not replace the whole `.github/` directory. Then **run setup** in the agent.

### After install

1. Ignore rules: the GitHub installer merges them; for rsync/manual, ensure `.gitignore` includes `.agents/hooks/state/` (and `.cursor/hooks/state/` if listed).
2. Fill `AGENTS.md` via the **setup** skill (`run setup`).
3. Confirm worker names in `.agents/hooks/gate-core.mjs` (`WORKERS`) match `.agents/agents/*.md` (excluding `manager`).
4. After any edit under `.agents/`, run:

```bash
node scripts/sync-tool-adapters.mjs
```
## How to use

- Multi-domain or multi-step work → invoke **`manager`** (it plans via `planner`, dispatches workers, relays decisions).
- Single clear specialist with known scope → you may invoke that agent directly; still use Modes and the Output contract.
- Durable product choices → manager reads agent-memory; after a settled decision, manager briefs `documenter` to append.

## Customize checklist

- [ ] Run **setup** skill (or fill `AGENTS.md` by hand): stack, ownership, narrow commands, required env
- [ ] Optional: extend “No owner” list
- [ ] Optional: trim agents you do not need — remove from `.agents/agents/`, `WORKERS` in `gate-core.mjs`, then re-run sync
- [ ] Confirm Context7 MCP is available if you keep the Context7 rule
- [ ] Re-run `node scripts/sync-tool-adapters.mjs` after canonical edits

## Authoring note

**Edit canonical sources under `.agents/`** (agents, skills, rules, memory, hooks). Do not hand-edit generated copies under `.cursor/`, `.claude/`, or `.github/` except temporary experiments — sync will overwrite them.

## Not a live sync

This kit is a **portable snapshot**. Updating the kit does not update projects that already copied it (and vice versa).
