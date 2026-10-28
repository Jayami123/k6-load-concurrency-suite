# Draft: Medusa parallel cancels (X04 + F-M3 + F-M4)

Status: not filed

- **Findings:** `P6-MED-RACE-008` (X04, F-M3), `P6-MED-RACE-013` (X04, F-M3), `P6-MED-RACE-014` (X04, F-M3, F-M4).
- **Target:** `medusajs/medusa`.
- **Channel:** public issue, form `.github/ISSUE_TEMPLATE/bug_report_v2.yml` ("Bug report for v2.0"). The title prefix is `[Bug]: `.
- **Source draft:** Task 9 plan Appendix B1. The numbers below are from the released zips (permanent), not from the unpublished `p6-phase2`.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `develop` `5ac3fdcbf82e818337d424852c778ce2ffd5e8e9` (latest tag `v2.22.1`). It was read with `git ls-remote` and a blobless clone.
- **Code:** these files are identical between `v2.21.2` (the pinned version) and that HEAD:
  - `packages/core/core-flows/src/order/workflows/cancel-order.ts`
  - `create-fulfillment.ts`
  - `cart/workflows/complete-cart.ts`
  - `reservation/steps/delete-reservations-by-line-items.ts`
  - `delete-reservations.ts`

  `git diff --stat` between the two is empty. The line numbers below were rechecked at HEAD.

- **Duplicate search:** GitHub issue search, unauthenticated, run on 2026-10-29. Queries, each scoped with `repo:medusajs/medusa`:
  - `cancel order concurrent`
  - `cancel order twice`
  - `cancel reservation`
  - `cancel race condition`
  - `cancel fulfillment race`
  - `refunded_total cancel`
- **Related, not duplicates:**
  - #17369 (open): concurrent fulfillment workflows, the same unlocked order-change guard, no cancel.
  - #16569 (open): concurrent `createReservationItems` oversubscribe stock.
  - PR #17420: "fix(inventory): serialize reservation mutations". It is closed and was **not merged**, and its text mentions the deletion and restoration before-images.
  - PR #17412: "route post-success errors to compensation". It is closed, not merged.
  - PR #15397: reservation locking, already in 2.21.2.
  - PR #14270: locks for order edit flows.
- **Verdict: still applies.** No issue reports parallel cancels or a reservation restored by a losing cancel.

## Title

[Bug]: Parallel cancels of one order both succeed, and a losing cancel restores the order's stock reservation (`cancelOrderWorkflow` takes no lock)

## Package.json file

This is `apps/backend/package.json` of the reproduction app: the Medusa DTC starter at
`f677db438f27294fc50e4c7c6612e71ff38eeff5`, `@medusajs/*` 2.21.2. Paste the file from
https://github.com/Jayami123/medusa-dtc-starter/blob/f677db438f27294fc50e4c7c6612e71ff38eeff5/apps/backend/package.json.
TODO: confirm that the fork is public before linking.

## Node.js version

v22.23.3. This is `software.node` in the run-meta of the Medusa load jobs of the same released runs (`load-medusa` and `medusa-invariants`). The race jobs write no run-meta. TODO: confirm the race job's Node from its job log; the repo's `.nvmrc` says `22`.

## Database and its version

PostgreSQL 15 (the harness image, per the Task 9 plan). TODO: confirm the exact image tag in `qa-portfolio-harness` v0.2.15.

## Operating system name and version

Ubuntu 24.04, a GitHub-hosted runner, image `ubuntu24` `20261023.334.3`.

## Browser name

None. The repro uses Admin API calls only.

## What happened?

Setup: one order with one line item of quantity 1, and its payment authorised by the system provider. N parallel
`POST /admin/orders/:id/cancel` requests are sent within about 1 ms of each other.

- **N = 2, case `P6-MED-RACE-008`, 50 trials per run.** Both cancels return 200 in 40, 29, 37 and 42 of 50 trials (four runs below). Each cancel writes a `credit_line` order change. The second change stays `pending`.
- **Loser restores the reservation.** When the losing cancel instead gets 400 "Order (…) already has an existing active order change", the canceled order keeps one live reservation. This happened in **every** such trial: 10 of 10, 21 of 21, 13 of 13 and 8 of 8. It never happened when both cancels returned 200.
- **N = 10, case `P6-MED-RACE-013`.** In 50 of 50 trials of every run, these four problems occur together:
  - more than one cancel returned 200;
  - extra `credit_line`s are written;
  - the canceled order keeps a live reservation;
  - `reserved_quantity` is not equal to the sum of the live reservations.

  Pending order changes are left in 49, 49, 47 and 46 of 50 trials.

