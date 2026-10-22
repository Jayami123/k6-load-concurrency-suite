# P6 Phase 2 Task 3: Medusa budget and order-state races (plan, revision 2)

This is the implementation plan a weaker model will build from. The owner reviewed revision 1 (rule 10: this task adds
a CI job and proposes product-bug labels, §11 and §10) and **agreed to every proposed answer in §21 on 2026-10-22**.
Revision 2 records those answers (D54 to D59). **The build has not started:** the owner said not to build yet, so no
code is written until the owner says to start.

Structure follows [2026-10-22-p6-phase2-task2-med-money-races.md](2026-10-22-p6-phase2-task2-med-money-races.md). The
source of this task is [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md), section "Task 3: Medusa budget +
order-state races", decisions D1, D3, D6 and D12. It builds on Task 1 (rerun-on-spread) and Task 2 (money cases, cleanup
rules D38 and D41), both merged on `main`.

## Context

- Repo: `k6-load-concurrency-suite` (P6). Branch `feat/2026-10-22-p6-med-budget-order-races`, cut from `main` at `8a46530`
  (merge of PR #29, Task 2).
- Harness `qa-portfolio-harness#v0.2.11`; Medusa fork `medusa-dtc-starter` at `MEDUSA_REF` `f677db43`, `@medusajs/*`
  2.21.2. Never edit the fork or `node_modules/qa-portfolio-harness` (rule 14). `scripts/harness.mjs` starts and stops
  Medusa.
- Cases: `P6-MED-RACE-005` (P1, campaign budget), `P6-MED-RACE-008` (P1 X04, double cancel), `P6-MED-RACE-009` (P1 X05,
  cancel ‖ fulfil), `P6-MED-RACE-012` (accepted extra, promotion usage limit; **cheap, lands**, §2.4).
- Owner decisions that apply: **D2** (spread valid when `≤ RACE_MAX_SPREAD_MS`), **D3** (only spread makes an attempt
  invalid; a product violation always counts), **D4** (top-level counts are valid attempts only), **D6** (Medusa 3 trials
  on PRs, full count on `main`, nightly and dispatch), **D12** (`-012` in scope if cheap). Task 2 **D37** (setup errors
  are TEST BUG, never a rerun), **D39** (do not reduce trials to fit a budget; add a job), **D40** (an HTTP-versus-database
  mismatch is a SUSPECTED product bug until full-count CI runs reproduce it), **D41** (cleanup residue that a product
  defect causes is reported leaked data, not a failure). New decisions D42 to D53 are in §20.
- Primitives (roadmap "Primitive bar"): **single winner under contention** and **budget never overdrawn** (`-005`,
  `-012`); **state-transition exclusivity** (`-008`, `-009`). Transfers: a credit or daily-transfer limit and a capped
  authorisation (visits, units) for `-005`/`-012`; "cancel vs settle" for a payment and "cancel vs dispense" for a
  prescription for `-009`; "void a transaction exactly once" for `-008`.
- Backlog: the repo has no `BACKLOG` file. The only backlog lines for this task are in the roadmap ("Follow-up (not in
  this PR): a small P1 PR removes X04/X05 from P1", and "Later: `P6-MED-RACE-012` if the Task 3 probe finds it not cheap")
  and Task 2 §2.1 G5 (static note on the promotion lock). All three are handled below (§5, §2.4, §2.2).

## 1. Header

- Plan date 2026-10-22 (UTC). Static reads and the live probe were done in a Claude Code cloud session on the same date.
- Baseline: `main` at `8a46530`. `npm run check` green on the branch before any change: **354 unit tests, 354 pass, 0
  fail** (Step 0 repeats it).
- Live numbers are **proof only** (AGENTS.md); published numbers come only from GitHub Actions (median of at least 3).
- Secrets: the probe used a throwaway admin password generated with `openssl rand -hex 16` into a mode-600 file outside
  the repo. Nothing from it is in this plan, the histograms or the logs.

## 2. Probe findings

### 2.1 Summary

| #   | Question (roadmap "The live probe must confirm")           | Finding (live, 2026-10-22, unless marked static)                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | P1's X04/X05 request sequence and assertions               | The P1 repo is not reachable from this session (access is scoped to this repo). The P6 reference copy says X04 = `statuses [200, 200]` with a pending `credit_line` change; X05 = `canceled` + 1 open fulfillment (`docs/reference/p1-plan-example-medusa.md` line 365). The probe rebuilt both from that text (§2.3).                                                          |
| Q2  | Do X04/X05 still reproduce at `MEDUSA_REF`?                | **Yes, both.** X04: two 200s in **7 of 8** N=2 runs. X05: canceled + open fulfillment in **1 of 5** N=2 runs. N=10 adds new effects (§2.3, F-M3, F-M4).                                                                                                                                                                                                                         |
| Q3  | Admin routes and bodies: campaign + budget, cancel, fulfil | `POST /admin/campaigns` `{name, campaign_identifier, budget:{type:"usage",limit}}` → 200. `POST /admin/promotions` → 200. `POST /admin/orders/:id/cancel` `{}` → 200. `POST /admin/orders/:id/fulfillments` `{items:[{id,quantity}],location_id}` → 200. Store: `POST /store/carts/:id/promotions` `{promo_codes:[..]}` → 200.                                                  |
| Q4  | Reuse seed promo `QA10` or one per trial?                  | **One per trial.** `QA10` exists (`limit null`, `used 0`, no campaign) and is shared by every run; it has no budget or limit to race. Each attempt creates its own lowercase, prefixed code (§9).                                                                                                                                                                               |
| Q5  | Oracle tables                                              | `promotion` (`limit int`, `used int`), `promotion_campaign`, `promotion_campaign_budget` (`type`, `limit numeric`, `used numeric`), `order_promotion` (link, soft delete), `order_change` (`change_type`, `status`), `order_credit_line`, `fulfillment` + `order_fulfillment`, `reservation_item`, `inventory_level`, `order_summary.totals` (jsonb). Read-only pool reads all. |
| Q6  | `-012` usage-limit field, oracle, "cheap" test             | `limit` on the promotion (`int`, min 1). Same setup as `-005` minus the campaign, one oracle field (`promotion.used`). **Cheap: lands** (§2.4).                                                                                                                                                                                                                                 |
| Q7  | Cleanup and leak check for campaigns and promotions        | `DELETE /admin/promotions/:id` → 200, `DELETE /admin/campaigns/:id` → 200. The campaign delete **keeps** its `promotion_campaign_budget` row (`deleted_at` NULL), so the leak check must not count budget rows (§9).                                                                                                                                                            |
| Q8  | Budget type risk (usage vs spend)                          | Both hold under N=10: usage K=3 → 3 orders (8 of 8 runs); spend limit 250 EUR with 100 EUR discounts → 2 orders, used 200 (3 of 3). `-005` uses **usage** (D43).                                                                                                                                                                                                                |
| Q9  | Fulfil setup (stock location, shipping option)             | None extra: the checkout order's line item and the `European Warehouse` location from `loadCatalog` are enough. Fulfil → 200 with no extra setup.                                                                                                                                                                                                                               |
| Q10 | Per-trial time (proof only)                                | `-005`/`-012`: **13.0 to 15.9 s** per attempt (10 ready carts ≈ 9.5 to 11.5 s). `-008`/`-009` at N=2: **2.1 to 2.9 s** per attempt. §12 turns these into the CI budget.                                                                                                                                                                                                         |

Static (pinned source, read only):

- `@medusajs/promotion` 2.21.2 `dist/services/promotion-module.js` `registerUsage` (lines 139 to 260): sets `lock_timeout
= '3s'`, then `SELECT ... FOR UPDATE` on `promotion` rows **only when `promotion.limit` is a number** (lines 152 to 175)
  and on `promotion_campaign_budget` rows (lines 176 to 181), then re-reads with `refresh: true` and throws
  `NOT_ALLOWED` "Promotion usage exceeds the limit." (line 201) or "... the budget limit." (lines 221, 234).
- `@medusajs/core-flows` 2.21.2 `cart/workflows/complete-cart.js`: `registerUsageStep` runs inside `parallelize(...)`
  with `createRemoteLinkStep`, `updateCartsStep` and `reserveInventoryStep` (line 534), after the order is created.
- `order/workflows/cancel-order.js`: no lock step. It runs `refundCapturedPaymentsWorkflow`, `deleteReservationsByLineItemsStep`
  and `cancelPaymentStep` in parallel (line 107), then `createOrderRefundCreditLinesWorkflow`, then `cancelOrdersStep`.
  Validation (`cancelValidateOrder`, lines 36 to 49) rejects a canceled order or one with a non-canceled fulfillment.
- `order/workflows/create-fulfillment.js`: no lock step; `throwIfOrderIsCancelled` (line 43) and "No stock reservation
  found" (line 160) are the guards.

### 2.2 `-005` campaign budget and `-012` usage limit (live, N=10, cap 3)

Probe script `p2-budget-race.ts` (scratchpad, §2.6). Each run: new product (stock 50), new campaign/promotion, 10 ready
carts with the code applied, 10 parallel `POST /store/carts/:id/complete` behind `fireTogether`.

```text
-005 usage budget K=3, 8 runs:  apply {200:10}  statuses {200:3, 400:7}  http_orders=3  spread 0.56 to 1.03 ms
     db: orders_with_promo 3, budget used 3 of 3, promotion.used 0, live orders 3, discount_sum 300
     loser x7: 400 not_allowed "Promotion usage exceeds the budget limit."              cleanup ok (8 of 8)
spend budget 250 EUR, 3 runs:  statuses {200:2, 400:8}  budget used 200 of 250  orders_with_promo 2   cleanup ok
-012 promotion limit L=3, 8 runs:
     6 runs: statuses {200:3, 400:7}  promotion.used 3  orders_with_promo 3  live orders 3   cleanup ok
     2 runs (run 1 of batch 1, run 4 of batch 2):
            statuses {200:3, 400:7}  promotion.used 3  orders_with_promo 4  live orders 4  discount_sum 400
            loser x6: 400 not_allowed "Promotion usage exceeds the limit."
            loser x1: 400 not_allowed "Updating Status from \"ok\" to \"temp_failure\" is not allowed."
            cleanup: product delete 400 "Cannot remove following inventory item(s) since they have reservations"
```

**F-M2 (suspected product bug, D40 rule).** In 2 of 8 `-012` runs one losing request got a 400 but left an order behind.
Inspected (`p2b-inspect.ts`): status `pending`, **no payment row**, payment collection `not_paid`, a live
`order_promotion` link, a live reservation, cart `completed_at` set. So four orders carry the promotion while its
`limit` is 3 and `promotion.used` is 3; the client was told the checkout failed. The cap counter holds; the orders do not.
Not seen in 8 `-005` runs. Cleanup: `cancel` → 200, `archive` → 200, then the product delete → 200 (§9 sweeps orders
by email prefix, not by HTTP order id, for this reason).

Other facts:

- Every loser's `order_promotion` row is soft deleted by the rollback (`order_promo_rows_softdel` 7 = losers), and the
  rolled-back orders are gone (`all_orders` 3). The oracle counts only live links joined to live orders.
- Order cancel does **not** release budget usage (`budget used` stays 1 after cancel + archive, P1 run). Not a race
  finding; it means the next attempt needs a fresh campaign, which the design does anyway.
- Codes are case sensitive: applying the lowercase form of an uppercase code → 400 `invalid_data` "The promotion code ...
  is invalid". The build creates lowercase codes only.
- Creating a usage budget with `currency_code` → 400 (validator); a duplicate code → 400 "already exists".

**`-005` and `-012` verdict:** the budget and the limit counters are never exceeded (16 of 16 runs). `-012` has F-M2.

### 2.3 `-008` double cancel and `-009` cancel ‖ fulfil (live)

Probe script `p3-order-state.ts`. Each run: new product, one checkout order (`system` provider, authorised, not captured),
then the burst. The `cancel-captured` mode captures X = 1010 first.

```text
-008 N=2 (X04 shape), 8 runs:
   7 runs: cancel {200:2}  status canceled  changes credit_line:confirmed,credit_line:pending  credit_lines 2  reservations 0
   1 run:  cancel {200:1, 400:1 "Order (...) already has an existing active order change"}
           status canceled  credit_lines 1  live reservation 1 (restored)  → product delete 400 until the reservation is deleted
-008 N=10, 3 runs: cancel {200:2..3, 400:7..8 "already has an existing active order change"}
           credit_lines 2..3  pending changes 1..2  live reservation 1  inventory_level.reserved_quantity 6..7 after cleanup
-008 captured X=1010, N=10, 3 runs: cancel {200:2..3, 400:7..8}
           refund rows 1, refunded 1010 of captured 1010 (no double refund)   credit_lines 2..5 (amount 0 each)
           order_summary.totals.refunded_total 2020 in 2 of 3 runs (1010 in 1)   reserved_quantity 6..7 after cleanup
-009 N=2 (1 cancel ‖ 1 fulfil, X05 shape), 5 runs:
   1 run:  cancel 200, fulfil 200  status canceled  open fulfillments 1  fulfilled_quantity 1     ← X05
   3 runs: cancel 200, fulfil 400 "No stock reservation found for item ..."   clean
   1 run:  cancel 200, fulfil 400 "Order (...) already has an existing active order change"  live reservation 1 (restored)
-009 N=10 (5 ‖ 5), 3 runs: cancel {200:1..2, 400:3..4}, fulfil {400:5 "No stock reservation found"}
           no open fulfillment   reserved_quantity 4..6 after cleanup
```

Spreads 0.30 to 2.76 ms. Order state was `canceled` at the end of every run.

**X04 reproduces (SUSPECTED until full-count CI, D40 rule).** Two cancels of one order both return 200 in 7 of 8 N=2
runs. Each writes a `credit_line` order change; the second stays `pending` and cannot be confirmed afterwards (`POST
/admin/order-edits/:id/confirm` → 400 "Order with id ... has been canceled."). Archive still works (200), so the order is
not stuck.

**X05 reproduces (SUSPECTED).** 1 of 5 N=2 runs ends `canceled` with one open fulfillment and `fulfilled_quantity` 1.
The fulfillment then cannot be canceled (`POST /admin/orders/:id/fulfillments/:fid/cancel` → 400 "Order with id ... has
been canceled."). Archive works.

**F-M3 (suspected product bug, new): a failed concurrent cancel or fulfil restores the stock reservation of a canceled
order, and N=10 bursts leave `reserved_quantity` with no reservation behind it.** At N=2 a losing request (400) left one
live reservation on a canceled order in 2 of 13 runs. At N=10 every run (9 of 9) left `inventory_level.reserved_quantity`
at 4 to 7 after the order was archived and its one live reservation deleted (0 live reservation rows; stocked 50; the
order was quantity 1). The product then cannot be deleted. Static reading: the losers' rollback re-creates the
reservations the winner deleted. This is the same invariant `-001` checks (`checkOversellInvariants`, "inventory_level
reserved ... !== reservation_item sum").

**F-M4 (suspected product bug, new): concurrent cancels of a captured order double the order's refunded total.** The
payment module holds one refund of 1010 (no double refund: the Task 2 money invariant holds), but the order's
`order_summary.totals.refunded_total` is 2020 and `pending_difference` 2020 in 2 of 3 runs. The order's own accounting
disagrees with the payment rows.

### 2.4 `-012` is cheap (roadmap gate)

Same per-attempt setup as `-005` without the campaign (one `POST /admin/promotions` with `limit`), the same burst, and one
extra oracle column (`promotion.used`). Time per attempt is the same (13.4 to 15.9 s). **`-012` lands in this task (D44).**
F-M2 makes it the more valuable of the two.

### 2.5 Cleanup candidates (live)

| Residue                                                | Candidate                                                     | Result                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Ghost order (F-M2)                                     | find by email prefix, `cancel` then `archive`                 | 200, 200; then product delete 200                                                              |
| Pending `credit_line` change on a canceled order (X04) | `POST /admin/order-edits/:id/confirm` (Task 2 D41 route)      | **400** "has been canceled". Not needed: `archive` → 200 anyway                                |
| Open fulfillment on a canceled order (X05)             | `POST /admin/orders/:id/fulfillments/:fid/cancel`             | **400** "has been canceled". `archive` → 200; the fulfillment row stays (reported leaked data) |
| Open fulfillment on a live order                       | the same route, before `cancel`                               | not hit live (a fulfil never won against a cancel without X05); kept in the cleanup order, §9  |
| Restored live reservation (F-M3, N=2)                  | `DELETE /admin/reservations/:id`                              | 200; product delete then 200                                                                   |
| Phantom `reserved_quantity` with no reservation (F-M3) | A: `DELETE /admin/inventory-items/:id/location-levels/:loc`   | **400** "Cannot remove Inventory Level ... because there are reservations"                     |
|                                                        | B: `DELETE /admin/inventory-items/:id`                        | **400** "Cannot remove following inventory item(s) since they have reservations"               |
|                                                        | C: `POST /admin/reservations` (+1) then `DELETE` it           | 200, 200; `reserved_quantity` unchanged; product delete still **400**                          |
| Promotion, campaign                                    | `DELETE /admin/promotions/:id`, `DELETE /admin/campaigns/:id` | 200, 200; the budget row remains (not soft deleted)                                            |

**No admin route clears a phantom `reserved_quantity`.** A product left behind by F-M3 is reported leaked data (D41 rule,
D49), never deleted by SQL (the oracle is read only, and P6 never writes to the product database).

### 2.6 Probe environment and exit codes

- `npm run up:medusa` → **exit 0** (`pnpm medusa build` 39.9 s, `/health` 200 in 6.1 s, 1 m 20 s in total).
- Scripts (never committed): `/tmp/claude-0/-home-user-k6-load-concurrency-suite/6695eb1e-1b89-56b1-8b4b-7cbde349b74d/scratchpad/probe/`
  `lib.ts`, `p1-schema-promo.ts`, `p2-budget-race.ts`, `p2b-inspect.ts`, `p3-order-state.ts`, `p3c-leftover.ts`,
  `p3d-inspect.ts`, `p4-phantom-cleanup.ts`, `p5-leftovers.ts`, with their outputs (`*.out`). They import the repo's own
  `src/medusa/admin.ts`, `src/medusa/payloads.ts`, `src/oracles/pg.ts` and `src/races/fire-together.ts`.
- Final leftovers before `down` (`p5-leftovers.ts`): live orders 0, promotions 0, campaigns 0; **products 9** (all F-M3
  phantom `reserved_quantity` from the N=10 `-008`/`-009` runs), customers 3 (the P1 schema script did not delete its
  three test customers), budget rows of deleted campaigns 12 (Q7).
- `npm run down:medusa` → **exit 0** ("Medusa backend stopped and compose stack torn down (volumes kept)"); `curl
:9000/health` → `000` (closed).
- CI reference: `main` run [39829474241](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39829474241)
  (merge of PR #29): `medusa-smoke` job 17 min 36 s, race step "Race medusa (P6-MED-RACE-001, money cases, extras)" 16 min
  01 s at 50 trials, job timeout 45 min.

## 3. Goal and scope

**Goal.** Prove at the HTTP level, with N trials and a read-only DB oracle, that a capped promotion budget or usage limit
is never overdrawn, and that an order cannot take two exclusive transitions at once. Where the stack breaks a rule,
record it with repeated-run evidence and the right label; never hide it and never loosen the check (rule 12).

**In:**

- `P6-MED-RACE-005`, `-012`, `-008`, `-009` (all four reachable and probed, §2).
- Admin client calls for campaign, promotion, cancel, fulfil, reservation delete; the store call to apply a code.
- Pure payloads and invariants with unit tests; oracle SQL for promotion and order state, and the leak checks.
- Two run modules: `run-promo-case.ts` (`-005`, `-012`) and `run-order-case.ts` (`-008`, `-009`).
- A new CI job `medusa-order-races` (§11, D50) and README rows.

**Out:**

- Changes to `runTrials`, `fireTogether`, `src/races/rerun-on-spread.ts`, `src/oracles/pg.ts`, `run-case.ts`,
  `run-money-case.ts`, the harness, the fork.
- The extras of §5 (`-013` and `-014` are a follow-up task, `-015` is "Later"), the P1 follow-up PR (listed for Task 9), spend budgets beyond the probe
  note, any `test.fail()` before the owner accepts a label (§10, D47).

## 4. Test-case mapping

| Case                      | Title (keep the ID in the title)                   | Spec                                                       | N per burst          | Oracle (per attempt, after the burst)                                                                                                                      | Expected (probe)                                                     |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `P6-MED-RACE-005` (P1)    | N carts with a budget-K promo complete in parallel | `tests/medusa/races/med-race-005-campaign-budget.spec.ts`  | 10, K = 3            | budget `used ≤ K`; live orders with the promo `≤ K`; HTTP 200s `≤ K`; losers 4xx; no ghost order (F-M2 signal)                                             | pass (8 of 8)                                                        |
| `P6-MED-RACE-012` (extra) | N carts with a limit-L promo complete in parallel  | `tests/medusa/races/med-race-012-usage-limit.spec.ts`      | 10, L = 3            | `promotion.used ≤ L`; live orders with the promo `≤ L`; HTTP 200s `≤ L`; losers 4xx; no ghost order                                                        | counters pass (8 of 8); orders `≤ L` fails in 2 of 8 (F-M2)          |
| `P6-MED-RACE-008` (P1)    | two parallel cancels of one order                  | `tests/medusa/races/med-race-008-double-cancel.spec.ts`    | 2 (X04 shape)        | status `canceled`; HTTP 200s `= 1`; no `pending` change left; credit lines `= 1`; reservations `= 0`; `reserved_quantity` equals live reservations; no 5xx | 200s `= 1` fails in 7 of 8 (X04); reservations fail in 1 of 8 (F-M3) |
| `P6-MED-RACE-009` (P1)    | one cancel ‖ one fulfil on one order               | `tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts` | 2 (1 ‖ 1, X05 shape) | never `canceled` with an open fulfillment; exactly one of the two takes effect; reservations consistent with the final state; no 5xx                       | X05 in 1 of 5; F-M3 in 1 of 5                                        |

Each case fires the Task 1 untimed warm-up burst first (D28), with its own setup and cleanup.

## 5. Extras, follow-ups and priorities

| #                 | Item                                                                                                                                       | Status                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `P6-MED-RACE-013` | **Accepted extra (D57).** N=10 cancels of one order: `reserved_quantity` equals live reservations                                          | Follow-up task after this PR (D57). F-M3 at N=10 in 6 of 6 cancel runs. Same runner as `-008` with N=10; a spec only. |
| `P6-MED-RACE-014` | **Accepted extra (D57).** N=10 cancels of a **captured** order: refunds ≤ captured and the order's `refunded_total` equals the refund rows | Follow-up task after this PR (D57). F-M4 in 2 of 3 runs. Money primitive; reuses Task 2 helpers.                      |
| `P6-MED-RACE-015` | **Moved to "Later" (D57).** Spend budget (EUR) under N parallel carts: budget `used ≤ limit`                                               | Not planned. Held 3 of 3 live. The roadmap "Later" list gets it in Step 10.                                           |
| F-P1              | P1 follow-up PR removing X04/X05 from P1                                                                                                   | Not this PR (roadmap). Listed for the Task 9 closeout once `-008`/`-009` are labelled at full count.                  |
| Priorities (D45)  | `-008` **P1**, `-009` **P1**, `-012` **P2**                                                                                                | Agreed (D58). `-008`/`-009` were known P1 failures and cover state exclusivity; `-012` is the counter twin of `-005`. |

## 6. Architecture (every file touched, one responsibility each)

| File                                                                                                               | Change  | Responsibility                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/medusa/payloads.ts`                                                                                           | edit    | `promoCode`, `campaignCreateBody`, `promotionCreateBody`, `fulfillmentBody` (pure).                                                                                                                                                                                           |
| `src/medusa/admin.ts`                                                                                              | edit    | `createCampaign`, `createPromotion`, `deletePromotion`, `deleteCampaign`, `cancelOrder` (raced), `createFulfillment` (raced), `cancelFulfillment`, `deleteReservation`, `archiveOrder`.                                                                                       |
| `src/medusa/store.ts`                                                                                              | edit    | `prepareReadyCart` gets an optional `promoCode`, applied right after the line item (`applyPromoCode`).                                                                                                                                                                        |
| `src/medusa/oracle.ts`                                                                                             | edit    | `PROMO_SNAPSHOT_SQL`, `ORDER_STATE_SQL`, `LIVE_ORDERS_FOR_EMAIL_SQL`, `ORDER_RESERVATIONS_SQL`, `OPEN_FULFILLMENTS_SQL`, `PHANTOM_RESERVED_SQL`, `LEAK_PROMOTIONS_SQL`, `LEAK_CAMPAIGNS_SQL`; `readPromoSnapshot`, `readOrderState`, `promoLeakCheck`, `orderStateLeakCheck`. |
| `src/medusa/invariants.ts`                                                                                         | edit    | `checkPromoCap`, `checkGhostOrders`, `checkSingleCancel`, `checkCancelFulfilExclusive`, `checkReservationDrift`.                                                                                                                                                              |
| `src/medusa/run-promo-case.ts`                                                                                     | **new** | Trial body for `-005`/`-012`: campaign/promo, N carts, burst, oracle, sweep cleanup, leak check.                                                                                                                                                                              |
| `src/medusa/run-order-case.ts`                                                                                     | **new** | Trial body for `-008`/`-009`: one order, burst, oracle, cleanup, leak check with F-M3 residue reported.                                                                                                                                                                       |
| `tests/medusa/races/med-race-005-campaign-budget.spec.ts`                                                          | **new** | `P6-MED-RACE-005`.                                                                                                                                                                                                                                                            |
| `tests/medusa/races/med-race-012-usage-limit.spec.ts`                                                              | **new** | `P6-MED-RACE-012`.                                                                                                                                                                                                                                                            |
| `tests/medusa/races/med-race-008-double-cancel.spec.ts`                                                            | **new** | `P6-MED-RACE-008`.                                                                                                                                                                                                                                                            |
| `tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts`                                                         | **new** | `P6-MED-RACE-009`.                                                                                                                                                                                                                                                            |
| `tests/unit/medusa-payloads.test.ts`, `medusa-admin.test.ts`, `medusa-oracle.test.ts`, `medusa-invariants.test.ts` | edit    | §13.                                                                                                                                                                                                                                                                          |
| `.github/workflows/perf.yml`                                                                                       | edit    | `medusa-smoke` race step excludes the four cases; new job `medusa-order-races` runs them (§11).                                                                                                                                                                               |
| `README.md`                                                                                                        | edit    | Case rows, suspected bugs F-M2 to F-M4 and X04/X05 status, leaked-data note (§17).                                                                                                                                                                                            |
| `docs/plans/2026-10-22-p6-phase2-roadmap.md`                                                                       | edit    | Task 3 status line, `-012` lands, proposed extras (§14 Step 10).                                                                                                                                                                                                              |

Unchanged: `src/races/*`, `src/oracles/pg.ts`, `src/medusa/run-case.ts`, `src/medusa/run-money-case.ts`,
`playwright.config.ts` (the specs stay in `tests/medusa/races`, project `medusa-race`), `scripts/harness.mjs`, the fork.

## 7. Design

### 7.1 `-005` / `-012` attempt (one trial index, one or more attempts)

1. **Setup (not raced).** Product (`createStockedVariant`, stock 50, lowercase handle `attemptTag`). `-005`:
   `createCampaign(identifier, {type:"usage", limit:K})`, then `createPromotion(code, {campaignId})`. `-012`:
   `createPromotion(code, {limit:L})`. Then `prepareReadyCarts(N, ... promoCode: code)`; every apply must be 200, else
   TEST BUG (D37).
2. **Burst.** `fireTogether(N, completeCart)` with the `/health` warm.
3. **Oracle.** `readPromoSnapshot(pool, promotionId, campaignId, emailLike)` → `budgetUsed`, `budgetLimit`,
   `promotionUsed`, `ordersWithPromo` (live link + live order), `liveOrders` (by attempt email prefix), `unpaidOrders`
   (live orders of the prefix without a payment row). HTTP: 200 count, order ids, loser statuses and messages.
4. **Invariants.** `checkPromoCap` (counter and orders `≤ cap`, HTTP 200s `≤ cap`), `checkLoserStatuses` (Task 2),
   `checkGhostOrders` (a live order whose HTTP response was not 200).
5. **Cleanup (§9).** Sweep live orders by the attempt email prefix (catches ghosts), cancel + archive, delete the
   product, the promotion, the campaign, the customers.

### 7.2 `-008` / `-009` attempt

1. **Setup.** Product, one ready cart, `completeCart` → one order (authorised, not captured); read its line item id;
   location = `catalog.locationId`.
2. **Burst.** `-008`: 2 × `cancelOrder`. `-009`: index 0 `cancelOrder`, index 1 `createFulfillment(itemId, 1, locationId)`.
3. **Oracle.** `readOrderState(pool, orderId, inventoryItemId, locationId)` → `status`, `openFulfillments`,
   `pendingChanges`, `creditLines`, `liveReservations`, `reservedQuantity`, `fulfilledQuantity`.
4. **Invariants.** `-008`: `checkSingleCancel` (HTTP 200s `= 1`, `pendingChanges = 0`, `creditLines = 1`, status
   `canceled`), `checkReservationDrift`. `-009`: `checkCancelFulfilExclusive` (never `canceled` with `openFulfillments >
0`; exactly one of the two requests returned 200; `fulfilledQuantity` matches the winner), `checkReservationDrift`.
   Both: `checkLoserStatuses`.
5. **Cleanup (§9).** Cancel open fulfillments (only while the order is not canceled), cancel if not canceled, archive,
   delete live reservations of the order, delete the product. An F-M3 product is reported leaked data.

### 7.3 Which bursts can be invalid

Only the spread precondition (D3). A product invariant violation in an invalid attempt still counts. A setup failure is a
TEST BUG and fails the case at once (D37).

### 7.4 Invariants (pure, `src/medusa/invariants.ts`)

Every violation string starts with its label. The label rules are §10; the text shows what a junior engineer writes.

| Function                                                                                                  | Rule                                                                                                 | Violation text (example)                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `checkPromoCap({ cap, counterUsed, ordersWithPromo, httpSuccesses, label })`                              | `counterUsed ≤ cap`, `httpSuccesses ≤ cap` → PRODUCT BUG; `ordersWithPromo ≤ cap` → SUSPECTED (F-M2) | `PRODUCT BUG: P6-MED-RACE-005 budget used 4 of 3`; `SUSPECTED PRODUCT BUG: ... 4 orders carry the promotion, cap 3 (F-M2)` |
| `checkGhostOrders({ liveOrderIds, httpOrderIds })`                                                        | every live order of the attempt was returned by an HTTP 200                                          | `SUSPECTED PRODUCT BUG: order order_x exists but its checkout returned 4xx (F-M2)`                                         |
| `checkSingleCancel({ httpSuccesses, pendingChanges, creditLines, status })`                               | `status = canceled`; `httpSuccesses = 1`; `pendingChanges = 0`; `creditLines = 1`                    | `SUSPECTED PRODUCT BUG: 2 cancels returned 200, expected 1 (X04)`                                                          |
| `checkCancelFulfilExclusive({ status, openFulfillments, cancelStatus, fulfilStatus, fulfilledQuantity })` | not (`canceled` and open fulfillment); exactly one 200; fulfilled qty `= 1` iff fulfil won           | `SUSPECTED PRODUCT BUG: order canceled with 1 open fulfillment (X05)`                                                      |
| `checkReservationDrift({ status, liveReservations, reservedQuantity, liveReservationQty })`               | canceled ⇒ `liveReservations = 0`; `reservedQuantity = liveReservationQty`                           | `SUSPECTED PRODUCT BUG: reserved_quantity 6 but live reservations sum 0 (F-M3)`                                            |

The words "PRODUCT BUG" appear only for a counter overdraw, which no probe run showed. Everything the probe did show is
"SUSPECTED PRODUCT BUG" until §10 says otherwise.

## 8. Code skeletons

Skeletons only. The build writes the full code, with Prettier and typecheck green after each file. Copy the shapes of the
Task 2 code (`run-money-case.ts`, `moneyPost`, `moneyLeakCheck`) rather than inventing new ones.

### 8.1 `src/medusa/payloads.ts` (edit)

```ts
/** Promotion code for one attempt. Codes are case sensitive (live §2.2), so always lowercase. */
export function promoCode(prefix: string, leaf: string): string {
  const code = `${prefix.toLowerCase()}-${leaf}-code`;
  if (!/^[a-z0-9-]+$/.test(code))
    throw new Error(`TEST BUG: promo code "${code}" is not [a-z0-9-]`);
  return code;
}

/** Body of POST /admin/campaigns with a usage budget. Live: 200; a currency_code on a usage budget is a 400. */
export function campaignCreateBody(identifier: string, limit: number) {
  return { name: identifier, campaign_identifier: identifier, budget: { type: "usage", limit } };
}

/** Body of POST /admin/promotions: 10 % off the order in EUR, active; either a campaign or a usage limit. */
export function promotionCreateBody(code: string, cap: { campaignId: string } | { limit: number }) {
  return {
    code,
    type: "standard",
    status: "active",
    application_method: {
      type: "percentage",
      target_type: "order",
      value: 10,
      currency_code: "eur",
    },
    ...("campaignId" in cap ? { campaign_id: cap.campaignId } : { limit: cap.limit }),
  };
}

/** Body of POST /admin/orders/:id/fulfillments. Live: 200 with the checkout line item id and the stock location. */
export function fulfillmentBody(itemId: string, quantity: number, locationId: string) {
  return { items: [{ id: itemId, quantity }], location_id: locationId };
}
```

### 8.2 `src/medusa/admin.ts` (edit)

```ts
export async function createCampaign(
  token: string,
  identifier: string,
  limit: number,
): Promise<string> {
  // adminJson("/campaigns", POST, campaignCreateBody). Non-200 → throw "TEST BUG: POST /admin/campaigns HTTP <s>".
  // Returns json.campaign.id.
}
export async function createPromotion(
  token: string,
  code: string,
  cap: { campaignId: string } | { limit: number },
): Promise<string> {
  // adminJson("/promotions", POST, promotionCreateBody). Non-200 → TEST BUG. Returns json.promotion.id.
}
export async function deletePromotion(token: string, id: string): Promise<void> {
  /* DELETE /promotions/:id, 200 else TEST BUG */
}
export async function deleteCampaign(token: string, id: string): Promise<void> {
  /* DELETE /campaigns/:id, 200 else TEST BUG */
}

/** Raced. Never throws on 4xx/5xx (same rule as moneyPost). */
export function cancelOrder(token: string, orderId: string) {
  return moneyPost(`/orders/${orderId}/cancel`, token, {});
}
/** Raced. */
export function createFulfillment(
  token: string,
  orderId: string,
  itemId: string,
  locationId: string,
) {
  return moneyPost(
    `/orders/${orderId}/fulfillments`,
    token,
    fulfillmentBody(itemId, 1, locationId),
  );
}
export function cancelFulfillment(token: string, orderId: string, fulfillmentId: string) {
  return moneyPost(`/orders/${orderId}/fulfillments/${fulfillmentId}/cancel`, token, {});
}
export async function archiveOrder(token: string, orderId: string): Promise<void> {
  /* POST /orders/:id/archive, 200 else TEST BUG */
}
export async function deleteReservation(token: string, id: string): Promise<number> {
  /* DELETE /reservations/:id; returns status */
}
```

`moneyPost` is renamed `rawPost` (it is no longer money-only) in the same commit; its two money callers change with it.

### 8.3 `src/medusa/store.ts` (edit)

```ts
// prepareReadyCart input gains `promoCode?: string`. Right after the line item succeeds:
if (input.promoCode) {
  const promo = await storeJson(`/carts/${cartId}/promotions`, input.publishableKey, {
    method: "POST",
    body: { promo_codes: [input.promoCode] },
  });
  throwIfSetupFailed("POST /store/carts/:id/promotions", promo.status);
}
```

Callers that pass no `promoCode` are unchanged (the oversell and money cases).

### 8.4 `src/medusa/oracle.ts` (edit)

```ts
/** $1 promotion id, $2 campaign id ('' for -012), $3 attempt email LIKE. Live §2.2. */
export const PROMO_SNAPSHOT_SQL = `
SELECT
  (SELECT p.used FROM promotion p WHERE p.id = $1)::int AS promotion_used,
  (SELECT b.used::text FROM promotion_campaign_budget b WHERE b.campaign_id = $2 AND b.deleted_at IS NULL) AS budget_used,
  (SELECT COUNT(*) FROM order_promotion op JOIN "order" o ON o.id = op.order_id
     WHERE op.promotion_id = $1 AND op.deleted_at IS NULL AND o.deleted_at IS NULL)::int AS orders_with_promo
`;

/** Live orders of one attempt (ghosts included), with whether each has a payment row. */
export const LIVE_ORDERS_FOR_EMAIL_SQL = `
SELECT o.id, o.status,
  EXISTS (SELECT 1 FROM order_payment_collection opc JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
          WHERE opc.order_id = o.id AND p.deleted_at IS NULL) AS has_payment
FROM "order" o
WHERE o.email LIKE $1 AND o.deleted_at IS NULL AND o.status NOT IN ('archived', 'canceled')
`;

/** $1 order id, $2 inventory item id, $3 location id. Live §2.3. */
export const ORDER_STATE_SQL = `
SELECT o.status,
  (SELECT COUNT(*) FROM order_fulfillment ofl JOIN fulfillment f ON f.id = ofl.fulfillment_id
     WHERE ofl.order_id = $1 AND ofl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.canceled_at IS NULL)::int AS open_fulfillments,
  (SELECT COUNT(*) FROM order_change ch WHERE ch.order_id = $1 AND ch.status = 'pending' AND ch.deleted_at IS NULL)::int AS pending_changes,
  (SELECT COUNT(*) FROM order_credit_line cl WHERE cl.order_id = $1 AND cl.deleted_at IS NULL)::int AS credit_lines,
  (SELECT COUNT(*) FROM reservation_item ri WHERE ri.inventory_item_id = $2 AND ri.deleted_at IS NULL)::int AS live_reservations,
  (SELECT COALESCE(SUM(ri.quantity), 0)::text FROM reservation_item ri WHERE ri.inventory_item_id = $2 AND ri.deleted_at IS NULL) AS live_reservation_qty,
  (SELECT il.reserved_quantity::text FROM inventory_level il WHERE il.inventory_item_id = $2 AND il.location_id = $3 AND il.deleted_at IS NULL) AS reserved_quantity,
  (SELECT oi.fulfilled_quantity::text FROM order_item oi WHERE oi.order_id = $1 AND oi.deleted_at IS NULL ORDER BY oi.version DESC LIMIT 1) AS fulfilled_quantity
FROM "order" o WHERE o.id = $1
`;
// ORDER_RESERVATIONS_SQL: SELECT ri.id FROM reservation_item ri WHERE ri.inventory_item_id = $1 AND ri.deleted_at IS NULL
// OPEN_FULFILLMENTS_SQL:  fulfillment ids of $1 with canceled_at IS NULL (shape of the subquery above)
// PHANTOM_RESERVED_SQL:   products of a LIKE prefix whose inventory_level.reserved_quantity > live reservation sum
// LEAK_PROMOTIONS_SQL:    SELECT COUNT(*)::int AS n FROM promotion WHERE code LIKE $1 AND deleted_at IS NULL
// LEAK_CAMPAIGNS_SQL:     SELECT COUNT(*)::int AS n FROM promotion_campaign WHERE campaign_identifier LIKE $1 AND deleted_at IS NULL
//                         (budget rows are NOT checked: a campaign delete keeps them, §2.1 Q7)
```

Inventory is read by `inventory_item_id` (the attempt's own product), not through `order_item` joins: the probe's first
join through `order_item` double counted rows across order versions.

`promoLeakCheck(pool, like)` returns violations for products, customers, live orders, promotions and campaigns of the
prefix (the `moneyLeakCheck` shape). `orderStateLeakCheck(pool, like, reportedPhantomProductIds)` reports a live product
that `PHANTOM_RESERVED_SQL` lists and the run reported as leaked data; any other leftover is a TEST BUG.

### 8.5 `src/medusa/invariants.ts` (edit)

```ts
export function checkReservationDrift(input: {
  status: string;
  liveReservations: number;
  liveReservationQty: number;
  reservedQuantity: number;
}): string[] {
  const out: string[] = [];
  if (input.status === "canceled" && input.liveReservations > 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: canceled order keeps ${input.liveReservations} live reservation(s) (F-M3)`,
    );
  }
  if (input.reservedQuantity !== input.liveReservationQty) {
    out.push(
      `SUSPECTED PRODUCT BUG: reserved_quantity ${input.reservedQuantity} but live reservations sum ${input.liveReservationQty} (F-M3)`,
    );
  }
  return out;
}
```

The other four follow the same shape and the rules of §7.4.

### 8.6 `src/medusa/run-promo-case.ts` (new) and `run-order-case.ts` (new)

Shape: copy `runMoneyCase`. `runPromoCase({ pool, token, catalog, runPrefix, caseId, title, mode: "budget" | "limit",
n, cap, trials })` and `runOrderCase({ ..., mode: "double-cancel" | "cancel-vs-fulfil", trials })`. Both build the
runner with `createRerunRunner(spreadPolicyFromEnv(), trials)`, run `runner.warmup`, then `runTrials`, then the leak
check, write the histogram in `finally`, and return `{ histogram, suspected: string[], reportedLeaked: string[] }`.

How a violation is used (D47, agreed as D54):

- Strings starting `PRODUCT BUG` or `TEST BUG` go through `recordTrial`'s throw → the trial fails → verdict `fail`.
- Strings starting `SUSPECTED PRODUCT BUG` go into `record.oracle.suspectedBug` and the run's `suspected` list; the spec
  annotates them (`type: "suspected-bug"`), exactly as `-011` does for F-M1. They do not change the verdict until the
  owner labels them.

### 8.7 Spec skeleton (`-008`; the other three differ only in the runner, mode and title)

```ts
import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOrderCase } from "../../../src/medusa/run-order-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa double cancel", () => {
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();

  test.beforeAll(async () => {
    token = await seedAndLogin();
    catalog = await loadCatalog(token);
  });
  test.afterAll(async () => {
    await closePool(pool);
  });

  test.describe("P6-MED-RACE-008 double cancel", () => {
    // 60 s + 10 s per trial (probe: ≤ 2.9 s per attempt; 3x margin). -005/-012 use 60 s + 30 s per trial (probe ≤ 15.9 s).
    test.describe.configure({ timeout: 60_000 + trials * 10_000 });

    test("P6-MED-RACE-008 two parallel cancels → one takes effect", async () => {
      const { histogram, suspected, reportedLeaked } = await runOrderCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-008",
        title: "two parallel cancels of one order → one takes effect",
        mode: "double-cancel",
        trials,
      });
      for (const s of suspected)
        test.info().annotations.push({ type: "suspected-bug", description: s });
      for (const id of reportedLeaked)
        test.info().annotations.push({ type: "leaked-data", description: `${id} (F-M3, D49)` });
      expect(histogram.verdict).toBe("pass");
    });
  });
});
```

## 9. Data isolation, cleanup and leak check

- Every handle, email, promotion code and campaign identifier starts with `casePrefix(runPrefix, caseId)` and carries
  `attemptTag(trial, attempt)`; all lowercase (codes are case sensitive, handles must be lowercase).
- `-005`/`-012` cleanup per attempt, in order:
  1. Sweep live orders by the attempt's email LIKE (`LIVE_ORDERS_FOR_EMAIL_SQL`), not only the HTTP order ids, so a
     ghost order (F-M2) is found. `cancelAndArchive` each (live: 200, 200 for normal and ghost orders).
  2. Delete the product (live 200 once the ghost is archived), the promotion, the campaign, the customers.
- `-008`/`-009` cleanup per attempt:
  1. For each open fulfillment, if the order is not canceled: `cancelFulfillment` (if it is canceled, the route returns
     400; skip and report the fulfillment row as leaked data).
  2. If the order is not canceled: `cancelOrder`. Do **not** call the Task 2 confirm route: on a canceled order it
     returns 400 (§2.5) and archive works without it.
  3. `archiveOrder` (live 200 in every run).
  4. `deleteReservation` for each live reservation of the attempt's inventory item (live 200).
  5. `deleteProduct`. If it returns 400 "have reservations" and `PHANTOM_RESERVED_SQL` lists the product, report it as
     leaked data (D49). Otherwise it is a TEST BUG.
- Leak check per case (after all trials): products, customers, live orders, promotions and campaigns of the case LIKE
  prefix. Budget rows are not checked (Q7). A reported F-M3 product or an F-M2/X05 residue named in the histogram is
  leaked data, never a failure; anything else is a TEST BUG.
- The oracle reads by the attempt's own ids, so a leaked row of an earlier attempt never enters a later attempt's
  numbers (a phantom `reserved_quantity` is per inventory item, and every attempt has its own product).

## 10. Labels and the evidence each needs

| Observation                                                         | Label now                  | Evidence before a stronger label                                                                        |
| ------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Budget or limit counter above the cap; HTTP 200s above the cap      | PRODUCT BUG                | Never seen live (16 runs). The request bodies and DB rows of the failing attempt.                       |
| Orders with the promotion above the cap; ghost order (F-M2)         | **SUSPECTED PRODUCT BUG**  | Seen 2 of 8 (`-012`). PRODUCT BUG only after full-count CI runs reproduce it (D40 rule).                |
| Two cancels both 200, pending credit_line change (X04)              | **SUSPECTED PRODUCT BUG**  | Seen 7 of 8; was a P1 expected failure. Full-count CI runs, then the owner decides `test.fail()` (D47). |
| Canceled with an open fulfillment (X05)                             | **SUSPECTED PRODUCT BUG**  | Seen 1 of 5; was a P1 expected failure. As X04.                                                         |
| Reservation restored or `reserved_quantity` drift (F-M3)            | **SUSPECTED PRODUCT BUG**  | Seen 2 of 13 at N=2, 9 of 9 at N=10. As X04.                                                            |
| `order_summary.refunded_total` above the refund rows (F-M4)         | not asserted in this task  | Only in the follow-up `-014` (D57). Seen 2 of 3.                                                        |
| 5xx on a raced request                                              | PRODUCT BUG                | The status and body. Not seen live.                                                                     |
| Setup step fails (campaign, promotion, apply code, checkout)        | TEST BUG                   | The step name (D37). Never rerun (rule 13).                                                             |
| Leftover product, customer, promotion, campaign not explained above | TEST BUG (cleanup)         | The leftover rows.                                                                                      |
| F-M3 product, X05 fulfillment, X04 pending change after cleanup     | REPORTED LEAKED DATA (D49) | The ids and the failed route bodies in the histogram.                                                   |

**This plan does not apply `PRODUCT BUG` or `test.fail()` to anything.** Rule 13 needs repeated full-count CI runs;
rule 9 needs the owner for any product-bug label. Agreed rule (D54): until then, suspected signals are annotations and do
not change the verdict. After 3 full-count CI runs the owner labels X04, X05, F-M2 and F-M3; each labelled signal then
becomes an asserted invariant under `test.fail()` with the run links (a separate commit, never in this PR's build steps).

## 11. CI (`.github/workflows/perf.yml`) — agreed by the owner (D55)

- **Why a new job (D50).** `medusa-smoke` already uses 17 min 36 s of its 45-min timeout on `main` (run 39829474241;
  race step 16 min 01 s). The four new cases at 50 trials need about 26 to 30 min of race time on the probe's per-attempt
  numbers (§12). Together they would exceed 45 min. D39 forbids cutting trials and Task 1 D24 forbids raising the
  timeout, so the cases get their own job.
- **`medusa-smoke` race step:** `npm run race:medusa -- --grep-invert "P6-MED-RACE-0(05|08|09|12)"`. Step name becomes
  "Race medusa (P6-MED-RACE-001, money cases, extras)" (unchanged).
- **New job `medusa-order-races`:** a copy of `medusa-smoke` steps 1 to 17 (checkouts, `MEDUSA_REF` verify, harness
  roots, Node, P6 install, k6, pnpm cache restore, Medusa install, build cache restore, admin password, `up:medusa`, k6
  smoke) with the same pins and env. Then one step "Race medusa order races (P6-MED-RACE-005, -008, -009, -012)" running
  `npm run race:medusa -- --grep "P6-MED-RACE-0(05|08|09|12)"` with `RACE_TRIALS` = 3 on `pull_request`, else 50, and
  `P6_PLAYWRIGHT_JSON: results/playwright/medusa-order-races.json`. Then the job summary, the artefact
  `race-histograms-medusa-order` (14 days), `down:medusa` with `always()`. No cache **save** steps (only `medusa-smoke`
  saves; this job only restores). `timeout-minutes: 45`. No check step (`npm run check` runs once in `medusa-smoke`).
- The README race table and `scripts/write-ci-job-summary.ts` already read any `results/races/*.json`; no script change
  is expected. If the summary script hard-codes the Medusa artefact name, the build stops and reports (no silent edit).

## 12. Trial counts and time budget

- **Full count 50** on `main`, nightly and dispatch; **3** on PRs (D6). No reduction (D39).
- Per attempt (probe VM, proof only): `-005`/`-012` 13.0 to 15.9 s; `-008`/`-009` 2.1 to 2.9 s; one warm-up attempt each.
- Estimate at 50 trials on the new job: `-005` 51 × 15.9 s ≈ 13.5 min; `-012` ≈ 13.5 min; `-008` 51 × 2.9 s ≈ 2.5 min;
  `-009` ≈ 2.5 min; spread reruns up to 20 % more (Task 1 budget). **Race step ≈ 32 min worst case**; plus ≈ 2 min of
  setup (the cached `up:medusa` took 41 s on `main`). **≈ 34 min of the 45-min timeout.** At 3 trials on PRs: ≈ 2 min.
- If the first full-count run exceeds 40 min, the build stops and reports; the proposed fix is to split `-005` and
  `-012` into a third job (D50), not to cut trials.
- Per-test timeouts: `-005`/`-012` `60_000 + trials * 30_000` (as the money specs), `-008`/`-009`
  `60_000 + trials * 10_000`.
- No new environment variable. `.env.example` is unchanged.

## 13. Unit tests (exact counts; baseline 354)

### 13.1 `tests/unit/medusa-payloads.test.ts` (+5 → 359)

1. `promoCode("P6-QA-X-P6-MED-RACE-005", "t01a1")` → `"p6-qa-x-p6-med-race-005-t01a1-code"`.
2. `promoCode` throws `TEST BUG` for a leaf with `_`.
3. `campaignCreateBody("id", 3)` deep-equals `{ name: "id", campaign_identifier: "id", budget: { type: "usage", limit: 3 } }` (no `currency_code`).
4. `promotionCreateBody("c", { limit: 3 })` has `limit: 3`, no `campaign_id`; with `{ campaignId: "camp" }` it has `campaign_id` and no `limit` (one `it`, two asserts).
5. `fulfillmentBody("li", 1, "loc")` deep-equals `{ items: [{ id: "li", quantity: 1 }], location_id: "loc" }`.

### 13.2 `tests/unit/medusa-admin.test.ts` (+3 → 362)

Reuse `stubFetch`. 6. `createCampaign` returns the id on 200. 7. `createCampaign` throws `TEST BUG: POST /admin/campaigns
HTTP 400` on 400. 8. `cancelOrder` on a 400 resolves `{ status: 400, body }` and does not throw.

### 13.3 `tests/unit/medusa-oracle.test.ts` (+5 → 367)

9. `assertSelectOnly` passes for `PROMO_SNAPSHOT_SQL`, `LIVE_ORDERS_FOR_EMAIL_SQL`, `ORDER_STATE_SQL`. 10. The same for
   `ORDER_RESERVATIONS_SQL`, `OPEN_FULFILLMENTS_SQL`, `PHANTOM_RESERVED_SQL`, `LEAK_PROMOTIONS_SQL`, `LEAK_CAMPAIGNS_SQL`.
10. `promoLeakCheck` with all counts 0 → no violation. 12. `promoLeakCheck` with one live promotion → one `TEST BUG`
    violation naming `promotion`. 13. `orderStateLeakCheck` with one phantom product that was reported → no violation, one
    reported id.

### 13.4 `tests/unit/medusa-invariants.test.ts` (+14 → 381)

14–15. `checkPromoCap`: at the cap → `[]`; counter cap+1 → one `PRODUCT BUG`. 16. `checkPromoCap`: orders cap+1 with
counter at cap → one `SUSPECTED PRODUCT BUG` containing `F-M2`. 17–18. `checkGhostOrders`: equal sets → `[]`; one extra
live order → one `SUSPECTED` with its id. 19–20. `checkSingleCancel`: one 200, 0 pending, 1 credit line → `[]`; two 200s →
`SUSPECTED` containing `X04`. 21. `checkSingleCancel`: status `pending` → `SUSPECTED` naming the status. 22–24.
`checkCancelFulfilExclusive`: canceled + 0 open + fulfil 400 → `[]`; fulfilled + not canceled + cancel 400 → `[]`;
canceled + 1 open → `SUSPECTED` containing `X05`. 25. `checkCancelFulfilExclusive`: both 200 → `SUSPECTED`. 26–27.
`checkReservationDrift`: consistent → `[]`; reserved 6 vs 0 → `SUSPECTED` containing `F-M3`.

## 14. Build steps (repo root; one commit each; on any differing output stop and paste it)

Before every command: `export PATH="/usr/local/bin:$PATH"`. Admin credentials come from the environment (§1), never typed
into a file in the repo.

### Step 0. Baseline gate (no commit)

```bash
npm run check                  # expect: "# tests 354", "# pass 354", "# fail 0"
npm run up:medusa              # expect exit 0 and "Medusa backend is up at http://127.0.0.1:9000"
npm run smoke:medusa           # expect exit 0
npm run down:medusa            # expect exit 0; curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9000/health → 000
```

### Step 1. Payloads — `feat(medusa): add promotion, campaign and fulfillment payloads`

Files: `src/medusa/payloads.ts`, `tests/unit/medusa-payloads.test.ts` (§8.1, §13.1).

```bash
npm run check                  # expect "# tests 359", "# pass 359", "# fail 0"
git add src/medusa/payloads.ts tests/unit/medusa-payloads.test.ts
git commit -m "feat(medusa): add promotion, campaign and fulfillment payloads"
```

### Step 2. Admin and store clients — `feat(medusa): add promotion and order-state admin calls`

Files: `src/medusa/admin.ts`, `src/medusa/store.ts`, `src/medusa/run-money-case.ts` (rename `moneyPost` → `rawPost` only),
`tests/unit/medusa-admin.test.ts` (§8.2, §8.3, §13.2). Expect **362** tests.

### Step 3. Oracle — `feat(medusa): add promotion and order-state oracle`

Files: `src/medusa/oracle.ts`, `tests/unit/medusa-oracle.test.ts` (§8.4, §13.3). Expect **367** tests.

### Step 4. Invariants — `feat(medusa): add budget and order-state invariants`

Files: `src/medusa/invariants.ts`, `tests/unit/medusa-invariants.test.ts` (§8.5, §13.4). Expect **381** tests.

### Step 5. Promotion runner and `-005` — `feat(races): add medusa campaign budget race P6-MED-RACE-005`

Files: `src/medusa/run-promo-case.ts`, `tests/medusa/races/med-race-005-campaign-budget.spec.ts`. Expect **381** tests.
Proof run on the VM (never published):

```bash
npm run up:medusa
RACE_TRIALS=3 npx playwright test --project=medusa-race -g "P6-MED-RACE-005"   # expect 1 passed
npm run down:medusa
```

Paste the histogram verdict, `invalidTrials`, `reruns`, the per-attempt `budgetUsed`/`ordersWithPromo`, and the leak
result. Expected from the probe: pass, budget used 3, orders 3.

### Step 6. `-012` — `feat(races): add medusa promotion usage limit race P6-MED-RACE-012`

File: `tests/medusa/races/med-race-012-usage-limit.spec.ts`. **381** tests. Proof run as Step 5 with `-g
"P6-MED-RACE-012"`. Expected: counters pass; F-M2 may show as a `suspected-bug` annotation (2 of 8 in the probe).

### Step 7. Order runner and `-008` — `feat(races): add medusa double cancel race P6-MED-RACE-008`

Files: `src/medusa/run-order-case.ts`, `tests/medusa/races/med-race-008-double-cancel.spec.ts`. **381** tests. Proof run
with `-g "P6-MED-RACE-008"`. Expected: X04 `suspected-bug` annotations on most trials; verdict `pass` unless a counter, 5xx or
setup check fails (D54).

### Step 8. `-009` — `feat(races): add medusa cancel vs fulfil race P6-MED-RACE-009`

File: `tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts`. **381** tests. Proof run with `-g "P6-MED-RACE-009"`.

### Step 9. CI and README — `ci(races): run the medusa budget and order-state races`

Files: `.github/workflows/perf.yml` (§11), `README.md` (§17). **381** tests. `npm run check` includes actionlint; expect
exit 0. `npx playwright test --list --project=medusa-race | tail -1` before Step 5 and after Step 8: the total grows by
exactly 4.

### Step 10. Roadmap sync — `docs(plans): sync the phase 2 roadmap with task 3`

File: `docs/plans/2026-10-22-p6-phase2-roadmap.md`: Task 3 status line (plan link, `-012` lands, suspected bugs, new job),
`-013` and `-014` as accepted extras for a follow-up task, `-015` under "Later", the priorities of D58. **381** tests.

### Step 11. Push and PR

```bash
git push -u origin feat/2026-10-22-p6-med-budget-order-races
gh pr create --title "feat: add medusa budget and order-state races" --body-file <path outside the repo>
```

`gh` only (rule 3). If `gh` is missing, report the title and body and stop. Read CI once (rule 15).

## 15. Verification gate (paste real output before the PR is ready)

- `npm run check` (all five parts; 381 tests, 0 fail).
- `npx playwright test --list` count before and after.
- Green PR run (3 trials) for both Medusa jobs, then one full-count run (`main`, nightly or dispatch) with the
  `medusa-order-races` step time (§12).
- Every histogram: verdict, `trialsRequested`, `invalidTrials`, `reruns`, `warmup[]`, violations, suspected signals with
  counts, and leaked-data records.

## 16. Commit plan

1. `docs(plans): add the phase 2 task 3 med-budget-order-races plan` (this file only).
2. to 11. As §14 Steps 1 to 10.

## 17. Docs (README)

- "Medusa budget and order-state races (Phase 2)" section: one row per case with N, cap, oracle, and the CI job.
- F-M2, F-M3 and X04/X05 as **suspected** product bugs with the probe counts (not in "Known product bugs" until §10 is
  met). F-M4 as a probe note pointing at the accepted follow-up `-014`.
- A note that an F-M3 product cannot be deleted through the admin API and is reported as leaked data.

## 18. Will NOT do

- No fork or harness change; no SQL writes; no `retries`; no sleeps; no `test.fail()` without the owner's label (§10).
- No reduction of trials, no timeout change (D39, Task 1 D24).
- No change to `runTrials`, `fireTogether`, the rerun policy, `run-case.ts` or the money logic.
- No work on `-013` or `-014` in this PR (follow-up task, D57) and none on `-015` ("Later"); no P1 repo change (follow-up only).
- No publication of probe timings.

## 19. Risks

| Risk                                                                    | Mitigation                                                                                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The new job's time exceeds the estimate (setup is 10 carts per attempt) | First full-count run decides; split `-005`/`-012` into a third job (D50). Never cut trials.                                                                            |
| F-M3 products pile up in a long-lived local DB                          | Each is prefixed and reported; CI databases are throwaway. Local: `npm run down:medusa` keeps volumes, so the leftovers stay until the volume is removed (documented). |
| X05 is intermittent (1 of 5): a 3-trial PR run may not show it          | It is a suspected signal, not an assertion, until labelled (D54). Full count gives ≈ 1 − 0.8⁵⁰ chance to see it.                                                       |
| `lock_timeout = '3s'` in `registerUsage` could give 5xx under load      | Not seen live (burst ≤ 2.8 s). A 5xx is a PRODUCT BUG with the body.                                                                                                   |
| A ghost order (F-M2) blocks the product delete                          | The cleanup sweeps orders by email prefix first (§9), proven live.                                                                                                     |
| The P1 X04/X05 sequence differs from the reference text                 | P1 is out of reach here; the P6 reference text is the agreed source (D56). The P6 cases stand on their own probe evidence.                                             |
| `order_promotion` join counts a soft-deleted link                       | The SQL filters `op.deleted_at IS NULL AND o.deleted_at IS NULL` (live: losers' links are soft deleted).                                                               |

## 20. Decisions (2026-10-22; numbering continues from Task 2's D41)

- **D42 One campaign/promotion per attempt.** `QA10` is shared and has no cap (Q4).
- **D43 `-005` uses a usage budget, K = 3, N = 10.** Usage is the budget type the master plan names ("allows K"); spend is
  `-015`, moved to "Later" (D57).
- **D44 `-012` lands.** Same setup, one oracle field, same time (§2.4).
- **D45 Priorities (agreed, D58):** `-008` P1, `-009` P1, `-012` P2 (§5).
- **D46 `-008`/`-009` use N = 2** (the X04/X05 shape the roadmap ports). N = 10 behaviour is the accepted follow-up `-013` (D57).
- **D47 Suspected signals are annotated, not asserted, until the owner labels them** (D40 precedent). Counter overdraws,
  5xx and setup errors are asserted. Agreed (D54).
- **D48 Cleanup sweeps live orders by attempt email prefix** (F-M2 ghost orders, §2.5).
- **D49 F-M3 products and X05 fulfillment rows are reported leaked data, not failures** (D41 rule; no admin route clears
  them, §2.5).
- **D50 New CI job `medusa-order-races`** (§11), because the time budget does not fit `medusa-smoke`.
- **D51 Promotion codes are lowercase** (live: case sensitive).
- **D52 Inventory is read by inventory item id**, not through `order_item` (§8.4).
- **D53 Two runner modules** (`run-promo-case.ts`, `run-order-case.ts`), not a grown `run-money-case.ts`: each holds one
  setup shape.

Owner answers to revision 1 (agreed 2026-10-22; each closes the §21 question of the same number):

- **D54 Verdict before labelling (Q1).** Suspected signals (X04, X05, F-M2, F-M3) are annotations and histogram fields; they
  do not fail the case. Counter overdraws, HTTP 200s above the cap, 5xx and setup errors are asserted. After 3 full-count
  CI runs the owner labels each signal; a labelled signal becomes an asserted invariant under `test.fail()` with the run
  links.
- **D55 New CI job `medusa-order-races` (Q2).** Accepted as in §11: same pins, restore-only caches, `timeout-minutes: 45`.
- **D56 X04/X05 source (Q3).** The P6 reference text (`docs/reference/p1-plan-example-medusa.md` line 365) is the source
  of the port. If the owner later pastes P1's blocks and they differ, the build stops and reports the difference.
- **D57 Extras (Q4).** `-013` and `-014` are accepted for a follow-up task after this PR; `-015` moves to "Later".
- **D58 Priorities (Q5).** `-008` P1, `-009` P1, `-012` P2.
- **D59 Upstream issues (Q6).** X04, X05, F-M2 and F-M3 are filed upstream only after the D54 labels, as for the Phase 1
  findings.

## 21. Contradictions with the roadmap, and open questions (answered)

**Contradictions:**

1. Roadmap Task 3 "Expected result is a pass" for `-005`: confirmed. But `-012`, said to be "the same race", is not
   clean: F-M2 (2 of 8). The roadmap text is updated in Step 10.
2. Roadmap "CI change: same `medusa-smoke` race step". The time budget does not allow it (§11, D50); a new job is needed.
3. Roadmap "P1's X04/X05 request sequence (P1 repo)": the P1 repo is not reachable from this session; the probe used the
   P6 reference text (§2.1 Q1).
4. Rule 10 says a plan goes on a `plan/...` branch; the owner's instruction for this task says to commit the plan on
   `feat/2026-10-22-p6-med-budget-order-races`. The owner's instruction was followed (Task 2 did the same).

**Open questions (all answered by the owner on 2026-10-22; the answers are D54 to D59):**

1. **How do suspected signals affect the verdict before labelling?** Proposed (D47): annotate, do not fail, as `-011`
   does for F-M1; assert only the counters, 5xx and setup. After 3 full-count CI runs, the owner labels X04, X05, F-M2
   and F-M3, and each labelled signal becomes an asserted invariant under `test.fail()` with the run links. Alternative:
   assert everything now and accept red `main` runs until labelled. **Agreed: the proposal (D54).**
2. **Accept the new CI job `medusa-order-races` (D50)?** Proposed: yes, same pins, restore-only caches, 45 min. **Agreed (D55).**
3. **P1 X04/X05 sequence.** Proposed: accept the P6 reference text as the port's source; the owner pastes P1's
   `tests/medusa/api/races.spec.ts` X04/X05 blocks if they differ. **Agreed (D56).**
4. **Accept the extras `-013`, `-014`, `-015`?** Proposed: accept `-014` (money: F-M4 is an order-accounting drift) and
   `-013` (F-M3 at N=10, 9 of 9) in a follow-up task after this PR; `-015` to "Later". **Agreed (D57).**
5. **Priorities (D45).** Proposed `-008` P1, `-009` P1, `-012` P2. **Agreed (D58).**
6. **Upstream issues.** Proposed: file X04, X05, F-M2, F-M3 upstream only after the labels of question 1, as for the
   Phase 1 findings. **Agreed (D59).**

No open questions remain. The next step is the owner's word to start the build (§14 Step 0).

## Closeout notes

Filled in before the PR merges.

- Merge SHA: _pending_
- Findings (final labels and CI evidence): _pending_
- Deviations from this plan: _pending_
- Rule slips: _pending_
