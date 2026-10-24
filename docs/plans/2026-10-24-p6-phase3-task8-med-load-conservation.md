# P6 Phase 3 Task 8: inventory conservation under load (`P6-MED-LOAD-002`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 8", D1, D5, D9.

**Interfaces assumed from the other Phase 3 plans** (must match the merged code at build time, §5 check 3): Task 3 (`LoadCase`, `Stage`, `StageResult`, `runLoad`, `parseK6Summary`, `caseDataPrefix`, `openModelScenario`, `standardOptions`, `runJourney`), Task 4 (`judgeValidity`, `checkReadiness`), Task 6 ([task6](2026-10-24-p6-phase3-task6-load-reconciliation.md): `evaluateMedusaAudit`, `AuditStageConfig`, `composeStages`, `knownBugs["F-M2"]`, counter `p6_orders`), Task 7 ([task7](2026-10-24-p6-phase3-task7-journey-smokes.md): `k6/journeys/med-checkout.js` `runMedCheckout`, `src/load/products/medusa.ts` `medusaSetup`/`medusaCleanup`, `LoadContext.secrets`, the counters `p6_refused_at_line_item`, `p6_refused_at_complete`, `p6_other_status`, the job `medusa-load`).

## 1. Header

- **Task.** Phase 3 Task 8. Case: `P6-MED-LOAD-002` (P0).
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-med-load-conservation`.
- **Base.** `origin/main` = `5acd2a0`, plus Tasks 3 to 7 merged.
- **Harness pin.** Unchanged (single Medusa instance).
- **Environment change.** None.
- **Unit tests.** Baseline = the count after Task 7 (471 + 51 + 43 + 56 + 33 + 16 = **670** on today's base). This plan adds **+17** (§12); expected **687**.
- **Stop for owner review.** Yes (rule 10): `perf.yml` step added; Q1 asks about the stock rule.

## 2. What it proves

- **Stock is conserved when many unique carts check out at a steady rate against a finite stock `S`, and a sold-out variant refuses cleanly.** Over the run: orders ≤ `S`; every unit sold has exactly one reservation and one `reserved` unit; every iteration ends as either an order or a clean 400 refusal; no 5xx; no iteration is dropped by the generator (else the run is INVALID).
- **Finance and healthcare.** The same check as "a credit line or a vaccine stock is never over-allocated when requests keep arriving at a steady rate, and the last requests get a clear refusal instead of an error". The race tasks prove it for a burst; this proves it for a stream.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3, 4 vCPU, 16 GB), k6 2.3.0, Medusa started with `npm run up:medusa`, stopped with `down`. Timings are **VM, proof only**. The journey is the Task 7 checkout (nine requests), with refusals classified by status.

### 3.1 The conservation run (probe item 1)

```text
variant stock S = 15, constant-arrival-rate 1 per second, 30 s, maxVUs from Little's law:
  iterations 31, dropped_iterations 0 (metric absent), peak vus 1 to 3
  orders (200 type=order at complete)                           15
  refused at line item  (400 type "not_allowed", code "insufficient_inventory", message "Some variant does not have the required inventory")      15
  refused at complete   (400 type "not_allowed", message "Not enough stock available for item iitem_… at location sloc_…")                         1
  other status                                                   0       5xx 0
  15 + 15 + 1 = 31 iterations accounted for
database (read-only, prefix-scoped):
  orderCount 15, orderQty 15, reservationQty 15, stocked 15, reserved 15, live orders by email prefix 15
  stocked - reserved = 0 (no negative availability)