- **N = 10 on a captured order, case `P6-MED-RACE-014`.** In every run:
  - more than one cancel returned 200 in 49–50 of 50 trials;
  - the canceled order keeps a live reservation in 50 of 50;
  - extra `credit_line`s appear in 48–50 of 50;
  - `order_summary.totals.refunded_total` differs from the sum of the payment's refund rows in 34 of 50.

  The payment itself holds one refund.

## Expected behavior

Exactly one cancel takes effect, and the other requests fail with a 4xx and change nothing. The order then has:

- one confirmed `credit_line` change;
- no live reservation;
- `reserved_quantity` equal to the live reservations;
- a `refunded_total` equal to the payment's refunds.

## Actual behavior

The behaviour is as described above. Code at `develop` `5ac3fdcb`, identical to `v2.21.2`:

- `packages/core/core-flows/src/order/workflows/cancel-order.ts` has no `acquireLockStep`. The workflow runs these steps:
  1. `cancelValidateOrder` (L71) reads the order;
  2. `parallelize(refundCapturedPaymentsWorkflow, deleteReservationsByLineItemsStep, cancelPaymentStep)` (L182);
  3. `createOrderRefundCreditLinesWorkflow` (L252);
  4. `cancelOrdersStep` (L272).

  Two requests can both pass the validation.

- The compensation of `deleteReservationsByLineItemsStep` (`reservation/steps/delete-reservations-by-line-items.ts` L48, `restoreReservationItemsByLineItem`) brings back the reservations that the winning cancel deleted.

Related: #17369, #16569 and PR #17420 (not merged).

## Link to reproduction repo

https://github.com/Jayami123/k6-load-concurrency-suite. The specs are:

- `tests/medusa/races/med-race-008-double-cancel.spec.ts`
- `tests/medusa/races/med-race-013-cancel-burst.spec.ts`
- `tests/medusa/races/med-race-014-captured-cancels.spec.ts`

## Evidence (release assets, permanent)

| Run         | Release   | Asset                         | P6 commit  | 008 both 200 | 008 loser leak | 014 `refunded_total` |
| ----------- | --------- | ----------------------------- | ---------- | ------------ | -------------- | -------------------- |
| 40177412186 | p6-phase3 | `p6-40177412186-evidence.zip` | `0b075942` | 40/50        | 10/10          | 34/50                |
| 40498902575 | p6-phase4 | `p6-40498902575-evidence.zip` | `4e0d3f71` | 29/50        | 21/21          | 34/50                |
| 40524237209 | p6-phase4 | `p6-40524237209-evidence.zip` | `3e81242f` | 37/50        | 13/13          | 34/50                |
| 40526041971 | p6-phase4 | `p6-40526041971-evidence.zip` | `6a9a23fd` | 42/50        | 8/8            | 34/50                |

- **Where in each zip:** `race-histograms-medusa/P6-MED-RACE-008.json`, and `race-histograms-medusa-cancel-extras/P6-MED-RACE-013.json` and `-014.json`. The relevant fields are `attempts[].statusCounts` and `attempts[].oracle` (`liveReservations`, `loserMessage`, `suspectedBug`).
- **Download URL pattern:** `https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/<release>/<asset>`.
- **Product pin:** `software.products.medusa` = `f677db438f27294fc50e4c7c6612e71ff38eeff5` in every run-meta.
- **Historical:** the Phase 2 runs 40037355173 and 40039351021 gave 653/900 double 200 and 247/900 restored reservations (N = 2), and 684/953 `refunded_total` (F-M4). They were never released, and their Actions artefacts expire 2026-11-06. Cite them only as run links, or drop them.

## Before filing

- [ ] Re-run the duplicate search on the filing day.
- [ ] Attach or paste MED-002 (`2026-10-29-medusa-med-002-load-evidence.md`) as a section or a first comment.
- [ ] Tick "searched existing issues" in the form.
