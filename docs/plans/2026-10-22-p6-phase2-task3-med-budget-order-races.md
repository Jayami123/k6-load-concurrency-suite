# P6 Phase 2 Task 3: Medusa budget and order-state races (plan, revision 3, owner answers and labels recorded)

This is the implementation plan a weaker model will build from. The owner reviewed revision 1 (rule 10: this task adds
a CI job and proposes product-bug labels, §11 and §10) and **agreed to every proposed answer in §21 on 2026-10-22**.
Revision 2 records those answers (D54 to D59). Revision 3 answers the owner's review of revision 2: the labelling
contradiction (§21 contradiction 5, open questions 7 and 8), a redone time budget with the rerun allowance and setup
(§11, §12, proposal D60), the `moneyPost` rename kept inside `admin.ts` (§8.2), full skeletons for the new checks and
both attempt bodies (§8.5, §8.6), and exact commands per build step (§14). The owner answered revision 3 on
2026-10-22: questions 7 and 9 agreed, question 8 option (a) (D64 to D66). After the three dispatch runs of §14 Step 12
the owner labelled the signals (D67 to D70, §10). The build continues with Step 13 and Step 14.

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
- CI: `-008`/`-009` in the `medusa-smoke` race step and a new job `medusa-order-races` for `-005`/`-012` (§11,
  proposal D60), and README rows.

**Out:**

- Changes to `runTrials`, `fireTogether`, `src/races/rerun-on-spread.ts`, `src/oracles/pg.ts`, `run-case.ts`,
  `run-money-case.ts`, the harness, the fork. The private `moneyPost` in `src/medusa/admin.ts` is renamed inside that
  file only (§8.2); `run-money-case.ts` does not import it and is not touched.
- The extras of §5 (`-013` and `-014` are a follow-up task, `-015` is "Later"), the P1 follow-up PR (listed for Task 9), spend budgets beyond the probe
  note, any `test.fail()` before the owner labels a signal (§10, D47; the proposed final step is §14 Step 13).

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

| File                                                                                                               | Change  | Responsibility                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/medusa/payloads.ts`                                                                                           | edit    | `promoCode`, `campaignCreateBody`, `promotionCreateBody`, `fulfillmentBody` (pure).                                                                                                                                                                                                                  |
| `src/medusa/admin.ts`                                                                                              | edit    | `createCampaign`, `createPromotion`, `deletePromotion`, `deleteCampaign`, `cancelOrder` (raced), `createFulfillment` (raced), `cancelFulfillment`, `deleteReservation`, `archiveOrder`; private `moneyPost` renamed `rawPost` in this file only.                                                     |
| `src/medusa/store.ts`                                                                                              | edit    | `prepareReadyCart` gets an optional `promoCode`, applied right after the line item (`applyPromoCode`).                                                                                                                                                                                               |
| `src/medusa/oracle.ts`                                                                                             | edit    | `PROMO_SNAPSHOT_SQL`, `ORDER_STATE_SQL`, `LIVE_ORDERS_FOR_EMAIL_SQL`, `ORDER_RESERVATIONS_SQL`, `OPEN_FULFILLMENTS_SQL`, `PHANTOM_RESERVED_SQL`, `LEAK_PROMOTIONS_SQL`, `LEAK_CAMPAIGNS_SQL`, `ORDER_LINE_ITEM_SQL`; `readPromoSnapshot`, `readOrderState`, `promoLeakCheck`, `orderStateLeakCheck`. |
| `src/medusa/invariants.ts`                                                                                         | edit    | `checkPromoCap`, `checkGhostOrders`, `checkSingleCancel`, `checkCancelFulfilExclusive`, `checkReservationDrift`, `classifyFindings`.                                                                                                                                                                 |
| `src/medusa/run-promo-case.ts`                                                                                     | **new** | Trial body for `-005`/`-012`: campaign/promo, N carts, burst, oracle, sweep cleanup, leak check.                                                                                                                                                                                                     |
| `src/medusa/run-order-case.ts`                                                                                     | **new** | Trial body for `-008`/`-009`: one order, burst, oracle, cleanup, leak check with F-M3 residue reported.                                                                                                                                                                                              |
| `tests/medusa/races/med-race-005-campaign-budget.spec.ts`                                                          | **new** | `P6-MED-RACE-005`.                                                                                                                                                                                                                                                                                   |
| `tests/medusa/races/med-race-012-usage-limit.spec.ts`                                                              | **new** | `P6-MED-RACE-012`.                                                                                                                                                                                                                                                                                   |
| `tests/medusa/races/med-race-008-double-cancel.spec.ts`                                                            | **new** | `P6-MED-RACE-008`.                                                                                                                                                                                                                                                                                   |
| `tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts`                                                         | **new** | `P6-MED-RACE-009`.                                                                                                                                                                                                                                                                                   |
| `tests/unit/medusa-payloads.test.ts`, `medusa-admin.test.ts`, `medusa-oracle.test.ts`, `medusa-invariants.test.ts` | edit    | §13.                                                                                                                                                                                                                                                                                                 |
| `.github/workflows/perf.yml`                                                                                       | edit    | `medusa-smoke` race step keeps `-008`/`-009`, excludes `-005`/`-012`, gets a step timeout; new job `medusa-order-races` runs `-005`/`-012` (§11, D60).                                                                                                                                               |
| `README.md`                                                                                                        | edit    | Case rows, suspected bugs F-M2 to F-M4 and X04/X05 status, leaked-data note (§17).                                                                                                                                                                                                                   |
| `docs/plans/2026-10-22-p6-phase2-roadmap.md`                                                                       | edit    | Task 3 status line, `-012` lands, proposed extras (§14 Step 10).                                                                                                                                                                                                                                     |

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
Task 2 code (`run-money-case.ts`, the private `moneyPost` helper of `admin.ts`, `moneyLeakCheck`) rather than inventing
new ones.

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

**Rename first, in this file only.** `moneyPost` is a private (not exported) function at `src/medusa/admin.ts:238`, and
its only callers are `capturePayment` (line 252), `refundPayment` (line 256) and `confirmPendingOrderChange` (line 264),
all in the same file. Rename it to `rawPost` (it is no longer money-only) and update those three call sites. Keep the
exported type `MoneyResult` as it is (its name is public; no other file imports it today, `grep -rn MoneyResult src
tests scripts` shows only `admin.ts`). No other file changes for the rename: `src/medusa/run-money-case.ts` imports
`capturePayment`, `refundPayment` and `confirmPendingOrderChange`, never `moneyPost`.

```ts
/** Raced or cleanup POST: never throws on 4xx/5xx, so fireTogether records the real status and body. */
async function rawPost(path: string, token: string, body: unknown): Promise<MoneyResult> {
  // body of today's moneyPost, unchanged
}

export async function createCampaign(
  token: string,
  identifier: string,
  limit: number,
): Promise<string> {
  const res = await adminJson("/campaigns", token, {
    method: "POST",
    body: campaignCreateBody(identifier, limit),
  });
  const id = (res.json as { campaign?: { id?: string } }).campaign?.id;
  if (res.status !== 200 || !id)
    throw new Error(`TEST BUG: POST /admin/campaigns HTTP ${res.status}`);
  return id;
}

export async function createPromotion(
  token: string,
  code: string,
  cap: { campaignId: string } | { limit: number },
): Promise<string> {
  // Same shape as createCampaign: POST /promotions with promotionCreateBody(code, cap); returns json.promotion.id;
  // non-200 or no id → "TEST BUG: POST /admin/promotions HTTP <status>".
}

export async function deletePromotion(token: string, id: string): Promise<void> {
  // DELETE /promotions/:id; 200 else "TEST BUG: DELETE promotion <id> HTTP <status>" (the deleteProduct shape).
}

export async function deleteCampaign(token: string, id: string): Promise<void> {
  // DELETE /campaigns/:id; 200 else TEST BUG. The budget row stays (live §2.1 Q7); that is expected.
}

/** Raced. */
export function cancelOrder(token: string, orderId: string) {
  return rawPost(`/orders/${orderId}/cancel`, token, {});
}

/** Raced. */
export function createFulfillment(
  token: string,
  orderId: string,
  itemId: string,
  locationId: string,
) {
  return rawPost(`/orders/${orderId}/fulfillments`, token, fulfillmentBody(itemId, 1, locationId));
}

export function cancelFulfillment(token: string, orderId: string, fulfillmentId: string) {
  return rawPost(`/orders/${orderId}/fulfillments/${fulfillmentId}/cancel`, token, {});
}

export async function archiveOrder(token: string, orderId: string): Promise<void> {
  // POST /orders/:id/archive with {}; 200 else "TEST BUG: archive order <id> HTTP <status>".
}

