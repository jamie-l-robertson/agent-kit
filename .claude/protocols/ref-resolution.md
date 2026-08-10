## Resolving AGENTS.md refs (design system / standards)

Follow `AGENTS.md` “Resolving Design system / standards refs” (full table + forbidden tools live there).

1. Skip if value is `n/a`, empty, or a `<!-- … -->` placeholder.
2. **Repo path** → Read from the workspace. Missing file → `blocked` (or `needs-decision` if the brief allows choosing a path).
3. **URL** → **MCP only**. Discover/auth the server from **Standards MCP** / **Required MCP** / brief `MCP prewarmed`. Fetch via that MCP.
4. Never fall back to curl / `gh` / raw REST / WebFetch / browser / install scripts (see AGENTS.md).
5. URL + no MCP after one auth attempt → `blocked` naming the MCP needed.
6. List meaningful calls under JSON `mcpUsed` so the manager can batch to mcp-usage (no payloads/secrets).
