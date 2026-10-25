# P6 Phase 4 Task 3: Medusa checkout-journey knee (`P6-MED-LOAD-004`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 3", D2, D3, D13, D16. Method:
[2026-10-25-p6-phase4-task1-breakpoint-method.md](2026-10-25-p6-phase4-task1-breakpoint-method.md) (Task 1, **must be merged first**).
The workflow file `knee.yml` is created by [Task 2](2026-10-25-p6-phase4-task2-cal-knee.md); this plan adds a job to it. The p95
reference comes from Phase 3 Task 11 ([2026-10-25-p6-phase3-task11-closeout.md](2026-10-25-p6-phase3-task11-closeout.md)).

**Paths.** Every path is a path on `main` after the Phase 3 stack and Phase 4 Task 1 have merged. Paths created by Task 1 are marked
"(Task 1)", by Task 2 "(Task 2)", by Task 11 "(Task 11)". Phase 3 Task 10 paths are marked "(Phase 3 Task 10, merging)".

## 1. Header

- **Task.** Phase 4 Task 3. Case: `P6-MED-LOAD-004` (P0).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-med-knee`.
- **Base.** `origin/main` after Task 1 (and Task 11 for the p95 reference; Task 2 only for `knee.yml`, §6.6).
- **Harness pin.** Unchanged. **Environment change.** None.
- **Unit tests.** B3 = count on `main` when the build starts (Task 1 adds +61; Task 2, if merged, +12). This plan adds **+8** (§12);
  expected B3 + 8.
- **Stop for owner review.** Yes (rule 10): a job in the new CI workflow `knee.yml`.

## 2. What it proves

Where the Medusa checkout flow (browse, cart, line item, address, shipping, payment, complete) saturates, as a step range between two
arrival rates, with stock high enough that a stock-out never ends the run, so a refusal is never read as saturation, and the first
resource that gave. The harness runs Medusa as the production build with the in-memory lock and the fake Redis (the harness default),
one backend, Postgres in Docker; the label of every result says so.

- **Finance and healthcare.** Where a checkout, or a payment-initiation flow, saturates and why, separated from business refusals.

## 3. Live probe evidence

Probe date 2026-10-25 (UTC). Cloud VM (Node v22.23.3, 4 vCPU, 16 GB), k6 2.3.0, harness v0.2.15, Medusa at `MEDUSA_REF` `f677db43`
started with `npm run up:medusa` (build already present: 6.1 s from spawn to HTTP 200; 35 s from a fresh database volume), later
stopped with `down`. The ramp ran through the real runner (`runLoad`, `makeMedusaSetup`, `medusaCleanup`, the post-load audit and the
sampler) with a scratch k6 script and a scratch case in the scratchpad; nothing in the repo was edited or committed. The admin
password was generated for the probe (`openssl rand -hex 16`), kept outside the repo, never printed. **VM timings prove that a step
works; no number below is a target or a published value.**

### 3.1 Orders per step; the stock to size (roadmap probe item 1)

The scratch ramp: start 0.5, step 0.5 journeys per second, hold 30 s, ramp 2 s, six steps planned, stock 2,000, smoke p95 taken as
250 ms so the stop is at 2,500 ms, k6 abort with `delayAbortEval` 10 s. **k6 accepts only whole numbers as `target` and `startRate`**
("cannot unmarshal number 0.5 into … target of type int64", probed), so a rate below one per second needs a longer `timeUnit`; with
`timeUnit: "10s"` and targets 5, 10, 15, … k6 started an iteration every 2.0 s at 0.5 per second and every 0.67 s at 1.5 per second
(probed on `/health`, timestamps 2.0, 4.0, … 20.0, then 21.2, 22.0, 22.7, …). Task 1's plan must use that unit (refinement R1 there).

```text
run 1                                                                                     run 2
step rate  started/planned  http p95  iter p50 / p95   errors  app cores  db act/total  RSS    step  started/planned  http p95  iter p50 / p95  app cores
0   0.5/s   15/15           394 ms    1.49 s / 1.77 s  0/135   0.82       1.0 / 7       456    0     15/15            457 ms    1.75 s / 1.92 s 0.92
1   1.0/s   30/30           876 ms    3.38 s / 3.87 s  0/270   1.20       1.1 / 11      576    1     30/30            1954 ms   5.53 s / 10.6 s 1.21
2   1.5/s   21/45           2788 ms   8.75 s / 9.91 s  0/106   1.24       1.2 / 11      764    2     12/45            2662 ms   (cut)           1.25   <- stop (p95 >= 2500)
exit 99 in both; k6 stopped 6 to 14 s into step 2; steps 3 to 5 never started
orders: 54 completed of 70 started (run 1), 45 of 61 (run 2); k6 `vus_max` 20 of 20 pre-allocated; dropped_iterations 0
```

- **The knee on the VM is between 1.0 and 1.5 journeys per second, twice.** Run 2's last clean step was close to the limit (p95
  1,954 ms of 2,500); the spread between runs is real, so the report is a range and the plan takes at least three runs.
- **Orders per step** = `rate x hold`: 15, 30, 45, …, 120 (at 4.0/s). **Stock rule:** `S = ceil(1.05 x sum over the planned steps of
rate x hold) + 20`. The default plan (start 0.5, step 0.5, hold 30 s, 8 steps = 0.5 … 4.0 per second) has `sum = 30 x (0.5+…+4.0)` =
  540 orders, `S = 587`. The run stops far earlier (about 60 to 70 started), so the stock is never in play. `createStockedVariant` takes
  any `S`; the seed had `stocked_quantity` in the millions elsewhere, no cap was met.
- **Which request moves p95.** From the points file, p95 per request name at step 1: `POST /store/carts/:id/shipping-methods` 3,809 ms,
  `POST /store/carts/:id` 2,044 ms, `POST /store/carts/:id/complete` 1,946 ms, `POST /store/carts/:id/line-items` 1,362 ms; at
  step 0 the same four lead (537, 433, 381, 299 ms). Every cart mutation slows together: the process, not one route.
- **Application CPU is above one core already at the last clean step** (1.20 cores at 1.0 per second; 0.82 to 0.92 at 0.5 per second).
  A fixed level of 0.9 cores would name `app_cpu` at step 0 although p95 is 394 ms. Task 1's rule therefore also needs the run-relative
  level (0.85 of the run's peak cores, floor 0.9): step 0 (0.82, 0.92) is below 0.85 x 1.25 = 1.06 and step 1 (1.20) is above it. Refinement
  R2 of Task 1; Cal (0.94 / 0.97 at its last clean step against a peak of 1.08) and the burn stub fit the same rule.
- **Database.** `db.active` 1.0 to 1.2, `db.total` 7 to 11 of `max_connections` 100, waits 0 of 26 samples in clean steps (1 of 26 once),
  no lock waits; the health probe 4 to 31 ms. Postgres is not the limit.
- **Generator headroom.** k6 0.02 cores average (max 0.04); runner busy 35.6 % average (max 51 %); available memory never under 90 %.
  Peak VUs 20 of 20 pre-allocated (the iteration takes 1.5 to 9 s, so `rate x iteration` is up to 14). The plan pre-allocates 40 and caps
  at 120.

### 3.2 The harness Medusa mode (probe item 2)

Default: the production build, the in-memory lock provider and the harness fake Redis (`MEDUSA_REDIS` and `MEDUSA_LOCK` unset; harness
README, `docs/adr/0001-medusa-fake-redis.md`), one backend (`MEDUSA_SECOND_BASE_URL` unset). The knee runs in that mode and the
report's `environment` line says "Medusa production build, in-memory lock, fake Redis, one backend". A Redis-lock or two-backend knee
is a different measurement (proposed extra `P6-MED-LOAD-011`).

### 3.3 DB growth per run and cleanup (probe item 3)

```text
fresh volume:           pg_database_size 19.68 MB
after run 2 (46 orders, 61 carts, cleanup done):   23.89 MB      -> +4.21 MB, about 91 KB per order
orders after cleanup:   46 rows, status "archived" (cancelAndArchive); reservation_item rows 46, all soft-deleted (0 live);
                        inventory_level.reserved_quantity 0 for the case variant
