# P6 Phase 4b Task 10: Medusa invariants under load (`P6-MED-LOAD-007`, `-008`, `-009`) (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 613 to 645 (Task 10), D7 (line 821), D17 (line 850). Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `e27ad5a`. Probe date 2026-10-25 (UTC), cloud VM (4 vCPU, 15 GB, Node v22.23.3, k6 v2.3.0). **VM timings prove that a step works; none is a published number or a target.**

## 1. Header

- **Task and roadmap line:** Phase 4b Task 10, Medusa invariants under steady load, roadmap lines 613 to 645.
- **Cases and priority:** `P6-MED-LOAD-007` (P1, two-instance conservation), `P6-MED-LOAD-008` (P1, promo ledger under load), `P6-MED-LOAD-009` (P2, double cancel and cancel-vs-fulfil inside steady load).
- **Build branch pattern:** `feat/<build date>-p6-med-load-invariants`.
- **Unit-test delta:** **+12 against B0 1025** (`main` at `e27ad5a`). With Task 6 merged first (+36): B = 1061, expected **1073**.
- **Stop for owner review: yes.** New two-instance mode in the Medusa load job (shared CI, `MEDUSA_REDIS=1`), and a new race injection path from k6 (Q-RACEPATH).

## 2. What it proves

- Stock and orders are conserved across two backends that share one database and one Redis lock: no oversell, and no duplicate order for one cart (`-007`).
- A promotion's budget and the balances of its ledger hold under a share of carts that apply it (`-008`).
- An order takes one terminal transition even when a cancel and a second cancel, or a cancel and a fulfilment, arrive together under load (`-009`).
- Transfer: stock conservation across replicas of a retail back end, promotion budgets in a loyalty system, and single terminal state in an order or prescription lifecycle.

## 3. Live probe evidence

Probes were run with the harness scripts only; Medusa was started and stopped each time (`npm run up:medusa` / `npm run down:medusa`), one stack at a time.

| #     | Roadmap probe item                                                                            | Command                                                                                                                                                                                                                | Output (trimmed)                                                                                                                                                                                                                                                                               | Value it sets                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| M10-1 | Both instances receive load: can two backends start?                                          | `MEDUSA_REDIS=1 MEDUSA_LOCK=redis MEDUSA_SECOND_BASE_URL=http://127.0.0.1:9001 npm run up:medusa` (README lines 709 to 716), on a fresh volume (`docker volume rm qa-harness-medusa_medusa_harness_pg` after the down) | exit 0 in **43 s**; `curl` port 9000 → **200**, port 9001 → **200**; containers `qa-harness-medusa-postgres-1` and `qa-harness-medusa-redis-1` (`redis:7`, pulled and started); `npm run down:medusa` exit 0, 0 leftover containers                                                            | the two-instance stack starts on the VM; the per-instance request counts are **UNPROBED** (no load ran against both) |
| M10-2 | Stock and reservation invariant on a single instance (the audit the two-instance case reuses) | `node scripts/load/run-load.ts --case P6-MED-LOAD-002 --profile steady` (earlier in this session, Task 7 row M-3)                                                                                                      | VALID; 42 orders, 42 units, stock 42; `reservations rows 42, units 42, reserved 42`; `available 0`; `one-payment-per-order 42, 0 without`; `balances 0 violation(s)`; `no-ghost-orders database 42, client 42`                                                                                 | the single-instance audit is green on the VM; `-007` reuses these checks per instance                                |
| M10-3 | Failure mode of the fresh database (the admin user persists in the volume)                    | the 30-s arms after a restart without volume removal                                                                                                                                                                   | `POST /auth/user/emailpass failed (HTTP 401)`, a TEST BUG in local probing, not a product result; the fix is the volume removal above, which CI never needs (a fresh database per job)                                                                                                         | local reruns need a volume reset; CI does not                                                                        |
| M10-4 | Money and promo oracles on main                                                               | `grep -n` of `src/medusa/oracle.ts` (below)                                                                                                                                                                            | `MONEY_SNAPSHOT_SQL` line 146, `readMoneySnapshot` 169, `moneyLeakCheck` 195, `PROMO_SNAPSHOT_SQL` 225, `readPromoSnapshot` 302, `promoLeakCheck` 382                                                                                                                                          | the money and promo checks of `-008` exist on main; no gift-card check exists (M10-5)                                |
| M10-5 | Gift-card clause                                                                              | `grep -n "P6-MED-RACE-006" docs/plans/2026-10-22-p6-phase2-roadmap.md` (line 101: "**Later**, D34: no gift-card route at `MEDUSA_REF`")                                                                                | the gift-card clause is **Later** with that evidence                                                                                                                                                                                                                                           | `-008`'s gift-card clause is recorded as **pending**, not dropped (D7)                                               |
| M10-6 | Race injection inside k6 load                                                                 | `ls tests/medusa/races/` and `grep -n "fireTogether\|runOrderCase" src/medusa/*.ts`                                                                                                                                    | the races are **Playwright specs** (`med-race-005-campaign-budget.spec.ts`, `-007-refunds`, `-008-double-cancel`, `-009-cancel-vs-fulfil`, `-011-partial-refunds`) and `fireTogether` (`src/races/fire-together.ts` line 15, used by `src/medusa/run-case.ts` line 213); no k6 path fires them | injection from inside k6 is **new** (Q-RACEPATH)                                                                     |
| M10-7 | Steady rate of Medusa                                                                         | `jq '.products.medusa.lowerBoundRate' k6/thresholds/knee-bounds.json`                                                                                                                                                  | 1.5 → `steadyRateFor` = 0.7 (`k6/thresholds/baseline-band.json`, `P6-MED-LOAD-002` rate 0.7)                                                                                                                                                                                                   | the rate of all three cases is 0.7 per second                                                                        |
| M10-8 | Per-instance counts, conservation under two instances at 0.7 per second                       | **UNPROBED** (M10-1 started both; no load run was made against both)                                                                                                                                                   | —                                                                                                                                                                                                                                                                                              | the build's first probe (§6.4) measures the per-instance split                                                       |

