# P6 Phase 2 Task 2: Medusa money races (plan, revision 3)

This is the implementation plan a weaker model will build from. Do not write code until the maintainer approves this
document.

Structure follows [2026-10-22-p6-phase2-task1-rerun-on-spread.md](2026-10-22-p6-phase2-task1-rerun-on-spread.md). The
source of this task is [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md), section "Task 2: Medusa money
races", decisions D5, D6, D12, and "Notes on the agreed order" items 4 and 8 (the gift-card gate). The framework it builds
on is Task 1 (rerun-on-spread, merged in PR #27 on this branch).

**Probe status.** Revision 1 held static findings only. Revision 2 added the **live probe** (§2.5). Revision 3 adds the
live test of the cleanup candidates for a stuck pending order change (§2.5b) and the F-M1 label rule (D40). All runs were
on the cloud VM against the pinned stack (`npm run up:medusa`, then `npm run down:medusa`; every exit code 0, `:9000`
closed). Live results are proof only (AGENTS.md): they show what the stack does, not a published number.

## Context

- Repo: `k6-load-concurrency-suite` (P6). This plan is on branch `feat/2026-10-22-p6-med-money-races`, cut from `main`
  at `147d94b`. The designated session branch `claude/wonderful-meitner-a7ql20` keeps the first copy of the plan and is
  not changed by this task.
- Harness `qa-portfolio-harness#v0.2.11`. Never edit the Medusa fork or `node_modules/qa-portfolio-harness`.
  `scripts/harness.mjs` starts and stops Medusa (`npm run up:medusa`, `npm run down:medusa`); every probe run ends with
  `npm run down:medusa`.
- Cases in this task: `P6-MED-RACE-007` (P1, refunds ≤ captured), `P6-MED-RACE-011` (accepted extra, partial-refund
  boundary), `P6-MED-RACE-010` (accepted extra, captures ≤ authorized). `P6-MED-RACE-006` (gift card, P0) **moves to
  "Later"** (D34, confirmed live, §2.2).
- Owner decisions that apply: **D2** (valid when `dispatchSpreadMs ≤ RACE_MAX_SPREAD_MS`), **D3** (only spread makes an
  attempt invalid; product violations always count), **D4** (top-level `statusCounts` count valid attempts only), **D5**
  (no gift-card plugin: P6 never changes the Medusa fork), **D6** (trial counts: small on PRs, full on `main`, nightly and
  dispatch), **D12** (`-010` and `-011` are in scope with their proposed IDs). Task 1 decisions D26 to D33 apply
  unchanged (warm-up burst D28, `trials[]`/`attempts[]` histogram D30). Decisions D34 to D41 are this plan's (§20).
- Primitive (roadmap "Primitive bar"): **money never goes negative**, **money never over-returned**. Transfers to finance
  (prepaid card double spend, capture or refund over the authorised amount) and to healthcare billing (a payout cap on a
  claim).

## 1. Header

- Plan date 2026-10-22 (UTC). Static reads and the live probes were all done in a Claude Code cloud session on the same
  date.
- Baseline: `main` at the merge of PR #27 (`147d94b`), `npm run check` must be green before the build starts (Step 0).
- Live numbers (time per attempt, race outcomes) are **proof only** until a GitHub Actions run; published numbers come
  only from Actions (median of at least 3 runs), per AGENTS.md.
- Secrets: the Medusa admin password comes from the harness config or the environment (`src/medusa/admin.ts` already does
  this). The probe used a throwaway admin password held in a mode-600 scratch file outside the repo. Nothing from a probe
  goes into this plan, the histograms or the logs.

## 2. Probe findings

### 2.1 Summary

| #   | Question                                    | Finding (live, 2026-10-22, unless marked static)                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Gate for `-006` (gift card at `MEDUSA_REF`) | **Live: no gift-card feature.** `GET /admin/gift-cards`, `GET /store/gift-cards`, `GET /admin/store-credits` and `GET /store/store-credits` all return **404**. The database has no gift-card table. **`-006` moves to "Later" (D34 confirmed).**                                                                                                                                                                                                        |
| G2  | Refund route and guard                      | **Live:** a sequential refund of X+1 after a capture of X returns **400** "You are not allowed to refund more than the captured amount" (the text of `refund-payment.js` line 33). Under 10 parallel refunds the losers instead return **400** "You cannot refund more than what is captured on the payment." (a different guard, not in `refund-payment.js`). The over-refund was **not** reached in 3 runs of `-007`. See F-M1 for the `-011` anomaly. |
| G3  | Capture route and guard                     | **Live:** `POST /admin/payments/:id/capture` with `{ amount }` returns **200**. A second sequential capture of the same payment also returns **200** and adds **no** capture row. Under 10 parallel captures: 1 × **200**, 9 × **400** "You cannot capture more than the authorized amount substracted by what is already captured." The payment-module TODO (`payment-module.js` line 143) did not produce a double capture in 3 runs.                  |
| G4  | Does checkout auto-capture with `system`?   | **Live: no.** After `completeCart` with the `system` provider the payment has `captured_at` NULL and 0 capture rows (2 of 2 orders). **`-010` stays in scope (D35 confirmed).**                                                                                                                                                                                                                                                                          |
| G5  | Promotion lock (for Task 3, noted here)     | **Static only:** `promotion-module.js` line 76 says the budget row is locked by the caller (`registerUsage`); lines 145 to 152 lock promotion rows in id order. Not probed (Task 3).                                                                                                                                                                                                                                                                     |
| G6  | Setup per attempt and cleanup               | **Live:** `createStockedVariant` → `prepareReadyCart` → `completeCart` gives an order and a payment in every run. Cleanup (refund to zero, then `cancel` and `archive`) works for a serially refunded order and for a captured but unrefunded order. **1 of 9** concurrent `-011` orders was left with a `pending` change that blocked cancel; `POST /admin/order-edits/:id/confirm` cleared it (§2.5b).                                                 |
| G7  | Where money is read                         | **Live:** `payment` (`amount numeric`, `raw_amount jsonb`, `captured_at`, `payment_collection_id`), `capture` and `refund` (`amount numeric`, `raw_amount jsonb`, `payment_id`), `payment_collection` (`authorized_amount`, `captured_amount`, `refunded_amount`), `order_payment_collection` (`order_id`, `payment_collection_id`). The oracle sums `amount` directly; `raw_amount` is not needed.                                                      |

### 2.2 Gate result for `-006` (D5, D34): confirmed live

Live evidence (§2.5 P1):

- `GET /admin/gift-cards`, `GET /store/gift-cards`, `GET /admin/store-credits`, `GET /store/store-credits`: **404**
  (`Cannot GET ...`).
- The database table list (`information_schema`, `%gift%` or `%credit%`) returns `credit_line` and `order_credit_line`
  only. Those are order-change totals (the `credit_line` change type seen in F-M1), not a spendable balance.
- Static (§2.1 G1): `medusa-config.ts` has no `plugins` and no `modules`; no gift-card code in the installed packages.

**Decision:** `P6-MED-RACE-006` moves to "Later" (D34). The money primitive is covered by `-007`, `-010` and `-011`. No
`med-race-006-gift-card.spec.ts` is created. The README and the Task 9 closeout record the move with this evidence.

### 2.3 Gate result for `-010` (capture is a separate step): stays in scope (D35)

The live probe shows checkout does **not** capture: a `system`-provider order has `captured_at` NULL and no capture row
(2 of 2 orders). The capture route is therefore a separate admin step, and `-010` stays in scope. `-010` moves to
"Later" only if a later stack changes this (§21, item 4).

### 2.4 The refund cases: what the code says and what the stack does

Code (static, §2.1 G2): `refund-payment.js` checks captured minus refunded before the refund step, with no lock step. The
check-then-act window the roadmap names is therefore possible in the code.

Stack (live): under 10 parallel refunds of X on one captured X (`-007`, 3 runs), exactly one request succeeded in every
run and the 9 losers returned **400** "You cannot refund more than what is captured on the payment." That text does not
come from `refund-payment.js`; it comes from a later guard. The window did not produce an over-refund here. **`-007`
passes its oracle in 3 of 3 runs.**

For `-011` (N parallel refunds of X/2 on one captured X) the expected result is exactly two successes, a refund sum of
exactly X, and N − 2 clean 4xx. The live result differs in an important way: the refund **sum** is always exactly X, but
the **HTTP successes** are usually one, not two (F-M1, §2.5). F-M1 is a **suspected product bug** (D40); it is not
labelled PRODUCT BUG until full-count CI runs reproduce it.

### 2.5 Live probe output (2026-10-22)

Environment: `npm run up:medusa` exit 0 (`/health` 200 in 6.1 s), Medusa on `127.0.0.1:9000`, `MEDUSA_REF` `f677db43`,
`@medusajs/*` 2.21.2. Probe scripts (never committed): `/tmp/claude-0/-home-user-k6-load-concurrency-suite/43568a29-0543-5b16-b790-de0b35f11fb8/scratchpad/probe-1.ts` to `probe-8.ts`,
importing the repo's own helpers (`src/medusa/admin.ts`, `src/medusa/store.ts`, `src/races/fire-together.ts`,
`src/oracles/pg.ts`). `npm run down:medusa` exit 0 on both stack runs (the first run and the cleanup-candidate run), `curl :9000/health` → `000` (closed).