cleanup time:           17.2 s and 16.0 s for 54 and 45 orders (0.32 to 0.37 s each, sequential, `cancelAndArchive`), customers 0.5 s
setup time:             6.7 to 6.8 s (admin login, seed check, product with stock S)
k6 step:                75 to 81 s for the stopped ramp
```

At the default plan's worst case (587 orders) cleanup takes about 3.3 minutes and the database grows by about 53 MB, both fine for a
job that starts from a fresh database. Cleanup is sequential, as Phase 3 built it; no concurrency is added (not needed for the
budget, §9).

### 3.4 What `ghost` and refusal responses look like here

No refusal and no 5xx occurred (stock was ample): `p6_nonconflict_error` would have been 0; the Medusa log held 6 lines matching
`error` and 0 lines with a 5xx status. The classifier of Task 1 still treats an inventory 400 (`not_allowed`, "Not enough stock" /
"insufficient inventory") as a conflict and anything else as an error; a ghost `Updating Status from … is not allowed` 400 (the F-M2
signature) is an error here and is also counted by the audit under `F-M2`.

### 3.5 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. The knee on the GitHub runner: **UNPROBED**. The default plan's top (4.0/s) is 2.7 times the VM's upper bound; no stop makes the run
   INVALID (`no_knee`) and the dispatch is repeated with other inputs.
2. The Redis-lock and two-instance modes (not part of this case).
3. The `db_cpu` source on the runner (the VM's `/sys/fs/cgroup` is `tmpfs`; Task 1 §3.8).
4. Job time on the runner (§9 estimate is from `medusa-load` run 40141809613 and the VM).

## 4. Depends on earlier plans

Task 1 (plan): `kneeOptions`, `beginKneeIteration`, `observeKneeResponses`, `kneeHooks`, `buildKneePlan`, `kneeStage`,
`kneePlanFromInputs` (`src/load/knee/plan-input.ts`), `K6RunSpec.knee`, `K6RunSpec.allowExits`, the reconcile slack for interrupted
iterations. Task 2 (plan): `.github/workflows/knee.yml`. Task 11 (plan): `k6/thresholds/smoke-p95.json`, `parseSmokeBaseline`,
`smokeP95For`. On `main` after Phase 3: `k6/journeys/med-checkout.js` (`runMedCheckout`), `k6/cases/med-load-001.js`,
`src/load/products/medusa.ts` (`makeMedusaSetup`, `medusaSetupWith`, `medusaCleanup`), `src/load/reconcile/medusa.ts`,
`src/medusa/oracle.ts` (`readOversellSnapshot`, `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `leakCheck`), `src/medusa/admin.ts`
(`createStockedVariant`, `cancelAndArchive`), `.github/workflows/perf.yml` (`medusa-load` job as the template).