```

So with `S = planned / 2` the stock runs out about halfway (iteration 16 sees the first refusal) and the run is still VALID at 1 per second. The refusals come in two clean shapes, **at the line item** (the stock was already reserved by earlier carts) and, once, **at complete** (two carts held the last unit at the same time; the loser gets the 400 at complete). Both are `not_allowed` and neither leaves an order.

### 3.2 Setup and reservation cleanup (probe item 4)

```text
setup (admin login, catalogue, stocked product + variant, price)      5.0 s
cleanup, orders swept with cancelAndArchive                            0.45 s per order (15 orders: 8.0 s; 21 orders: 9.6 s)
customers deleted by prefix (31 customers)                              0.5 s
leak check after cleanup                                               empty (orders, reservations, customers, products)
```

Cancelling an order releases its reservation, so the leak check on `reservation_item` of the variant reads 0 after the sweep (checked by the existing `leakCheck`). The per-order cost bounds the cleanup of this case: `S` orders at about 0.45 s each, 7 s at `S = 15`.

### 3.3 Rate and `dropped_iterations` (probe item 2)

Unchanged from Task 7 §3.2: 1 per second, 0 drops, runner busy 24 to 39 % average; 2 per second drops (4 in 20 s). **Fixed rate 1 per second.** Stock numbers: `S = ceil(planned / 2)`, so `S = 15` for the 30 s profile (31 iterations observed, `planned = 30`) and `S = 5` for the 10 s PR profile (`planned = 10`; at least 10 iterations arrive).

### 3.4 The loser body under load, and the F-M2 mechanism (probe item 3)

- The loser body at line item and at complete is the 400 shown in §3.1. It carries `type` (`not_allowed`) and a message; the classifier of §6.2 keys on `type == "not_allowed"` and on the message containing `inventory` or `Not enough stock`.
- The known ghost-order mechanism (F-M2 and F-M5, labelled in the README "Known product bugs"; Phase 2 closeout 6b) answers a 400 whose message reads `Updating Status from "ok" to "temp_failure" is not allowed.` while an order exists in the database that no checkout returned. It did **not** appear in the probe run (orders in the DB equal the 15 orders the client saw), but the classifier separates it so that, if it appears, it is reported under `F-M2` (Task 6) and not as a conservation failure.
- Known bugs F-M1, F-M3, F-M4 and X04/X05 belong to the cancel and race paths and cannot appear in a checkout-only flow.

### 3.5 What the probe could not confirm ("build-time probe must confirm")

1. The fixed rate (1 per second) VALID on the GitHub runner (three dispatch runs).
2. The 10 s PR profile (`S = 5`): the probe ran the 30 s profile only; the build probes the PR profile once on the VM and expects 5 orders and at least 5 refusals.
3. The `ghost-order` shape under a run longer than 30 s (not planned; Phase 4 re-runs at 50 % of the knee).

## 4. Depends on earlier plans

The interface list above, plus from `main`: `src/medusa/oracle.ts` (`readOversellSnapshot`, `ORDERS_FOR_VARIANT_SQL`, `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`), `src/medusa/run-case.ts` (`createStockedVariant` through `src/medusa/admin.ts`), `src/medusa/invariants.ts`, README "Known product bugs". Task 7 must be merged first (the roadmap says 7).

## 5. Build-time recheck

| #   | Check                    | Command                                                                                                                                                        | Expected                                               |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Base                     | `git fetch origin main && git log -1 --format=%h origin/main`                                                                                                  | descendant of `5acd2a0`                                |
| 2   | Baseline                 | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                            | exit 0, `# tests 670` (or what Task 7 left)            |
| 3   | Task 7 names             | `grep -n "export function runMedCheckout\|export async function medusaSetup\|p6_refused_at_line_item" k6/journeys/med-checkout.js src/load/products/medusa.ts` | all found; otherwise stop and report                   |
| 4   | Known bugs still current | `grep -n "F-M2\|F-M5" README.md docs/BACKLOG.md \| head`                                                                                                       | present; if fixed upstream, drop the classifier branch |
| 5   | Loser bodies             | `npm run up:medusa`; run the case once on the VM (`npm run load:medusa-conservation -- --profile pr`)                                                          | refusals are `400 not_allowed`; 5 orders; 0 other      |
| 6   | Cleanup                  | after the run: the leak check lines in `verdict.json`                                                                                                          | empty                                                  |

## 6. Design

### 6.1 File tree