| Probe item                                                            | Result (live)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 gift-card routes                                                   | `GET /admin/gift-cards`, `GET /store/gift-cards`, `GET /admin/store-credits`, `GET /store/store-credits` → **404** each (`Cannot GET ...`). No gift-card table. **`-006` → Later (D34).**                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P2 capture/refund bodies and statuses                                 | Body `{ "amount": <integer> }` accepted for both routes. Capture X → **200** (`captured_at` set, 1 capture row). Second capture X → **200**, still 1 capture row. Refund X+1 (captured X) → **400** `{"type":"invalid_data","message":"You are not allowed to refund more than the captured amount"}`. Refund X/2 → **200**. Refund the remaining X/2 → **200** (refunded to zero). Not tested: a capture with no body, a refund with a `note` or `refund_reason_id`.                                                                                                                                       |
| P3 checkout auto-capture                                              | **No.** Two of two `system`-provider orders: `captured_at` NULL, 0 capture rows, 0 refund rows after `completeCart`. **`-010` stays in scope (D35).**                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P4 table names and `raw_amount` shape                                 | `payment` (`id`, `amount numeric`, `raw_amount jsonb`, `currency_code`, `captured_at`, `payment_collection_id`), `capture` (`id`, `amount numeric`, `raw_amount jsonb`, `payment_id`), `refund` (`id`, `amount numeric`, `raw_amount jsonb`, `payment_id`, `refund_reason_id`, `note`), `payment_collection` (`authorized_amount`, `captured_amount`, `refunded_amount`, `status`), `order_payment_collection` (`order_id`, `payment_collection_id`). Read-only pool (`createReadOnlyPool`) reads all of them. Soft delete via `deleted_at`.                                                                |
| P5 amounts                                                            | Order total X = **1010** (not the unit price 1000; the reason is not probed). X is an integer. X/2 = 505 is accepted with 200. The probe never produced an odd X.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P6 race outcome (proof only; N = 10, `fireTogether`, 3 runs per case) | **`-007` refund X:** statuses `{200:1, 400:9}` in each run; captured 1010, refunded 1010, 1 refund row; spread 1.81 to 2.19 ms. **3 of 3 pass.** **`-010` capture X (authorised, not captured):** `{200:1, 400:9}`, 1 capture row, captured 1010. **3 of 3 pass.** **`-011` refund X/2:** see F-M1.                                                                                                                                                                                                                                                                                                         |
| P7 time per attempt (proof only)                                      | Pre-capture (where needed) + burst + oracle + cleanup: **656 to 1 087 ms** per attempt on the probe VM. Checkout setup (product, cart, complete) is not timed separately. Estimate for the three money specs at 50 trials: about 150 attempts plus 150 setups, well under the 45-minute `medusa-smoke` budget if a setup costs a few seconds. Confirm with the first CI run (§12).                                                                                                                                                                                                                          |
| P8 cleanup of a captured order                                        | Serial order A: refund to zero, then `cancel` and `archive` → **200**, order `archived`. Order B (captured, not refunded): `cancel` → **200**, `archived`. Product delete → **200**. Concurrent `-011` runs (9 in total across the probes): **8 of 9** cleaned up with `cancel` + `archive` directly. **1 of 9** (probe-4 run 3) was blocked by a `pending` `credit_line` order change: `cancel` → **400** "Order (...) already has an existing active order change"; `archive` → **400** "Orders (...) are completed, canceled, or in draft and cannot be archived". Cleared by the confirm route (§2.5b). |