export async function deleteReservation(token: string, id: string): Promise<number> {
  // DELETE /reservations/:id; returns the status (live 200). The caller decides what a non-200 means.
}
```

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
/** $1 promotion id, $2 campaign id ('' for -012). Live §2.2. */
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

/** $1 order id. The line item id the fulfil body needs (latest order version). */
export const ORDER_LINE_ITEM_SQL = `
SELECT oi.item_id FROM order_item oi
WHERE oi.order_id = $1 AND oi.deleted_at IS NULL
ORDER BY oi.version DESC LIMIT 1
`;

/** $1 inventory item id. Live reservations the cleanup deletes (live: DELETE /admin/reservations/:id → 200). */
export const ORDER_RESERVATIONS_SQL = `
SELECT ri.id FROM reservation_item ri
WHERE ri.inventory_item_id = $1 AND ri.deleted_at IS NULL
`;

/** $1 order id. Open fulfillments the cleanup cancels while the order is not canceled. */
export const OPEN_FULFILLMENTS_SQL = `
SELECT f.id FROM order_fulfillment ofl JOIN fulfillment f ON f.id = ofl.fulfillment_id
WHERE ofl.order_id = $1 AND ofl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.canceled_at IS NULL
`;

/** $1 handle LIKE. Live products whose reserved_quantity exceeds their live reservations (F-M3 residue, D49). */
export const PHANTOM_RESERVED_SQL = `
SELECT p.id FROM product p
JOIN product_variant pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
JOIN product_variant_inventory_item pvi ON pvi.variant_id = pv.id
JOIN inventory_level il ON il.inventory_item_id = pvi.inventory_item_id AND il.deleted_at IS NULL
WHERE p.handle LIKE $1 AND p.deleted_at IS NULL
  AND il.reserved_quantity > (SELECT COALESCE(SUM(ri.quantity), 0) FROM reservation_item ri
                              WHERE ri.inventory_item_id = il.inventory_item_id AND ri.deleted_at IS NULL)
`;

/** Budget rows are NOT checked: a campaign delete keeps them (§2.1 Q7). */
export const LEAK_PROMOTIONS_SQL = `
SELECT COUNT(*)::int AS n FROM promotion WHERE code LIKE $1 AND deleted_at IS NULL
`;
export const LEAK_CAMPAIGNS_SQL = `
SELECT COUNT(*)::int AS n FROM promotion_campaign WHERE campaign_identifier LIKE $1 AND deleted_at IS NULL
`;

export type PromoSnapshot = { promotionUsed: number; budgetUsed: number; ordersWithPromo: number };

export async function readPromoSnapshot(
  pool: pg.Pool,
  promotionId: string,
  campaignId: string,
): Promise<PromoSnapshot> {
  const [row] = await selectRows<{
    promotion_used: number | null;
    budget_used: string | null;
    orders_with_promo: number;
  }>(pool, PROMO_SNAPSHOT_SQL, [promotionId, campaignId]);
  if (!row) throw new Error("TEST BUG: promotion snapshot returned no row");
  return {
    promotionUsed: Number(row.promotion_used ?? 0),
    budgetUsed: row.budget_used === null ? 0 : parseWholeAmount(row.budget_used, "budget used"),
    ordersWithPromo: Number(row.orders_with_promo),
  };
}

export type OrderState = {
  status: string;
  openFulfillments: number;
  pendingChanges: number;
  creditLines: number;
  liveReservations: number;
  liveReservationQty: number;
  reservedQuantity: number;
  fulfilledQuantity: number;
};

export async function readOrderState(
  pool: pg.Pool,
  orderId: string,
  inventoryItemId: string,
  locationId: string,
): Promise<OrderState> {
  const [row] = await selectRows<{
    status: string;
    open_fulfillments: number;
    pending_changes: number;
    credit_lines: number;
    live_reservations: number;
    live_reservation_qty: string;
    reserved_quantity: string | null;
    fulfilled_quantity: string | null;
  }>(pool, ORDER_STATE_SQL, [orderId, inventoryItemId, locationId]);
  if (!row) throw new Error(`TEST BUG: order ${orderId} not found`);
  return {
    status: row.status,
    openFulfillments: Number(row.open_fulfillments),
    pendingChanges: Number(row.pending_changes),
    creditLines: Number(row.credit_lines),
    liveReservations: Number(row.live_reservations),
    liveReservationQty: parseWholeAmount(row.live_reservation_qty, "live reservation qty"),
    reservedQuantity: parseWholeAmount(row.reserved_quantity ?? "0", "reserved quantity"),
    fulfilledQuantity: parseWholeAmount(row.fulfilled_quantity ?? "0", "fulfilled quantity"),
  };
}

/** Leak check for -005 / -012 (the moneyLeakCheck shape). Every leftover is a TEST BUG. */
export async function promoLeakCheck(pool: pg.Pool, likePrefix: string): Promise<string[]> {
  const [products, customers, orders, promotions, campaigns] = await Promise.all([
    selectRows<{ n: number }>(pool, LEAK_PRODUCTS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CUSTOMERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_LIVE_ORDERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_PROMOTIONS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CAMPAIGNS_SQL, [likePrefix]),
  ]);
  const rows: Array<[string, Array<{ n: number }>]> = [
    ["products", products],
    ["customers", customers],
    ["live orders", orders],
    ["promotion", promotions],
    ["campaign", campaigns],
  ];
  return rows
    .filter(([, r]) => Number(r[0]?.n ?? 0) !== 0)
    .map(([kind]) => `TEST BUG: leak ${kind} LIKE ${likePrefix}`);
}

/** Leak check for -008 / -009. A live product that PHANTOM_RESERVED_SQL lists and the run reported is leaked data (D49). */
export async function orderStateLeakCheck(
  pool: pg.Pool,
  likePrefix: string,
  reportedProductIds: readonly string[],
): Promise<{ violations: string[]; reportedLeaked: string[] }> {
  const [products, phantom, customers, orders] = await Promise.all([
    selectRows<{ id: string }>(
      pool,
      `SELECT id FROM product WHERE handle LIKE $1 AND deleted_at IS NULL`,
      [likePrefix],
    ),
    selectRows<{ id: string }>(pool, PHANTOM_RESERVED_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CUSTOMERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_LIVE_ORDERS_SQL, [likePrefix]),
  ]);
  const phantomIds = new Set(phantom.map((row) => row.id));
  const reported = new Set(reportedProductIds);
  const violations: string[] = [];
  const reportedLeaked: string[] = [];
  for (const product of products) {
    if (phantomIds.has(product.id) && reported.has(product.id)) reportedLeaked.push(product.id);
    else violations.push(`TEST BUG: leak product ${product.id} handle LIKE ${likePrefix}`);
  }
  if (Number(customers[0]?.n ?? 0) !== 0)
    violations.push(`TEST BUG: leak customers email LIKE ${likePrefix}`);
  if (Number(orders[0]?.n ?? 0) !== 0)
    violations.push(`TEST BUG: leak live orders email LIKE ${likePrefix}`);
  return { violations, reportedLeaked };
}
```

The inline product query in `orderStateLeakCheck` is a constant in the build (`LEAK_PRODUCT_IDS_SQL`, added to test 10's
`assertSelectOnly` list). `runOrderCase` passes the bare product ids it reported (it keeps a separate
`reportedProductIds` array next to the `reportedLeaked` text lines of §8.6).

Inventory is read by `inventory_item_id` (the attempt's own product), not through `order_item` joins: the probe's first
join through `order_item` double counted rows across order versions.

### 8.5 `src/medusa/invariants.ts` (edit)

Every check is pure and returns label-prefixed lines. Tags in brackets (`X04`, `X05`, `F-M2`, `F-M3`) name the signal, so
`classifyFindings` can route a line without parsing the rest of it.

```ts
/** -005 / -012. The counter and the HTTP count are asserted (PRODUCT BUG); the order count is a suspected signal. */
export function checkPromoCap(input: {
  cap: number;
  counterUsed: number;
  ordersWithPromo: number;
  httpSuccesses: number;
  label: string;
}): string[] {
  const out: string[] = [];
  if (input.counterUsed > input.cap) {
    out.push(`PRODUCT BUG: ${input.label}: usage counter ${input.counterUsed} of cap ${input.cap}`);
  }
  if (input.httpSuccesses > input.cap) {
    out.push(
      `PRODUCT BUG: ${input.label}: ${input.httpSuccesses} checkouts returned 200, cap ${input.cap}`,
    );
  }
  if (input.ordersWithPromo > input.cap) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.label}: ${input.ordersWithPromo} orders carry the promotion, cap ${input.cap} (F-M2)`,
    );
  }
  return out;
}

/** -005 / -012. Every live order of the attempt must be one a checkout returned with 200. */
export function checkGhostOrders(input: {
  liveOrderIds: readonly string[];
  httpOrderIds: readonly string[];
}): string[] {
  const returned = new Set(input.httpOrderIds);
  return input.liveOrderIds
    .filter((id) => !returned.has(id))
    .map((id) => `SUSPECTED PRODUCT BUG: order ${id} exists but no checkout returned it (F-M2)`);
}