```text
k6/cases/med-load-002.js                    NEW      scenario + thresholds; calls runMedCheckout(cfg, { classify: true })
k6/cases/med-load-002.example.json          NEW      input for the standalone command (D6)
k6/journeys/med-checkout.js                 CHANGED  refusals classified through classifyRefusal (adds three counters)
k6/lib/pure/refusal.js                      NEW      classifyRefusal(status, type, message) -> "order" | "clean" | "ghost" | "other"
src/load/med-conservation.ts                NEW      judgeConservation(counters, snapshot, stock), conservationStage
src/load/products/medusa.ts                 CHANGED  medusaSetup becomes makeMedusaSetup({ stockFor })
src/load/cases.ts                           CHANGED  + MED_LOAD_002
package.json                                CHANGED  + load:medusa-conservation
.github/workflows/perf.yml                  CHANGED  + LOAD step in medusa-load (Task 7 job)
README.md                                   CHANGED  + case row, standalone command
tests/unit/k6-lib-refusal.test.ts, med-conservation.test.ts, load-products-medusa.test.ts (3 more)    NEW / CHANGED
```

### 6.2 The classifier (`k6/lib/pure/refusal.js`, pure, unit-tested in Node)

```js
/** @returns {"order" | "clean" | "ghost" | "other"} */
export function classifyRefusal(status, type, message) {
  if (status === 200 && type === "order") return "order";
  if (status === 400 && type === "not_allowed") {
    const m = String(message || "");
    if (/Updating Status from ".*" to ".*" is not allowed/.test(m)) return "ghost"; // F-M2 / F-M5 mechanism
    if (/inventory|Not enough stock/i.test(m)) return "clean"; // loser at line item or at complete
  }
  return "other"; // anything else (including every 5xx)
}
```

In `med-checkout.js` the `line item` and `complete` steps call `classifyRefusal(r.status, r.json("type"), r.json("message"))` and add one of three new counters: `p6_refused_clean`, `p6_refused_ghost`, `p6_refused_other` (the Task 7 counters `p6_refused_at_line_item` and `p6_refused_at_complete` stay for the stage split). A `clean` refusal ends the iteration as ok; `ghost` and `other` fail the check (so `checks == 1` is red on a ghost or unknown 4xx/5xx). Case script:

```js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runMedCheckout } from "../journeys/med-checkout.js";
const cfg = loadLoadConfig([
  "baseUrl",
  "publishableKey",
  "regionId",
  "salesChannelId",
  "variantId",
  "prefix",
  "rate",
  "durationSec",
  "maxLatencyMs",
  "stock",
]);
export const options = standardOptions({
  scenarios: {
    journey: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      tags: { case: "P6-MED-LOAD-002", journey: "med-checkout" },
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // 400 is expected, declared through expectStatuses(400) in the journey
});
export default function () {
  runMedCheckout(cfg, { classify: true });
}
```

### 6.3 The conservation judge (`src/load/med-conservation.ts`)

```ts
export interface ConservationCounters {
  iterations: number;
  orders: number;
  refusedClean: number;
  refusedGhost: number;
  refusedOther: number;
  dropped: number;
  status5xx: number;
}
export interface ConservationInput {
  counters: ConservationCounters;
  snapshot: OversellOracleSnapshot;
  stock: number;
}
export interface ConservationFinding {
  check: string;
  ok: boolean;
  kind?: "PRODUCT BUG" | "TEST BUG";
  detail: string;
}

/** Pure. Every line of detail is numbers only. */
export function judgeConservation(i: ConservationInput): {
  findings: ConservationFinding[];
  knownBugs: Record<string, number>;
};
```

Checks, in order:

