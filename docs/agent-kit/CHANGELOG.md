# Behavior changelog

Semantic notes for kit gates/validators (not a full git log). Version: see `.claude/.kit-version`.

## Unreleased

- Hooks: commands use `node "${CLAUDE_PROJECT_DIR}/…"` — the gate no longer depends on hook cwd (Desktop **Code** tab, sub-directory sessions). `mergeClaudeSettings` sweeps any legacy spelling so upgrades replace rather than duplicate the hook
- Gate: `PreToolUse` no longer force-approves non-denied spawns (it emitted `permissionDecision: "allow"` for every `Agent`/`Task` call, bypassing user permission settings). Deny path unchanged
- Gate: all ten workers now also carry `disallowedTools: … Agent, Task` — host-native nesting block; the hook stays for the "return to manager" routing message and run-event telemetry
- **Worker-report gate**: `SubagentStop` validates each kit worker's JSON fence and blocks the stop with the validator's real errors until it is valid. Capped at 2 blocks per agent, then advisory (`additionalContext`) so a bad worker cannot burn the session. Scoped by matcher **and** `PROJECT_AGENTS` check, so `Explore` / `general-purpose` are untouched. Logged as `report-ok` / `report-invalid` run events
- Settings: `permissions.allow` merged for kit scripts (validator, check, sync) — fewer prompts mid-run; foreign permissions preserved
- Skill: `manager` restored as the managed entry point (Claude-worded; `disable-model-invocation`)
- Removed `AGENT_KIT_TELEMETRY_URL` (env-driven POST of every spawn decision to an arbitrary URL, no consumer)
- Gate state: cap at 20 sessions so a missed `SessionEnd` cannot grow `agent-roles.json` unbounded
- New `scripts/claude-adapter.test.mjs` — asserts the adapter's actual stdout contract (the suite previously only tested `decide()`)
- Install: "Kept existing AGENTS.md" is now true. `patchAgentsSkillsLine` no longer prepends the Skills line above the H1 of a project-owned card with no `## Stack` anchor — it leaves the file alone and says so; `--check` still reports the missing line and **setup** offers the block. Anchored project cards are patched as before
- Install: `.kit-version` / install-audit record real provenance — `local:<path>` or `repo@ref`, not the literal `--from=…` flag. `install.sh` sets `AGENT_KIT_SOURCE` so a curl install records `repo@ref` instead of the temp extract dir it deletes on exit

## 0.2.0

- Validator: `verify-only` ⇒ `changed: []`; `document` ⇒ docs/memory/stack-card paths only
- Gate: mkdir exclusive lock; **fail-closed** on lock timeout (no steal); atomic state rename
- Gate: unmapped/missing caller no longer invents `root` — deny as `unknown` (seed via `sessionStart`)
- Run events: deny/allow JSONL (`.claude/memory/runs/`, schema `run-event.schema.json`)
- Multiprocess lock contention test; maturity doc + capture checklist
- `check-agent-kit` prints kit version