**Summary runs, N = 10 (`probe-3.ts`):**

```text
P6-MED-RACE-007 refund X run 1..3: statuses {"200":1,"400":9}  successes=1  captured 1010  refunded 1010  refund_rows=1
  loser "You cannot refund more than what is captured on the payment."  spread 1.81 to 2.19 ms  cleanup ok (3 of 3)
P6-MED-RACE-011 refund X/2 run 1..3: statuses {"200":1,"400":9}  successes=1  captured 1010  refunded 1010  refund_rows=2
P6-MED-RACE-010 capture X run 1..3:   statuses {"200":1,"400":9}  successes=1  captured 1010  capture_rows=1
  loser "You cannot capture more than the authorized amount substracted by what is already captured."  cleanup ok (3 of 3)
```

**Detailed `-011` runs, per request (`probe-4.ts`), abridged:**

```text
run 1: req0 200 (refund 505) | req2 400 "Order ... already has an existing active order change" | 8 others 400 "cannot refund more than captured"
       refund rows: 505 + 505 = 1010   cleanup ok
run 2: req1 400 "...already has an existing active order change" | 1 x 200 | 8 others 400   refund rows: 505 + 505   cleanup ok
run 3: req0 200, req1 200 | 8 others 400   refund rows: 505 + 505   cleanup FAILED: pending credit_line change, cancel 400
```

**F-M1 (suspected product bug, D40).** Concurrent refunds of X/2 on a captured X (N = 10). In all runs the refund sum is
exactly X and there is no over-refund, so the money invariant holds. But in **8 of 9 runs** two refund rows of 505 were
committed while only **one** request returned 200 (summary runs 3 of 3, detailed runs 2 of 3, confirmation runs 3 of 3).
In the detailed runs that log the reason, the second request returned **400** "already has an existing active order
change" **after** its refund row was written. The client is told the refund failed when the money moved. In the one run
with two HTTP 200s, the order was left with a `pending` `credit_line` change, which blocked cancel and archive (P8). So the
`-011` expectation "exactly two successes, sum X" holds on the database and fails on the HTTP side.

What this plan does with it: F-M1 is recorded as a **suspected product bug** with this evidence (D40). It is labelled
PRODUCT BUG only after **full-count CI runs** (`main`, nightly or dispatch) reproduce the same HTTP-versus-database
mismatch. The probe VM runs do not decide the label.

### 2.5b Cleanup candidates for a stuck pending order change (live, probe-7 and probe-8)

The stuck order from probe-4 run 3 was still in the probe database. Its change list before the test: one `confirmed`
`credit_line` change (the first refund) and one `pending` `credit_line` change (the second refund). The order status was
`pending`. Each candidate below was tried against that order, with the change status read from the database after each.

| Candidate | Route and workflow (pinned source, `MEDUSA_REF` `f677db43`)                                  | Live result                                                                                                                     | Effect on the pending change                                                |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A         | `POST /admin/order-edits/:orderId/confirm` (no body), workflow `confirm-order-edit-request`  | **200**, returns an `order_preview`                                                                                             | **pending → confirmed**. Order status stays `pending` until cancel.         |
| B         | `DELETE /admin/order-edits/:orderId`, workflow `cancel-begin-order-edit`                     | **400** "An active Order Change is required to proceed"                                                                         | None. It cancels an in-progress order **edit**, not a `credit_line` change. |
| C         | `POST /admin/order-changes/:changeId` (body `internal_note`), workflow `update-order-change` | **200**                                                                                                                         | None. The status stays `pending`. It only updates notes and promotions.     |
| D         | `cancel-order-change` and `decline-order-change` workflows                                   | Not tested. **No HTTP route calls either workflow** (`dist/api/admin` search), so they are not reachable through the admin API. | n/a                                                                         |
| E         | `POST /admin/orders/:orderId/cancel`, then `POST /admin/orders/:orderId/archive`             | Cancel **200** and archive **200** after candidate A. Before A, cancel returned **400** (§2.5 P8).                              | Order `archived`. Cancel created its own confirmed change.                  |
| F         | `GET /admin/orders/:orderId/changes`                                                         | **200**, lists each change with its id and status. Used to read the ids.                                                        | None (read only).                                                           |
| G         | `POST /admin/orders/:orderId/credit-lines` (create workflow)                                 | Not tested. Its workflow creates credit lines and clears nothing.                                                               | Not applicable.                                                             |

**Result: candidate A clears the stuck change.** Candidate A, followed by cancel and archive, gave `archived`. This is the
only candidate that changed the pending change's status.

**Repeat check (probe-8, three fresh `-011` bursts, the cleanup order: confirm if a pending change exists, refund to zero,
cancel, archive).** Each run: `{200:1, 400:9}` with 2 refund rows summing to 1010 (F-M1 again). **No run had a pending change**,
so the confirm step did not run. Cancel and archive returned **200** in all three. The stuck state is therefore intermittent:
**1 of 9** runs across the probes (probe-4 run 3), with no way to force it from the probe.

**Limits.** Candidate A was proven on one stuck order and was not repeated on a stuck order in CI. Its response includes an
`order_preview` with `transaction_total` −1010 (the refunded total); the probe did not analyse what that preview means for
the order's accounting. The probe ran the admin API as the seeded admin only. This is the cleanup route the build uses; it
is not a test of the confirm's effect on money (the money oracle reads the refund rows, which were unchanged).

### 2.6 What the repo already has (reused, not re-planned)

