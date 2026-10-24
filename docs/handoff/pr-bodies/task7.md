# Task 7 PR (not created: owner opens it)

Base: feat/2026-10-24-p6-load-reconciliation (Task 6)
Head: feat/2026-10-24-p6-journey-smokes
Title: feat(load): add the cal, medusa and documenso journey smokes

## Body

## What and why

Replaces the three health smokes (`k6 smoke` on Medusa, Cal and Documenso, which only proved that a route answered) with
three journey smokes that run a business journey under a small fixed load and then check the books:

- **Cal (P6-CAL-LOAD-001):** look up the schedule, book a slot; one booking per iteration from the global iteration counter.
- **Medusa (P6-MED-LOAD-001):** browse, create a cart, add a line item, set the address and shipping, open a payment session, complete;
  a refusal at the line item is a clean end of the journey (`stop: true`), not a failure.
- **Documenso (P6-DOC-LOAD-001):** create an envelope, add two recipients and signature fields, distribute, sign and complete as each
  recipient; the distribute reply is checked strictly (exact recipients, one signing token each).

The product setup and cleanup sweep by the run's prefix, from the database and the admin API, so a request whose reply the client never
saw is still removed. Cal cancels by the uid it reads from the database. Medusa cancels and archives the live orders, deletes the product
and the customers with the prefix. Documenso ends the run through its own `endRun`.

Plan: docs/plans/2026-10-24-p6-phase3-task7-journey-smokes.md (§6, §10, §12).

## Commits

Build order of §12 (one commit per step, `npm run check` after each), then the fixes found while building:

- feat(k6): let a journey step end the journey cleanly (`stop: true`)
- feat(k6): add the cal booking journey and case
- feat(k6): add the medusa checkout journey and case
- feat(k6): add the documenso signing journey and case
- feat(load): add cal setup and cleanup that sweep by prefix (also adds `LoadContext.secrets`, forwarded to k6 by `secretEnv` only)
- feat(load): add medusa setup and cleanup, including the customer sweep (also adds `deleteCustomersByPrefix` to `src/medusa/admin.ts`)
- feat(load): add documenso setup and cleanup (also adds `LoadContext.handles`, in memory only)
- feat(load): register the three journey smokes
- ci(perf): replace the health smokes by the journey smokes (+ a style commit)
- chore(k6): remove the retired health smokes
- docs: point the readme and agents notes at the journey smokes
- ci(perf): move the medusa multi-instance build key to harness v0.2.15 (a Task 2 fix, merged up; see Task 2)

## Verification

`npm run check` after every step: 667 at step 1 (Task 6 count + 1; the plan's own B is 690, see deviations), 668, 669, 672, 676, 681,
684 after step 7, and 684 through the end (steps 8 to 11 add no unit tests). `tsc` and `k6 inspect` pass on all three case scripts.
The journey tests (`tests/unit/load-journey-cases.test.ts`, 5 tests) evaluate each journey in Node through a loader hook that stubs
`k6/*`, and compare each request body with the payload builder in `src/*/payloads.ts` (the Cal booking, the Medusa cart, line item,
address and payment session, the Documenso recipients, fields, sign and complete bodies) and with the distribute failure cases.

## CI

perf.yml workflow_dispatch on this branch (head 7d688df): run 40097847812. Result: see the run-2 report and the update below.

## Budget

The new step budgets from §10 (the plan's numbers): cal LOAD 1.4 min estimate (4 min PR cap, 6 min main), documenso LOAD 1.5 min
(3 PR, 4 main), medusa LOAD in the new job `medusa-load` (45-minute timeout, the same as `medusa-order-races`): 1.9 min estimate,
6 min main, 4 min PR. Each LOAD step's `timeout-minutes` is the 80 % stop rule's cap; no existing timeout was raised.

## Deviations

- **The unit-test base is 666, not the plan's 690.** Tasks 5 and 6 are partial in this stack (Task 5 has 634 tests against the plan's
  657, Task 6 has 666 against 690), so every count here is the plan's count minus that gap: 667 at step 1, 684 at the end.
- **`reconcileStage` (Task 6) is not built.** The plan's pre-check of the four names (§5 check 3) fails on that one name. The cases do
  not use it: each case's stages are `setup` and `cleanup` only, as in the plan's §6.5 snippet. The product audits that the plan
  attaches through `ctx.config.audit` are written by setup, but nothing reads them yet, so the "books agree afterwards" check is
  **not** run in this PR. Task 6's live readers are the missing piece.
- **`.gitignore`:** `products/` matched `src/load/products/`. Anchored to `/products/` (the checkout directory at the repo root).
- **`src/load/products/medusa.ts`** keeps its `deleteCustomersByPrefix` in `src/medusa/admin.ts` next to `deleteCustomersByEmail`
  (the admin helper is private there). The plan names it in the products module.
- **Documenso recipient mailboxes** are read from `"Recipient"` joined to `"Envelope"` by title. The table and column names follow the
  Prisma convention; no existing code in this repo reads that table, so this is **not yet verified** against the live schema (the
  CI run is the first check).
- **Step 5 commit** also changed `src/load/runner.ts`, `src/load/stages.ts` and the runner test: the new `secrets` field needs them.
  The plan's path list did not name them.
- **Step 1** also needed `k6/lib/pure/journey.js` (the `stop` rule) only; no other file.
- **k6 type fixes** in the journeys (JSDoc types, one unused import removed in the Cal journey, the Documenso `http` import kept). Behaviour
  unchanged; the plan's code was copied from the working prototype and did not type-check under the repo's strict settings.

## Not built / open

- The audit stage of the three cases (needs Task 6's `reconcileStage` and live readers). Until then the LOAD steps prove the journeys and
  the validity judge, not the books.
- Live steps of plan §5 (the Cal slot count probe, the rate probes on the runner) are covered by the CI runs, not by local runs.

## Environment changes

None beyond the k6 pin of Task 3.

## Escalation check (Task 7)

- CI/runner change: YES. Five health smoke steps and their uploads removed; three LOAD steps added; new job `medusa-load` (45 min).
- Timeout raised: NO. The new step timeouts are new; no existing timeout changed.
- Test merged or split, or assertion weakened: NO.
- Secret, footer line, force-push or merge to main: NO.
