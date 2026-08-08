---
name: verify-evidence
description: >-
  How to run narrow verification commands, quote real output, and fill JSON
  evidence without claiming green falsely. Use when Success implies
  tests/lint/codegen or when reporting tests/evidence in the worker report.
x-owner: agent-kit
---

# Verify evidence

Never claim green without quoted command output. Put quotes in the JSON fence `evidence` field and set `verificationResult` to `pass` | `fail` | `n/a`.

## Steps

1. Pick the **narrowest** command from the brief `Verify with` or `AGENTS.md` Narrow commands (not full suite unless asked).
2. Run it. For Playwright e2e/a11y: allow ~180s cold start (`webServer`); do not treat an early tool return as boot failure.
3. Record in JSON `evidence`:
   - Exact command(s)
   - Exit code / pass-fail
   - Short quote (pass summary or first failing assertion)
4. Set `verificationResult`: `pass` or `fail` when commands ran; `n/a` when Success needs no command.
5. Split **pre-existing** failures from ones introduced by this change.
6. If Success required verification and you could not run it (missing env, boot, tooling) → `blocked` (or `needs-decision` if product choice), not `done`.
7. If Success required verification and the harness **ran**:
   - **Infra/tooling failure** (boot/auth/missing secrets) → `blocked` with `evidence`
   - **Assertion/product failure**:
     - `mode: implement` → do **not** return `status: done` with `verificationResult: fail` (fix or `needs-decision`)
     - `mode: verify-only` / `audit-only` → `done` with `verificationResult: fail` and quoted `evidence` / `tests` is valid when discovering failure is the deliverable

## Evidence shape

```text
<command> → exit <n> — "<short quote>"
```

Use `evidence: null` and `verificationResult: n/a` only when Success truly needs no command.

## Do not

- Weaken tests (`.skip`, lingering `.only`, loosened asserts) to force green
- Claim “tests pass” from memory or prior sessions
- Substitute lint for a required test command when Success named tests