| Need                               | Where                                                                                                           | Status                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Stocked product per attempt        | `createStockedVariant` (`src/medusa/admin.ts` line 131)                                                         | reuse; the attempt tag is in the handle; the handle must be lowercase (a mixed-case handle returned 400 live) |
| Ready carts, complete              | `prepareReadyCart(s)`, `completeCart` (`src/medusa/store.ts` lines 54, 139, 147)                                | reuse                                                                                                         |
| Cancel and archive, product delete | `cancelAndArchive`, `deleteProduct` (`src/medusa/admin.ts` lines 197, 211)                                      | reuse; add the confirm step before cancel when a pending change exists (§9)                                   |
| Payload helpers, prefixes          | `src/medusa/payloads.ts` (`casePrefix`, `caseLeakPattern`, `prefixedEmail`, `setupStepError`, `cleanupFailure`) | reuse                                                                                                         |
| Oracle + leak check                | `src/medusa/oracle.ts` (`readOversellSnapshot`, `leakCheck`)                                                    | reuse the pattern, new SQL constants                                                                          |
| Invariant helpers                  | `src/medusa/invariants.ts` (`checkOversellInvariants`)                                                          | reuse the shape                                                                                               |
| Per-trial runner                   | `createRerunRunner` (`src/races/rerun-on-spread.ts` line 96), `fireTogether`                                    | reuse as Task 1 does in `runOversellCase`                                                                     |
| Per-test run                       | `playwright.config.ts` project `medusa-race`, `timeout: 60_000` default, the oversell spec sets its own         | reuse                                                                                                         |

### 2.7 Files and tests that read the same code today

- `src/medusa/run-case.ts` (305 lines) is the oversell case. The money cases get their own module, not a grown
  `run-case.ts` (the roadmap allows this; §6 decides).
- `tests/medusa/races/med-race-001-oversell.spec.ts` (120 lines) is the spec shape to copy.
- `tests/medusa/races/framework-self-test.spec.ts` (149 lines) fires the runner; the money cases need no change to it.

## 3. Goal and scope

**Goal.** Prove that, under contention, the Medusa payment module never captures more than is authorised and never
refunds more than is captured. A case that breaks the rule is recorded as a product bug with repeated-run evidence, not
hidden. A case whose HTTP results disagree with the database is recorded as a suspected product bug (D40).

**In:**

- `P6-MED-RACE-007`, `-011`, `-010` (all three are live-confirmed to be reachable; §2.5).
- Admin client calls for capture, refund, reading a payment, and the confirm call for a pending change (§2.5b).
- Pure money helpers and invariants, with unit tests.
- Oracle SQL for captured and refunded sums per payment.
- One CI step in `medusa-smoke`, or a separate `medusa-money` job if §12 says so (D39).
- README and `.env.example` changes (only if an env name is added; §12).

**Out:**

- `P6-MED-RACE-006` (D34; moves to "Later"). No plugin, no fork change.
- Any change to `runTrials`, `fireTogether`, `src/races/rerun-on-spread.ts` behaviour, `src/oracles/pg.ts`, the harness,
  the Medusa fork.
- Cases in Task 3 (`-005`, `-008`, `-009`, `-012`).
- Job timeouts (D24 of Task 1 applies: no timeout change). A separate job is the approved alternative (D39).
- Playwright `retries` (stay 0), `test.fail()` outside a proven product bug with repeated-run evidence (§10).

## 4. Test-case mapping

| Case                               | Title (keep the case ID in the title)              | Spec                                                      | Oracle (per attempt, after the burst)                                              | Expected result                                                          |
| ---------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `P6-MED-RACE-007` (P1)             | refunds of X on one captured payment               | `tests/medusa/races/med-race-007-refunds.spec.ts`         | `refundedSum ≤ capturedSum` (integer `amount` sums); successes = 1; losers are 4xx | pass (live: 3 of 3); a proven over-refund is `test.fail()` with evidence |
| `P6-MED-RACE-011` (accepted extra) | N parallel refunds of X/2                          | `tests/medusa/races/med-race-011-partial-refunds.spec.ts` | `refundedSum = capturedSum`; HTTP successes = 2; losers 4xx                        | DB side passes; the HTTP count is a suspected bug (F-M1, D40)            |
| `P6-MED-RACE-010` (accepted extra) | N parallel captures of X on one authorised payment | `tests/medusa/races/med-race-010-captures.spec.ts`        | `capturedSum ≤ authorizedAmount`; successes = 1; losers 4xx                        | pass (live: 3 of 3)                                                      |

Each case fires the Task 1 untimed **warm-up burst** first (D28). The warm-up has its own order and its own cleanup, so a
warm-up refund or capture never reaches a counted attempt.

## 5. Extras and follow-ups

| #    | Item                                           | Decision                                                                                                                                                          |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D34  | `-006` gift card                               | **Confirmed live**: no route, no table (§2.2). Moves to "Later".                                                                                                  |
| D35  | `-010` gate (auto-capture)                     | **Confirmed live**: checkout does not capture (§2.3). `-010` stays in scope.                                                                                      |
| F1   | Refund rounding and decimal amounts            | Out of this task. The amounts are integers (§7.3), so the float question does not arise here. A decimal case is a follow-up.                                      |
| F2   | Captured-order cleanup                         | **Live fix found**: a pending change is confirmed through `POST /admin/order-edits/:id/confirm`, then cancel and archive (§2.5b, §9, D41). The probe ran it once. |
| F-M1 | `-011` HTTP successes versus committed refunds | **Suspected product bug** (D40, §2.5). PRODUCT BUG label only after full-count CI runs reproduce it.                                                              |

## 6. Architecture (every file touched, one responsibility each)

