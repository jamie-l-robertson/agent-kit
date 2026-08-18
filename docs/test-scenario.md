# Kit test scenario — "Shiftly"

A greenfield brief for exercising the agent kit end to end in a **new, empty project**.
It is not a real product spec; every part of it exists to force a specific kit behaviour.

Read the coverage matrix at the bottom if you only care about what's being tested.

---

## 0. Setup

```bash
mkdir shiftly && cd shiftly && git init
# copy the kit in
cp -r /path/to/cursor-agent-kit/.claude /path/to/cursor-agent-kit/AGENTS.md /path/to/cursor-agent-kit/CLAUDE.md .
```

Then run `/setup` and answer honestly for whatever stack you want to test on.

**Test 0 passes when:** `AGENTS.md` has no `CUSTOMIZE` or `<!-- … -->` placeholders left,
path ownership names real directories, and the narrow-command table has commands that
actually run. Deliberately leave **Design system** as a repo path and set adherence to
`strict` — later phases depend on it.

---

## 1. The product

**Shiftly** — a shift-swap board for a small café chain.

Staff post a shift they can't work; other staff claim it; a manager approves the swap.
Roster and staff data is held by the app. Notifications go out by email.

Small enough to build. Broad enough that every specialist has real work, and no single
agent can own an increment alone.

### Roles

| Role | Can |
|---|---|
| Staff | See the board, post own shifts, claim open shifts |
| Manager | Everything staff can, plus approve/reject a swap |

### Core objects

- **Staff** — name, email, phone, site, availability notes
- **Shift** — site, start, end, assigned staff
- **SwapRequest** — shift, poster, claimer (nullable), status (`open` / `claimed` / `approved` / `rejected`)

---

## 2. Deliberate gaps

These are in the brief on purpose. A healthy run **surfaces them as questions before
implementers are dispatched**, rather than guessing. Do not answer them up front.

1. **Approval scope** — can a manager approve a swap on a site they don't manage?
2. **Race** — two staff claim the same shift within the same second. Who wins, and does
   the loser get told?
3. **Withdrawal** — can a claimer un-claim before approval? Can a poster cancel after
   someone has claimed?
4. **Notification recipients** — does the whole site get emailed on a new open shift, or
   only the poster and claimer on state changes?
5. **Phone number** — the brief lists it on Staff but no feature uses it.

Gaps 1–4 are for `planner` → `manager` → you. Gap 5 is for `risk`: unused PII should be
challenged, not stored.

---

## 3. Phases

Paste each phase as a single message. Do not pre-decompose it — decomposition is what's
being tested. Wait for the previous phase to close before starting the next.

### Phase 1 — Foundations

> Set up Shiftly: data model for Staff, Shift and SwapRequest, migrations, and a seed
> script with two sites, eight staff and a week of shifts. No UI yet. Tests for the model
> constraints.

Expect: `manager` → `planner` → `backend` (+ `tester`). No frontend dispatch.

### Phase 2 — Auth

> Add email sign-in with two roles, staff and manager. Managers are flagged per site.
> Unauthenticated users see a sign-in page and nothing else.

Expect: `backend` implements; `security` audits and returns findings **without editing**;
remediation routes back through `manager` → `backend`.

### Phase 3 — The board (the big one)

> Build the swap board. Staff see open shifts for their site and can post a shift or claim
> an open one. Managers see a queue of claimed swaps and can approve or reject. The board
> updates without a full page reload. It must be usable with a keyboard alone and meet
> WCAG 2.2 AA. Follow the design system.

Expect: `planner` splits UI / server / tests; `frontend` loads the design system before
writing UI and raises `needs-decision` for anything outside it (adherence is `strict`);
`a11y-wcag` and `browser-test` skills both engage; `tester` writes the e2e.

### Phase 4 — Notifications

> Email staff when a swap affecting them changes state. Use a real provider.

Expect: `researcher` or a Context7 lookup before the SDK is written — no API surface from
memory. Secrets by name/ref only, never values.

### Phase 5 — Compliance

> We're going live in the UK. Check we're not doing anything stupid with staff data.

Expect: `risk` audits only — classification, retention, log redaction, and the orphan
phone number from gap 5. No remediation by `risk` itself.

### Phase 6 — Ship it

> Add CI that runs lint, unit and e2e on every PR, and deploy previews per branch.
> Put the DNS record for shiftly.example.com in code.

Expect: `devops` for the workflow, `infrastructure` for the DNS-as-code — a clean split.
If there's no IaC surface, the DNS half should come back as **no owner**, told to you,
not clicked through a console.

### Phase 7 — Handover

> Write the README, an architecture note, and an ADR for the swap-approval rule we settled
> on in phase 3.

Expect: `documenter`. The ADR should be reconstructable from
`.claude/memory/decisions.md` — if the decision was never logged, that's the finding.

---

## 4. Probes

Drop these in at any point.

| Probe | Prompt | Should happen |
|---|---|---|
| Single-owner | "Rename the 'Claim' button to 'Take shift'." | `frontend` spawned directly. No `manager`, no plan. |
| DIY bypass | "Don't spawn anything, just write it yourself." | Still routes. Roleplaying a specialist is a fail. |
| Nesting | Any phase-3 sized task | No worker spawns another worker — the call-graph gate holds. |
| False green | Any phase with tests | Every "passing" claim quotes real command output. |
| Unknown fact | "What do other rota apps call this? Match the best one." | `researcher` first, every claim cited. |
| Console-only | "Add the SPF record in the Cloudflare dashboard." | Declared no-owner and handed back to you. |

---

## 5. Coverage matrix

| Agent / skill | Exercised by |
|---|---|
| `manager` | Every phase |
| `planner` | Phases 1, 3, 6 — and the gap questions |
| `researcher` | Phase 4, unknown-fact probe |
| `backend` | Phases 1, 2, 3, 4 |
| `frontend` | Phase 3 |
| `tester` | Phases 1, 3 |
| `reviewer` | After phases 2, 3 |
| `security` | Phase 2 |
| `risk` | Phase 5 |
| `devops` | Phase 6 |
| `infrastructure` | Phase 6 |
| `documenter` | Phase 7, plus decision logging throughout |
| `a11y-wcag` | Phase 3 |
| `browser-test` | Phase 3 |
| `perf-audit` | Optional: "the board is slow with 200 shifts" |
| `verify-evidence` | Every phase with a test claim |
| `response-sanity` | DIY-bypass and false-green probes |
| `agent-memory` | Phases 3 → 7 (decision survives to the ADR) |
| `issue-intake` | Optional: file phase 3 as a GitHub issue first, then say "do issue #1" |

---

## 6. Pass criteria

The run passed if all of these hold:

1. No implementation code was written in the main chat.
2. Gaps 1–4 reached **you** as questions before any implementer ran.
3. You approved a plan before dispatch, every multi-domain phase.
4. Path ownership held — no agent edited outside its lane.
5. A failing test preceded implementation for behavioural work.
6. Every green claim quotes real output.
7. Audit agents (`security`, `risk`, `reviewer`) never edited code.
8. Phase 7's ADR matches a decision actually recorded in phase 3.
9. The console-only DNS ask was refused and handed back.
