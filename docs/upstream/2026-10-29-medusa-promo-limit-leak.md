# Draft: Medusa failed checkout leaves an order carrying a capped promotion (F-M2)

Status: not filed

- **Findings:** `P6-MED-RACE-012` (promotion `limit`) and `P6-MED-RACE-005` (campaign budget). Finding id F-M2.
- **Target:** `medusajs/medusa`.
- **Channel:** public issue, form `bug_report_v2.yml`, title prefix `[Bug]: `.
- **Source draft:** Task 9 plan Appendix B3.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `develop` `5ac3fdcbf82e818337d424852c778ce2ffd5e8e9`.
- **Code:** `cart/workflows/complete-cart.ts` is identical to `v2.21.2`. At HEAD:
  - `acquireLockStep` is at L362 (per cart);
  - `createOrdersStep` is at L542;
  - the `parallelize(…, registerUsageStep)` block is at L648–652;
  - `authorizePaymentSessionStep` is at L687.
- **Duplicate search** (unauthenticated, `repo:medusajs/medusa`):
  - `promotion usage limit concurrent`
  - `promotion limit exceeded order`
  - `complete cart race promotion`
  - `campaign budget exceeded`
- **Related, not duplicates:**
  - #16012 (closed, fixed by PR #16097: the usage counter and budget guards, which still hold here);
  - #16997 and #16595 (promotion `revertUsage` locking);
  - PRs #17018, #16661 and #16596;
  - PR #17446 (`spend_by_attribute` budgets).

  None reports an order left behind by a checkout that returned 400.

- **Verdict: still applies.**

## Title

[Bug]: Under parallel checkouts, a checkout that returns 400 can still leave an unpaid order carrying the promotion, so live orders exceed the promotion's usage limit

## Package.json / Node.js / Database / OS / Browser

As in `2026-10-29-medusa-cancel-race.md`.

## What happened?

Setup: a promotion with `limit: 3`, or a campaign usage budget of 3. Ten ready carts have the code applied, and ten parallel
`POST /store/carts/:id/complete` requests are sent.

- **Status codes:** every trial returns 3 × 200 and 7 × 400 (150 × 200 and 350 × 400 per 50-trial run, in all four runs).
- **Usage counter:** the promotion's `used` counter stays at 3.
- **The leak:** in some trials, one losing request returns 400 `not_allowed` "Updating Status from \"ok\" to \"temp_failure\" is not allowed." and its order stays. The oracle reports "N orders carry the promotion, cap 3" and "order … exists but no checkout returned it". This happened in:
  - `limit` (`P6-MED-RACE-012`): 10, 14, 14 and 18 of 50 trials;
  - campaign budget (`P6-MED-RACE-005`): 0, 6, 0 and 1 of 50 trials.
- **Phase 2 detail of the leaked order:**
  - status `pending`, with no payment row;
  - payment collection `not_paid`;
  - a live `order_promotion` link and a live reservation;
  - `completed_at` set on the cart.

  TODO: confirm these per-order fields against a released zip before quoting them, or quote only the oracle text.

## Expected behavior

A checkout that returns an error leaves no order, no promotion link and no reservation.

## Actual behavior

The behaviour is as described above. In `complete-cart.ts` (at HEAD):

1. The order is created first (L542).
2. Then the links, the cart update, the reservation and the usage registration run in parallel (L648–652).
3. The payment is authorised last (L687).

The lock (L362) is per cart, so parallel carts are not serialised. The rollback after the payment-session status error does not remove the created order.

## Link to reproduction repo

https://github.com/Jayami123/k6-load-concurrency-suite. The specs are `tests/medusa/races/med-race-012-usage-limit.spec.ts` and `med-race-005-campaign-budget.spec.ts`.

## Evidence (release assets, permanent)

The data is in `race-histograms-medusa-budget/P6-MED-RACE-012.json` and `P6-MED-RACE-005.json`.

| Run         | Release   | 012 trials with more than 3 promo orders | 005 trials with more than 3 promo orders |
| ----------- | --------- | ---------------------------------------- | ---------------------------------------- |
| 40177412186 | p6-phase3 | 10/50                                    | 0/50                                     |
| 40498902575 | p6-phase4 | 14/50                                    | 6/50                                     |
| 40524237209 | p6-phase4 | 14/50                                    | 0/50                                     |
| 40526041971 | p6-phase4 | 18/50                                    | 1/50                                     |

- **Historical:** Phase 2 gave 209 of 1050 (`limit`) and 12 of 1051 (budget) attempts, from runs that were not released.
- **Note:** the repo labels F-M2 "PRODUCT BUG, annotation only". There is no `test.fail()` spec, because the trigger is not deterministic.