1. `iterations-accounted`: `orders + refusedClean + refusedGhost + refusedOther == iterations` (an iteration whose last step failed for another reason is counted by the k6 `checks`, so this reads `iterations == completed + failedChecks`; use the `iterations` and `checks` metrics of `parseK6Summary`). Mismatch → `TEST BUG: iterations not accounted`.
2. `stock-exhausted`: `iterations > stock` and `snapshot.orderCount == stock`. If `orderCount < stock` the run never exhausted the stock and proved nothing → `TEST BUG: stock never ran out (orders N of S)`; the numbers come from the profile, so this means the rate or `S` is wrong.
3. `orders-le-stock`: `orderCount ≤ stock` and `orderQty ≤ stock` → else `PRODUCT BUG: oversold, N orders for stock S`.
4. `reservations-match`: `reservationQty == orderQty` and `snapshot.reserved == reservationQty` → else `PRODUCT BUG`.
5. `client-matches-db`: `snapshot.orderCount == counters.orders`. `orderCount > counters.orders` is **not** a violation: it goes to `knownBugs["F-M2"] = difference` (the Task 6 rule). `orderCount < counters.orders` → `PRODUCT BUG: client saw an order the database lacks`.
6. `clean-refusals-only`: `refusedOther == 0` and `status5xx == 0`; otherwise `PRODUCT BUG: N unclassified refusals / 5xx`. `refusedGhost > 0` is reported under `knownBugs["F-M2"]` as well (the response side of the same mechanism), not as a violation.
7. `no-drops`: `dropped == 0`; otherwise not a finding here: Task 4's validity makes the run INVALID.

`conservationStage` is the case's `reconcile` stage extension: it runs after Task 6's `evaluateMedusaAudit` through `composeStages` (the audit checks the money and the generic stock; this stage adds the stream-specific checks). It reads `k6-main-summary.json` through `parseK6Summary` and `readOversellSnapshot`.

### 6.4 The case and the setup change

```ts
// src/load/cases.ts
export const MED_LOAD_002: LoadCase = {
  id: "P6-MED-LOAD-002",
  title: "Inventory conservation under constant-arrival checkouts",
  product: "medusa",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 4000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/med-load-002.js", env: {} }],
  stages: {
    setup: makeMedusaSetup({ stockFor: (planned) => Math.ceil(planned / 2) }),
    reconcile: composeStages([medusaAuditStage, conservationStage]),
    cleanup: medusaCleanup,
  },
};
```

`makeMedusaSetup({ stockFor })` replaces Task 7's fixed `planned + 20` (Task 7 passes `stockFor: (planned) => planned + 20`): one extra parameter, one changed call site, +1 test (§12). `ctx.config.stock` and `ctx.config.audit.stock` get `stockFor(planned)`.

## 7. Oracles and assertions

| Level                      | Assertion                                                                                                                             | If it fails                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| per response (k6 `checks`) | each step 200, or the documented clean 400 at line item or complete; `complete` 200 means `type == "order"`                           | `checks` red → the verdict lists the failing check  |
| per response               | no 5xx (`http_req_failed == 0` with 400 declared expected)                                                                            | PRODUCT BUG with the status counts                  |
| post-load (judge, §6.3)    | orders ≤ `S`; orders == `S` (stock did run out); reservations == orders == `reserved`; client orders == DB orders; refusals all clean | PRODUCT BUG or TEST BUG as listed                   |
| validity (Task 4)          | `dropped_iterations == 0`, VUs below the cap, runner not saturated                                                                    | INVALID, never FAIL, never hides a correctness FAIL |

**PRODUCT BUG vs TEST BUG.** Oversell, reservation mismatch, a client-seen order missing from the database, a 5xx and an unclassified refusal are PRODUCT BUG (evidence: `audit.json` counts, the k6 status counts, the loser message). A wrong `S`, a stock that never ran out, an iteration count that does not add up, a setup or cleanup failure are TEST BUG. F-M2 ghost orders are counted, never failed (Task 6 Q2). There is no `test.fail()` in this task: no new bug was proven by the probe. If a build run shows oversell, rule 13 applies: repeat, label SUSPECTED, report; do not write a labelled expected-failure without the owner's label.

## 8. Data isolation, cleanup, leak check

