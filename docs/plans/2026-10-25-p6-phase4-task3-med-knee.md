# P6 Phase 4 Task 3: Medusa checkout-journey knee (`P6-MED-LOAD-004`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 3", D2, D3, D13, D16. Method:
[2026-10-25-p6-phase4-task1-breakpoint-method.md](2026-10-25-p6-phase4-task1-breakpoint-method.md) (Task 1, **must be merged first**). Prerequisites: PRE-1
([2026-10-25-p6-phase4-pre1-med-load-006-storm-fix.md](2026-10-25-p6-phase4-pre1-med-load-006-storm-fix.md), **must be merged first**: it uses the same Medusa stack and checkout journey,
and a flaky `P6-MED-LOAD-006` turns pull-request CI red), the workflow file `knee.yml` created by [Task 2](2026-10-25-p6-phase4-task2-cal-knee.md) (this plan adds a job to it, one
workflow PR at a time) and PRE-3 ([2026-10-25-p6-phase4-pre3-evidence-workflow-ids.md](2026-10-25-p6-phase4-pre3-evidence-workflow-ids.md)) for the release. The p95 reference is
`k6/thresholds/smoke-p95.json` (Phase 3 Task 11, on main, PR #65, `6e307cf`).

**Paths.** Every path is a path on `main` after PRE-1, Phase 4 Task 1 and Task 2 have merged. Paths created by Task 1 are marked "(Task 1)", by Task 2 "(Task 2)". The Phase 3
stack (Task 10 is PR #62, `63c4d87`) and the smoke baseline (PR #65) are on main.

## 1. Header

- **Task.** Phase 4 Task 3. Case: `P6-MED-LOAD-004` (P0).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-med-knee`.
- **Base.** `origin/main` after PRE-1, Task 1 and Task 2 (`knee.yml` exists). B3 is measured at build time (865 at `2db9726`, plus the deltas of PRE-1, PRE-2, Task 1 and Task 2).
- **Harness pin.** Unchanged. **Environment change.** None.
- **Unit tests.** B3 = the count on `main` when the build starts. This plan adds **+10** (§12); expected B3 + 10.
- **Stop for owner review.** Yes (rule 10): a job in the new CI workflow `knee.yml` (dispatch only).

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
is a different measurement (proposed extra `P6-MED-LOAD-014`).

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
"insufficient inventory") as a conflict and anything else as an error. A ghost `Updating Status from … is not allowed` 400 (the F-M2
signature: the client saw a failure, an order exists) is an error here, and the per-intent audit (Task 1 §6.8) counts it under `F-M2` by intent: one occurrence per `fail` intent that
has exactly one order.

### 3.5 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. The knee on the GitHub runner: **UNPROBED**. The default plan's top (4.0/s) is 2.7 times the VM's upper bound; no stop makes the run
   INVALID (`no_knee`) and the dispatch is repeated with other inputs.
2. The Redis-lock and two-instance modes (not part of this case).
3. The `db_cpu` source on the runner reads (30 of 30 `telemetry-main.json` files of the `p6-phase3` release zips report `sources.container` `present: true, errors: 0`, Task 1 §3.8
   item 2); the VM's `tmpfs` cgroup is a VM-only failure.
4. Job time on the runner: the copied setup steps are measured (§9, 17 `medusa-load` runs); the knee step is from the VM and **UNPROBED** on the runner.

## 4. Depends on earlier plans

Task 1 (plan): `kneeOptions`, `beginKneeIteration`, `endKneeIteration`, `observeKneeResponses`, `kneeHooks`, `buildKneePlan`, `kneeStage`,
`kneePlanFromInputs` (`src/load/knee/plan-input.ts`), `K6RunSpec.knee`, `K6RunSpec.allowExits`, the per-intent reconciliation (`parseIntentLog`, `auditByIntent`, `opts.onCommit`,
`failWithRowKnownBugId`). Task 2 (plan): `.github/workflows/knee.yml`. On `main` (PR #65, `6e307cf`): `k6/thresholds/smoke-p95.json`, `parseSmokeBaseline`,
`smokeP95For` (`src/load/smoke-baseline.ts`). On `main`: `k6/journeys/med-checkout.js` (`runMedCheckout`), `k6/cases/med-load-001.js`,
`src/load/products/medusa.ts` (`makeMedusaSetup`, `medusaSetupWith`, `medusaCleanup`), `src/load/reconcile/medusa.ts` (`ORDERS_BY_EMAIL_SQL`, `evaluateMedusaAudit`),
`src/medusa/oracle.ts` (`readOversellSnapshot`, `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `leakCheck`), `src/medusa/admin.ts`
(`createStockedVariant`, `cancelAndArchive`), `.github/workflows/perf.yml` (`medusa-load` job as the template), `.gitleaks.toml` (the `load-medusa/P6-MED-LOAD-nnn/<attempt>/k6-config.json` allowlist).

## 5. Build-time recheck

| #   | Check              | Command                                                                                                                                                                                                                                                                                   | Expected                                                                                                                         |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Base               | `git fetch origin main && git log --oneline origin/main \| grep -c "knee"; ls .github/workflows/knee.yml`                                                                                                                                                                                 | Task 1 merged (≥ 1) and `knee.yml` exists (Task 2); PRE-1 merged (`git log --oneline origin/main \| grep -c "med-load-006"` ≥ 1) |
| 2   | Baseline           | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                                                                                                       | exit 0; `# tests` = B3 (measure; write it into the PR)                                                                           |
| 3   | Names              | `grep -n "export function kneeOptions" k6/lib/knee.js; grep -n "export const makeMedusaSetup" src/load/products/medusa.ts; ls .github/workflows/knee.yml`                                                                                                                                 | all found; otherwise stop and report                                                                                             |
| 4   | p95 reference      | `node --input-type=module -e 'import { readFileSync } from "node:fs"; import { parseSmokeBaseline, smokeP95For } from "./src/load/smoke-baseline.ts"; console.log(smokeP95For(parseSmokeBaseline(JSON.parse(readFileSync("k6/thresholds/smoke-p95.json", "utf8"))), "P6-MED-LOAD-001"))'` | prints `171.6001092` at `2db9726`                                                                                                |
| 5   | Fractional rates   | the 10 s `timeUnit` probe of §3.1 on `/health`                                                                                                                                                                                                                                            | an iteration every 2.0 s at 0.5 per second                                                                                       |
| 6   | The case runs once | `export MEDUSA_ADMIN_EMAIL=admin@qa.local MEDUSA_ADMIN_PASSWORD="$(openssl rand -hex 16)"`; `npm run up:medusa`; `npm run load:medusa-knee -- --profile pr`; `npm run down:medusa`                                                                                                        | exit 0 or 3, `knee-report-main.md` written                                                                                       |

## 6. Design

### 6.1 File tree

```text
k6/cases/med-load-004.js                  NEW      knee script (Task 1 library + runMedCheckout with onCommit)
k6/cases/med-load-004.example.json        NEW      example config for a standalone run
src/load/knee/med-stock.ts                NEW      stockForKnee(plan)
src/load/knee/med-intents.ts              NEW      MED_INTENT_ROWS_SQL, medIntentOf(prefix, email), medRowsByIntent(rows, prefix) (§6.4b)
src/load/cases.ts                         CHANGED  + MED_LOAD_004
package.json                              CHANGED  + load:medusa-knee
.github/workflows/knee.yml                CHANGED  + job medusa-knee (created by Task 2)
README.md                                 CHANGED  + "Medusa knee" section after the runs exist (§12 step 7)
tests/unit/med-knee-stock.test.ts, med-knee-intents.test.ts, load-cases-med-knee.test.ts   NEW
tests/unit/load-products-medusa.test.ts   CHANGED  (+2)
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
import {
  beginKneeIteration,
  endKneeIteration,
  kneeHooks,
  kneeOptions,
  observeKneeResponses,
} from "../lib/knee.js";
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
  const intent = beginKneeIteration(plan);
  let committed = false;
  runMedCheckout(cfg, { onCommit: () => (committed = true) }); // called where the journey adds to p6_orders (three sites, Task 1 §6.8)
  endKneeIteration(intent, committed); // one outcome line per finished iteration
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
the second argument. The setup stage also reads `smokeP95Ms` through the shipped reader (PR #65): `smokeP95For(parseSmokeBaseline(JSON.parse(readFileSync("k6/thresholds/smoke-p95.json", "utf8"))), "P6-MED-LOAD-001")`
into `ctx.config.smokeP95Ms`; an unreadable or invalid file is `ENV: smoke p95 reference unreadable`, and there is no default number in code. `kneePlanFor(ctx)` (Task 1) reads the
dispatch inputs through `kneePlanFromInputs` with the defaults `{ startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 2, maxSteps: 8 }` on `full` and
`{ 0.5, 0.5, 10, 2, 3 }` on `pr`. `reconcileStage` is the Medusa audit in per-intent mode (§6.4b, Task 1 §6.8): `orders-le-stock`, reservations consistent
(`RESERVATION_QTY_SQL` / `INVENTORY_LEVEL_SQL` through `readOversellSnapshot`), `available >= 0`, one payment per order, balances stay as today; `no-ghost-orders` is replaced by the five
per-intent rules with `failWithRowKnownBugId: "F-M2"`. `package.json`: `"load:medusa-knee": "node scripts/load/run-load.ts --case P6-MED-LOAD-004"`; `CASES` gets the entry.

### 6.4b Rows by intent (`src/load/knee/med-intents.ts`, NEW)

```ts
/** `ORDERS_BY_EMAIL_SQL` (src/load/reconcile/medusa.ts) with the email column; read-only through selectRows. */
export const MED_INTENT_ROWS_SQL = `SELECT id, email FROM "order" WHERE email LIKE $1 AND deleted_at IS NULL`;
/** "<prefix>-i<n>@qa.local" → n (k6/journeys/med-checkout.js:39); undefined for another prefix or a leaf that is not a whole number. */
export function medIntentOf(prefix: string, email: string): number | undefined;
export function medRowsByIntent(
  rows: Array<{ id: string; email: string }>,
  prefix: string,
): { rowsByIntent: Map<number, number>; ghostRows: number };
```

How `F-M2` reads by intent: a `fail` intent (the client saw a 400 or another failure) with exactly **one** order is one occurrence of the known bug `F-M2` (counted under its id, not a
violation, as the existing audit does). More than one order for one intent (a duplicate) and an order that belongs to no started intent (a ghost write) are `PRODUCT BUG (SUSPECTED)` and
are never counted under `F-M2`.

### 6.5 The p95 reference

The stop limit is `10 x cases["P6-MED-LOAD-001"].medianP95Ms` from `k6/thresholds/smoke-p95.json` (**171.6001092 ms** at `2db9726`, so the limit is about 1,716 ms), computed at setup and never a
constant in code. The smoke journey and this journey are the same nine requests, so the references are comparable; the report prints the ratio `step 0 p95 / smoke median` and a warning
above 2 (a different machine class, not a failure). The VM's step-0 p95 (394 to 457 ms) is 2.3 to 2.7 times the released median (171.6 ms), so on a VM the warning prints; on the
runner the ratio is the number to confirm, which is why the reference must come from the same environment class: the runner. **UNPROBED — confirm in the first
CI dispatch:** the step-0 p95 / 171.60 ms ratio (a ratio above 2 prints the warning).

### 6.6 The workflow job (`.github/workflows/knee.yml`, CHANGED)

Add job `medusa-knee` after `cal-knee`, `timeout-minutes: 60`, `runs-on: ubuntu-24.04`, and add `MEDUSA_REF: f677db438f27294fc50e4c7c6612e71ff38eeff5` to the workflow-level `env:` (same SHA as
`perf.yml` line 27 and `scripts/bootstrap.sh` line 9; check with `grep -n '^MEDUSA_REF' scripts/bootstrap.sh`). The job env is the `medusa-load` env verbatim (print it with
`sed -n '/^  medusa-load:/,/^    steps:/p' .github/workflows/perf.yml`; nine keys at `2db9726`) plus the four knee inputs:

```yaml
env:
  P6_WORKING_DIRECTORY: p6
  PRODUCTS_ROOT: ${{ github.workspace }}/products
  MEDUSA_CHECKOUT_PATH: products/medusa-dtc-starter
  MEDUSA_BASE_URL: http://127.0.0.1:9000
  # Public harness default database URL, not a secret.
  MEDUSA_DB_URL: postgres://medusa:medusa@127.0.0.1:5433/medusa
  MEDUSA_ADMIN_EMAIL: admin@qa.local
  MEDUSA_SKIP_STOREFRONT: "1"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  COREPACK_ENABLE_STRICT: "0"
  KNEE_START_RATE: ${{ inputs.start_rate }}
  KNEE_STEP_RATE: ${{ inputs.step_rate }}
  KNEE_HOLD_SEC: ${{ inputs.hold_sec }}
  KNEE_MAX_STEPS: ${{ inputs.max_steps }}
```

The inputs are empty by default, so the case default plan applies (Task 2 §6.7, "Inputs"). The steps: first the ref guard of Task 2 §6.7 (3) verbatim (`Stop unless dispatched from main`,
`timeout-minutes: 1`), then the 14 `medusa-load` steps from the first `actions/checkout` through `Start Medusa (harness up)`, by exact name (`sed -n '/^  medusa-load:/,/name: Job summary/p'
.github/workflows/perf.yml | rg "^      - (name|uses):"` prints them in this order): `actions/checkout@3d3c42e5… # v7.0.1` (path `p6`), `Checkout Medusa fork`, `Verify Medusa fork HEAD`,
`Stub harness product roots`, `actions/setup-node@949feb24… # v7.1.0`, `Install P6 dependencies`, `Install k6 (pinned in .k6-version, checksum-verified)`, `Enable pnpm via corepack`,
`Restore pnpm store cache`, `Install Medusa dependencies`, `Restore Medusa build cache`, `Generate the CI admin password`, `Pull Medusa images (3 tries, 15 s then 30 s)`,
`Start Medusa (harness up)`. Every one has a `timeout-minutes` (the table of §9; `medusa-load` leaves 12 of them uncapped, and this job never copies an uncapped step). Caches are restored
here, never saved (`medusa-smoke` saves them on `main`):

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  timeout-minutes: 1
  with:
    persist-credentials: false
    path: ${{ env.P6_WORKING_DIRECTORY }}

- name: Checkout Medusa fork
  timeout-minutes: 1
  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    repository: Jayami123/medusa-dtc-starter
    ref: ${{ env.MEDUSA_REF }}
    path: ${{ env.MEDUSA_CHECKOUT_PATH }}
    persist-credentials: false

- name: Verify Medusa fork HEAD
  timeout-minutes: 1
  run: |
    set -euo pipefail
    head="$(git -C "${MEDUSA_CHECKOUT_PATH}" rev-parse HEAD)"
    if [ "$head" != "${MEDUSA_REF}" ]; then
      echo "::error::Medusa HEAD ${head} does not match MEDUSA_REF ${MEDUSA_REF}"
      exit 1
    fi

- name: Stub harness product roots
  timeout-minutes: 1
  run: |
    set -euo pipefail
    mkdir -p "${PRODUCTS_ROOT}/cal" "${PRODUCTS_ROOT}/documenso" "${PRODUCTS_ROOT}/twenty-CRM"

- uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
  timeout-minutes: 1
  with:
    node-version-file: ${{ env.P6_WORKING_DIRECTORY }}/.nvmrc
    cache: npm
    cache-dependency-path: ${{ env.P6_WORKING_DIRECTORY }}/package-lock.json

- name: Install P6 dependencies
  timeout-minutes: 1
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    npm ci

- name: Install k6 (pinned in .k6-version, checksum-verified)
  timeout-minutes: 2
  run: |
    set -euo pipefail
    bash "${{ github.workspace }}/p6/scripts/install-k6.sh"

- name: Enable pnpm via corepack
  timeout-minutes: 1
  run: |
    set -euo pipefail
    corepack enable
    corepack prepare pnpm@10.11.1 --activate
    version="$(pnpm --version)"
    if [ "$version" != "10.11.1" ]; then
      echo "::error::pnpm ${version} is not the 10.11.1 the Medusa fork pins"
      exit 1
    fi
    echo "PNPM_STORE_PATH=$(pnpm store path --silent)" >> "$GITHUB_ENV"

- name: Restore pnpm store cache
  timeout-minutes: 1
  id: medusa_pnpm
  uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: ${{ env.PNPM_STORE_PATH }}
    key: ${{ runner.os }}-medusa-pnpm-${{ env.MEDUSA_REF }}-${{ hashFiles(format('{0}/pnpm-lock.yaml', env.MEDUSA_CHECKOUT_PATH)) }}

- name: Install Medusa dependencies
  timeout-minutes: 1
  working-directory: ${{ env.MEDUSA_CHECKOUT_PATH }}
  run: |
    set -euo pipefail
    pnpm install --frozen-lockfile

- name: Restore Medusa build cache
  timeout-minutes: 1
  id: medusa_build
  uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: ${{ env.MEDUSA_CHECKOUT_PATH }}/apps/backend/.medusa/server
    key: ${{ runner.os }}-medusa-build-${{ env.MEDUSA_REF }}-h0.2.15

- name: Generate the CI admin password
  timeout-minutes: 1
  run: |
    set -euo pipefail
    pw="$(openssl rand -hex 16)"
    echo "::add-mask::${pw}"
    echo "MEDUSA_ADMIN_PASSWORD=${pw}" >> "$GITHUB_ENV"

- name: Pull Medusa images (3 tries, 15 s then 30 s)
  id: medusa_pull
  timeout-minutes: 3
  working-directory: ${{ github.workspace }}/p6/node_modules/qa-portfolio-harness/docker
  run: |
    set -euo pipefail
    bash "${{ github.workspace }}/p6/scripts/ci/compose-pull.sh" -p qa-harness-medusa -f medusa.compose.yml

- name: Start Medusa (harness up)
  timeout-minutes: 3
  id: medusa_up
  if: ${{ steps.medusa_pull.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    SECONDS=0
    npm run up:medusa
    echo "HARNESS_UP_SECONDS=${SECONDS}" >> "$GITHUB_ENV"
- name: Knee P6-MED-LOAD-004 (knee range, environment-bound)
  id: knee
  if: ${{ steps.medusa_up.outcome == 'success' }}
  timeout-minutes: 15
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    status=0
    npm run load:medusa-knee -- --profile full || status=$?
    # exit 3 is INVALID: shown in the summary, excluded from the knee statistics (P6-RULE-005), the job stays green
    if [ "$status" -eq 3 ]; then echo "::warning::knee run INVALID (see the job summary)"; status=0; fi
    exit "$status"

- name: Job summary (knee table)
  if: ${{ !cancelled() }}
  timeout-minutes: 2
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: node scripts/write-ci-job-summary.ts

- name: Token scan of the knee results
  id: token_scan
  if: ${{ !cancelled() }}
  timeout-minutes: 2
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: node scripts/evidence-token-scan.mjs results/load

# The release scan (PR #68, .gitleaks.toml) lets the publishable key through only in
# .../load-medusa/P6-MED-LOAD-nnn/<attempt>/k6-config.json, so the artefact keeps that inner folder.
- name: Stage the results under load-medusa/
  if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
  timeout-minutes: 1
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    mkdir -p stage/load-medusa
    cp -a results/load/. stage/load-medusa/

- uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
  timeout-minutes: 3
  with:
    name: knee-medusa
    path: ${{ env.P6_WORKING_DIRECTORY }}/stage/
    if-no-files-found: warn
    retention-days: 90

- name: Stop Medusa (harness down)
  if: ${{ always() }}
  timeout-minutes: 1
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    npm run down:medusa || true
```

**Artefact name and the release scan (decided: keep the inner folder, no allowlist change).** The release downloads every artefact of a run into `<run id>/<artefact name>/…`
and runs `gitleaks dir … --config .gitleaks.toml`. Its only allowlist matches `(^|/)load-medusa/P6-MED-LOAD-[0-9]{3}/[^/]+/k6-config\.json$` (and the 64-hex `pk_` key), so a Medusa knee
artefact named `knee-medusa` but holding `P6-MED-LOAD-004/<attempt>/k6-config.json` directly would fail the scan on its publishable key. The staging step puts the results under
`load-medusa/` inside the artefact: `knee-medusa/load-medusa/P6-MED-LOAD-004/<attempt>/k6-config.json` matches, and the case id `P6-MED-LOAD-004` has the required `nnn` shape. The widening of
the regex is never needed. Check (probed on 2026-10-25 with gitleaks 8.30.1, the pinned version and sha256, on fixture files with a random 64-hex key; no real key was used):

```text
$ gitleaks dir fx --config .gitleaks.toml --redact --no-banner --exit-code 1        # fx/knee-medusa/load-medusa/P6-MED-LOAD-004/20261025T000000Z-aaaaaaaa/k6-config.json
exit 0
$ gitleaks dir fx --config .gitleaks.toml --redact --no-banner --exit-code 1        # fx/knee-medusa/P6-MED-LOAD-004/20261025T000000Z-aaaaaaaa/k6-config.json  (no load-medusa folder)
exit 1
```

At build time repeat it on the first real artefact before any release: `gh run download <run id> -n knee-medusa --dir "$RUNNER_TEMP/x"` then the same `gitleaks dir` command; expect exit 0. The
same shape rule applies to the Medusa steady and spike jobs of Tasks 5 and 6 (cases `P6-MED-LOAD-002`, `-003`, `-010`). The job runs on `workflow_dispatch` only, on `main` (the guard), never on
pull requests. Every action is pinned by SHA exactly as in `perf.yml`. The knee points file `k6-main.json.gz` stays in the Actions artefact only (not an allowed release kind).

## 7. Oracles and assertions

(1) The **post-load audit** (Phase 3 Task 6, per intent after a stop: Task 1 §6.8): orders <= stock S, reservation rows consistent with live orders and
`inventory_level.reserved_quantity` (`readOversellSnapshot`), `available >= 0`, one payment per order, money balances; and by intent: every order maps to a started intent, no intent has two
orders, an `ok` intent has exactly one, a `fail` intent has none or is counted under `F-M2`, only indeterminate intents 0 or 1 (at most `interrupted` of them). (2) The **leak check** after the
cleanup sweep (`leakCheck`). (3) The **knee contract**: a KNEE report with a range between two steps and the D2 stop reason, or NO_KNEE/INVALID with its reason. (4) **Supply**: `S >= planned` is
asserted before load; a 400 `not_allowed` stock refusal is a TEST BUG (S too small) and is counted as a conflict, not an error.

**PRODUCT BUG vs TEST BUG.** Oversell (`orders > S`), an order without payment, a reservation that disagrees with live orders, a 5xx before the rule trips, a duplicate order for one intent, a ghost
order (no started intent) or an `ok` intent without an order would be `PRODUCT BUG (SUSPECTED)` with the run link, labelled only by the owner after repeated full-count runs (rule 13). A `fail`
intent with one order is the known `F-M2`, counted by intent. Stock too small, a plan that ends without a stop, a stale config, or more indeterminate intents than `interrupted` are TEST BUG or
INVALID. **No `PRODUCT BUG (SUSPECTED)` was found by this probe** (0 5xx, orders = completed iterations, reservations released on cleanup). No expected-failure marker, no skip.

## 8. Data isolation, cleanup, leak check

Prefix: `caseDataPrefix(runPrefix, "P6-MED-LOAD-004")`; customers `iterationId(prefix, n)@qa.local`; the product and inventory item are
made by the setup and removed by the cleanup. Cleanup (`medusaCleanupWith`): live orders found by the database (`LEAK_LIVE_ORDER_IDS_SQL`),
`cancelAndArchive` each, then the product, then customers by prefix; a failure is a TEST BUG line and the sweep continues; `leakCheck`
last. Carts are not deleted by the admin API; they stay (61 carts after the probe) and the Medusa database is dropped with the job. The
token scan runs in the `tokenScan` stage and in the workflow step.

## 9. CI, token scan, budget

Job `medusa-knee`, own timeout **60 minutes**, `workflow_dispatch` only. Durations of the copied setup steps are the maximum over the 17 successful `medusa-load` runs on `main` (3 dispatch: 40177412186,
40178773022, 40180625279; 6 pull request; 8 push; `https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/runs/<run id>/jobs`), except `Start Medusa` and `Install Medusa dependencies`, where
the larger 64 `medusa-smoke` runs are quoted too.

| step name (as in YAML)                                | timeout-minutes | estimate (source)                                                                         | 80 % stop | runs on this event?                          |
| ----------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- | --------- | -------------------------------------------- |
| Stop unless dispatched from main                      | 1               | UNPROBED (a shell test; expect < 1 s)                                                     | 48 s      | workflow_dispatch                            |
| `actions/checkout@3d3c42e5…` (path `p6`)              | 1               | 2 s (max of 17 `medusa-load` runs)                                                        | 48 s      | workflow_dispatch                            |
| Checkout Medusa fork                                  | 1               | 1 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Verify Medusa fork HEAD                               | 1               | 0 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Stub harness product roots                            | 1               | 1 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| `actions/setup-node@949feb24…`                        | 1               | 4 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Install P6 dependencies                               | 1               | 8 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Install k6 (pinned in .k6-version, checksum-verified) | 2               | 1 s (same)                                                                                | 96 s      | workflow_dispatch                            |
| Enable pnpm via corepack                              | 1               | 2 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Restore pnpm store cache                              | 1               | 8 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Install Medusa dependencies                           | 1               | 7 s (same; 13 s max over 64 `medusa-smoke` runs)                                          | 48 s      | workflow_dispatch                            |
| Restore Medusa build cache                            | 1               | 2 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Generate the CI admin password                        | 1               | 1 s (same)                                                                                | 48 s      | workflow_dispatch                            |
| Pull Medusa images (3 tries, 15 s then 30 s)          | 3               | 14 s (same)                                                                               | 144 s     | workflow_dispatch                            |
| Start Medusa (harness up)                             | 3               | 31 s (same; 68 s max over 64 `medusa-smoke` runs)                                         | 144 s     | workflow_dispatch                            |
| Knee P6-MED-LOAD-004 (knee range, environment-bound)  | 15              | UNPROBED on the runner: VM about 3 min (cleanup of 587 orders worst 3.3 min + k6 4.3 min) | 12 min    | workflow_dispatch (if `medusa_up` succeeded) |
| Job summary (knee table)                              | 2               | 1 s (`medusa-load` summary step, same runs)                                               | 96 s      | workflow_dispatch                            |
| Token scan of the knee results                        | 2               | 0 s (`medusa-load` token scan, same runs)                                                 | 96 s      | workflow_dispatch                            |
| Stage the results under load-medusa/                  | 1               | UNPROBED (a `cp`; expect < 5 s)                                                           | 48 s      | workflow_dispatch                            |
| `actions/upload-artifact@cf430e03…` (`knee-medusa`)   | 3               | 2 s (`medusa-load` upload step, same runs)                                                | 144 s     | workflow_dispatch                            |
| Stop Medusa (harness down)                            | 1               | 1 s (same runs)                                                                           | 48 s      | workflow_dispatch                            |

Sum of the step caps: 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 + 1 + 1 + 1 + 3 + 3 + 15 + 2 + 2 + 1 + 3 + 1 = **44 min**. Job timeout **60**. 60 − 44 = **16 ≥ 10**. No range, no cache-save allowance (the job only
restores). If the first dispatch shows the knee step above 12 minutes (80 % of 15) or any step above 80 % of its cap, that is a stop and report; the fix is a shorter hold or fewer steps, never a higher cap or
timeout. **Cold path:** a Medusa build-cache miss makes `Start Medusa` a production build and trips its 3-minute cap; that is a visible failure, not a silent one; the owner re-runs after a `medusa-smoke` push
has warmed the cache. No existing job changes; no existing timeout is raised. Each dispatch costs about 6 runner minutes (three: 18).

## 10. Expected output

```text
$ npm run load:medusa-knee -- --profile pr
P6-MED-LOAD-004 (knee range, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   stock 56 (3 steps x 10 s hold), smoke p95 reference 300 ms
  k6 main      exit 99  steps 0..2 of 3  (stop rule: p95 >= 3000 ms)  or  exit 0, no stop
  knee         KNEE between step 1 (1.0/s) and step 2 (1.5/s); stop: p95; first saturated: app_cpu (step 1)  | NO_KNEE -> INVALID no_knee
  reconcile    ok   audit (per intent): 28 started, 28 ok, 28 orders <= stock 56; reservations 28; payments 28; 0 ghost, 0 duplicate
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

| Step | Commit subject                                                     | `git add` paths                                                                                                                             | Expected (`npm run check`)                                                                            |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0    | `docs(plans): bring the phase 4 task 3 plan onto the build branch` | `docs/plans/2026-10-25-p6-phase4-task3-med-knee.md`                                                                                         | exit 0, B3                                                                                            |
| 1    | `feat(load): size the medusa stock of a knee`                      | `src/load/knee/med-stock.ts tests/unit/med-knee-stock.test.ts`                                                                              | exit 0, **B3 + 3**                                                                                    |
| 2    | `feat(load): map medusa orders to intents`                         | `src/load/knee/med-intents.ts tests/unit/med-knee-intents.test.ts`                                                                          | exit 0, **B3 + 5**                                                                                    |
| 3    | `feat(k6): add the medusa knee script`                             | `k6/cases/med-load-004.js k6/cases/med-load-004.example.json`                                                                               | exit 0, B3 + 5; `k6 inspect` ok                                                                       |
| 4    | `feat(load): add the medusa knee case`                             | `src/load/products/medusa.ts src/load/cases.ts package.json tests/unit/load-cases-med-knee.test.ts tests/unit/load-products-medusa.test.ts` | exit 0, **B3 + 10**; `npm run load:medusa-knee -- --profile pr` against a started Medusa exits 0 or 3 |
| 5    | `ci(knee): add the medusa job to the knee workflow`                | `.github/workflows/knee.yml`                                                                                                                | exit 0 (actionlint silent), B3 + 10                                                                   |
| 6    | `docs: describe the medusa knee run`                               | `README.md`                                                                                                                                 | exit 0, B3 + 10                                                                                       |

New unit tests by name (10): `med-knee-stock` (3: the default plan gives 587; fractional rates sum exactly (0.5 steps over 8 steps);
a one-step plan gives `ceil(1.05 x rate x hold) + 20`); **`med-knee-intents` (2: `medIntentOf` maps `<prefix>-i<n>@qa.local` to `n` and rejects another prefix, another domain and a non-numeric leaf; `medRowsByIntent`
counts orders per intent, counts an order of no intent as a ghost row, and counts two orders of one intent as 2)**; `load-cases-med-knee` (3: the case, its run (`allowExits [0, 99]`,
`maxVUs 120`) and telemetry product `medusa`; stock is at least the planned orders of the default plan; `package.json` has the script and
the example config has the keys the script reads); `load-products-medusa` (+2: `stockFor` receives the context and a knee case sets
`audit.stock` from the plan; the old callers still get `planned + 20` and `ceil(planned / 2)`). Count 3 + 2 + 3 + 2 = **10**; steps 1 → +3, 2 → +2, 4 → +5. The workflow file has no unit test (`actionlint` is part of
`npm run check`); its cap table of §9 is checked by hand with the script of PRE-2 §4.

After step 6: push, `gh pr create` (rule 3), CI once (rule 15). The PR runs only the product-free job of Task 1 (and a new job in `knee.yml` is dispatchable only after the merge). After the owner merges,
the owner dispatches `knee.yml` three times on `main` (§14); PRE-3 has already put `knee.yml` into the release check.

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

**Proposed extras (out of scope until accepted; new IDs).** (`P6-MED-LOAD-011` is already proposed by Phase 3 Tasks 8 and 10; the next free numbers are used here.)

- `P6-MED-LOAD-014`: the same knee on the Redis-lock mode (`MEDUSA_REDIS=1`, `MEDUSA_LOCK=redis`) and on two backends, to show how much the
  in-memory lock mode matters.
- `P6-MED-LOAD-015`: attribution ramps per route (the probe: cart mutations all slow together; which one first).

**Decisions (owner, 2026-10-25).**

- **Q1. Default plan.** Decided (owner, 2026-10-25): (a) start 0.5, step 0.5, hold 30 s, 8 steps — the VM knee is at step 2 of 8; 587 units of stock.
  Options considered: (a) start 0.5, step 0.5, hold 30 s, 8 steps; (b) start 0.25, step 0.25 (finer; needs `timeUnit` 20 s).
- **Q2. Stock rule.** Decided (owner, 2026-10-25): (a) `ceil(1.05 x Σ) + 20` — it documents the intent and keeps the reservation arithmetic readable.
  Options considered: (a) `ceil(1.05 x Σ) + 20`; (b) a large fixed stock (10,000). Evidence: any stock works.
- **Q3. Cleanup concurrency.** Decided (owner, 2026-10-25): (a) sequential as built — 3.3 minutes worst.
  Options considered: (a) sequential as built; (b) 4 in parallel (faster, untested here).
- **Q4. The smoke reference.** Decided (owner, 2026-10-25): (a) the `P6-MED-LOAD-001` median 171.60 ms from `k6/thresholds/smoke-p95.json`; UNPROBED — confirm in first CI dispatch: the step-0 p95 / 171.60 ratio
  (the VM gave 2.3 to 2.7 times; a ratio above 2 prints the warning).
  Options considered: (a) the shipped median; (b) re-measure step 0 of each knee run and use that. Evidence: the VM's step-0 p95 is far above the runner median, so a reference from another machine misplaces the stop.

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B3 + 10** unit tests; `k6 inspect` lists the new script.
- [ ] 3 VALID `workflow_dispatch` runs of `knee.yml` (job `medusa-knee`) on `main`, each with a KNEE report (range between two steps,
      stop reason, first saturated resource), chart and telemetry, a clean per-intent audit (`F-M2` counted by intent, no duplicate, no ghost) or a recorded product bug under its ID; the three
      ranges and their spread in the job summaries; the release scan of the artefact passes (`gitleaks dir` exit 0, §6.6).
- [ ] Run ids and `run-meta.json` listed; INVALID runs listed with reasons and excluded; the environment label says "in-memory lock,
      fake Redis, one backend".
- [ ] README says "knee range" and carries the label; no VM number appears.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID runs with range, stop reason, resource, clean audit: §14. Gap: runner values (§3.5).
- (b) Existing names grepped on `main` at `2db9726`: `k6/journeys/med-checkout.js` (`runMedCheckout`), `src/load/products/medusa.ts`
  (`makeMedusaSetup`, `medusaCleanup`, `medusaSetupWith`), `src/load/reconcile/medusa.ts` (`ORDERS_BY_EMAIL_SQL`), `src/medusa/oracle.ts` (`readOversellSnapshot`,
  `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `leakCheck`), `src/medusa/admin.ts` (`createStockedVariant`, `cancelAndArchive`),
  `.github/workflows/perf.yml` (`medusa-load`), `src/load/smoke-baseline.ts`, `.gitleaks.toml`. NEW here with skeletons: §6.1. From Tasks 1, 2: the names in §4.
- (c) CI time: §9 (exact table, 44 min of caps in a 60-minute timeout, margin 16); no existing timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) Every owner answer is recorded in "Decisions (owner, 2026-10-25)" (§13).
