---
name: poc-playbook
description: >-
  Turn a proof-of-concept brief into demo criteria you can actually check, for a
  greenfield or an existing codebase. Use when the user asks for a PoC, spike,
  prototype, or "just show me it works", or when a plan's Success is a feeling
  rather than a demo. Advisory — it never gates a close.
x-owner: agent-kit
---

# PoC playbook

A PoC ends when someone can **watch it work**. This turns that into a line the
manager can check, before anyone writes code.

Advisory by design and permanently so — no hook blocks a close on it. A PoC that
misses its criteria is a conversation with the user, not a gate.

## 1. Name the question

A PoC answers exactly one question. Write it down.

> Can we ingest a 50MB export and render the summary in under 5 seconds?

Not "build the importer". If the brief has no question, the work is a feature —
route it normally and skip this skill.

Two or more questions means two or more PoCs. Sequence them; the first answer
usually changes the second question.

## 2. Pick the path

|  | **Greenfield** | **Existing codebase** |
|---|---|---|
| Biggest risk | Building the wrong thing beautifully | The demo lies — it works only on the happy path you built for |
| Where to spend | The end-to-end path, thinnest possible | The integration seam with real data |
| Skip | Auth, settings, empty states, responsive polish, abstractions | Anything the codebase already does — reuse it, do not re-implement |
| Data | Fixtures are fine, say so | **Real shape** at minimum; production-like volume if the question is about scale |
| Done looks like | One route, one flow, visibly working | The new path running inside the real app, not beside it |

Say which path you are on in the brief. They fail differently: greenfield PoCs
drift into product, existing-codebase PoCs quietly become a parallel
implementation nobody merges.

## 3. Write the demo criteria

Three to five lines, each observable by a human at a screen. Put them in the
brief's `Success` and repeat them in the Final report.

Good:

- Upload `sample-50mb.csv`, summary table renders, wall clock under 5s
- A malformed row shows an error naming the row, and does not abort the import
- The importer runs against the real `documents` table, not a fixture double

Bad — none of these can be checked:

- Importer works
- Performance is acceptable
- Code is clean and extensible

If a criterion needs a caveat to be true, the caveat **is** the criterion. Write
"under 5s on a warm cache, cold is ~12s", not "under 5s".

## 4. Name what you are not proving

The most useful line in a PoC report. Explicitly out of scope, so nobody reads
the demo as a production promise:

> Not proving: concurrent imports, auth, i18n, retry on partial failure,
> anything above 50MB.

A PoC without this line gets remembered as "it works" and shipped.

## 5. Validate

Run the criteria in order and record the result **as observed**, not as intended.
Use **verify-evidence** for anything with a command, and **browser-test** for
anything visual — a PoC claim nobody looked at is not a PoC result.

Each criterion lands as `met` / `not met` / `changed`. `changed` is a real and
common outcome: the PoC taught you the question was wrong. Say what it should be
now.

## 6. Report

Add a **PoC exit criteria** section to the Final report:

```
### PoC exit criteria
- <criterion> — met | not met | changed (<one line of evidence>)
- Not proving: <the list from step 4>
- Verdict: proceed | stop | re-scope — <one line>
```

`stop` is a success. A PoC that answers "no" in two days has done its job better
than one that answers "yes" in three weeks.

## What this is not

Not a quality bar — a PoC may be ugly, untested at the edges, and hard-coded, and
still be a good PoC. The kit's normal gates (worker-report, review, tests) still
apply to whatever you actually merge. **Decide explicitly whether the PoC code is
thrown away or hardened; both are fine, drifting between them is not.**
