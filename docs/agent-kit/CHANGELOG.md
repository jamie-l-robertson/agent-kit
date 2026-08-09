# Behavior changelog

Semantic notes for kit gates/validators (not a full git log). Version: see `.agents/.kit-version`.

## 0.2.0

- Validator: `verify-only` ⇒ `changed: []`; `document` ⇒ docs/memory/stack-card paths only
- Gate: mkdir exclusive lock; **fail-closed** on lock timeout (no steal); atomic state rename
- Gate: unmapped/missing caller no longer invents `root` — deny as `unknown` (seed via `sessionStart`)
- Run events: deny/allow JSONL (`.agents/memory/runs/`, schema `run-event.schema.json`); optional `AGENT_KIT_TELEMETRY_URL`
- Multiprocess lock contention test; maturity doc + capture checklist
- `check-agent-kit` prints kit version
