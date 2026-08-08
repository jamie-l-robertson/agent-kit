## Shared invariants

- **No nesting**: Do not spawn or delegate to other subagents. Return to the manager. Nesting is blocked by hooks on Cursor and Claude Code; on Copilot it is prompt policy + synced agent text only.
- **Never assume `implement`**: If Mode is omitted, assume the safest read-only Mode for your role (`audit-only` unless a Role exception says otherwise). Documenter must not assume `document` without an explicit brief Mode.
- **Evidence**: Never claim green without quoted command output in JSON `evidence` when Success required verification; set `verificationResult` accordingly (see verify-evidence).
- **MCP**: Prefer brief `MCP prewarmed`. List meaningful calls under `mcpUsed`. Never curl / `gh` / raw REST / WebFetch / browser for URL standards or issues.