## 5. Build-time recheck

| #   | Check              | Command                                                                                                                                                                            | Expected                                                                                                    |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Base               | `git fetch origin main && git log --oneline origin/main \| grep -c "knee"`                                                                                                         | Task 1 merged (≥ 1)                                                                                         |
| 2   | Baseline           | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                | exit 0; `# tests` = B3                                                                                      |
| 3   | Names              | `grep -n "export function kneeOptions" k6/lib/knee.js; grep -n "export const makeMedusaSetup" src/load/products/medusa.ts; ls .github/workflows/knee.yml`                          | all found; if `knee.yml` is missing build it with the job of §6.6 and note it in the PR (Task 2 not merged) |
| 4   | p95 reference      | `node -e` read of `k6/thresholds/smoke-p95.json` for `P6-MED-LOAD-001` (§6.5)                                                                                                      | present, `n >= 3`                                                                                           |
| 5   | Fractional rates   | the 10 s `timeUnit` probe of §3.1 on `/health`                                                                                                                                     | an iteration every 2.0 s at 0.5 per second                                                                  |
| 6   | The case runs once | `export MEDUSA_ADMIN_EMAIL=admin@qa.local MEDUSA_ADMIN_PASSWORD="$(openssl rand -hex 16)"`; `npm run up:medusa`; `npm run load:medusa-knee -- --profile pr`; `npm run down:medusa` | exit 0 or 3, `knee-report-main.md` written                                                                  |

