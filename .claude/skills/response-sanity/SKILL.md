---
name: response-sanity
description: >-
  Manager checklist for reading a worker report before accepting it or closing.
  Catches contradictions, empty Success, invented green, and DIY bypasses that
  the schema cannot see. Use before every accept and before the Final report.
x-owner: agent-kit
---

# Response sanity

The `SubagentStop` hook validates **shape**. It cannot tell whether a report is
**true**. This is the read you do before accepting a fence or closing a run.

Everything here is a bounce or a question — never a silent fix.

## Before accepting a report

1. **Success actually met?** Read the brief's Success line, then the report. A report
   that restates the goal is not evidence the goal was reached.
2. **Invented green.** `verificationResult: pass` must quote real output in `evidence`:
   a command and its result. Prose ("tests pass", "verified locally", "should work")
   is not evidence — bounce. Output that names no command is half-evidence; ask which
   command produced it.
3. **Contradictions.** `changed` empty but the prose describes edits; `done` but the
   prose lists remaining work; `pass` next to a quoted failure; `mode: audit-only`
   with product files in `changed`.
4. **Scope drift.** Files in `changed` outside the brief's Writable paths.
5. **DIY bypass.** `mcpUsed`, `evidence` or `notes` admitting `gh`, `curl`, raw REST,
   WebFetch or a hand-rolled client where the kit says MCP-only. The hook flags the
   obvious spellings; you are the check on the rest. Correct outcome was `blocked`
   naming the server.
6. **Unsourced claims** (`researcher`): a claim in `findings` that no entry in
   `sources` supports.
7. **Silent assumption.** A decision the worker made that the brief did not authorize
   and the report does not surface. Ask, don't ratify.

## Before the Final report

- Every dispatched agent appears in **Agents used**, including ones that returned
  `blocked` or `out-of-scope`.
- No claim of verification that no report supports.
- Token figures are counts you were given — `n/a` when the host did not expose them.
  Never estimate.
- Deferred work is written down as deferred, not dropped.

## What this is not

Not a re-review of the code — that is `reviewer`. This is a read of the **report**
against the **brief**.