| File                                                                                       | Change  | Responsibility                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/medusa/admin.ts`                                                                      | edit    | Add `capturePayment`, `refundPayment`, `readOrderPayment`, `confirmPendingOrderChange` (admin HTTP; bodies per P2 and §2.5b).              |
| `src/medusa/payloads.ts`                                                                   | edit    | Add `captureBody(amount)`, `refundBody(amount)` (pure, unit-tested).                                                                       |
| `src/medusa/money.ts`                                                                      | **new** | Pure: `parseWholeAmount(value)` (strict integer; rejects decimals and non-numeric strings with a TEST BUG message).                        |
| `src/medusa/oracle.ts`                                                                     | edit    | Add `CAPTURED_SUM_SQL`, `REFUNDED_SUM_SQL`, `REFUND_COUNT_SQL`, `PENDING_CHANGES_SQL` (per order or payment id); `readMoneySnapshot(...)`. |
| `src/medusa/invariants.ts`                                                                 | edit    | Add `checkRefundCap`, `checkCaptureCap`, `checkSuccessCount` (pure).                                                                       |
| `src/medusa/run-money-case.ts`                                                             | **new** | The trial body for the money cases: per attempt setup, burst, oracle, cleanup (with confirm), leak check; uses `createRerunRunner`.        |
| `tests/medusa/races/med-race-007-refunds.spec.ts`                                          | **new** | `P6-MED-RACE-007`.                                                                                                                         |
| `tests/medusa/races/med-race-011-partial-refunds.spec.ts`                                  | **new** | `P6-MED-RACE-011`.                                                                                                                         |
| `tests/medusa/races/med-race-010-captures.spec.ts`                                         | **new** | `P6-MED-RACE-010`.                                                                                                                         |
| `tests/unit/money.test.ts`                                                                 | **new** | §13.1.                                                                                                                                     |
| `tests/unit/medusa-payloads.test.ts`, `medusa-oracle.test.ts`, `medusa-invariants.test.ts` | edit    | §13.2.                                                                                                                                     |
| `.github/workflows/perf.yml`                                                               | edit    | One step in `medusa-smoke`, or a `medusa-money` job (D39, §11).                                                                            |
| `README.md`                                                                                | edit    | Case rows, the `-006` "Later" move, the gate evidence, F-M1 as a suspected bug (§17).                                                      |

Unchanged: `src/races/*`, `src/oracles/pg.ts`, `src/medusa/store.ts`, `src/medusa/run-case.ts` (the oversell case),
`scripts/harness.mjs`, the Medusa fork.

## 7. Design

### 7.1 Attempt shape (one trial index, one or more attempts)

For each trial index, the runner calls `attempt(n)` (Task 1 `AttemptFn`). One attempt:

1. **Setup (not raced).** `createStockedVariant` with a **lowercase** handle `attemptTag(trial, attempt)`; `prepareReadyCart`;
   `completeCart` → one order and one payment. Read the payment id and the order total (`readOrderPayment`, P2).
2. **Pre-state (not raced, `-007` and `-011` only).** `capturePayment(X)` once, so the payment is captured X before the
   burst. Read `capturedSum` from the DB; it must equal X, or the attempt is a **setup error** (TEST BUG, not a rerun).
3. **Burst.** `fireTogether` of N admin requests: `-007` N × `refundPayment(X)`; `-011` N × `refundPayment(X/2)`;
   `-010` N × `capturePayment(X)` on an authorised payment (no pre-capture). Each request records its status and body.
4. **Oracle.** Read `capturedSum`, `refundedSum` (or `capturedSum` for `-010`), refund and capture row counts, by payment id.
   Also read the **HTTP successes** and count them against the expected number (F-M1 is visible only this way).
5. **Cleanup (§9).** If a `pending` order change exists, confirm it (`confirmPendingOrderChange`, §2.5b). Refund the rest to
   zero, then cancel and archive the order, then delete the product. The leak check runs by the case prefix.

The attempt returns `RaceAttemptResult` (Task 1 type) with `statusCounts`, `invariantViolations` (from §7.4), and the
money fields in `oracle`.

### 7.2 Which bursts can be invalid

Only the spread precondition (D3, Task 1). A money violation in an invalid attempt is still recorded and fails the case.
A setup error (step 2 or 1 fails) is never a rerun: it is a TEST BUG and fails the case at once, with the step named
(`setupStepError`).

### 7.3 Amounts

- X is the **order total** read in step 1. Live: **X = 1010**, an integer, for the one-unit cart the probe built. It is not
  the unit price 1000 (`payloads.ts` line 1), so the spec reads X and does not assume it. It must parse as a whole integer
  (`parseWholeAmount`). X/2 = 505 was accepted live. If an odd X ever appears, X/2 is not an integer: the attempt is a
  TEST BUG and the maintainer decides the amount (the roadmap's "decimal amounts compared as floats" risk).
- The oracle compares **integers** in SQL (`SUM(amount)` on `capture` and `refund`, which is `numeric` with integer values
  live) and in JS through `parseWholeAmount`. No float arithmetic on money.

### 7.4 Invariants (pure, `src/medusa/invariants.ts`)

| Function                                             | Rule                                       | Violation text (example)                                   |
| ---------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| `checkRefundCap({ capturedSum, refundedSum })`       | `refundedSum ≤ capturedSum`                | `PRODUCT BUG: refunded 2000 of 1000 captured`              |
| `checkCaptureCap({ authorizedAmount, capturedSum })` | `capturedSum ≤ authorizedAmount`           | `PRODUCT BUG: captured 2000 of 1000 authorised`            |
| `checkSuccessCount({ successes, expected, label })`  | `successes === expected`                   | `SUSPECTED PRODUCT BUG: 1 HTTP success, expected 2 (F-M1)` |
| `checkLoserStatuses(statuses)`                       | every loser is 4xx; any 5xx is a violation | `PRODUCT BUG: 5xx on a racing refund: 500`                 |

`checkSuccessCount` writes a **suspected product bug**, not a `PRODUCT BUG`, for any count that differs from expected
(D40). The request statuses and bodies are recorded with it. The label changes only through §10.

## 8. Code

Skeletons only. The build writes the full code, with Prettier and typecheck green after each file.

### 8.1 `src/medusa/money.ts` (new)

```ts
// Whole-unit money. Amounts are integers in the Medusa order currency unit (see §7.3).
export function parseWholeAmount(value: string | number, label: string): number {
  const text = String(value);
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`TEST BUG: ${label} is not a whole amount: ${text}`);
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`TEST BUG: ${label} is outside the safe integer range: ${text}`);
  }
  return n;
}
```

Unit tests: §13.1.

### 8.2 `src/medusa/payloads.ts` (edit)

```ts
export function captureBody(amount: number) {
  return { amount };
}

export function refundBody(amount: number) {
  return { amount };
}
```

Live (§2.5 P2): both routes accept `{ "amount": <integer> }` and return 200 on success. Not tested: a capture without a body,
a refund with `note` or `refund_reason_id`. The build keeps these two bodies unless it needs one of the untested fields.

### 8.3 `src/medusa/admin.ts` (edit)

```ts
export async function capturePayment(token: string, paymentId: string, amount: number) {
  // POST /admin/payments/:id/capture with captureBody(amount). Live: 200 on success.
  // Returns { status, bodyText } so the caller records every loser exactly.
}

export async function refundPayment(token: string, paymentId: string, amount: number) {
  // POST /admin/payments/:id/refund with refundBody(amount). Live: 200 on success, 400 invalid_data on refusal.
}

export async function readOrderPayment(token: string, orderId: string) {
  // Returns { paymentId, totalAmount, authorizedAmount, currencyCode } for the order.
  // The probe read the payment through SQL (§2.5 P4); the admin read's exact fields are a build-time check.
}

export async function confirmPendingOrderChange(token: string, orderId: string) {
  // POST /admin/order-edits/:orderId/confirm with no body. Live (§2.5b, candidate A): 200; pending → confirmed.
  // Called only when GET /admin/orders/:id/changes or PENDING_CHANGES_SQL shows a pending change.
}
```

Each function returns the HTTP status and the body text. The case records the status; a non-2xx is a result, not an
exception, so `fireTogether` can count it.

### 8.4 `src/medusa/oracle.ts` (edit)

```ts
export const CAPTURED_SUM_SQL = `
  SELECT COALESCE(SUM(c.amount), 0)::text AS total
  FROM capture c
  WHERE c.payment_id = $1 AND c.deleted_at IS NULL
`;
// REFUNDED_SUM_SQL: the same shape on refund, with the refund row count next to it.
// PENDING_CHANGES_SQL: SELECT id FROM order_change WHERE order_id = $1 AND status = 'pending' AND deleted_at IS NULL.
// Live (P4): capture and refund have `amount numeric` and `deleted_at`; no raw_amount parsing is needed.
```

### 8.5 `src/medusa/invariants.ts` (edit)

```ts
export function checkRefundCap(input: { capturedSum: number; refundedSum: number }): string[] {
  return input.refundedSum > input.capturedSum
    ? [`PRODUCT BUG: refunded ${input.refundedSum} of ${input.capturedSum} captured`]
    : [];
}
```

The other three checks follow the same shape (§7.4).

### 8.6 `src/medusa/run-money-case.ts` (new)

Shape only: `runMoneyCase({ caseId, mode, trials, ... })` where `mode` is `"refund-all" | "refund-half" | "capture"`. It
builds the runner with `createRerunRunner(spreadPolicyFromEnv(), trials)`, fires one warm-up attempt (own setup and
cleanup), runs `runTrials` over the runner's attempt function, writes the histogram in `finally`, and returns it.
`runOversellCase` (`src/medusa/run-case.ts`) is the reference for the trial loop and the histogram write.

## 9. Data isolation, cleanup and leak check

- Every product handle, customer email and cart carries `attemptTag` (Task 1) under the run prefix (`p6RunPrefix`). Handles
  must be lowercase (live: a mixed-case handle returned 400).
- Orders are not deletable. Cleanup order, as verified live (§2.5 P8, §2.5b):
  1. **Confirm a pending change**, only if `PENDING_CHANGES_SQL` returns one: `POST /admin/order-edits/:id/confirm`
     (candidate A, live 200; the change becomes `confirmed`).
  2. **Refund the rest to zero** (`captured − refunded`), if any remains (live: works).
  3. **Cancel** (`POST /admin/orders/:id/cancel`). Live: 200 after step 1 or with no pending change. Without step 1, a pending
     change blocks it (400, "already has an existing active order change").
  4. **Archive** (`POST /admin/orders/:id/archive`). Live: 200 after a successful cancel.
  5. **Delete the product** (`deleteProduct`). Live: 200.
- **Stuck order (reported leaked data, not a failure).** If step 1 fails, or step 3 or 4 still fails after it, the order is **not**
  a case failure. The attempt records the order id, its change rows and the error bodies, and the leak check reports the order
  as leftover data (D41). The case result is unaffected, and the row is named in the histogram's cleanup record.
- The oracle queries are by payment id, so a later attempt can never read an earlier attempt's rows.
- Leak check: a query on the case prefix (customer email, `src/medusa/oracle.ts` line 42 style) plus a payment query by order
  id. A leftover row is reported with its ids; it fails the case only when the leftover is a product or a payment of this
  attempt that cleanup did not remove (a TEST BUG, cleanup), not an order that step 1 to 4 could not archive.

## 10. Labels (PRODUCT BUG vs TEST BUG vs SUSPECTED PRODUCT BUG) and the evidence each needs

| Observation                                                    | Label                                         | Evidence needed before the label is used                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refundedSum > capturedSum` in any attempt                     | PRODUCT BUG (over-refund)                     | The attempt's request statuses and bodies, the DB rows, and the same failure in **3 full-count runs** of the case (or in the probe and one full-count run). Not seen live in 3 runs of `-007`. |
| More than one successful capture of an authorised X            | PRODUCT BUG (over-capture)                    | As above, with the capture rows. Not seen live in 3 runs of `-010`.                                                                                                                            |
| 5xx on a racing refund or capture                              | PRODUCT BUG (server fault under contention)   | The status and body. Not seen live.                                                                                                                                                            |
| HTTP successes differ from the database (F-M1, `-011`)         | **SUSPECTED PRODUCT BUG** (D40)               | Seen live in 8 of 9 runs on the probe VM. Becomes PRODUCT BUG only when **full-count CI runs** (`main`, nightly or dispatch) reproduce the same mismatch.                                      |
| Setup fails (capture before the burst, checkout)               | TEST BUG                                      | The step name (`setupStepError`).                                                                                                                                                              |
| Stuck pending change or order after cleanup steps 1 to 4       | **REPORTED LEAKED DATA** (D41), not a failure | The order id, the change rows and the error bodies, in the histogram's cleanup record (§2.5b).                                                                                                 |
| Leftover product or payment of this attempt                    | TEST BUG (cleanup)                            | The leftover rows.                                                                                                                                                                             |
| Fewer successes than expected, all losers 4xx, sums consistent | SUSPECTED PRODUCT BUG (D40)                   | The request bodies and the DB rows, as in F-M1.                                                                                                                                                |

A proven product bug becomes `test.fail()` with the evidence in the annotation and the README (roadmap rule, §3 "Out").

## 11. CI (`.github/workflows/perf.yml`)

- **Default:** one new step in the `medusa-smoke` job, after the existing "Race P6-MED-RACE-001 + extras (medusa-race)" step,
  running the money specs with `--project=medusa-race -g "P6-MED-RACE-0(07|10|11)"`. **`-011` runs on every event** (PR,
  dispatch, `main`, nightly), because the cleanup route is now proven (D41).
- **If the timing rule in §12 triggers:** the same three specs run in a new job `medusa-money` with the same pins (the
  `MEDUSA_REF` and `bootstrap.sh` steps copied from `medusa-smoke`, unchanged), the same probe and token scan, and its own
  `timeout-minutes` (D39). Trials are not reduced to fit.
- `RACE_TRIALS`: `pull_request` → `3` (Medusa PR count, D6); `main`, nightly and dispatch → `50` (D39). See §12 for the one
  exception the timing may force on PRs.
- Histogram artefact stays `race-histograms-medusa`; the token scan (`scripts/evidence-token-scan.mjs`) runs before upload
  as for the other steps.
- Job timeout of `medusa-smoke` is 45 minutes. No timeout change (Task 1 D24).

## 12. Trial counts, timing and environment

- **Full count is 50** on `main`, nightly and dispatch (D6, master plan §1). **PR count is 3** (D6).
- **Timing rule (D39, decided here).** If the money specs at 50 trials do not fit the 45-minute `medusa-smoke` budget,
  add a separate `medusa-money` job with the same pins (§11). **Do not reduce the trial count to fit.**
- **PR exception (D39).** A PR run may use **20** trials, and only if the PR run's own timing needs it. `main`, nightly and
  dispatch keep 50 whichever job runs them.
- The probe estimate (§2.5 P7) says the three money specs at 50 trials are well under 45 minutes, so the separate job is
  **not** triggered on current numbers. The first `main` CI run decides (its step times, not the probe's, are the record).
- The per-test timeout in each spec is set from the CI timing (the oversell spec sets its own; the default in
  `playwright.config.ts` is 60 s, too short for a full money case).
- **Environment variables.** No new variable is expected. If one is added, its name goes in `.env.example` (names only)
  and the README.
- **Cursor Cloud and Claude Code cloud.** No change expected: the probe ran on the existing `up:medusa` path.

## 13. Unit tests

### 13.1 `tests/unit/money.test.ts` (new)

At least:

- `parseWholeAmount("1010", "x")` → 1010; `"-5"` → -5.
- `parseWholeAmount("10.5", "x")` throws `TEST BUG`; `"1e3"` throws; `""` throws; `"9007199254740993"` throws (not a safe integer).
- A value of `0` is accepted (a zero-capture payment is a valid state the oracle must report).

### 13.2 Updated tests

- `medusa-payloads.test.ts`: `captureBody(1010)` and `refundBody(505)` produce exactly `{ "amount": 1010 }` and `{ "amount": 505 }`.
- `medusa-oracle.test.ts`: the new SQL constants contain the payment-id parameter and the table names from P4; a string
  check is enough (no DB).
- `medusa-invariants.test.ts`: `checkRefundCap` at the boundary (`refundedSum === capturedSum` → no violation;
  `+1` → violation); `checkCaptureCap` the same; `checkSuccessCount` for expected, below and above (below and above return
  a suspected bug, not a bug); `checkLoserStatuses` with a 4xx-only list (no violation) and one 5xx (violation).

## 14. Build steps (repo root; on any differing output: stop and report, paste it)

### Step 0. Baseline and live probe

The live probes are done (§2.5, §2.5b). The build repeats P1, P2 and the cleanup check once, as a gate, before any code:

```bash
export PATH="/usr/local/bin:$PATH"
npm run check                       # must be green on the build branch before anything changes
npm run up:medusa                   # exit 0, /health 200
npm run smoke:medusa                # green
# re-run P1, P2 and the confirm-then-cancel check (probe-1, probe-2, probe-7 in the scratchpad); paste output into §2.5 if it differs
npm run down:medusa                 # always, exit 0, :9000 closed
```

Stop here if `npm run check` is not green, or if P1 finds a gift-card route (then D34 is withdrawn and the owner decides).

### Step 1. Money helpers (build commit 1)

`src/medusa/money.ts`, `tests/unit/money.test.ts`. Run `npm run typecheck` and `npm run test:unit`.

### Step 2. Admin client and payloads (build commit 2)

`src/medusa/payloads.ts`, `src/medusa/admin.ts` (including `confirmPendingOrderChange`), `tests/unit/medusa-payloads.test.ts`.
The bodies in §8.2 are the live ones.

### Step 3. Oracle and invariants (build commit 3)

`src/medusa/oracle.ts`, `src/medusa/invariants.ts`, the matching unit tests (§13.2).

### Step 4. Money case runner and `-007` (build commit 4)

`src/medusa/run-money-case.ts`, `tests/medusa/races/med-race-007-refunds.spec.ts`. Run one spec at `RACE_TRIALS=3` on the
VM (proof only) and paste the histogram verdict and the invalid/rerun counts.

### Step 5. `-011` (build commit 5)

`tests/medusa/races/med-race-011-partial-refunds.spec.ts` on the same runner, with the cleanup of §9 (confirm, then cancel
and archive). It records F-M1 as a suspected bug through `checkSuccessCount`; it does not fail the case on the HTTP count
alone. A stuck order is reported as leaked data (D41).

### Step 6. `-010` (build commit 6)

`tests/medusa/races/med-race-010-captures.spec.ts`. Live: capture is a separate step (§2.3), so this step is not gated.

### Step 7. CI and README (build commit 7)

`.github/workflows/perf.yml` (the step or the `medusa-money` job, §11), `README.md` (§17), `.env.example` only if §12 added a name.

### Step 8. Roadmap sync (build commit 8)

`docs/plans/2026-10-22-p6-phase2-roadmap.md`: mark the gate results for `-006` (moved to Later, D34) and `-010` (stays, D35),
the F-M1 suspected bug, the cleanup route (D41), and the chosen full count.

### Step 9. Verification and PR

`npm run check` green. Then the PR body links the green CI run (Task 1 D31 rule).

## 15. Verification gate (hard gate before the PR is marked ready; paste real output)

- `npm run check` output (Prettier, actionlint, typecheck, k6 inspect, unit tests with pass and fail counts).
- The `npx playwright test --list` count, before and after (the new specs added).
- A green CI run on the PR (small count) and the full-count run on `main` or nightly/dispatch, with the histogram artefact
  names, and the step times (for §12).
- Every histogram: verdict, `trialsRequested`, `invalidTrials`, `reruns`, `warmup[]`, violations, the HTTP success counts
  against expected (F-M1 shows here), and the cleanup records (leaked data, D41).

## 16. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

1. `docs(plans): add the phase 2 task 2 medusa money races plan` (this file only).
2. `feat(medusa): add money helpers` (`src/medusa/money.ts`, its test).
3. `feat(medusa): add capture, refund and confirm admin calls` (`payloads.ts`, `admin.ts`, test).
4. `feat(medusa): add money oracle and invariants` (`oracle.ts`, `invariants.ts`, tests).
5. `feat(races): add medusa refund race P6-MED-RACE-007` (runner, spec).
6. `feat(races): add medusa partial refund race P6-MED-RACE-011` (spec, F-M1 suspected bug, cleanup).
7. `feat(races): add medusa capture race P6-MED-RACE-010` (spec).
8. `ci(races): run the medusa money races` (`perf.yml`, README, `.env.example` if changed).
9. `docs(plans): sync the phase 2 roadmap with task 2`.

## 17. Docs (README)

- Case rows for `-007`, `-011`, `-010`, and the `-006` "Later" row with the gate evidence (D34).
- F-M1 in the README as a **suspected** product bug with its evidence and the open label question (D40), not as a known
  product bug, and not as a passing result.
- Known product bugs: a row only when a bug is proven (§10).

## 18. Will NOT do

- No gift-card plugin, no Medusa fork change, no `node_modules` edit (D5).
- No `retries`, no sleeps, no `test.fail()` without repeated-run evidence (§10).
- No publication of any timing from the cloud VM; the job summary gets Actions numbers only.
- No change to `runTrials`, `fireTogether` or the rerun policy.
- No reduction of trial counts to fit a time budget (D39).
- No new case beyond the three in §4 (the extras of Task 3 and `-006` stay out).
- No PRODUCT BUG label on F-M1 before full-count CI runs reproduce it (D40).

## 19. Risks and unknowns

| Risk                                                         | Mitigation                                                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No gift-card feature (`-006`)                                | Confirmed live (P1); moved to "Later" (D34).                                                                                                                |
| Capture is automatic with `system`                           | Ruled out live (P3); `-010` stays (D35).                                                                                                                    |
| `-011` HTTP successes differ from the database (F-M1)        | Suspected bug (D40); full-count CI runs decide the label.                                                                                                   |
| A stuck pending change blocks cleanup                        | 1 of 9 live runs. Confirm route proven once (§2.5b, D41); if it fails, the order is reported as leaked data, not a failure.                                 |
| Confirm route changes money accounting                       | The probe did not analyse the `order_preview` (§2.5b limits). The money oracle reads refund rows, which confirm does not change. Check in the first CI run. |
| Job time: three money cases at 50 trials per run             | Estimate well under 45 min (P7); separate `medusa-money` job if CI disagrees (D39).                                                                         |
| Refund of X/2 or X rejected for rounding or a required field | Live: X/2 = 505 accepted; amounts in §7.3.                                                                                                                  |
| Warm-up refund or capture reaching a counted attempt         | Warm-up has its own order and cleanup (§4).                                                                                                                 |
| Order total is not the unit price (1010 vs 1000)             | The spec reads X from the order (§7.3); no hard-coded amount.                                                                                               |

## 20. Decisions (2026-10-22; numbering continues from Task 1's D33)

- **D34 Gift-card gate: confirmed live.** `-006` moves to "Later" (§2.2). Evidence: 404 on four routes, no table.
- **D35 Capture gate: confirmed live.** Checkout does not auto-capture, so `-010` stays in scope (§2.3).
- **D36 Money amounts are whole integers (§7.3).** The order total is read from the order, not assumed (live X = 1010).
  Decimal amounts are a follow-up (F1).
- **D37 Setup errors are TEST BUG, never a rerun (§7.2).** Only spread reruns (Task 1 D2 to D4) apply.
- **D38 Cleanup order: confirm a pending change, refund to zero, cancel, archive, delete the product (§9).** Each step is
  proven live (§2.5, §2.5b).
- **D39 Timing budget (decided 2026-10-22).** If the money specs at 50 trials exceed the 45-minute `medusa-smoke` budget,
  add a separate `medusa-money` job with the same pins (`MEDUSA_REF`, the harness pin, the probe, the token scan). Do not
  reduce trials. PR runs use 3 trials; 20 only if PR timing requires it. `main`, nightly and dispatch keep 50.
- **D40 F-M1 is a suspected product bug, not a PRODUCT BUG (decided 2026-10-22).** The HTTP-versus-database mismatch
  (8 of 9 live runs) is recorded as suspected. It becomes PRODUCT BUG only after **full-count CI runs** (`main`, nightly or
  dispatch) reproduce it. The probe VM does not decide the label.
- **D41 Cleanup route for a stuck pending change, and the `-011` run rule (decided 2026-10-22).** The confirm route
  `POST /admin/order-edits/:id/confirm` cleared the one stuck order (§2.5b). Because one candidate is now proven, `-011`
  runs on every event (PR, dispatch, `main`, nightly), not only PR and dispatch. A stuck order that the confirm route does
  not clear is **reported as leaked data, not a failure** (§9). The proof is one stuck order and three clean repeat runs, so
  the first `main` CI run is the check.

## 21. Open points for the maintainer

1. **F-M1 label.** D40 records it as a suspected product bug. Proposed: PRODUCT BUG only when the full-count CI runs on
   `main` or nightly reproduce it. Confirm that rule.
2. **D34 and D35 are confirmed by the live probe.** `-006` moves to "Later"; `-010` stays. Confirm the move in the roadmap
   and the README.
3. **Stuck order cleanup: resolved for the one case seen (D41).** Confirm that the cleanup may confirm a `credit_line`
   order change the refund created (an admin API call the harness already makes as the seeded admin). The probe did not
   analyse the confirm's `order_preview` (§2.5b limits). Decide whether a CI run must show the confirm's effect on the
   order before the case is trusted.
4. **Auto-capture on a different provider.** The probe used the `system` provider only. A stack that auto-captures would
   move `-010` to "Later" (D35 stays conditional on the pinned provider).
5. **Full count for the three money specs** is set by the first `main` CI run's step times (§12), not by the probe.