## 6. Design

### 6.1 File tree

```text
k6/cases/med-load-004.js                  NEW      knee script (Task 1 library + runMedCheckout)
k6/cases/med-load-004.example.json        NEW      example config for a standalone run
src/load/knee/med-stock.ts                NEW      stockForKnee(plan)
src/load/cases.ts                         CHANGED  + MED_LOAD_004
package.json                              CHANGED  + load:medusa-knee
.github/workflows/knee.yml                CHANGED  + job medusa-knee (created by Task 2)
README.md                                 CHANGED  + "Medusa knee" section after the runs exist (§12 step 6)
tests/unit/med-knee-stock.test.ts, load-cases-med-knee.test.ts   NEW
```

No change to `k6/journeys/med-checkout.js`: it already uses `request()` (hooked by Task 1's observer), `expectStatuses(400)`, and the
iteration index only for the email.

### 6.2 Stock sizing (`src/load/knee/med-stock.ts`, NEW)

```ts
import type { KneePlanSpec } from "../types.ts";

/** ceil(1.05 x sum of rate x holdSec over the steps) + 20: more units than the plan can order, so a stock-out never ends a run. */
export function stockForKnee(p: KneePlanSpec): number {
  let sum = 0;
  for (let i = 0; i < p.maxSteps; i += 1) sum += (p.startRate + i * p.stepRate) * p.holdSec;
  return Math.ceil(sum * 1.05) + 20;
}
```

Rates are floating (0.5 steps); the sum is computed in whole tenths to avoid float noise:
`Math.round(rate * 10)` per step, divided by 10 at the end. Unit test: the default plan gives 587.

### 6.3 The knee script (`k6/cases/med-load-004.js`, NEW)

```js
// P6-MED-LOAD-004: Medusa checkout knee (plan Phase 4 task 3). Standalone, against a Medusa stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/med-load-004.example.json k6 run k6/cases/med-load-004.js
import { loadLoadConfig } from "../lib/config.js";
import { beginKneeIteration, kneeHooks, kneeOptions, observeKneeResponses } from "../lib/knee.js";
import { buildKneePlan } from "../lib/pure/knee.js";
import { runMedCheckout } from "../journeys/med-checkout.js";

const cfg = {
  startRate: 0.5,
  stepRate: 0.5,
  holdSec: 30,
  rampSec: 2,
  maxSteps: 8,
  smokeP95Ms: 300,
  pre: 40,
  max: 120,
  delayAbortEvalSec: 10,
  baseUrl: "http://127.0.0.1:9000",
  publishableKey: "pk_placeholder",
  regionId: "reg_placeholder",
  salesChannelId: "sc_placeholder",
  variantId: "variant_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-004",
  ...loadLoadConfig([]),
};
const plan = buildKneePlan(cfg);
export const options = kneeOptions({
  ...cfg,
  plan,
  exec: "journey",
  tags: { case: "P6-MED-LOAD-004", journey: "med-checkout" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("medusa");
export function journey() {
  beginKneeIteration(plan);
  runMedCheckout(cfg);
}
```

`kneeOptions` converts the decimal rates to whole targets per `timeUnit: "10s"` (Task 1, R1), so `startRate: 0.5` is `5` per 10 s.
Defaults equal `k6/cases/med-load-004.example.json` so `k6 inspect` works without a config.

### 6.4 The case (`src/load/cases.ts`, CHANGED)

```ts
export const MED_LOAD_004: LoadCase = {
  id: "P6-MED-LOAD-004",
  title: "Medusa checkout journey knee: held ramping-arrival-rate steps",
  product: "medusa",
  label: "knee range, environment-bound",
  profiles: {
    pr: { rate: 0.5, durationSec: 102, maxLatencyMs: 10000 }, // 3 steps (0.5, 1.0, 1.5/s) x 10 s hold + ramps: a smoke of the machinery
    full: { rate: 0.5, durationSec: 256, maxLatencyMs: 10000 }, // 8 steps x 32 s
  },
  telemetry: { product: "medusa" },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/med-load-004.js",
      env: {},
      allowExits: [0, 99],
      knee: { ...kneePlanFor(ctx), smokeP95Ms: ctx.config.smokeP95Ms as number, maxVUs: 120 },
    },
  ],
  stages: {
    setup: makeMedusaSetup({ stockFor: (_planned, ctx) => stockForKnee(kneePlanFor(ctx)) }),
    reconcile: composeStages([kneeStage, reconcileStage]),
    cleanup: medusaCleanup,
  },
};
```

`makeMedusaSetup`'s `stockFor` currently takes only `planned` (`src/load/products/medusa.ts`); the change adds the context as a second
argument (`stockFor: (planned: number, ctx: LoadContext) => number`) so the knee can size from its plan. The two existing callers ignore
the second argument. The setup stage also reads `smokeP95Ms` (Task 11's file, key `P6-MED-LOAD-001`; missing file: `ENV: smoke p95
reference missing`, no default number in code) into `ctx.config.smokeP95Ms`. `kneePlanFor(ctx)` (Task 1) reads the dispatch inputs through
`kneePlanFromInputs` with the defaults `{ startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 2, maxSteps: 8 }` on `full` and
`{ 0.5, 0.5, 10, 2, 3 }` on `pr`. `reconcileStage` is the Medusa audit with the interrupted slack (Task 1): `orders-le-stock`,
reservations consistent (`RESERVATION_QTY_SQL` / `INVENTORY_LEVEL_SQL` through `readOversellSnapshot`), `available >= 0`, one payment per
order, balances, and `no-ghost-orders` where a difference within `interrupted` is not counted under F-M2. `package.json`:
`"load:medusa-knee": "node scripts/load/run-load.ts --case P6-MED-LOAD-004"`; `CASES` gets the entry.

### 6.5 The p95 reference

The stop limit is `10 x cases["P6-MED-LOAD-001"].medianP95Ms` from `k6/thresholds/smoke-p95.json` (Task 11). The smoke journey and this
journey are the same nine requests, so the references are comparable; the report prints the ratio `step 0 p95 / smoke median` and a
warning above 2 (a different machine class, not a failure). The VM's step-0 p95 (394 to 457 ms) against the one CI example
(235.5 ms from a push run, Task 11 plan §3.1) is the reason the reference must come from the same environment class: the runner.

### 6.6 The workflow job (`.github/workflows/knee.yml`, CHANGED)

Add job `medusa-knee` after `cal-knee`, `timeout-minutes: 60`, `runs-on: ubuntu-24.04`, the env of the `medusa-load` job in `perf.yml`
(`P6_WORKING_DIRECTORY`, `PRODUCTS_ROOT`, `MEDUSA_CHECKOUT_PATH`, `MEDUSA_BASE_URL`, `MEDUSA_DB_URL`, `MEDUSA_ADMIN_EMAIL`,
`MEDUSA_SKIP_STOREFRONT`, `COREPACK_ENABLE_STRICT`) plus `KNEE_START_RATE`, `KNEE_STEP_RATE`, `KNEE_HOLD_SEC`, `KNEE_MAX_STEPS` from the
workflow inputs, and the same steps as `medusa-load` up to and including "Start Medusa (harness up)" (checkout, Medusa fork checkout and
HEAD check, stub harness roots, setup-node, `npm ci`, k6 install, corepack and pnpm, pnpm store cache restore, Medusa dependencies,
build cache restore with key `${{ runner.os }}-medusa-build-${{ env.MEDUSA_REF }}-h0.2.15`, the CI admin password, image pull). Then:

```yaml
- name: Knee P6-MED-LOAD-004 (knee range, environment-bound)
  timeout-minutes: 15
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    status=0
    npm run load:medusa-knee -- --profile full || status=$?
    if [ "$status" -eq 3 ]; then echo "::warning::knee run INVALID (see the job summary)"; status=0; fi
    exit "$status"

# then: Job summary (knee table), Token scan, upload artefact knee-medusa, Stop Medusa (harness down, if: always())
```

Caches are restored here, never saved (`medusa-smoke` saves them on `main`). `MEDUSA_REF` in the workflow `env` is the same SHA as
`perf.yml` and `scripts/bootstrap.sh`; the "Verify Medusa fork HEAD" step fails the job on a mismatch. The job runs on `workflow_dispatch`
and the Saturday cron only (D16), never on pull requests. Every action is pinned by SHA exactly as in `perf.yml`.

## 7. Oracles and assertions

(1) The **post-load audit** (Phase 3 Task 6 plus Task 1's slack): orders <= stock S, reservation rows consistent with live orders and
`inventory_level.reserved_quantity` (`readOversellSnapshot`), `available >= 0`, one payment per order, money balances, no ghost orders
beyond the interrupted slack (counted under `F-M2`, never hidden). (2) The **leak check** after the cleanup sweep (`leakCheck`). (3) The
**knee contract**: a KNEE report with a range between two steps and the D2 stop reason, or NO_KNEE/INVALID with its reason. (4)
**Supply**: `S >= planned` is asserted before load; a 400 `not_allowed` stock refusal is a TEST BUG (S too small) and is counted as a
conflict, not an error.

**PRODUCT BUG vs TEST BUG.** Oversell (`orders > S`), an order without payment, a reservation that disagrees with live orders, a 5xx
before the rule trips, or ghost orders beyond the slack would be `PRODUCT BUG (SUSPECTED)` with the run link, labelled only by the
owner after repeated full-count runs (rule 13). Stock too small, a plan that ends without a stop, a stale config or an audit mismatch
within the slack are TEST BUG or INVALID. **No `PRODUCT BUG (SUSPECTED)` was found by this probe** (0 5xx, orders = completed
iterations, reservations released on cleanup). No expected-failure marker, no skip.

## 8. Data isolation, cleanup, leak check

Prefix: `caseDataPrefix(runPrefix, "P6-MED-LOAD-004")`; customers `iterationId(prefix, n)@qa.local`; the product and inventory item are
made by the setup and removed by the cleanup. Cleanup (`medusaCleanupWith`): live orders found by the database (`LEAK_LIVE_ORDER_IDS_SQL`),
`cancelAndArchive` each, then the product, then customers by prefix; a failure is a TEST BUG line and the sweep continues; `leakCheck`
last. Carts are not deleted by the admin API; they stay (61 carts after the probe) and the Medusa database is dropped with the job. The
token scan runs in the `tokenScan` stage and in the workflow step.

## 9. CI, token scan, budget

Job `medusa-knee`, own timeout **60 minutes**, `workflow_dispatch` and Saturday only. Estimate (warm caches) from `medusa-load` run
40141809613: checkout and install 12 s, caches and Medusa install 13 s, image pull 14 s, `up:medusa` 26 s = **about 1.1 min**; knee step
about 1.5 to 2.5 min of k6 (it stops near step 2 or 3) plus setup 7 s, audit 1 s, cleanup 0.35 s per order (60 to 120 orders: 0.4 to
0.7 min); summary, scan, upload, `down` about 1 min. **Estimate 4 to 6 min.**

| Step                           | `timeout-minutes` | Estimate (min)                                   | Stop rule (80 %)    |
| ------------------------------ | ----------------- | ------------------------------------------------ | ------------------- |
| setup steps up to image pull   | 1 to 8 each       | 0.7                                              | per step            |
| `up:medusa` (harness)          | 10                | 0.5 (cold build 8)                               | 8                   |
| **knee step**                  | **15**            | 3.0 (cleanup of 587 orders, worst: 3.3 + k6 4.3) | **12**              |
| summary / scan / upload / down | 2 / 2 / 3 / 5     | 1                                                | 1.6 / 1.6 / 2.4 / 4 |

Worst case at caps (`up` cold build 10 + knee 15 + the post steps and warm setup, three cache-restore allowances): **about 40 minutes**;
timeout 60, **margin 20**. If the first dispatch shows the knee step above 12 minutes (80 % of 15), the fix is a shorter hold or fewer steps,
never a higher timeout. No existing job changes; no existing timeout is raised. Each dispatch costs about 6 runner minutes (three: 18).

## 10. Expected output

```text
$ npm run load:medusa-knee -- --profile pr
P6-MED-LOAD-004 (knee range, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   stock 56 (3 steps x 10 s hold), smoke p95 reference 300 ms
  k6 main      exit 99  steps 0..2 of 3  (stop rule: p95 >= 3000 ms)  or  exit 0, no stop
  knee         KNEE between step 1 (1.0/s) and step 2 (1.5/s); stop: p95; first saturated: app_cpu (step 1)  | NO_KNEE -> INVALID no_knee
  reconcile    ok   orders 28 <= stock 56; reservations 28; payments 28; client 28, database 28
  cleanup      ok   28 orders cancelled and archived, leak check clean
  verdict      PASS | INVALID  results/load/P6-MED-LOAD-004/<run id>/verdict.json
```

(Illustrative VM-class values; the PR profile is a smoke of the machinery.) The job summary prints `knee-report-main.md`.

## 11. Environment changes (exact steps)

None for Cursor Cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) or Claude Code cloud (setup script,
`.claude/hooks/session-start.sh`). The local run needs the admin credentials in the environment
(`MEDUSA_ADMIN_EMAIL=admin@qa.local`, `MEDUSA_ADMIN_PASSWORD` a fresh random value; AGENTS.md/README already say so for the Medusa
races); the CI job generates the password in a step. No repo setting changes. The owner starts a dispatch from the Actions tab.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-med-knee origin/main`.
Counts relative to B3 (§5 check 2).

| Step | Commit subject                                                     | `git add` paths                                                                                                                             | Expected (`npm run check`)                                                                           |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0    | `docs(plans): bring the phase 4 task 3 plan onto the build branch` | `docs/plans/2026-10-25-p6-phase4-task3-med-knee.md`                                                                                         | exit 0, B3                                                                                           |
| 1    | `feat(load): size the medusa stock of a knee`                      | `src/load/knee/med-stock.ts tests/unit/med-knee-stock.test.ts`                                                                              | exit 0, **B3 + 3**                                                                                   |
| 2    | `feat(k6): add the medusa knee script`                             | `k6/cases/med-load-004.js k6/cases/med-load-004.example.json`                                                                               | exit 0, B3 + 3; `k6 inspect` ok                                                                      |
| 3    | `feat(load): add the medusa knee case`                             | `src/load/products/medusa.ts src/load/cases.ts package.json tests/unit/load-cases-med-knee.test.ts tests/unit/load-products-medusa.test.ts` | exit 0, **B3 + 8**; `npm run load:medusa-knee -- --profile pr` against a started Medusa exits 0 or 3 |
| 4    | `ci(knee): add the medusa job to the knee workflow`                | `.github/workflows/knee.yml`                                                                                                                | exit 0 (actionlint silent), B3 + 8                                                                   |
| 5    | `docs: describe the medusa knee run`                               | `README.md`                                                                                                                                 | exit 0, B3 + 8                                                                                       |

New unit tests by name (8): `med-knee-stock` (3: the default plan gives 587; fractional rates sum exactly (0.5 steps over 8 steps);
a one-step plan gives `ceil(1.05 x rate x hold) + 20`); `load-cases-med-knee` (3: the case, its run (`allowExits [0, 99]`,
`maxVUs 120`) and telemetry product `medusa`; stock is at least the planned orders of the default plan; `package.json` has the script and
the example config has the keys the script reads); `load-products-medusa` (+2: `stockFor` receives the context and a knee case sets
`audit.stock` from the plan; the old callers still get `planned + 20` and `ceil(planned / 2)`). Count 3 + 3 + 2 = **8**; steps 1 → +3,
3 → +5.

After step 5: push, `gh pr create` (rule 3), CI once (rule 15). The PR runs only the product-free job of Task 1. After the owner merges,
the owner dispatches `knee.yml` three times on `main` (§14).

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                                          | Mitigation                                                             |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R1  | Few iterations per step (15 at 0.5/s) make the dropped-iteration check coarse | Task 1 uses an absolute tolerance of 2 iterations for small steps      |
| R2  | The lock mode changes the knee                                                | the label says which mode ran; Redis mode is an extra                  |
| R3  | A step's p95 is read from 135 requests at step 0                              | `minRequests` 20 and `delayAbortEval` 10 s; ≥ 3 runs expose the spread |
| R4  | The run-to-run spread is large (VM: clean-step p95 876 vs 1,954 ms)           | the report states the range per run and the min/max over runs          |
| R5  | Cleanup of up to 587 orders                                                   | counted in §9 (3.3 minutes)                                            |

**Contradictions with the roadmap.**

| #   | Roadmap says                               | Probe shows                                                                 | Effect                                   |
| --- | ------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------- |
| C1  | "Orders per step at each rate (to size S)" | orders = rate x hold exactly (15, 30, …); the run stops at 60 to 70 started | `S = ceil(1.05 x Σ) + 20`, far above use |
| C2  | knee workflow or `perf.yml`                | same as Task 2                                                              | job in `knee.yml` (Task 2 Q1)            |
| C3  | rates in iterations per second             | k6 needs whole targets; Medusa's rates are below 1 per second               | `timeUnit` 10 s (Task 1 R1)              |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-MED-LOAD-011`: the same knee on the Redis-lock mode (`MEDUSA_REDIS=1`, `MEDUSA_LOCK=redis`) and on two backends, to show how much the
  in-memory lock mode matters.
- `P6-MED-LOAD-012`: attribution ramps per route (the probe: cart mutations all slow together; which one first).

**Open decisions** (option, evidence, recommended default).

- **Q1. Default plan.** (a) start 0.5, step 0.5, hold 30 s, 8 steps (recommended: the VM knee is at step 2 of 8; 587 units of stock);
  (b) start 0.25, step 0.25 (finer; needs `timeUnit` 20 s). **Default: (a).**
- **Q2. Stock rule.** (a) `ceil(1.05 x Σ) + 20` (recommended); (b) a large fixed stock (10,000). Evidence: any stock works; (a) documents
  the intent and keeps the reservation arithmetic readable. **Default: (a).**
- **Q3. Cleanup concurrency.** (a) sequential as built (recommended; 3.3 minutes worst); (b) 4 in parallel (faster, untested here).
  **Default: (a).**
- **Q4. The smoke reference.** (a) the Task 11 median of `P6-MED-LOAD-001` (recommended); (b) re-measure step 0 of each knee run and use
  that. Evidence: VM step-0 p95 is 1.7 to 1.9 times the CI example, so a reference from another machine misplaces the stop. **Default: (a).**

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B3 + 8** unit tests; `k6 inspect` lists the new script.
- [ ] 3 VALID `workflow_dispatch` runs of `knee.yml` (job `medusa-knee`) on `main`, each with a KNEE report (range between two steps,
      stop reason, first saturated resource), chart and telemetry, a clean audit or a recorded product bug under its ID; the three
      ranges and their spread in the job summaries.
- [ ] Run ids and `run-meta.json` listed; INVALID runs listed with reasons and excluded; the environment label says "in-memory lock,
      fake Redis, one backend".
- [ ] README says "knee range" and carries the label; no VM number appears.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID runs with range, stop reason, resource, clean audit: §14. Gap: runner values (§3.5).
- (b) Existing names grepped on the Task 10 head: `k6/journeys/med-checkout.js` (`runMedCheckout`), `src/load/products/medusa.ts`
  (`makeMedusaSetup`, `medusaCleanup`, `medusaSetupWith`), `src/load/reconcile/medusa.ts`, `src/medusa/oracle.ts` (`readOversellSnapshot`,
  `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `leakCheck`), `src/medusa/admin.ts` (`createStockedVariant`, `cancelAndArchive`),
  `.github/workflows/perf.yml` (`medusa-load`). NEW here with skeletons: §6.1. From Tasks 1, 2, 11: the names in §4.
- (c) CI time: §9, worst 40 of 60 minutes; no existing timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) No owner answer is recorded as given; Q1 to Q4 are open with defaults.
