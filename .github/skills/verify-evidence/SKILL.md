---
name: verify-evidence
description: >-
  How to run narrow verification commands, quote real output, and fill Evidence
  without claiming green falsely. Use when Success implies tests/lint/codegen or
  when reporting Tests/Evidence in a worker Output contract.
---

# Verify evidence

Never claim green without quoted command output.

## Steps

1. Pick the **narrowest** command from the brief `Verify with` or `AGENTS.md` Narrow commands (not full suite unless asked).
2. Run it. For Playwright e2e/a11y: allow ~180s cold start (`webServer`); do not treat an early tool return as boot failure.
3. Record under `Evidence:`:
   - Exact command(s)
   - Exit code / pass-fail
   - Short quote (pass summary or first failing assertion)
4. Split **pre-existing** failures from ones introduced by this change.
5. If Success required verification and you could not run it → `blocked` or `needs-decision`, not `done`.
6. If Success required verification and commands **ran but failed** → `blocked` with `Evidence:` quoting the failure (not `done`, not `out-of-scope`). Use `needs-decision` only when the red result is actually a product/design choice.

## Evidence line shape

```text
Evidence: <command> → exit <n> — "<short quote>"
```

Multiple commands: one bullet or semicolon-separated lines. Use `n/a` only when Success truly needs no command.

## Do not

- Weaken tests (`.skip`, lingering `.only`, loosened asserts) to force green
- Claim “tests pass” from memory or prior sessions
- Substitute lint for a required test command when Success named tests