/** -008. One of two cancels takes effect, once. */
export function checkSingleCancel(input: {
  status: string;
  httpSuccesses: number;
  pendingChanges: number;
  creditLines: number;
}): string[] {
  const out: string[] = [];
  if (input.status !== "canceled") {
    out.push(
      `SUSPECTED PRODUCT BUG: order status ${input.status} after two cancels, expected canceled (X04)`,
    );
  }
  if (input.httpSuccesses !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.httpSuccesses} cancels returned 200, expected 1 (X04)`,
    );
  }
  if (input.pendingChanges !== 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.pendingChanges} pending order change(s) left after cancel (X04)`,
    );
  }
  if (input.creditLines !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.creditLines} credit lines after cancel, expected 1 (X04)`,
    );
  }
  return out;
}

/** -009. Cancel and fulfil are exclusive: exactly one takes effect, and never "canceled with an open fulfillment". */
export function checkCancelFulfilExclusive(input: {
  status: string;
  openFulfillments: number;
  fulfilledQuantity: number;
  cancelStatus: number | null;
  fulfilStatus: number | null;
}): string[] {
  const out: string[] = [];
  if (input.status === "canceled" && input.openFulfillments > 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: order canceled with ${input.openFulfillments} open fulfillment(s) (X05)`,
    );
  }
  const wins = [input.cancelStatus, input.fulfilStatus].filter((s) => s === 200).length;
  if (wins !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${wins} of cancel ‖ fulfil returned 200, expected exactly 1 (X05)`,
    );
  }
  if (wins === 1 && input.fulfilStatus === 200 && input.fulfilledQuantity !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: fulfil won but fulfilled_quantity is ${input.fulfilledQuantity} (X05)`,
    );
  }
  if (wins === 1 && input.cancelStatus === 200 && input.fulfilledQuantity !== 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: cancel won but fulfilled_quantity is ${input.fulfilledQuantity} (X05)`,
    );
  }
  return out;
}

/** -008 / -009. Stock bookkeeping after the burst (F-M3). */
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

/**
 * Splits finding lines. `labelled` holds the signal tags the owner has labelled (empty until §14 Step 13): a SUSPECTED
 * line with a labelled tag is promoted to "PRODUCT BUG" and asserted. Everything else keeps its label.
 */
export function classifyFindings(
  lines: readonly string[],
  labelled: readonly string[],
): { violations: string[]; suspected: string[] } {
  const violations: string[] = [];
  const suspected: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("SUSPECTED PRODUCT BUG:")) {
      violations.push(line);
      continue;
    }
    const tag = /\(([A-Z0-9-]+)\)$/.exec(line)?.[1];
    if (tag && labelled.includes(tag)) {
      violations.push(line.replace("SUSPECTED PRODUCT BUG:", "PRODUCT BUG:"));
    } else {
      suspected.push(line);
    }
  }
  return { violations, suspected };
}
```

`classifyFindings` is the one place a label changes; it adds two unit tests (§13.4, tests 28 and 29).

### 8.6 `src/medusa/run-promo-case.ts` (new) and `run-order-case.ts` (new)

Shape: copy `runMoneyCase` (histogram, `createRerunRunner(spreadPolicyFromEnv(), trials)`, `runner.warmup`, `runTrials`,
`runner.applyTo`, leak check, histogram written in `finally`). The return value is
`{ histogram, suspected: string[], reportedLeaked: string[] }`. Copy the private `orderIdOf` and `messageOf` helpers
from `run-money-case.ts` (do not export them from there; that file stays untouched).

**Suspected lines never enter `invariantViolations`.** The rule that makes the warm-up safe:

- `recordTrial(trial, fired, validate)` gets a `validate` that throws **only** the `violations` of `classifyFindings`.
  So `record.ok` is `false` only for a `PRODUCT BUG` or `TEST BUG` line.
- The suspected lines go into `record.oracle.suspectedBug` (joined with `" | "`) and into the run-level `suspected`
  array, which the spec turns into `suspected-bug` annotations. They are not in `record.invariantViolations`.
- `runner.warmup` (`src/races/rerun-on-spread.ts` lines 167 to 200) copies a warm-up record's `invariantViolations` into
  the runner's violations whenever `r.ok` is false, and `applyTo` puts them into `histogram.invariantViolations`, which
  fails the verdict. Because suspected lines keep `ok` true, **a suspected signal seen during warm-up cannot fail the
  case**; it is annotated with `trial 0` like any other.
- **A `PRODUCT BUG` found during warm-up fails the case.** That is the runner's existing rule (Task 1 D28): the line is
  tagged `[warmup N]` and the verdict is `fail`. Nothing in this task changes it.

Attempt body of `runPromoCase` (`mode: "budget" | "limit"`, `n` = 10, `cap` = 3, `labelled: readonly string[]`):

```ts
const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
  const leaf = attemptTag(trial, attempt);
  const emailLike = likeLiteralPrefix(`${dataPrefix}-${leaf}-`); // "-t1-" never matches "-t10-"
  const code = promoCode(dataPrefix, leaf);
  const emails = Array.from({ length: input.n }, (_, i) =>
    prefixedEmail(dataPrefix, `${leaf}-c${String(i).padStart(2, "0")}`),
  );
  let productId = "";
  let promotionId = "";
  let campaignId = "";
  try {
    // 1. Setup, not raced. Any throw is a TEST BUG (D37): runTrial rethrows it, it is never rerun.
    const stocked = await createStockedVariant({
      token: input.token,
      catalog: input.catalog,
      prefix: dataPrefix,
      leaf: `${leaf}-product`,
      s: 50,
      onCreated: (ids) => {
        if (ids.productId) productId = ids.productId;
      },
    });
    if (input.mode === "budget") {
      campaignId = await createCampaign(input.token, `${dataPrefix}-${leaf}-camp`, input.cap);
    }
    promotionId = await createPromotion(
      input.token,
      code,
      input.mode === "budget" ? { campaignId } : { limit: input.cap },
    );
    const carts = await prepareReadyCarts(input.n, (i) => ({
      publishableKey: input.catalog.publishableKey,
      regionId: input.catalog.regionId,
      salesChannelId: input.catalog.salesChannelId,
      variantId: stocked.variantId,
      email: emails[i]!,
      quantity: 1,
      promoCode: code,
    }));
    for (const cart of carts) {
      const err = setupStepError("add line item", cart.lineItemStatus);
      if (err) throw new Error(err);
    }

    // 2. Burst.
    const bodies: string[] = [];
    const fired = await fireTogether(
      input.n,
      async (i) => {
        const res = await completeCart(input.catalog.publishableKey, carts[i]!.cartId);
        bodies[i] = res.body;
        return res;
      },
      { warm: async () => (await fetch(`${base}/health`)).text() },
    );

    // 3. Oracle.
    const httpOrderIds = bodies.map(orderIdOf).filter((id): id is string => id !== null);
    const snapshot = await readPromoSnapshot(input.pool, promotionId, campaignId);
    const live = await selectRows<{ id: string }>(input.pool, LIVE_ORDERS_FOR_EMAIL_SQL, [
      emailLike,
    ]);
    const losers = fired.requests.filter((r) => r.status !== 200);
    const lines = [
      ...checkPromoCap({
        cap: input.cap,
        counterUsed: input.mode === "budget" ? snapshot.budgetUsed : snapshot.promotionUsed,
        ordersWithPromo: snapshot.ordersWithPromo,
        httpSuccesses: fired.requests.length - losers.length,
        label: input.caseId,
      }),
      ...checkGhostOrders({ liveOrderIds: live.map((o) => o.id), httpOrderIds }),
      ...checkLoserStatuses(losers.map((r) => r.status)),
    ];
    const { violations, suspected } = classifyFindings(lines, input.labelled);

    // 4. Record. Only violations reach recordTrial's throw; suspected lines stay out of invariantViolations.
    const record = recordTrial(trial, fired, () => {
      if (violations.length > 0) throw new Error(violations.join("; "));
    });
    record.oracle = {
      mode: input.mode,
      n: input.n,
      cap: input.cap,
      httpSuccesses: fired.requests.length - losers.length,
      counterUsed: input.mode === "budget" ? snapshot.budgetUsed : snapshot.promotionUsed,
      ordersWithPromo: snapshot.ordersWithPromo,
      liveOrders: live.length,
      loserMessage: messageOf(bodies[fired.requests.findIndex((r) => r.status !== 200)]),
      suspectedBug: suspected.join(" | "),
    };
    for (const line of suspected) runSuspected.push(`trial ${trial} attempt ${attempt}: ${line}`);
    return record;
  } finally {
    // 5. Cleanup, §9 order: live orders by email prefix (ghosts included), product, promotion, campaign, customers.
    const live = await selectRows<{ id: string }>(input.pool, LIVE_ORDERS_FOR_EMAIL_SQL, [
      emailLike,
    ]);
    for (const order of live) {
      try {
        await cancelAndArchive(input.token, order.id);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("order", order.id, err));
      }
    }
    if (productId) {
      try {
        await deleteProduct(input.token, productId);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("product", productId, err));
      }
    }
    if (promotionId) {
      try {
        await deletePromotion(input.token, promotionId);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("promotion", promotionId, err));
      }
    }
    if (campaignId) {
      try {
        await deleteCampaign(input.token, campaignId);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("campaign", campaignId, err));
      }
    }
    for (const email of emails) {
      try {
        await deleteCustomersByEmail(input.token, email);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("customer", email, err));
      }
    }
  }
};
```

`readPromoSnapshot` and `readOrderState` are the §8.4 readers.

Attempt body of `runOrderCase` (`mode: "double-cancel" | "cancel-vs-fulfil"`, N = 2, `labelled: readonly string[]`):

```ts
const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
  const leaf = attemptTag(trial, attempt);
  const email = prefixedEmail(dataPrefix, `${leaf}-c00`);
  let productId = "";
  let inventoryItemId = "";
  let orderId = "";
  try {
    // 1. Setup: one product, one checkout order (authorised, not captured), its line item id.
    const stocked = await createStockedVariant({
      token: input.token,
      catalog: input.catalog,
      prefix: dataPrefix,
      leaf: `${leaf}-product`,
      s: 50,
      onCreated: (ids) => {
        if (ids.productId) productId = ids.productId;
        if (ids.inventoryItemId) inventoryItemId = ids.inventoryItemId;
      },
    });
    const [cart] = await prepareReadyCarts(1, () => ({
      publishableKey: input.catalog.publishableKey,
      regionId: input.catalog.regionId,
      salesChannelId: input.catalog.salesChannelId,
      variantId: stocked.variantId,
      email,
      quantity: 1,
    }));
    const lineError = setupStepError("add line item", cart?.lineItemStatus ?? 0);
    if (lineError || !cart) throw new Error(lineError ?? "TEST BUG: add line item missing");
    const done = await completeCart(input.catalog.publishableKey, cart.cartId);
    const completeError = setupStepError("complete", done.status);
    if (completeError) throw new Error(completeError);
    orderId = orderIdOf(done.body) ?? "";
    if (!orderId) throw new Error("TEST BUG: checkout returned no order");
    const [item] = await selectRows<{ item_id: string }>(input.pool, ORDER_LINE_ITEM_SQL, [
      orderId,
    ]);
    if (!item) throw new Error(`TEST BUG: no line item for order ${orderId}`);

    // 2. Burst: index 0 cancels; index 1 cancels (-008) or fulfils (-009).
    const bodies: string[] = [];
    const fired = await fireTogether(
      2,
      async (i) => {
        const res =
          i === 1 && input.mode === "cancel-vs-fulfil"
            ? await createFulfillment(input.token, orderId, item.item_id, input.catalog.locationId)
            : await cancelOrder(input.token, orderId);
        bodies[i] = res.body;
        return res;
      },
      { warm: async () => (await fetch(`${base}/health`)).text() },
    );

    // 3. Oracle.
    const state = await readOrderState(
      input.pool,
      orderId,
      inventoryItemId,
      input.catalog.locationId,
    );
    const statuses = fired.requests.map((r) => r.status);
    const lines = [
      ...(input.mode === "double-cancel"
        ? checkSingleCancel({
            status: state.status,
            httpSuccesses: statuses.filter((s) => s === 200).length,
            pendingChanges: state.pendingChanges,
            creditLines: state.creditLines,
          })
        : checkCancelFulfilExclusive({
            status: state.status,
            openFulfillments: state.openFulfillments,
            fulfilledQuantity: state.fulfilledQuantity,
            cancelStatus: statuses[0] ?? null,
            fulfilStatus: statuses[1] ?? null,
          })),
      ...checkReservationDrift(state),
      ...checkLoserStatuses(statuses.filter((s) => s !== 200)),
    ];
    const { violations, suspected } = classifyFindings(lines, input.labelled);

    // 4. Record (same rule as runPromoCase: suspected lines never reach invariantViolations).
    const record = recordTrial(trial, fired, () => {
      if (violations.length > 0) throw new Error(violations.join("; "));
    });
    record.oracle = {
      mode: input.mode,
      status: state.status,
      openFulfillments: state.openFulfillments,
      pendingChanges: state.pendingChanges,
      creditLines: state.creditLines,
      liveReservations: state.liveReservations,
      reservedQuantity: state.reservedQuantity,
      fulfilledQuantity: state.fulfilledQuantity,
      loserMessage: messageOf(bodies[statuses.findIndex((s) => s !== 200)]),
      suspectedBug: suspected.join(" | "),
    };
    for (const line of suspected) runSuspected.push(`trial ${trial} attempt ${attempt}: ${line}`);
    return record;
  } finally {
    // 5. Cleanup, §9 order. A route that the product state blocks is leaked data (D49), not a failure.
    if (orderId) {
      const status = (
        await readOrderState(input.pool, orderId, inventoryItemId, input.catalog.locationId)
      ).status;
      const open = await selectRows<{ id: string }>(input.pool, OPEN_FULFILLMENTS_SQL, [orderId]);
      for (const f of open) {
        if (status === "canceled") {
          reportedLeaked.push(`fulfillment ${f.id} of canceled order ${orderId} (X05, D49)`);
          continue;
        }
        const res = await cancelFulfillment(input.token, orderId, f.id);
        if (res.status !== 200)
          cleanupViolations.push(cleanupFailure("fulfillment", f.id, res.body));
      }
      if (status !== "canceled") {
        const res = await cancelOrder(input.token, orderId);
        if (res.status !== 200)
          cleanupViolations.push(cleanupFailure("order cancel", orderId, res.body));
      }
      try {
        await archiveOrder(input.token, orderId);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("order archive", orderId, err));
      }
    }
    if (inventoryItemId) {
      const rows = await selectRows<{ id: string }>(input.pool, ORDER_RESERVATIONS_SQL, [
        inventoryItemId,
      ]);
      for (const row of rows) {
        const status = await deleteReservation(input.token, row.id);
        if (status !== 200)
          cleanupViolations.push(cleanupFailure("reservation", row.id, `HTTP ${status}`));
      }
    }
    if (productId) {
      try {
        await deleteProduct(input.token, productId);
      } catch (err) {
        const phantom = await selectRows<{ id: string }>(input.pool, PHANTOM_RESERVED_SQL, [
          leakPrefix,
        ]);
        if (phantom.some((row) => row.id === productId))
          reportedLeaked.push(`product ${productId} (F-M3, D49)`);
        else cleanupViolations.push(cleanupFailure("product", productId, err));
      }
    }
    try {
      await deleteCustomersByEmail(input.token, email);
    } catch (err) {
      cleanupViolations.push(cleanupFailure("customer", email, err));
    }
  }
};
```

Both runners, after `runTrials`: `runner.applyTo(histogram)`; then the leak check (`promoLeakCheck` or
`orderStateLeakCheck` with the reported product ids); `histogram.invariantViolations.push(...cleanupViolations,
...leak.violations)`; verdict `pass` only when every trial is ok and `invariantViolations` is empty. `runSuspected`,
`cleanupViolations` and `reportedLeaked` are arrays declared once per case, above `runAttempt`, as `runMoneyCase` does.

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

| Observation                                                         | Label now                  | Evidence before a stronger label                                                                      |
| ------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Budget or limit counter above the cap; HTTP 200s above the cap      | PRODUCT BUG                | Never seen live (16 runs). The request bodies and DB rows of the failing attempt.                     |
| Orders with the promotion above the cap; ghost order (F-M2)         | **PRODUCT BUG** (D70)      | 32 of 150 trials in `-012`, 1 of 150 in `-005` (Step 12 runs). Labelled annotation, no `test.fail()`. |
| Two cancels both 200, pending credit_line change (X04)              | **PRODUCT BUG** (D67)      | 113 of 150 trials (Step 12 runs); P1 X04. `test.fail()` in `-008`.                                    |
| Canceled with an open fulfillment (X05)                             | **PRODUCT BUG** (D69)      | 50 of 150 trials (Step 12 runs); P1 X05. `test.fail()` in `-009`, PR count 13.                        |
| Reservation restored or `reserved_quantity` drift (F-M3)            | **PRODUCT BUG** (D68)      | 37 of 150 trials in `-008`, 7 of 150 in `-009` (Step 12 runs). `test.fail()` in `-008` and `-009`.    |
| `order_summary.refunded_total` above the refund rows (F-M4)         | not asserted in this task  | Only in the follow-up `-014` (D57). Seen 2 of 3.                                                      |
| 5xx on a raced request                                              | PRODUCT BUG                | The status and body. Not seen live.                                                                   |
| Setup step fails (campaign, promotion, apply code, checkout)        | TEST BUG                   | The step name (D37). Never rerun (rule 13).                                                           |
| Leftover product, customer, promotion, campaign not explained above | TEST BUG (cleanup)         | The leftover rows.                                                                                    |
| F-M3 product, X05 fulfillment, X04 pending change after cleanup     | REPORTED LEAKED DATA (D49) | The ids and the failed route bodies in the histogram.                                                 |

**Labels (owner, after the three full-count runs of Step 12, D67 to D70):** X04, F-M3 and X05 are PRODUCT BUG under
`test.fail()`; F-M2 is PRODUCT BUG as a labelled annotation without `test.fail()`. The text below is the rule as it
stood before the labels. Rule 13 needs repeated full-count CI runs;
rule 9 needs the owner for any product-bug label. Agreed rule (D54): until then, suspected signals are annotations and do
not change the verdict. After 3 full-count CI runs the owner labels X04, X05, F-M2 and F-M3; each labelled signal then
becomes an asserted invariant under `test.fail()` with the run links. Where that commit lands is the open contradiction
§21 item 5: the proposal is a final step of this PR (§14 Step 13), after 3 full-count `workflow_dispatch` runs.

## 11. CI (`.github/workflows/perf.yml`) — D60, agreed by the owner (D66)

D55 accepted one new job for all four cases. The redone budget (§12) shows `-008`/`-009` are small (≈ 6 min at 50
trials) and fit `medusa-smoke`; only `-005`/`-012` need the new job. D60 replaces the D55 layout; the owner agreed to it
(§21 question 9, D66). The numbers below are the §12 numbers.

- **`medusa-smoke` race step** (existing step "Race medusa (P6-MED-RACE-001, money cases, extras)"): renamed "Race
  medusa (P6-MED-RACE-001, money, order-state, extras)"; command
  `npm run race:medusa -- --grep-invert "P6-MED-RACE-0(05|12)"`, so it runs `-001`, the money cases, `-008` and `-009`.
  New step timeout, in the Cal/Documenso form:
  `timeout-minutes: ${{ github.event_name == 'pull_request' && 10 || 30 }}` (estimate: PR 3.1 min, full 22.1 min). The
  job's `timeout-minutes: 45` is unchanged (Task 1 D24).
- **New job `medusa-order-races`:** a copy of `medusa-smoke` steps "Run actions/checkout" to "k6 smoke (GET /health)"
  and the k6-summary upload (checkouts, `MEDUSA_REF` verify, harness roots stub, Node, P6 install, k6, corepack, pnpm
  cache restore, Medusa install, build cache restore, admin password, `up:medusa`, k6 smoke), same pins and env, **no**
  "Check" step (it runs once in `medusa-smoke`) and **no** cache save steps (only `medusa-smoke` saves). Then:
  - "Race medusa budget (P6-MED-RACE-005, -012)": `npm run race:medusa -- --grep "P6-MED-RACE-0(05|12)"`,
    `RACE_TRIALS: ${{ github.event_name == 'pull_request' && '3' || '50' }}`,
    `P6_PLAYWRIGHT_JSON: results/playwright/medusa-budget-races.json`,
    `timeout-minutes: ${{ github.event_name == 'pull_request' && 10 || 40 }}` (estimate: PR 3.4 min, full 32.5 min).
  - Job summary (`node scripts/write-ci-job-summary.ts`), artefact `race-histograms-medusa-budget` (14 days),
    "Stop Medusa (harness down)" with `always()`.
  - `timeout-minutes: 45` for the job (estimate: full 33.9 min).
- `scripts/write-ci-job-summary.ts` and the token scan read `results/races/*.json` and the Playwright JSON named by
  `P6_PLAYWRIGHT_JSON`. If the summary script hard-codes the Medusa artefact or JSON name, the build stops and reports
  (no silent edit).
- **Stop rule.** If a full-count step takes more than 80 % of its step timeout (24 min in `medusa-smoke`, 32 min in
  `medusa-order-races`), the build stops and reports the step time. The proposed fix is a further job split, never fewer
  trials (D39).

## 12. Trial counts and time budget (the arithmetic behind §11)

**Inputs (all cited):**

| Input                                       | Value                                                    | Source                                                                        |
| ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Full / PR trial count                       | 50 / 3                                                   | D6, D39                                                                       |
| Attempts per case                           | trials + 1 warm-up + invalid budget                      | Task 1 D28; `invalidBudget` (`src/races/rerun-on-spread.ts` line 36)          |
| Invalid budget (20 % rerun allowance)       | `max(2, ceil(trials × 20 / 100))`: full **10**, PR **2** | `RACE_MAX_INVALID_SHARE_PCT` 20, `RACE_MIN_INVALID_BUDGET` 2 (`.env.example`) |
| Attempts per case                           | full 50 + 1 + 10 = **61**; PR 3 + 1 + 2 = **6**          | the two rows above (worst case: every allowed rerun is used)                  |
| Time per attempt, `-005` / `-012`           | **15.9 s** (max of 16 probe runs)                        | §2.2 (probe VM, proof only)                                                   |
| Time per attempt, `-008` / `-009`           | **2.9 s** (max of 13 probe runs)                         | §2.3 (probe VM, proof only)                                                   |
| Per-spec setup (`seedAndLogin`, catalog)    | **6 s** per spec (seed 1.25 s live; rounded up)          | §2.6 seed log                                                                 |
| `medusa-smoke` before the race step         | **1 min 26 s** (includes the 13 s "Check" step)          | `main` run 39829474241 (18:13:39 → 18:15:05); PR run 39828439018 the same     |
| `medusa-smoke` existing race step           | full **16 min 01 s**; PR **2 min 15 s**                  | runs 39829474241 and 39828439018                                              |
| After the race step (summary, upload, down) | **9 s**                                                  | both runs                                                                     |

**`medusa-smoke` with `-008` and `-009` added (D60):**

```text
full:  -008  61 × 2.9 s + 6 s = 182.9 s
       -009  61 × 2.9 s + 6 s = 182.9 s
       new specs                = 365.8 s = 6 min 06 s
       race step   16:01 + 6:06               = 22 min 07 s   (step timeout 30 → 74 %; stop rule 24 min)
       job         1:26 + 22:07 + 0:09        = 23 min 42 s   (job timeout 45 → 53 %)
PR:    -008/-009   2 × (6 × 2.9 s + 6 s) = 46.8 s
       race step   2:15 + 0:47                = 3 min 02 s    (step timeout 10)
       job         1:26 + 3:02 + 0:09         = 4 min 37 s
```

**New job `medusa-order-races` with `-005` and `-012` (D60):**

```text
full:  -005  61 × 15.9 s + 6 s = 975.9 s
       -012  61 × 15.9 s + 6 s = 975.9 s
       race step   1951.8 s                   = 32 min 32 s   (step timeout 40 → 81 % worst case; stop rule 32 min)
       job         1:13 + 32:32 + 0:09        = 33 min 54 s   (1:13 = 1:26 minus the 13 s Check step; job timeout 45)
PR:    race step   2 × (6 × 15.9 s + 6 s)     = 202.8 s = 3 min 23 s   (step timeout 10)
       job         1:13 + 3:23 + 0:09         = 4 min 45 s
```

The worst case assumes all 10 reruns are used in each case; Task 2's `main` run used none (the race step time above
includes its actual reruns). The per-attempt times come from the probe VM; the first full-count run on CI is the record
(§11 stop rule).

