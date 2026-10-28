# Draft: Medusa cancel in parallel with create-fulfillment (X05)

Status: not filed

- **Finding:** `P6-MED-RACE-009` (X05, plus an F-M3 side effect).
- **Target:** `medusajs/medusa`.
- **Channel:** public issue, form `bug_report_v2.yml`, title prefix `[Bug]: `.
- **Source draft:** Task 9 plan Appendix B2.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `develop` `5ac3fdcbf82e818337d424852c778ce2ffd5e8e9`.
- **Code:** `cancel-order.ts` and `create-fulfillment.ts` are identical to `v2.21.2`. At HEAD, `throwIfOrderIsCancelled` is at `create-fulfillment.ts` L115 and `cancelValidateOrder` at `cancel-order.ts` L71. Neither file has `acquireLockStep`.
- **Duplicate search** (unauthenticated GitHub issue search, `repo:medusajs/medusa`): `cancel fulfillment race`, `cancel order concurrent` and `cancel race condition`. No duplicate.
- **Related:** #17369 (open). Its suggested per-order lock covers `createOrderFulfillmentWorkflow`, but it does not test order cancel.
- **Verdict: still applies.**

## Title

[Bug]: Cancel and create-fulfillment in parallel leave a canceled order with an open fulfillment

## Package.json / Node.js / Database / OS / Browser

As in `2026-10-29-medusa-cancel-race.md`:

- `@medusajs/*` 2.21.2 (starter `f677db43`);
- Node v22.23.3;
- PostgreSQL 15 (TODO: confirm the tag);
- Ubuntu 24.04 (runner image `20261023.334.3`);
- no browser.

## What happened?

Setup: one authorised order, with one line item of quantity 1. `POST /admin/orders/:id/cancel` and
`POST /admin/orders/:id/fulfillments` are sent in parallel.

- **Both requests return 200 in 2, 13, 12 and 9 of 50 trials** (four released runs). The oracle message is "2 of cancel ‖ fulfil returned 200, expected exactly 1".
- **The order ends `canceled` with one open fulfillment** in the same trials ("order canceled with 1 open fulfillment(s)").
- **A losing request can restore the reservation.** When the losing request gets 400 "Order (…) already has an existing active order change", the canceled order sometimes keeps a live reservation: in 2, 3, 0 and 0 of 50 trials.
- **Historical (Phase 2):** a follow-up `POST /admin/orders/:id/fulfillments/:fid/cancel` returned 400 "Order with id … has been canceled.", so the fulfillment is stuck. TODO: the released zips do not record this follow-up call; re-verify it before quoting it.

## Expected behavior

One of the two requests wins:

- either the order is canceled and the fulfillment is refused;
- or the fulfillment exists and the cancel is refused ("non-canceled fulfillment").

Never both.

## Actual behavior

The behaviour is as described above. In the code at `develop` `5ac3fdcb`, neither workflow takes a lock:

- `create-fulfillment.ts` checks `throwIfOrderIsCancelled` (L115);
- the cancel checks for non-canceled fulfillments in `cancelValidateOrder` (L71);
- each check runs before the other request's write.

## Link to reproduction repo

https://github.com/Jayami123/k6-load-concurrency-suite. The spec is `tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts`.

## Evidence (release assets, permanent)

The data is in `race-histograms-medusa/P6-MED-RACE-009.json` in each zip.

| Run         | Release   | Asset                         | Both 200 | Canceled with open fulfillment | Restored reservation |
| ----------- | --------- | ----------------------------- | -------- | ------------------------------ | -------------------- |
| 40177412186 | p6-phase3 | `p6-40177412186-evidence.zip` | 2/50     | 2/50                           | 2/50                 |
| 40498902575 | p6-phase4 | `p6-40498902575-evidence.zip` | 13/50    | 13/50                          | 3/50                 |
| 40524237209 | p6-phase4 | `p6-40524237209-evidence.zip` | 12/50    | 12/50                          | 0/50                 |
| 40526041971 | p6-phase4 | `p6-40526041971-evidence.zip` | 9/50     | 9/50                           | 0/50                 |

- **Historical:** Phase 2 runs 40037355173 and 40039351021 gave 259 of 900 attempts with both 200 and 40 of 900 restored. They were not released, and their artefacts expire 2026-11-06.