- Prefix `caseDataPrefix(runPrefix, "p6-med-load-002")`; every order email, product handle and customer email starts with it.
- Cleanup (Task 7's `medusaCleanup`): orders by email prefix (`cancelAndArchive`, which releases reservations), product, customers by prefix, `leakCheck(pool, likePrefix, [inventoryItemId])`. Cost is `S` orders × 0.45 s (7 s at `S = 15`).
- The variant exists only for this case (own stock `S`), so the conservation numbers cannot be touched by another case in the same job.

## 9. Token scan

New artefacts: none beyond Task 7's; `audit.json` and `verdict.json` carry counts and ids only (`ConservationFinding.detail` is built from numbers; a unit test passes it through `findHits`). The admin token lives in `ctx.secrets` and the publishable key is not written to `verdict.json`. The job step scans `results/load` before the upload.

## 10. CI budget

Convention: worst case = slowest green job + additions at their caps, at least 10 minutes under the timeout, no timeout raised. Per Task 7 §10, the Medusa LOAD steps run in the new job `medusa-load` (timeout 45; Q1 of Task 7). This plan's step estimate: VM full-profile time `5 + 30 + 1 + 7 (cleanup of 15 orders) + 0.5 + 5 (token scan, summary)` = about 50 s, ×2 for the runner = **1.7 min**; Task 7 reserved 2.4 min for it.

| Job                                                | Slowest green (min)                                         | This plan's addition                                  | Worst (min)                        | Timeout | Margin          |
| -------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- | ------- | --------------- |
| `medusa-load` (Task 7 proposal)                    | 16.7 reserved with all three Medusa LOAD steps (Task 7 §10) | step cap 6 min on `main`, 4 on PRs (use 2.4 reserved) | 16.7 (estimates); **31.0** at caps | **45**  | **14.0** (caps) |
| `medusa-smoke` (if Task 7 Q1 answers "no new job") | 26.2                                                        | 1.7 + Task 7's 1.9 + install 3.0 = 32.8               | 32.8 (Tasks 7+8 only)              | 45      | 12.2            |

Step: `LOAD P6-MED-LOAD-002 (functional load, not capacity)`, `timeout-minutes: ${{ github.event_name == 'pull_request' && 4 || 6 }}`, run `npm run load:medusa-conservation -- --profile pr|full`, INVALID → `::warning::` (exit 3 mapped to 0, same wrapper as Task 7), then the existing token scan and upload `load-medusa` (the artefact directory is per case: `results/load/P6-MED-LOAD-002`). Trials: none (not a race). No timeout is raised.

## 11. Environment changes

None. Cursor Cloud and Claude Code cloud already have k6 (Task 3), Docker and Node. Nothing by hand.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-med-load-conservation origin/main` (after Task 7 is merged). Counts relative to B (670 today).

| Step | Commit subject                                                            | `git add` paths                                                                           | `npm run check` expected           |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| 0    | `docs(plans): bring the phase 3 task 8 plan onto the build branch`        | `docs/plans/2026-10-24-p6-phase3-task8-med-load-conservation.md`                          | exit 0, B                          |
| 1    | `feat(k6): classify medusa checkout refusals`                             | `k6/lib/pure/refusal.js tests/unit/k6-lib-refusal.test.ts`                                | exit 0, **B + 6**                  |
| 2    | `feat(k6): count clean, ghost and other refusals in the checkout journey` | `k6/journeys/med-checkout.js k6/cases/med-load-002.js k6/cases/med-load-002.example.json` | exit 0 (`k6 inspect` ok), B + 6    |
| 3    | `feat(load): judge stock conservation after a stream of checkouts`        | `src/load/med-conservation.ts tests/unit/med-conservation.test.ts`                        | exit 0, **B + 16**                 |
| 4    | `refactor(load): let the medusa setup take its stock rule`                | `src/load/products/medusa.ts tests/unit/load-products-medusa.test.ts`                     | exit 0, **B + 17**                 |
| 5    | `feat(load): register the inventory conservation case`                    | `src/load/cases.ts package.json`                                                          | exit 0, B + 17                     |
| 6    | `ci(perf): run the inventory conservation load in medusa-load`            | `.github/workflows/perf.yml`                                                              | exit 0 (actionlint silent), B + 17 |
| 7    | `docs: document the inventory conservation load case`                     | `README.md`                                                                               | exit 0, B + 17                     |

New unit tests, by name (17): `k6-lib-refusal` (6: 200 order; clean at line item; clean at complete; ghost message; unknown 400 → other; 500 → other); `med-conservation` (10: clean run passes; oversold; reservations differ from orders; `reserved` differs from reservations; client sees an order the DB lacks; DB has an order the client never saw → `knownBugs["F-M2"]` and not a violation; stock never ran out → TEST BUG; unaccounted iterations → TEST BUG; unclassified refusal and 5xx → PRODUCT BUG; detail strings pass `findHits`); `load-products-medusa` (+1: `stockFor` decides the variant's stock and `ctx.config.stock`). Sum 6 + 10 + 1 = **17**. Cumulative: step 1 +6; step 3 +10 → B+16; step 4 +1 → B+17.
Before step 6 run the case once on the VM (`npm run up:medusa`; `npm run load:medusa-conservation -- --profile pr`; `npm run down:medusa`): expect 5 orders, at least 5 refusals, verdict PASS.
After step 7: `git push -u origin feat/<build date>-p6-med-load-conservation`, `gh pr create` (rule A3), read CI once (rule 15), one `workflow_dispatch` on `main` after merge. Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                                        | Mitigation                                                                                |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R1  | Generator saturation on the shared runner                   | INVALID, not FAIL (Task 4); rate recorded; three dispatch runs before merge               |
| R2  | The loser message text changes in a Medusa update           | the classifier has a unit test per shape; an unknown 400 is "other" and fails loudly      |
| R3  | `S` too high for the PR profile so the stock never runs out | `S = ceil(planned / 2)` per profile; the judge reports TEST BUG if it did not run out     |
| R4  | A 5xx that is a harness environment issue                   | label ENV with the `medusa.log` evidence; the preflight (Task 4) stops a sick stack first |
| R5  | Cleanup of `S` orders is slow                               | 0.45 s per order measured; the cleanup step is inside the step timeout                    |

**Contradictions with the roadmap.** None. Roadmap mention "Re-run at 50 % of the knee in Phase 4 (D1)": this plan fixes 1 per second (half the first dropping rate, 2 per second), which is the same rule; the Phase 4 knee probe may change it.

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-MED-LOAD-011`: the same stream with two variants of one inventory item (shared stock), proving the refusal arrives at the item level and not per variant.
- `P6-X-LOAD-018`: an optional `--stock` flag on `run-load.ts` to override `S` for local probes (not used in CI).

**Open questions for the owner.**

- **Q1.** `S = ceil(planned / 2)` (about half of the arrivals get a refusal) or a different ratio?
- **Q2.** Should `F-M2` ghost orders fail the conservation run once the bug is fixed upstream (today: counted only)? Same question as Task 6 Q2; answer once for both.
- **Q3.** PR profile 10 s with `S = 5` is enough, or should PRs also use 30 s (+20 s per PR)?

## 14. Done when (roadmap, made measurable)

- [ ] `P6-MED-LOAD-002` VALID and green on the PR and once on `main`: `verdict.json` outcome `PASS`, orders equal `S`, all refusals clean, no 5xx, `dropped_iterations` 0.
- [ ] `audit.json` and the conservation findings are in the artefact `load-medusa` after a clean token scan; the job summary shows orders, refusals and `knownBugs`.
- [ ] A proven product bug, if the run finds one, is recorded with repeated evidence (rule 13) and reported, not hidden.
- [ ] `npm run check` exit 0 with **B + 17** (687 on today's base); no job timeout raised; every new step has `timeout-minutes`.

## 15. Rule 20 self-check

- (a) Done-when in §14; gaps: the rate on the runner and the PR profile (§3.5), settled by the VM PR-profile run (step 6 prerequisite) and three dispatch runs.
- (b) Existing names grepped at `5acd2a0`: `src/medusa/{oracle,run-case,invariants,admin}.ts` functions in §4, README "Known product bugs", `perf.yml` jobs. NEW: `classifyRefusal`, `judgeConservation`, `conservationStage`, `makeMedusaSetup`, `MED_LOAD_002`, `load:medusa-conservation`. Names from Tasks 3 to 7 are checked at build time (§5 check 3).
- (c) CI time: §10.
- (d) Skeletons: §6. Steps with `git add` paths and expected counts: §12.
- (e) No owner answer is recorded.