**`-009` PR trial count (D65, question 8 option (a)).** The count is set in §14 Step 13 from the three dispatch runs
of Step 12, so a PR run misses the labelled `-009` signals with probability under 1 %:

1. `k` = valid `-009` trials (warm-up excluded) in which at least one signal the owner labelled for `-009` showed (X05,
   and F-M3 if labelled), summed over the three runs; `m` = valid `-009` trials in those runs (150 if no trial failed).
2. `p_L` = the lower end of the 95 % Wilson interval of `k / m` (conservative: the point rate of a small count can be
   high by chance):
   `p_L = (p + z²/2m − z·√(p(1−p)/m + z²/4m²)) / (1 + z²/m)`, with `p = k/m`, `z = 1.96`.
3. PR count `n = max(3, ceil(ln 0.01 / ln(1 − p_L)))`. Then the miss probability is `(1 − p_L)ⁿ < 1 %`.
4. PR time of `-009`: `(n + 1 + max(2, ceil(0.2 n))) × 2.9 s + 6 s`.

**Measured (Step 12 runs [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959)):** X05 or F-M3 in `k = 57` of `m = 150` valid `-009` trials (20 + 19 + 18);
`p = 0.380`, `p_L = 0.306`, `n = ceil(ln 0.01 / ln(1 − 0.306)) = ceil(12.65) = 13`; miss probability `0.694¹³ = 0.86 %`.
`-009` PR time: `(13 + 1 + max(2, 3)) × 2.9 s + 6 s = 17 × 2.9 + 6 = 55.3 s`; `medusa-smoke` PR race step ≈ 2:15 + 23.4 s

