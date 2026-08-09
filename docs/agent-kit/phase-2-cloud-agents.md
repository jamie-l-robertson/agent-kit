# Phase 2 — Cloud agents

Enable this agent kit on Cursor **cloud** agents (`Task` `environment: cloud`, Agents Window / `bc-` VMs). Local IDE orchestration remains the default path; this doc is the cloud enablement checklist.

Status: **in progress** (see [`maturity.md`](maturity.md) Phase 2). Smoke outcomes go in maturity after a real run.

## Prerequisites

1. Kit trees are **committed** in the consumer repo (`.agents/`, `.cursor/agents|skills|rules|hooks`, `.claude/`, `.github/{agents,skills,instructions}/`, `scripts/` runtime). Cloud clones the repo — uncommitted kit files are invisible.
2. Re-run install/sync before relying on cloud after kit upgrades (`scripts/install.sh` or `--from=` local kit).
3. Required MCP / secrets that workers need must exist in the **cloud** team/project config (not only on a laptop).

## Steps

### 1. Repo install on cloud clone

Confirm the cloud VM sees `.cursor/agents/manager.md` (and siblings) after clone. If missing, commit adapters from the consumer repo (do not rely on a post-clone sync-only workflow).

### 2. Orchestration model

| Pattern | When |
|---------|------|
| **Local manager → cloud workers** | Preferred for long/parallel isolated work; manager stays in Agent mode for plan approval and close |
| **Full cloud parent** | Entire managed run lives in cloud; same briefs/gates; merge-back still required for worker branches |

Dispatch cloud workers with `Task` `environment: cloud`. Each cloud worker gets its own VM/branch — treat **merge-back** (PR or user merge) as an explicit close step in the manager Final report (Manual QA / follow-ups or Outcomes).

### 3. Call-graph gate

Cursor hooks may not run the same way inside cloud VMs. Until a smoke run proves nest-deny on cloud:

- Treat cloud nesting as **prompt-policy soft** (like Copilot), not hard gate.
- Do not claim “hard gate on cloud” in the README matrix until maturity records a successful capture.
- Local manager + cloud workers: gate still applies on the local parent for local Task spawns.

### 4. MCP

- Cloud MCP is team/project configured. Stdio `env` values land in the VM — treat as secrets.
- Manager **MCP prewarm** + `AGENTS.md` Required MCP must list servers that exist in cloud.
- If a Required MCP server is missing in cloud → worker `blocked` (same as local), not silent skip.

### 5. Plan approval / Agent mode

Keep manager **Host UI (Cursor)** rules: no `SwitchMode` to Plan/Ask; no `CreatePlan` for kit worker plans. Present gap/approval in chat, then dispatch (cloud or local) after approve.

### 6. Logs metric (reviewer)

Local terminals are often absent for cloud workers. Prefer:

- Worker JSON `evidence`
- CI logs via MCP
- Host-exposed cloud run logs when available

Else `logs: n/a — none available` (not `blocked`).

### 7. Env / secrets for verify

`AGENTS.md` Required env must be injectable in cloud (Cursor cloud/team secrets). Missing boot secrets → `blocked` per **verify-evidence**. Do not assume a local `.env` file exists on the VM.

### 8. Token / cost reporting

Workers optionally report `usage` in the worker-report fence; manager **Final report** includes **Token costs**. Host/SDK may undercount subagents — use `n/a` with reason; never invent dollars. Same rules as local.

### 9. Smoke checklist

Record results in [`maturity.md`](maturity.md) Phase 2:

1. Manager (local or cloud) → planner
2. User plan approval in Agent mode
3. One implementer with `environment: cloud`
4. Reviewer (logs metric aware of cloud)
5. Manager Final report with all sections including **Token costs**
6. Note: gate hard/soft on cloud, MCP ok/blocked, usage present/n/a, merge-back done/deferred

## Kit code hooks (done or follow-up)

- Manager routing: cloud dispatch + merge-back note → `.agents/agents/manager.md`
- Code-review logs: cloud sources → `.agents/skills/code-review/SKILL.md`
- README feature matrix: Cloud agents row (update after smoke)