### 3.1 What the probe could not confirm (UNPROBED)

1. Per-instance request counts under load (M10-8): **UNPROBED**; the two backends start (M10-1).
2. The double-cancel and cancel-vs-fulfil hit rate under steady load and its inputs from k6 (Q-RACEPATH): **UNPROBED**.
3. The promo budget and ledger behaviour under load (the `PROMO_SNAPSHOT_SQL` audit on a load stream): **UNPROBED**; the single-instance audit of M10-2 is the only evidence.
4. Two-instance memory under load (roadmap main risk): **UNPROBED**.

## 4. Depends on

Main at `e27ad5a`, verified in this plan run:

- `src/medusa/oracle.ts`: `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `readOversellSnapshot` (Phase 1, Phase 2); `MONEY_SNAPSHOT_SQL` (146), `readMoneySnapshot` (169), `moneyLeakCheck` (195); `PROMO_SNAPSHOT_SQL` (225), `readPromoSnapshot` (302), `promoLeakCheck` (382).
- `src/load/reconcile/medusa.ts`: `readMedusaSnapshot` (line 165), the conservation audit (Phase 3 Task 8); `src/load/med-conservation.ts` (the conservation stage, `P6-MED-LOAD-002`); `src/load/retry-audit/medusa.ts`.
- `src/load/products/medusa.ts`: `makeMedusaSetup({ stockFor })` (line 252) and the `planned + 20` default (line 120); `src/load/cases.ts` `MED_LOAD_002` (line 365, `stockFor: ceil(planned / 2)`).
- `src/medusa/run-money-case.ts` (`runMoneyCase`, line 88), `src/medusa/run-promo-case.ts` (`runPromoCase`, line 86), `src/medusa/run-order-case.ts` (Phase 2 order-state races).
- `tests/medusa/races/med-race-005-campaign-budget.spec.ts`, `med-race-007-refunds.spec.ts`, `med-race-008-double-cancel.spec.ts`, `med-race-009-cancel-vs-fulfil.spec.ts`, `med-race-011-partial-refunds.spec.ts` (Playwright, Phase 2).
- `k6/journeys/med-checkout.js` (Phase 3 Task 7, `P6-MED-LOAD-001`), `k6/cases/med-load-002.js` (the stock-out case).
- `perf.yml` `medusa-smoke` (45 min), `medusa-load` (45), `medusa-multi-instance` (45, two legs: redis and memory, `MEDUSA_LOCK`), and the README two-backend command (lines 709 to 716).

**Phase 2 owner labels (on main, in `docs/plans/2026-10-22-p6-phase2-roadmap.md` lines 380 to 384):** X04 = `P6-MED-RACE-008` (double cancel: 113 of 150 trials), X05 = `P6-MED-RACE-009` (cancel ‖ fulfil: 50 of 150), F-M3 (a losing cancel or fulfil restores a canceled order's reservation: 37 of 150 in `-008`, 7 of 150 in `-009`) are **PRODUCT BUG under `test.fail()`** (owner labels, Phase 2 D65, D69). F-M2 (an unpaid order carries the promotion: live orders exceed its limit) is the ghost-order signal (L10).

**Not on main:** `P6-MED-RACE-006` (gift card) is **Later** (Phase 2 line 101, D34). The `-006`-dependent clause of `-008` is pending. The 4a Task 3 plan proposes `P6-MED-LOAD-014` (two-instance knee, on its branch only; the grep of §3 finds no `P6-MED-LOAD-014` on main).

## 5. Build-time recheck table

| #   | Check                                          | Exact command                                                               | Expected                       | If it differs                                                                                          |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | Task 6 merged (no direct dependency; recorded) | `git ls-remote --tags origin \| grep p6-phase4a`                            | printed after Task 6's release | not a blocker                                                                                          |
| 2   | Medusa steady rate                             | `jq '.products.medusa.lowerBoundRate' k6/thresholds/knee-bounds.json`       | 1.5 (so 0.7 per second)        | the rate follows the file                                                                              |
| 3   | Money and promo oracles still on main          | `grep -n "MONEY_SNAPSHOT_SQL =\|PROMO_SNAPSHOT_SQL =" src/medusa/oracle.ts` | two matches                    | a missing oracle is written as "pending", never dropped (D7)                                           |
| 4   | Two-instance start                             | M10-1 command                                                               | both health checks 200         | a failed second backend: root-cause before any case (the `medusa-multi-instance` job is the reference) |
| 5   | `npm run check`                                | `npm run check`                                                             | exit 0 with the count of §12   | fix                                                                                                    |

## 6. Design

### 6.1 File tree

```text
k6/cases/med-load-007.js                     NEW  P6-MED-LOAD-007 (two-instance conservation, rate 0.7)
k6/cases/med-load-008.js                     NEW  P6-MED-LOAD-008 (promo on a share of carts)
k6/cases/med-load-009.js                     NEW  P6-MED-LOAD-009 (double cancel and cancel-vs-fulfil inside steady load)
k6/journeys/med-checkout.js                  CHANGED  an `instance` tag per request (the base URL of the instance that served it), and a `promoShare` option
k6/lib/pure/instance.js                      NEW  pure: pick the instance for iteration i (round-robin, i mod 2)
src/load/med/instance-split.ts               NEW  per-instance request and order counts; the conservation check across instances
src/load/med/ledger.ts                       NEW  promoLedgerVerdict: redemptions ≤ budget, balances ≥ 0, debits = balance change (on the landed oracles only)
src/load/med/cancel-race.ts                  NEW  terminalTransitionVerdict: exactly one terminal transition per order (X04/X05 counted under their IDs)
src/load/cases.ts                            CHANGED  registers MED_LOAD_007, MED_LOAD_008, MED_LOAD_009
perf.yml                                     CHANGED  Q-PLACE (§9): a new job `medusa-invariants` (dispatch and schedule), two-instance leg for -007
tests/unit/med-instance-split.test.ts        NEW  4 tests
tests/unit/med-ledger.test.ts                NEW  3 tests
tests/unit/med-cancel-race.test.ts           NEW  3 tests
tests/unit/med-instance-pick.test.ts         NEW  2 tests
README.md                                    CHANGED  section "Medusa invariants under load"
```

### 6.2 Two-instance conservation (`P6-MED-LOAD-007`)

Both backends share the database and the Redis lock (`MEDUSA_REDIS=1 MEDUSA_LOCK=redis`, the README start). The stream of checkouts at 0.7 per second alternates between `MEDUSA_BASE_URL` (9000) and `MEDUSA_SECOND_BASE_URL` (9001) by iteration parity (`k6/lib/pure/instance.js`). Stock is `ceil(planned / 2)` on purpose (the Phase 3 conservation design, `MED_LOAD_002`, owner decision Q1 of Phase 3 Task 8; a stock-out is the expected refusal). The audit then checks: orders ≤ stock across both instances, one order per cart, one payment per order, reservations equal live orders (`RESERVATION_QTY_SQL`), and the per-instance request counts (both instances must serve requests; a zero count is a TEST BUG: the second instance did not receive load).

```ts
// src/load/med/instance-split.ts
export interface InstanceCount {
  instance: "primary" | "secondary";
  requests: number;
  orders: number;
}
export interface SplitVerdict {
  orders: number; // live orders in the database for the run prefix
  stock: number; // S, from the setup (the stockFor value)
  perInstance: InstanceCount[];
  verdict: "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
}
/** orders ≤ stock and one order per cart are PASS conditions; an instance with zero requests is a TEST BUG (it got no load); a duplicate order per cart is a FAIL (PRODUCT BUG, SUSPECTED). */
export function classifySplit(input: {
  orders: number;
  stock: number;
  perInstance: InstanceCount[];
  duplicateCartOrders: number;
  invalidReasons: string[];
}): SplitVerdict;
```

### 6.3 Promo ledger under load (`P6-MED-LOAD-008`)

A share of carts (`promoShare`, proposal 0.5) applies the promotion of the setup (`createPromotion`, the `P6-MED-LOAD-008` setup of `src/medusa/run-promo-case.ts`). The ledger clauses that have an oracle on main are checked; the gift-card clause is pending (M10-5).

```ts
// src/load/med/ledger.ts
export interface LedgerInput {
  redemptions: number; // orders that carried the promotion (PROMO_SNAPSHOT_SQL)
  promoLimit: number; // the promotion's usage limit from setup
  balances: number[]; // the money balances after the run (MONEY_SNAPSHOT_SQL)
  debitsSum: number; // the sum of the debits from the orders
  balanceChange: number; // the change of the balance from the start to the end of the run
}
export interface LedgerVerdict {
  clauses: Array<{
    name: "redemptions-le-budget" | "balances-ge-zero" | "debits-equal-change" | "gift-card";
    status: "PASS" | "FAIL (PRODUCT BUG)" | "PENDING";
    detail: string;
  }>;
  verdict: "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID" | "PASS (gift-card pending)";
}
/** The gift-card clause is always PENDING with the evidence of Phase 2 line 101 (D34). The other clauses use the landed oracles only. */
export function promoLedgerVerdict(input: LedgerInput): LedgerVerdict;
```

### 6.4 Double cancel and cancel-vs-fulfil under steady load (`P6-MED-LOAD-009`)

Inside the steady stream, every 10th order gets a second cancel from a second request in the same iteration (double cancel), and every 20th gets a cancel and a fulfilment at the same moment (cancel-vs-fulfil). The terminal state is read after the drain: exactly one terminal transition per order (the `ORDER_STATE_SQL` oracle, Phase 2). The race timing from k6 is **Q-RACEPATH**: option (a) a second request in the same iteration (recommended, the simplest injection, measured later); option (b) the Playwright races run next to the k6 run (not in k6, so not "inside steady load").

```ts
// src/load/med/cancel-race.ts
export interface OrderTerminal {
  orderId: string;
  terminal: string[];
  openFulfilment: boolean;
  sideEffects: { refunds: number; reservationsLive: number };
}
export interface CancelRaceVerdict {
  orders: number;
  singleTerminal: number; // orders with exactly one terminal transition
  x04Double: number; // double-cancel orders with more than one cancel effect: counted as X04 (P6-MED-RACE-008, PRODUCT BUG under test.fail())
  x05CancelFulfil: number; // cancel-vs-fulfil orders canceled with an open fulfilment: counted as X05 (P6-MED-RACE-009)
  f3Restore: number; // a losing cancel restored a reservation: counted as F-M3
  verdict: "PASS" | "PASS (X04/X05 counted)" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
}
/** Known bugs are counted under their IDs and do not make the case FAIL by themselves; a new double terminal state in an order that is not in those counts is a FAIL (PRODUCT BUG, SUSPECTED). */
export function terminalTransitionVerdict(
  orders: OrderTerminal[],
  invalidReasons: string[],
): CancelRaceVerdict;
```

### 6.5 k6 case skeletons

```js
// k6/cases/med-load-007.js  (P6-MED-LOAD-007: two-instance conservation under steady load; L10 ghost signal; per-instance counts)
export const options = standardOptions({
  scenarios: {
    steady: openModelScenario({
      rate: 7,
      timeUnitSec: 10,
      durationSec: 120,
      maxLatencyMs: 5000,
      exec: "checkout",
      tags: { case: "P6-MED-LOAD-007" },
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
});
```

The rate is written as **7 per 10 s**, not 0.7 per second: k6 rejects a fractional rate in a 1-second unit (`cannot unmarshal number 0.5 into … of type int64`, the 4a Task 5 §3.5 finding), and `timeUnitSec: 10` is the fix that plan added to `openModelScenario`. The same form is used by `-008` and `-009`.

`-008` and `-009` have the same shape with `promoShare: 0.5` and the race injection of §6.4 respectively. The stock is set in the setup (`makeMedusaSetup({ stockFor: (planned) => Math.ceil(planned / 2) })` for `-007`; `planned + 20` for `-008` and `-009`, so the ledger and the race audit are not dominated by stock-outs; M-F1 of Task 7).

### 6.6 CI (`perf.yml`, Q-PLACE)

A new job `medusa-invariants` in `perf.yml`, `schedule` and `workflow_dispatch` only, with three run steps: `-007` in the two-instance mode, `-008`, `-009`. The steps copy `medusa-multi-instance`'s two-instance start (the `MEDUSA_REDIS=1 MEDUSA_LOCK=redis MEDUSA_SECOND_BASE_URL` env, the same timeouts). Its budget is in §9.

## 7. Oracles and assertions

| Case   | Oracles (on main unless marked NEW)                                                                                                            | Verdict                                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-007` | `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `readOversellSnapshot`, the per-intent order rows (`MED_INTENT_ROWS_SQL`), `classifySplit` (NEW) | PASS: orders ≤ stock, one order per cart, both instances served requests. TEST BUG: an instance with zero requests. FAIL (PRODUCT BUG): oversell or duplicate order. The ghost signal (F-M2, L10) is reported `ghost: true`, never dropped |
| `-008` | `PROMO_SNAPSHOT_SQL`, `readPromoSnapshot`, `MONEY_SNAPSHOT_SQL`, `readMoneySnapshot`, `promoLedgerVerdict` (NEW)                               | PASS: the landed clauses hold; gift-card PENDING. FAIL (PRODUCT BUG): a redemption over the budget or a negative balance                                                                                                                   |
| `-009` | `ORDER_STATE_SQL` (Phase 2), `ORDER_RESERVATIONS_SQL`, `terminalTransitionVerdict` (NEW)                                                       | PASS (X04/X05 counted) when the only double terminal states are the known ones; FAIL (PRODUCT BUG) for any other                                                                                                                           |

**L9:** every iteration logs one intent line and one outcome line; reconciliation by intent must match exactly (no count slack). **L10:** ghost orders (orders no k6 intent explains) are reported with `ghost: true`.

**Pending clauses (D7):** the gift-card clause of `-008` (Later, Phase 2 line 101). Recorded in every verdict as PENDING with its reason.

## 8. Data isolation, cleanup and leak check

- Run prefix in every cart email and order note: `<prefix>-i<n> <intent>`, `<prefix>` as `p6-qa-<run id>-<case>`.
- Cleanup: `medusaCleanupWith` (cancel and archive of the run's orders, 0.33 s each, the 4a finding 7 and Task 7 §8); a two-instance run cleans up through the primary (both share the database).
- Leak check: `leakCheck` (Medusa) on the run prefix after cleanup. **Expected output: 0 rows** in `LEAK_LIVE_ORDERS_SQL`, `LEAK_LIVE_RESERVATIONS_SQL`, `LEAK_PROMOTIONS_SQL`, `LEAK_PRODUCTS_SQL` (the names on main; `LEAK_*` are in `src/medusa/oracle.ts`).

## 9. CI, token scan and budget

Q-PLACE (§13), recommended (a): a new job `medusa-invariants` in `perf.yml`, dispatch and schedule only. The job copies the setup of `medusa-multi-instance` (the two-instance start, same timeouts) but not its job timeout: `medusa-multi-instance` on main has 20 steps and a step-cap sum of 64 against its 45-minute job, so the new job sets its own timeout (75, below) and caps every step it has. Budget for the new job: setup **21** (the `medusa-knee` setup sum, Task 7 §9), start **5** (two backends, the measured 43 s plus a cold image pull), three run steps of **10** each (`-007` 2 min + audit + cleanup of 42 orders at 0.33 s ≈ 14 s; `-008` and `-009` 2 min each), summary 2, scan 2, upload 3, stop 1: **sum 21 + 5 + 30 + 2 + 2 + 3 + 1 = 64** against a job timeout of **75**: margin **11 ≥ 10** ✓. **Confirm in the first CI dispatch** (the copied setup steps' real durations, and the two-instance start on the runner).

Note: `medusa-multi-instance` on main has a step-cap sum of 64 against 45, a negative margin; that is a finding for PRE-2-style work on that job (outside this task, §13 risk R-MI).

The token scan runs before every upload. Permissions `contents: read`.

## 10. Expected output

```text
P6-MED-LOAD-007 instances: primary <r1> requests, secondary <r2> requests; orders <o> ≤ stock <s>; duplicate cart orders 0 → PASS
P6-MED-LOAD-008 promo: redemptions <x> ≤ limit <L>; balances ≥ 0; debits = change; gift-card PENDING (Later, D34) → PASS (gift-card pending)
P6-MED-LOAD-009 terminal: orders <n>, single terminal <s>, X04 <a>, X05 <b>, F-M3 <c> → PASS (X04/X05 counted)
```

Placeholders only.

## 11. Environment changes

None in the repo. For local reruns of two backends, the Medusa database volume must be removed between starts (M10-3, a harness-level reset that CI does not need). Cursor Cloud and Claude Code cloud need no change.

## 12. Build order

| Step | Commit                                                                | Files                                                                                                                                                | Unit tests after the step (B0 1025)    |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1    | `feat(load): add the two-instance split and the instance pick`        | `k6/lib/pure/instance.js`, `src/load/med/instance-split.ts`, `tests/unit/med-instance-split.test.ts` (4), `tests/unit/med-instance-pick.test.ts` (2) | 1031                                   |
| 2    | `feat(load): add the promo ledger and the terminal transition checks` | `src/load/med/ledger.ts`, `src/load/med/cancel-race.ts`, `tests/unit/med-ledger.test.ts` (3), `tests/unit/med-cancel-race.test.ts` (3)               | 1037                                   |
| 3    | `feat(k6): add the medusa invariant cases`                            | `k6/cases/med-load-007.js`, `k6/cases/med-load-008.js`, `k6/cases/med-load-009.js`, `k6/journeys/med-checkout.js`, `src/load/cases.ts`               | 1037 (`k6 inspect` in `npm run check`) |
| 4    | `ci(perf): add the medusa invariants job`                             | `.github/workflows/perf.yml`                                                                                                                         | 1037 (plus `lint:actions`)             |
| 5    | `docs(load): describe the medusa invariants in the readme`            | `README.md`                                                                                                                                          | 1037                                   |

**Expected after the last step: 1037** (B0 1025 + 12). With Task 6 merged first: 1073.

## 13. Risks, proposed extras and open decisions

**Open decisions:**

- **Q-PLACE (Medusa invariant cases).** Options: (a) a new job `medusa-invariants` in `perf.yml` (recommended; `medusa-multi-instance` is already over its cap, §9, and its steps must not grow); (b) a new mode in `knee.yml`; (c) a new workflow. Recommended: **(a)**.
- **Q-RACEPATH (race injection inside k6).** Options: (a) a second request in the same iteration (recommended; simplest, measured in the build's first probe); (b) the Playwright races beside the k6 run (not "inside steady load", so it does not meet the roadmap's wording). Recommended: **(a)**.
- **Q-MEDLOAD014.** The 4a Task 3 plan proposes `P6-MED-LOAD-014` (two-instance knee) on its branch only. It is not used here. Owner: confirm the ID before any Task 3 build.
- **Q-DEFER-GIFT.** The gift-card clause stays PENDING (Later, D34) until a route exists at `MEDUSA_REF`. Recommended: keep it PENDING.

**Proposed extras (new unused IDs):** none needed by this task. (Grep before any new ID: `P6-MED-LOAD-012` and `-013` are unused on main; `-011` is used by Phase 3 Task 8 (`P6-MED-LOAD-011`, shared stock), so it is not reused.)

**Risks:**

- R-MI: `medusa-multi-instance` on main has a step-cap sum of 64 against a 45-minute job (its own margin is negative). Not changed by this task; it needs its own PRE-style plan.
- Two backends share one Redis and one database: a shared failure counts once per instance. The audit reads the database, not the instances.
- Race injection from k6 is new code: its own unit tests (in the step 1 and 2 counts) are the guard.

## 14. Done when (roadmap, made measurable)

Roadmap: "≥ 3 VALID runs per case with clean audits or recorded bugs; pending clauses listed with the reason; `npm run check` green."

Measured: (1) `npm run check` with 1037 tests (1073 with Task 6), `# fail 0`; (2) three VALID `medusa-invariants` dispatches per case, each with `verdict.json` and the per-instance counts for `-007`; (3) the pending clause (gift card) and the counted X04, X05, F-M3 totals listed in each verdict.

## 15. Rule self-check

- **A1 to A5:** plan branch, Conventional Commits, explicit paths, no attribution, environment identity.
- **B7 (probe first):** §3 has M10-1 to M10-7 (M10-8 UNPROBED with reason).
- **B9:** §13 lists four open decisions with recommendations; contradictions: none new (the roadmap's `medusa-smoke` placement is replaced by Q-PLACE).
- **B10:** stop for review (§1).
- **C12:** no assertion is weakened; known bugs are counted under their IDs and never reported as passes.
- **D7 (pending clauses):** the gift-card clause is listed with its reason in §7 and in every verdict.
- **Industry practice:** conservation across replicas and the single terminal state follow the k6 `constant-arrival-rate` docs (Grafana k6) and the Phase 2 race primitives of this repo; the Google SRE book's guidance on separating data growth from leaks is applied to the ledger tables in the soak (Task 7); GitHub `timeout-minutes` is GitHub docs ("Workflow syntax").
- **F (plan self-check):** (a) roadmap "Done when" in §14; (b) names grep-verified in §4 (`src/medusa/oracle.ts` lines 146, 169, 195, 225, 302, 382; `src/medusa/run-money-case.ts` 88; `src/medusa/run-promo-case.ts` 86; `src/load/reconcile/medusa.ts` 165; `src/load/products/medusa.ts` 120, 252); (c) budget in §9 with margin 11; (d) skeletons in §6; (e) no owner answer recorded as given.