- 55.3 s ≈ 3 min 34 s (10-minute step timeout). The owner set the count to 13 with both signals labelled (D69).
  For `-008`, X04 or F-M3 showed in all 150 trials (`p_L ≈ 0.975`), so 3 PR trials miss with probability ≈ 0.002 %: no
  raise.

Worked values for m = 150 (for reference):

| k of 150 | k / m | p_L   | n   | (1 − p_L)ⁿ | `-009` PR attempts | `-009` PR time | `medusa-smoke` PR race step |
| -------- | ----- | ----- | --- | ---------- | ------------------ | -------------- | --------------------------- |
| 54       | 0.36  | 0.288 | 14  | 0.87 %     | 18                 | 58.2 s         | 3 min 37 s                  |
| 30       | 0.20  | 0.144 | 30  | 0.95 %     | 37                 | 113.3 s        | 4 min 32 s                  |
| 15       | 0.10  | 0.062 | 73  | 0.97 %     | 89                 | 264.1 s        | 7 min 03 s                  |
| 8        | 0.053 | 0.027 | 167 | 0.99 %     | 202                | 591.8 s        | 12 min 31 s (over 10)       |

The PR race step is 2:15 (today) + `-008` 23.4 s + the `-009` time. **Stop rule:** if the computed `n` would take the PR
race step over 8 min (80 % of its 10-minute step timeout; about `k ≤ 13` of 150), or if X05 did not show at all
(`k = 0` for X05), the build stops and reports instead of raising the step timeout. Full counts are unchanged (50).

The spec reads the count as a named constant with this arithmetic in its comment:

```ts
// D65: PR count from the Step 12 dispatch runs: k = <k> of m = <m>, p_L = <p_L>, n = ceil(ln 0.01 / ln(1 − p_L)) = <n>.
const MED_RACE_009_PR_TRIALS = <n>;
const trials =
  process.env.GITHUB_EVENT_NAME === "pull_request"
    ? Math.max(raceTrialsFromEnv(), MED_RACE_009_PR_TRIALS)
    : raceTrialsFromEnv();
```

- Per-test timeouts: `-005`/`-012` `60_000 + trials * 30_000` (as the money specs; 61 × 15.9 s = 970 s fits in
  60 + 1500 s), `-008`/`-009` `60_000 + trials * 10_000` (61 × 2.9 s = 177 s fits in 60 + 500 s).
- No new environment variable. `.env.example` is unchanged (a `-009` PR override, if chosen, is in the spec, as the
  oversell extras cap themselves with `Math.min(raceTrialsFromEnv(), 3)` in `med-race-001-oversell.spec.ts`).

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

