# Context practices

Keeping a session lean is a habit, not a setting. **Claude Code owns compaction — the kit does not reinvent summarization**, and there is nothing here for the installer to bake in.

Load this when a session feels heavy, before a long managed run, or during setup. It is deliberately **not** an always-on rule: a document about context cost should not spend context on every turn.

## What survives compaction

Verified against the Claude Code context-window docs (2026-08-15). This is the part that surprises people:

| Mechanism | After compaction |
|---|---|
| System prompt / output style | Unchanged — never in message history |
| Project-root `CLAUDE.md`, unscoped rules | Re-injected from disk |
| Auto memory (`MEMORY.md`) | Re-injected from disk (first 200 lines or 25KB) |
| Rules with `paths:` frontmatter | **Lost** until a matching file is read again |
| Nested `CLAUDE.md` in subdirectories | **Lost** until a file in that subdirectory is read |
| Invoked skill bodies | Re-injected, capped **5,000 tokens per skill / 25,000 total**, oldest dropped first |
| Hooks | Not applicable — hooks run as code, not context |

Two consequences for this kit:

- **Kit rules are unscoped, so they survive.** If you add a `paths:`-scoped rule that must hold after a compaction, drop the frontmatter or move it to `CLAUDE.md`.
- **Skill truncation keeps the start of the file.** Put the binding instructions near the top of a `SKILL.md`; reference material goes below. Every kit skill is currently well inside the cap — `setup` is the largest at roughly 1,800 tokens — so this is a rule for skills you add, not a problem you have.

## Commands worth knowing

| Command | Use it when |
|---|---|
| `/context [all]` | Diagnose before you act — shows what is actually eating the window, including memory bloat |
| `/clear [name]` | Between unrelated tasks. Empty context beats a summary of work you have finished with |
| `/compact [instructions]` | Mid-task, when you need the history but not all of it. `/compact focus on the auth bug` keeps what you choose instead of what the automatic pass guesses |
| `/autocompact <tokens>` | Long manager runs only, e.g. `/autocompact 500k`. Saves to **user** settings and applies to the current session |

Reach for `/clear` more often than `/compact`. A managed run that has closed its Final report has nothing left worth summarizing.

## Settings: nothing to bake

- **Do not** set `DISABLE_AUTO_COMPACT` or force a low compact window in project settings. Too lossy, and it is the user's call — `/autocompact` writes to user settings for a reason.
- **Leave MCP tool search deferred.** Do not set `ENABLE_TOOL_SEARCH=false`; loading every schema upfront is exactly the bloat this document is about.
- **Do not** auto-inject `tasks.md` or `mcp-usage.md` on `SessionStart`. The manager skims what it needs.
- `includeGitInstructions` **does not exist** — it was in an earlier draft of this plan and did not survive contact with the docs. The real keys are `attribution` (commit/PR text) and `autoCompactEnabled` / `autoCompactWindow`. Confirm any settings key against the installed version's docs before writing it into the kit.

## Kit habits

- **Paste anchors, not logs.** Never paste whole `tasks.md`, the archive, `decisions.md`, or `runs/*.jsonl` into a brief. Skim titles; quote the entry you mean.
- **Keep hook `additionalContext` short.** It lands in a worker's context every time it fires.
- **Lean `CLAUDE.md`.** Always-on load is currently about 1,560 tokens across `CLAUDE.md` and the three kit rules. Anything that is a procedure rather than a fact belongs in a skill, where it costs nothing until invoked.
- **A bloated `MEMORY.md` costs accuracy, not just tokens.** Only the first 200 lines load.
- **Subagents carry their own window.** Dispatching a specialist is often the cheaper move — the worker reads the files, the manager gets the report.