- **Test 9.** `assertSelectOnly` passes for `PROMO_SNAPSHOT_SQL`, `LIVE_ORDERS_FOR_EMAIL_SQL`, `ORDER_STATE_SQL`.
- **Test 10.** The same for `ORDER_LINE_ITEM_SQL`, `ORDER_RESERVATIONS_SQL`, `OPEN_FULFILLMENTS_SQL`,
  `PHANTOM_RESERVED_SQL`, `LEAK_PROMOTIONS_SQL`, `LEAK_CAMPAIGNS_SQL`, `LEAK_PRODUCT_IDS_SQL`.
- **Test 11.** `promoLeakCheck` with all counts 0 → no violation.
- **Test 12.** `promoLeakCheck` with one live promotion → one `TEST BUG` violation naming `promotion`.
- **Test 13.** `orderStateLeakCheck` with one phantom product that was reported → no violation, one reported id.

### 13.4 `tests/unit/medusa-invariants.test.ts` (+16 → 383)

14–15. `checkPromoCap`: at the cap → `[]`; counter cap+1 → one `PRODUCT BUG`. 16. `checkPromoCap`: orders cap+1 with
counter at cap → one `SUSPECTED PRODUCT BUG` containing `F-M2`. 17–18. `checkGhostOrders`: equal sets → `[]`; one extra
live order → one `SUSPECTED` with its id. 19–20. `checkSingleCancel`: one 200, 0 pending, 1 credit line → `[]`; two 200s →
`SUSPECTED` containing `X04`. 21. `checkSingleCancel`: status `pending` → `SUSPECTED` naming the status. 22–24.
`checkCancelFulfilExclusive`: canceled + 0 open + fulfil 400 → `[]`; fulfilled + not canceled + cancel 400 → `[]`;
canceled + 1 open → `SUSPECTED` containing `X05`. 25. `checkCancelFulfilExclusive`: both 200 → `SUSPECTED`. 26–27.
`checkReservationDrift`: consistent → `[]`; reserved 6 vs 0 → `SUSPECTED` containing `F-M3`. 28. `classifyFindings`
with `labelled = []`: a `SUSPECTED ... (X04)` line goes to `suspected`, a `PRODUCT BUG` line to `violations`. 29.
`classifyFindings` with `labelled = ["X04"]`: the same `(X04)` line goes to `violations`, relabelled `PRODUCT BUG:`; an
`(X05)` line stays in `suspected`.

### 13.5 Test skeletons (one per file; every other test in §13.1 to §13.4 follows the same shape)

```ts
// tests/unit/medusa-payloads.test.ts — test 3 (tests 1, 2, 4, 5: the same describe, one assert each as §13.1 says)
it("campaignCreateBody has a usage budget and no currency", () => {
  assert.deepEqual(campaignCreateBody("id", 3), {
    name: "id",
    campaign_identifier: "id",
    budget: { type: "usage", limit: 3 },
  });
});

// tests/unit/medusa-admin.test.ts — tests 6 to 8 reuse the file's stubFetch and afterEach(realFetch)
it("createCampaign throws a TEST BUG on 400", async () => {
  stubFetch({ "POST /admin/campaigns": { status: 400, body: { message: "bad" } } });
  await assert.rejects(createCampaign("t", "id", 3), /TEST BUG: POST \/admin\/campaigns HTTP 400/);
});
it("cancelOrder resolves a 400 instead of throwing", async () => {
  stubFetch({ "POST /admin/orders/o1/cancel": { status: 400, body: { message: "x" } } });
  const res = await cancelOrder("t", "o1");
  assert.equal(res.status, 400);
});

// tests/unit/medusa-oracle.test.ts — tests 9 to 13 reuse the file's fakePool shape
it("promoLeakCheck names a leaked promotion", async () => {
  const counts = new Map([[LEAK_PROMOTIONS_SQL, 1]]);
  const violations = await promoLeakCheck(fakePool(counts, []), "p6-qa-x-%");
  assert.deepEqual(violations, ["TEST BUG: leak promotion LIKE p6-qa-x-%"]);
});

// tests/unit/medusa-invariants.test.ts — tests 14 to 29
it("checkSingleCancel flags two successful cancels as X04", () => {
  const out = checkSingleCancel({
    status: "canceled",
    httpSuccesses: 2,
    pendingChanges: 1,
    creditLines: 2,
  });
  assert.ok(out.some((l) => l.startsWith("SUSPECTED PRODUCT BUG:") && l.endsWith("(X04)")));
});
it("classifyFindings promotes a labelled tag", () => {
  const line = "SUSPECTED PRODUCT BUG: 2 cancels returned 200, expected 1 (X04)";
  const out = classifyFindings([line], ["X04"]);
  assert.deepEqual(out, {
    violations: ["PRODUCT BUG: 2 cancels returned 200, expected 1 (X04)"],
    suspected: [],
  });
});
```

`orderStateLeakCheck` (test 13) needs rows of ids, not counts: give `fakePool` an optional `rows` map keyed by SQL so the
product and phantom queries return `[{ id: "prod_1" }]`, and keep the count map for the rest.

## 14. Build steps (repo root; one commit each; on any differing output stop and paste it)

Before every command: `export PATH="/usr/local/bin:$PATH"`. Admin credentials come from the environment (§1), never typed
into a file in the repo. Every step formats its own files, runs the full check and commits only its own paths (rule 2:
`git add <path>`, never `-A` or `.`; no trailer lines, rule 3). "Check output" below is
`npm run check 2>&1 | grep -E '^# (tests|pass|fail)'` plus the exit code; any other count stops the build (rule 11).

### Step 0. Baseline gate (no commit)

```bash
npm run check                  # expect exit 0 and: # tests 354 / # pass 354 / # fail 0
npm run up:medusa              # expect exit 0 and "Medusa backend is up at http://127.0.0.1:9000"
npm run smoke:medusa           # expect exit 0
npm run down:medusa            # expect exit 0; curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9000/health → 000
npx playwright test --list --project=medusa-race | tail -1   # note the total; Step 9 compares against it
```

### Step 1. Payloads

```bash
npx prettier --write src/medusa/payloads.ts tests/unit/medusa-payloads.test.ts
npm run check                  # exit 0; # tests 359 / # pass 359 / # fail 0
git add src/medusa/payloads.ts tests/unit/medusa-payloads.test.ts
git commit -m "feat(medusa): add promotion, campaign and fulfillment payloads"
```

### Step 2. Admin and store clients (§8.2, §8.3, §13.2)

`moneyPost` → `rawPost` inside `src/medusa/admin.ts` only (three call sites in the same file). `run-money-case.ts` is
**not** touched.

```bash
grep -rn "moneyPost" src tests scripts   # after the edit: no output
npx prettier --write src/medusa/admin.ts src/medusa/store.ts tests/unit/medusa-admin.test.ts
npm run check                  # exit 0; # tests 362 / # pass 362 / # fail 0
git add src/medusa/admin.ts src/medusa/store.ts tests/unit/medusa-admin.test.ts
git commit -m "feat(medusa): add promotion and order-state admin calls"
```

### Step 3. Oracle (§8.4, §13.3)

```bash
npx prettier --write src/medusa/oracle.ts tests/unit/medusa-oracle.test.ts
npm run check                  # exit 0; # tests 367 / # pass 367 / # fail 0
git add src/medusa/oracle.ts tests/unit/medusa-oracle.test.ts
git commit -m "feat(medusa): add promotion and order-state oracle"
```

### Step 4. Invariants (§8.5, §13.4)

```bash
npx prettier --write src/medusa/invariants.ts tests/unit/medusa-invariants.test.ts
npm run check                  # exit 0; # tests 383 / # pass 383 / # fail 0
git add src/medusa/invariants.ts tests/unit/medusa-invariants.test.ts
git commit -m "feat(medusa): add budget and order-state invariants"
```

### Step 5. Promotion runner and `-005` (§8.6, §8.7)

```bash
npx prettier --write src/medusa/run-promo-case.ts tests/medusa/races/med-race-005-campaign-budget.spec.ts
npm run check                  # exit 0; # tests 383 / # pass 383 / # fail 0
npm run up:medusa
RACE_TRIALS=3 npx playwright test --project=medusa-race -g "P6-MED-RACE-005"   # expect "1 passed"
npm run down:medusa            # exit 0
git add src/medusa/run-promo-case.ts tests/medusa/races/med-race-005-campaign-budget.spec.ts
git commit -m "feat(races): add medusa campaign budget race P6-MED-RACE-005"
```

Paste (proof only, never published) the histogram verdict, `invalidTrials`, `reruns`, per-attempt `counterUsed` and
`ordersWithPromo`, and the leak result. Expected from the probe: pass, counter 3, orders 3.

### Step 6. `-012`

```bash
npx prettier --write tests/medusa/races/med-race-012-usage-limit.spec.ts
npm run check                  # exit 0; # tests 383 / # pass 383 / # fail 0
npm run up:medusa
RACE_TRIALS=3 npx playwright test --project=medusa-race -g "P6-MED-RACE-012"   # expect "1 passed"
npm run down:medusa            # exit 0
git add tests/medusa/races/med-race-012-usage-limit.spec.ts
git commit -m "feat(races): add medusa promotion usage limit race P6-MED-RACE-012"
```

Expected: counters pass; F-M2 may show as a `suspected-bug` annotation (2 of 8 in the probe).

### Step 7. Order runner and `-008`

```bash
npx prettier --write src/medusa/run-order-case.ts tests/medusa/races/med-race-008-double-cancel.spec.ts
npm run check                  # exit 0; # tests 383 / # pass 383 / # fail 0
npm run up:medusa
RACE_TRIALS=3 npx playwright test --project=medusa-race -g "P6-MED-RACE-008"   # expect "1 passed"
npm run down:medusa            # exit 0
git add src/medusa/run-order-case.ts tests/medusa/races/med-race-008-double-cancel.spec.ts
git commit -m "feat(races): add medusa double cancel race P6-MED-RACE-008"
```

Expected: X04 `suspected-bug` annotations on most trials; verdict `pass` unless a counter, 5xx or setup check fails (D54).

### Step 8. `-009`

```bash
npx prettier --write tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts
npm run check                  # exit 0; # tests 383 / # pass 383 / # fail 0
npm run up:medusa
RACE_TRIALS=3 npx playwright test --project=medusa-race -g "P6-MED-RACE-009"   # expect "1 passed"
npm run down:medusa            # exit 0
git add tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts
git commit -m "feat(races): add medusa cancel vs fulfil race P6-MED-RACE-009"
```

### Step 9. CI and README (§11 as agreed under §21 question 9, §17)

```bash
npx prettier --write .github/workflows/perf.yml README.md
npm run check                  # exit 0 (actionlint included); # tests 383 / # pass 383 / # fail 0
npx playwright test --list --project=medusa-race | tail -1   # Step 0 total + 4
git add .github/workflows/perf.yml README.md
git commit -m "ci(races): run the medusa budget and order-state races"
```

### Step 10. Roadmap sync

Task 3 status line (plan link, `-012` lands, suspected bugs, the CI layout), `-013` and `-014` as accepted extras for a
follow-up task, `-015` under "Later", the priorities of D58.

```bash
npx prettier --write docs/plans/2026-10-22-p6-phase2-roadmap.md
npm run check                  # exit 0; # tests 383 / # pass 383 / # fail 0
git add docs/plans/2026-10-22-p6-phase2-roadmap.md
git commit -m "docs(plans): sync the phase 2 roadmap with task 3"
```

### Step 11. Push the branch (no PR yet; proposal D61)

```bash
git push -u origin feat/2026-10-22-p6-med-budget-order-races
```

### Step 12. Three full-count runs on the branch (proposal D61; needs §21 question 7)

```bash
gh workflow run perf.yml --ref feat/2026-10-22-p6-med-budget-order-races   # three times, one after the other finishes
```

`workflow_dispatch` uses `RACE_TRIALS` 50 (perf.yml: anything but `pull_request`). It also runs `cal-smoke` and
`documenso-smoke`; that cost is accepted. Read each run once when it finishes (rule 15). If `gh` is missing, the owner
starts the three runs. Report per case: verdict, the count of trials that showed each signal (X04, X05, F-M2, F-M3), the
step times (§11 stop rule) and the run links. **Stop for the owner's labels** (rule 9, rule 13).

### Step 13. Labelled signals under `test.fail()` (proposal D62; only for what the owner labels)

For each labelled signal, its spec passes the tag in `labelled` (for example `-008`: `["X04", "F-M3"]`) and gets the
two-test shape below, so the case's other checks stay strict while the known bug is expected to fail:

```ts
test.describe.serial("P6-MED-RACE-008 double cancel", () => {
  let result: Awaited<ReturnType<typeof runOrderCase>>;
  test.beforeAll(async () => {
    result = await runOrderCase({ /* as §8.7 */ labelled: [] });
  });
  test("P6-MED-RACE-008 guards: no unlabelled violation", () => {
    expect(result.histogram.invariantViolations.filter((v) => !/\((X04|F-M3)\)/.test(v))).toEqual(
      [],
    );
  });
  // PRODUCT BUG X04 and F-M3, labelled <date> after runs <link 1>, <link 2>, <link 3>.
  test("P6-MED-RACE-008 known bug: X04 and F-M3 reproduce", () => {
    test.fail();
    expect(result.suspected.filter((s) => /\((X04|F-M3)\)/.test(s))).toEqual([]);
  });
});
```

The `test.fail()` test fails (and so passes as expected) as long as the bug reproduces in at least one trial; if the bug
stops reproducing, it turns red, which is the signal to remove `test.fail()`. The runner keeps `labelled: []` here so
the labelled signals stay out of the guards' verdict and are counted in `suspected`; `classifyFindings` with a
non-empty `labelled` is used only if the owner prefers the single-test form.

As labelled (D67 to D70): `-008` and `-009` get the two-test shape; `-005` and `-012` keep one test and annotate F-M2
lines as `product-bug` (labelled, D70); `docs/BACKLOG.md` is new.

```bash
npx prettier --write tests/medusa/races/med-race-008-double-cancel.spec.ts tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts \
  tests/medusa/races/med-race-005-campaign-budget.spec.ts tests/medusa/races/med-race-012-usage-limit.spec.ts README.md docs/BACKLOG.md
npm run check                  # exit 0; # tests 383 / # pass 383 / # fail 0
npx playwright test --list --project=medusa-race | tail -1   # Step 9 total + 1 per spec given the two-test shape
git add tests/medusa/races/med-race-008-double-cancel.spec.ts tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts \
  tests/medusa/races/med-race-005-campaign-budget.spec.ts tests/medusa/races/med-race-012-usage-limit.spec.ts README.md docs/BACKLOG.md
git commit -m "test(races): mark the labelled medusa order-state bugs as expected failures"
git push
```

README moves each labelled signal from "suspected" to "Known product bugs" with the run links.

### Step 14. PR

```bash
gh pr create --title "feat: add medusa budget and order-state races" --body-file <path outside the repo>
```

`gh` only (rule 3). If `gh` is missing, report the title and body and stop. Read the PR CI once (rule 15).

## 15. Verification gate (paste real output before the PR is ready)

- `npm run check` (all five parts; 383 tests, 0 fail).
- `npx playwright test --list` count before and after.
- The three full-count `workflow_dispatch` runs of Step 12 with their links, step times and signal counts.
- Green PR run (3 trials) for both Medusa jobs after Step 13.
- Every histogram: verdict, `trialsRequested`, `invalidTrials`, `reruns`, `warmup[]`, violations, suspected signals with
  counts, and leaked-data records.

## 16. Commit plan

1. `docs(plans): add the phase 2 task 3 med-budget-order-races plan` (this file only).
2. `docs(plans): record the owner's answers in the task 3 plan` (revision 2).
3. `docs(plans): revise the task 3 plan after review` (revision 3).
4. to 13. As §14 Steps 1 to 10.
5. `test(races): mark the labelled medusa order-state bugs as expected failures` (§14 Step 13, if agreed).

## 17. Docs (README)

- "Medusa budget and order-state races (Phase 2)" section: one row per case with N, cap, oracle, and the CI job.
- F-M2, F-M3 and X04/X05 as **suspected** product bugs with the probe counts (not in "Known product bugs" until §10 is
  met). F-M4 as a probe note pointing at the accepted follow-up `-014`.
- A note that an F-M3 product cannot be deleted through the admin API and is reported as leaked data.

## 18. Will NOT do

- No fork or harness change; no SQL writes; no `retries`; no sleeps; no `test.fail()` without the owner's label (§10).
- No reduction of trials and no job timeout change (D39, Task 1 D24). The two step timeouts in §11 are new and proposed
  (D60).
- No change to `runTrials`, `fireTogether`, the rerun policy, `run-case.ts`, `run-money-case.ts` or the money logic.
  The `moneyPost` → `rawPost` rename stays inside `src/medusa/admin.ts` (§8.2).
- No work on `-013` or `-014` in this PR (follow-up task, D57) and none on `-015` ("Later"); no P1 repo change (follow-up only).
- No publication of probe timings.

## 19. Risks

| Risk                                                               | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A job's time exceeds the estimate (setup is 10 carts per attempt)  | §11 stop rule (80 % of a step timeout); split further. Never cut trials.                                                                                               |
| F-M3 products pile up in a long-lived local DB                     | Each is prefixed and reported; CI databases are throwaway. Local: `npm run down:medusa` keeps volumes, so the leftovers stay until the volume is removed (documented). |
| X05 is intermittent (1 of 5): a 3-trial PR run may not show it     | `-009`'s PR count is set from the dispatch runs so a miss is under 1 % (D65, §12).                                                                                     |
| `lock_timeout = '3s'` in `registerUsage` could give 5xx under load | Not seen live (burst ≤ 2.8 s). A 5xx is a PRODUCT BUG with the body.                                                                                                   |
| A ghost order (F-M2) blocks the product delete                     | The cleanup sweeps orders by email prefix first (§9), proven live.                                                                                                     |
| The P1 X04/X05 sequence differs from the reference text            | P1 is out of reach here; the P6 reference text is the agreed source (D56). The P6 cases stand on their own probe evidence.                                             |
| `order_promotion` join counts a soft-deleted link                  | The SQL filters `op.deleted_at IS NULL AND o.deleted_at IS NULL` (live: losers' links are soft deleted).                                                               |

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

Proposals of revision 3 (agreed by the owner as D64 to D66 below):

- **D60 CI layout (Q9).** `-008`/`-009` run in the `medusa-smoke` race step; only `-005`/`-012` get the new job
  `medusa-order-races`; both race steps get step timeouts (§11, §12). Replaces the D55 layout if agreed.
- **D61 Labelling runs inside this task (Q7).** Push without a PR, run 3 full-count `workflow_dispatch` runs on the branch,
  stop for the owner's labels (§14 Steps 11 and 12).
- **D62 `test.fail()` in this PR for labelled X04 and F-M3 (Q7).** Two-test shape per spec so the other checks stay strict
  (§14 Step 13).
- **D63 `-009` and X05 (Q8).** Answered by D65.

Owner answers to revision 3 (agreed 2026-10-22):

- **D64 Labelling inside this task (Q7, agreed).** Steps 11 to 13: push, 3 full-count `workflow_dispatch` runs, the owner
  labels, then `test.fail()` for X04 and F-M3 in this PR (D61, D62 as proposed).
- **D65 `-009` PR count (Q8, option (a)).** `-009`'s PR trial count is set from the rate measured in the 3 dispatch runs
  so that a miss is under 1 %, with the arithmetic in §12 and in the spec comment; `test.fail()` then covers the
  signals the owner labels for `-009`.
- **D66 CI layout (Q9, agreed).** D60 as proposed: `-008`/`-009` in the `medusa-smoke` race step, a new job for
  `-005`/`-012` only, per-step timeouts.

Owner labels after the three full-count runs of Step 12 ([39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959); 2026-10-23, rules 9 and 13):

- **D67 X04 (`-008`): PRODUCT BUG.** `test.fail()` in `-008`, with the dispatch run links and the P1 reference
  (`docs/reference/p1-plan-example-medusa.md` line 365: P1 X04, `statuses [200, 200]` with a pending `credit_line`
  change). 113 of 150 trials.
- **D68 F-M3 (`-008`, `-009`): PRODUCT BUG.** `test.fail()` where it is asserted (`-008` and `-009`), with the run links
  and the rollback source: `@medusajs/core-flows` 2.21.2 `dist/reservation/steps/delete-reservations-by-line-items.js`
  lines 10 to 29 (its compensation calls `restoreReservationItemsByLineItem`), run in `parallelize` by
  `dist/order/workflows/cancel-order.js` lines 107 to 109; and `dist/reservation/steps/delete-reservations.js` line 28
  (`restoreReservationItems`), run by `dist/order/workflows/create-fulfillment.js` line 395. A losing cancel or fulfil
  rolls back and restores the reservation the winner removed. 37 of 150 trials in `-008`, 7 of 150 in `-009`.
- **D69 X05 (`-009`): PRODUCT BUG.** `test.fail()` in `-009`; with both X05 and F-M3 labelled, `-009`'s PR trial count is
  **13** (§12 arithmetic). 50 of 150 trials; P1 X05 (same reference line).
- **D70 F-M2 (`-012`, `-005`): PRODUCT BUG, no `test.fail()`.** Live orders carrying the promotion exceed its limit.
  At about 11 % per trial (33 of 300) a PR run cannot hold an expected failure stable without about 40 trials, so
  `-012`'s counter assertions stay green and F-M2 is reported as a labelled annotation (`product-bug`) with the run
  links. A BACKLOG item (`docs/BACKLOG.md`) tracks making it a stable expected failure later.

## 21. Contradictions with the roadmap, and open questions (answered)

**Contradictions:**

1. Roadmap Task 3 "Expected result is a pass" for `-005`: confirmed. But `-012`, said to be "the same race", is not
   clean: F-M2 (2 of 8). The roadmap text is updated in Step 10.
2. Roadmap "CI change: same `medusa-smoke` race step". The time budget does not allow it (§11, D50); a new job is needed.
3. Roadmap "P1's X04/X05 request sequence (P1 repo)": the P1 repo is not reachable from this session; the probe used the
   P6 reference text (§2.1 Q1).
4. Rule 10 says a plan goes on a `plan/...` branch; the owner's instruction for this task says to commit the plan on
   `feat/2026-10-22-p6-med-budget-order-races`. The owner's instruction was followed (Task 2 did the same).
5. **D54 leaves `-008`/`-009` green while X04 reproduces.** Under D54 the suspected signals only annotate, so `-008`
   passes in CI although X04 reproduced in 7 of 8 probe runs. But roadmap D3 says a product invariant violation "is
   recorded and fails the case (or counts towards a `test.fail()` proof)", and the roadmap's Task 3 "Done when" says
   "`-005`, `-008` and `-009` pass or record a proven bug with `test.fail()` and repeated-run evidence". A green `-008`
   with X04 in its annotations meets neither. Proposed resolution (D61, D62): before the PR is ready, run 3 full-count
   `workflow_dispatch` runs on this branch (§14 Step 12); the owner labels; then a final step of this PR (§14 Step 13)
   adds `test.fail()` for the labelled X04 and F-M3 with the run links. Question 7 asks for agreement.

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

**Open questions of revision 3 (answered by the owner on 2026-10-22; D64 to D66):**

7. **Labelling inside this task (contradiction 5).** Proposed (D61, D62): push without a PR, 3 full-count
   `workflow_dispatch` runs, the owner labels, then `test.fail()` for X04 and F-M3 in this PR (§14 Steps 11 to 13). In
   `-008`, X04 makes the expected failure stable: with a probe rate of 7 of 8 per trial, a 3-trial PR run misses X04 with
   probability (1/8)³ ≈ 0.2 %, so F-M3 (2 of 13 per trial) can share the same `test.fail()` without making it flaky.
   Agree, or say where the `test.fail()` commit should go instead. **Agreed (D64).**
8. **`-009` and X05 under `test.fail()`.** X05 showed in 1 of 5 probe runs (a small sample). `test.fail()` fails the
   check when the bug does **not** reproduce, so at 3 PR trials with a per-trial rate of 0.2 it would be red on about
   0.8³ ≈ 51 % of PR runs; adding F-M3 in `-009` (1 of 5) gives a combined rate of about 0.36 and still ≈ 26 % red PRs.
   Two ways to avoid random failures:
   - **(a) Raise `-009`'s PR count.** The spec sets `trials = Math.max(raceTrialsFromEnv(), 25)` on PR runs (the
     `med-race-001` extras already set their own count). At a rate of 0.2, 25 trials miss X05 with probability 0.8²⁵ ≈
     0.4 %. The rate is re-measured from the 150 trials of Step 12, and the PR count is set to the smallest count with a
     miss probability ≤ 1 % (`ceil(ln 0.01 / ln(1 − rate))`; 21 at 0.2, 44 at 0.1). Cost: +1 min 12 s on the PR race step
     (§12). `test.fail()` then covers X05 and F-M3 in `-009`.
   - **(b) Keep X05 annotation-only.** `-009` stays green with X05 and F-M3 as `suspected-bug` annotations and histogram
     counts. It does not meet the roadmap "Done when" for X05; the README and the Task 9 closeout say so.

   Which one? **Option (a), with the PR count set from the dispatch runs so a miss is under 1 % (D65, §12).**

9. **CI layout (D60).** Agree to `-008`/`-009` in the `medusa-smoke` race step, `-005`/`-012` alone in
   `medusa-order-races`, and the two step timeouts of §11? This replaces the D55 layout. **Agreed (D66).**

No open questions remain. The build runs §14 Steps 0 to 12 and stops after Step 12 for the owner's labels.

## Closeout notes

Filled in before the PR merges.

- Merge SHA: _pending_ (filled when the owner merges).
- Findings (final labels and CI evidence). Three full-count `workflow_dispatch` runs on the branch, all jobs green:
  [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959). Per 150 valid trials:
  - **X04** (`-008`): 113 (39 / 39 / 35). **PRODUCT BUG**, `test.fail()` (D67).
  - **F-M3**: 37 in `-008` (11 / 11 / 15), 7 in `-009` (4 / 2 / 1). **PRODUCT BUG**, `test.fail()` (D68).
  - **X05** (`-009`): 50 (16 / 17 / 17). **PRODUCT BUG**, `test.fail()`, PR count 13 (D69).
  - **F-M2**: 32 in `-012` (11 / 9 / 12) and **1 in `-005`** (run 2, trial 13; the probe had 0 of 8). **PRODUCT BUG**,
    labelled annotation, no `test.fail()`; BACKLOG item (D70).
  - Counters never over the cap (`-005` budget, `-012` `promotion.used`) in 300 trials; no 5xx; leak checks clean; one
    spread rerun in 450 Medusa trials per run (run 3, `-001`).
  - Step times: `medusa-smoke` race step 13:05 / 11:58 / 19:17 (run 3 slower across every case on that runner, `-001`
    724 s against 443 to 485 s); `medusa-order-races` race step 15:32 / 14:26 / 15:16. All under the §11 stop rules.
  - F-M4 (not in this task): carried to Task 3b (roadmap D13).
- Deviations from this plan:
  - Docker had stopped after a container restart; it was started as `.claude/hooks/session-start.sh` does before Step 0.
  - Medusa stayed up across Steps 5 to 8 instead of up/down per step.
  - `PHANTOM_RESERVED_SQL` uses `SELECT DISTINCT`; the product-id leak query is a constant `LEAK_PRODUCT_IDS_SQL`.
  - The new job's k6 summary artefact is `k6-summary-medusa-budget-health` (the copied name would clash with
    `medusa-smoke`'s artefact in the same run).
  - The roadmap gained Task 3b on this branch (owner request), not on a separate `docs/` branch.
- Rule slips:
  - The plan went on the `feat/...` branch, not `plan/...` (rule 10; owner instruction, §21 contradiction 4).
  - The probe's first script left 3 test customers in the local database (§2.6; local only).
  - PR #31 (agent rules) was opened through `gh api`; the session proxy appended a "Generated by Claude Code" footer
    that rule 3 forbids, and it could not be removed from the session (the owner was asked to remove it by hand).
