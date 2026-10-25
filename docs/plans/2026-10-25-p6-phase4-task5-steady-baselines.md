# P6 Phase 4 Task 5: steady baselines at 50 % of the knee (`P6-CAL-LOAD-003`, `P6-MED-LOAD-002` re-run) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 5", D3, D13, D16 and `P6-RULE-001`. Inputs: the knee ranges of
[Task 2](2026-10-25-p6-phase4-task2-cal-knee.md) and [Task 3](2026-10-25-p6-phase4-task3-med-knee.md) (**merged, with at least three VALID
knee runs each**), the method of [Task 1](2026-10-25-p6-phase4-task1-breakpoint-method.md), the Phase 3 conservation case
([2026-10-24-p6-phase3-task8-med-load-conservation.md](2026-10-24-p6-phase3-task8-med-load-conservation.md), merged) and the run-selection
mechanism of [Phase 3 Task 11](2026-10-25-p6-phase3-task11-closeout.md).

**Paths.** Every path is a path on `main` after the Phase 3 stack and Phase 4 Tasks 1 to 3 have merged. Paths created by Tasks 1, 2, 3, 11 are
marked "(Task N)".

## 1. Header

- **Task.** Phase 4 Task 5. Cases: `P6-CAL-LOAD-003` (new, constant arrival rate), `P6-MED-LOAD-002` re-run at 50 % of the Medusa knee.
- **Plan branches.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted). **Build branches (pattern), two parts because the band can
  only be computed from steady runs of the merged code:** `feat/<build date>-p6-steady-baselines` (5a: code, `knee-bounds.json`, CI
  steps) and `docs/<build date>-p6-steady-band` (5b: `baseline-band.json` and the README table), the same split as Phase 3 Task 11.
- **Base.** `origin/main` after Tasks 1, 2, 3 and 11.
- **Harness pin.** Unchanged. **Environment change.** None.
- **Unit tests.** B5 = count on `main` when the build starts (Task 1 +61, Task 2 +12, Task 3 +8, Task 11 +23 on the 790 chain). This plan adds
  **+22** in 5a and **+0** in 5b (§12); expected B5 + 22.
- **Stop for owner review.** Yes (rule 10): `perf.yml` gets new steps (existing product jobs, existing timeouts untouched).

## 2. What it proves

A reproducible normal-load profile: at half the knee's lower bound (D3), the journey runs without dropped iterations, with the latency spread
(p50, p95, p99), error rate, resource use and correctness held (audit clean), repeated over at least three VALID runs, and the **baseline band**
(the spread of the per-run values) recorded with run ids. Later tasks compare against it: the spike recovery of Task 6 (the first window back
inside the band) and the A/A noise of Task 11 (Phase 4b).

- **Finance and healthcare.** The reference every change-control or SLA review starts from: what "normal" looked like, measured, with its
  environment, before anyone asks whether a release made it worse.

## 3. Live probe evidence

Probe date 2026-10-25 (UTC). Cloud VM (Node v22.23.3, 4 vCPU, 16 GB), k6 2.3.0, harness v0.2.15; Cal and Medusa started and stopped with
`npm run up:<product>` and `down`. Steady rates are 50 % of the knee **lower bounds the coarse ramps found on this VM** (Task 2 §3.3: Cal
6 to 8 per second; Task 3 §3.1: Medusa 1.0 to 1.5 per second). Runs went through the real runner with scratch scripts in the scratchpad; nothing
in the repo was edited or committed. **VM timings prove that a step works; no number below is a target or a published value.**

### 3.1 Is 50 % of the lower bound VALID? (roadmap probe item 1)

```text
Cal, 3 iterations per second for 130 s, fixed-slot journey (Task 2 §6.2), telemetry on, two runs:
run 1: PASS VALID  778 requests (389 iterations)  dropped 0  http p50 103 ms  p95 175  p99 221   k6 0.024 cores  runner busy 23.7 %
run 2: PASS VALID  778 requests                   dropped 0  http p50  98 ms  p95 173  p99 215   k6 0.024 cores  runner busy 22.8 %
audit (both): rows, accepted-only, client-matches-db, no-overlap all ok; stage times: k6 131 s, cleanup 27 s (389 bookings, 70 ms each), setup 0.2 to 0.5 s
Medusa, 0.5 journeys per second inside a spike run (the first 40 s and the last 120 s of a 200 s run, PASS VALID, dropped 0):
10-second windows: p50 120 to 180 ms, p95 366 to 503 ms (45 requests per window)
Documenso, 1.5 documents per second inside a spike run (PASS VALID): 10-second windows p50 45 to 63 ms, p95 295 to 332 ms (135 requests per window)
```

So 50 % of the lower bound is clean on the VM for all three products (the knee lower bounds themselves are unrelated to the runner: **confirm in
the first CI dispatch** that the rates derived from the runner's own knee runs are VALID there; the README rule is that a VALID verdict, not
this table, decides).

### 3.2 Slot supply for the Cal duration (probe item 2)

Per run: `rate x (hold + ramp)` iterations, one slot each (Task 2 §3.1: booked slots leave `getSchedule`; the fixed-slot mode takes one target
per iteration). At 3 per second and 130 s: 390 slots; `S = ceil(1.05 x rate x seconds)` = 410, `supplyWindowDays(410)` = 50 days. The nightly step
needs about 50 days of free slots out of 270+ available; cancelled bookings free their slots again, so consecutive runs reuse them.

### 3.3 The window that defines the band (probe item 3)

Two quantities, both stated, both unit-tested:

1. **Run-level values** (one number per run per metric): the whole-run statistics of the hold excluding the first 10 s (warm-up): http p50, p95
   and p99 (`http_req_duration` from the k6 summary), error rate, requests per second achieved, application CPU cores (mean of the telemetry
   samples), RSS at the end, database active sessions (mean). The **band** of a metric is `[min, max]` over the VALID runs; the plan stores both ends
   and the run ids, never a single "typical" number.
2. **Window values** (the recovery reference of Task 6): the 10-second bins of the points file (`readPointsGzStream`, Task 1) with at least
   40 requests; the band for recovery is `[min, max]` of the **per-window p95** over every baseline window of every VALID run, because a window of 45
   to 135 requests is noisier than a run. VM evidence: Cal window p95 122 to 220 ms (two phases of one spike run), Medusa 366 to 503 ms, Documenso
   295 to 332 ms. The band is stored per product with its window length and window count.

### 3.4 Nightly job time (probe item 4)

Runner values of the jobs today (run 40144142420, `full` profile): `cal-smoke` 6.6 min of 60, `medusa-load` 3.1 min of 45. The new steps add on the VM:
Cal 131 s k6 + 27 s cleanup + audit and setup 1 s = **2.7 min**; Medusa 0.5 per second for 120 s: setup 7 s + k6 about 130 s + cleanup
(60 orders x 0.33 s = 20 s) = **2.7 min**. Estimates after the change: `cal-smoke` 9.3 min of 60, `medusa-load` 5.8 min of 45 (**confirm in the first CI dispatch**).

### 3.5 Fractional rates (finding)

Medusa's steady rate is 0.5 per second; `openModelScenario` (`k6/lib/pure/options.js`) builds `constant-arrival-rate` with `timeUnit: "1s"` and a
whole `rate`. k6 rejects fractional rates (`cannot unmarshal number 0.5 into … of type int64`, Task 3 §3.1). `rate: 5` with `timeUnit: "10s"` ran at
0.5 per second, one start every 2.0 s (probed on `/health`). The steady scenario needs the same `timeUnitSec` parameter that Task 1 adds to the
ramping builder (refinement R1 there); this plan adds it to `openModelScenario` with a default of 1 so every Phase 3 caller is unchanged.

### 3.6 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. The runner's own knee lower bounds (they set the rates; the VM values above are only sizing).
2. VALID verdicts and the run-to-run spread of the steady runs on the runner: **UNPROBED**; three dispatch runs give the band.
3. `db_cpu` on the runner (Task 1 §3.8).
4. Medusa at the derived rate on the runner: the Phase 3 fixed rate (1 per second) is already 100 % of the VM's lower bound and was VALID on the runner in the
   Phase 3 dispatches; whether the runner's lower bound is higher or lower is exactly what Task 3's runs say.

## 4. Depends on earlier plans

Task 1: `KneePlanSpec`, `readPointsGzStream`, `parseSmokeBaseline`-style loaders (pattern), `LoadLabel`. Task 2: `slotsNeeded`, `pickSlotStarts`,
`calSetup({ knee })` (renamed in this plan to `calSetup({ slots })`, §6.3), the fixed-slot mode of `cal-book.js`, `knee.yml`. Task 3: `MED_LOAD_004`,
the knee runs. Task 11: `runIdOf`, `selectPublishable`, `summarizeMedian`, `k6/thresholds/` conventions. On `main` after Phase 3:
`MED_LOAD_002` and `conservationStage` (`src/load/med-conservation.ts`), `makeMedusaSetup`, `k6/cases/med-load-002.js`, `k6/cases/cal-load-001.js`,
`src/load/products/cal.ts`, `.github/workflows/perf.yml` (`cal-smoke`, `medusa-load`).

## 5. Build-time recheck

| #   | Check              | Command                                                                                                                                                                                        | Expected                                                      |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Base               | `git fetch origin main && git log --oneline origin/main \| grep -c "knee"`                                                                                                                     | Tasks 1 to 3 merged (≥ 3 commits mentioning knee)             |
| 2   | Baseline           | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                            | exit 0; `# tests` = B5                                        |
| 3   | Knee runs exist    | for Cal and Medusa: ≥ 3 VALID dispatch runs of `knee.yml` on `main`; `gh run download <id> -n knee-cal -D /tmp/ev/<id>/knee-cal` (and `knee-medusa`)                                           | three `knee-report-main.json` per product with `verdict` KNEE |
| 4   | Names              | `grep -n "export function openModelScenario" k6/lib/pure/options.js; grep -n "export const MED_LOAD_002" src/load/cases.ts; grep -n "export function slotsNeeded" src/load/knee/cal-supply.ts` | three hits                                                    |
| 5   | The case runs once | `npm run up:cal`; `npm run load:cal-steady -- --profile pr`; `npm run down:cal` (and the Medusa twin)                                                                                          | exit 0 or 3                                                   |

## 6. Design

### 6.1 File tree

```text
k6/lib/pure/options.js                      CHANGED  openModelScenario({ …, timeUnitSec = 1 }): rate x timeUnitSec whole, timeUnit "<n>s"
src/load/knee/bounds.ts                     NEW      buildKneeBounds, parseKneeBounds, steadyRateFor (pure)
scripts/write-knee-bounds.ts                NEW      CLI: knee-report folders -> k6/thresholds/knee-bounds.json
k6/thresholds/knee-bounds.json              NEW      data, 5a: lower bound per product with run ids (Cal, Medusa; Documenso added by Task 6)
src/load/steady.ts                          NEW      withSteadyProfile(caseDef, bounds), STEADY_DURATION_SEC
src/load/baseline-band.ts                   NEW      runValues, windowP95s, buildBand, parseBand (pure)
scripts/write-baseline-band.ts              NEW      CLI: steady run folders -> k6/thresholds/baseline-band.json
k6/thresholds/baseline-band.json            NEW      data, 5b: bands with run ids
k6/cases/cal-load-003.js, cal-load-003.example.json   NEW   steady Cal script (constant arrival rate, fixed-slot journey)
k6/cases/med-load-002.js                    CHANGED  uses timeUnitSec from the config (default 1)
src/load/cases.ts                           CHANGED  + CAL_LOAD_003; MED_LOAD_002 gains the "steady" profile slot
src/load/types.ts                           CHANGED  LoadProfileName + "steady"; LoadLabel + "steady baseline, environment-bound"; LoadProfile.timeUnitSec?
scripts/load/run-load.ts                    CHANGED  --profile steady: reads knee-bounds.json and builds the profile (withSteadyProfile)
src/load/products/cal.ts                    CHANGED  calSetup({ slots: { rate, seconds } }) generalises Task 2's knee option
package.json                                CHANGED  + load:cal-steady, load:medusa-steady
.github/workflows/perf.yml                  CHANGED  + two steps (cal-smoke, medusa-load); never on pull requests
README.md                                   CHANGED  5b: "Steady baselines" table
tests/unit/knee-bounds.test.ts, baseline-band.test.ts, steady-profile.test.ts, load-cases-steady.test.ts   NEW;   k6-lib-options.test.ts (+2)
```

### 6.2 The knee bounds (`src/load/knee/bounds.ts`, NEW) and the 50 % rule

```ts
export interface KneeBound {
  caseId: string; // "P6-CAL-LOAD-005"
  lowerBoundRate: number; // iterations per second; the lowest lower-step rate over the VALID runs
  upperBoundRate: number; // the highest upper-step rate over the VALID runs (context)
  n: number; // VALID runs, >= 3
  runIds: string[]; // GitHub Actions run ids, ascending, unique
  environment: string;
}
export interface KneeBounds {
  schema: 1;
  unit: "iterations per second";
  products: Partial<Record<"cal" | "medusa" | "documenso", KneeBound>>;
}

/**
 * Per product: keep KNEE reports from runs that selectPublishable accepts (Task 11) with event workflow_dispatch or schedule,
 * profile "full", verdict "KNEE" and a known run id. lowerBoundRate = the MINIMUM of the reports' lower rates (D3: "the knee range's lower
 * bound"; the minimum makes 50 % safe for every run). Throws naming the product when fewer than three remain.
 */
export function buildKneeBounds(input: {
  runs: Record<string, Array<{ meta: RunMeta; report: KneeReport }>>;
}): KneeBounds;
export function parseKneeBounds(value: unknown): KneeBounds;

/** 50 % of the lower bound, rounded DOWN to 0.1 (the resolution of timeUnitSec 10). Throws when the result is under 0.1 or the product is absent. */
export function steadyRateFor(bounds: KneeBounds, product: "cal" | "medusa" | "documenso"): number;
```

`scripts/write-knee-bounds.ts --out k6/thresholds/knee-bounds.json cal=<folder>,<folder>,<folder> medusa=…` mirrors `write-smoke-baseline.ts` (Task 11 §6.5): it
reads `knee-report-main.json` and `run-meta.json` from each downloaded folder, prints the table and exits 2 when a product has fewer than three
VALID runs. Example from the VM numbers (illustrative, not data): Cal lower bounds 6, 6, 6 → `steadyRateFor` = 3.0; Medusa 1.0, 1.0, 1.0 → 0.5.

### 6.3 Steady profile, Cal case and scenario unit

`src/load/types.ts`: `LoadProfileName = "pr" | "full" | "steady"`; `LoadProfile` gains `timeUnitSec?: number` (default 1); `LoadLabel` gains
`"steady baseline, environment-bound"`. `Record<LoadProfileName, LoadProfile>` becomes `Partial` for `steady` (`profiles: { pr; full; steady? }`), so
no existing case changes.

`src/load/steady.ts` (NEW):

```ts
export const STEADY_DURATION_SEC = { full: 120, pr: 30 } as const;

/** A copy of the case whose "steady" profile has rate = steadyRateFor(bounds, product), durationSec 120 and the case's maxLatencyMs x 2. */
export function withSteadyProfile(caseDef: LoadCase, bounds: KneeBounds): LoadCase;
```

`scripts/load/run-load.ts` (CHANGED): for `--profile steady`, read `k6/thresholds/knee-bounds.json` (missing: exit 2 with `ENV: knee bounds missing (Phase 4 Tasks 2 and
3 not evidenced)`), `caseDef = withSteadyProfile(caseDef, parseKneeBounds(...))`, `runLoad(caseDef, { profile: "steady" })`. `run-meta.json` therefore carries the
derived `rate` and `durationSec` without a runner change.

`k6/lib/pure/options.js` (CHANGED): `openModelScenario({ …, timeUnitSec = 1 })` returns `rate: Math.round(rate * timeUnitSec)` and
`timeUnit: \`${timeUnitSec}s\``, and sizes `preAllocatedVUs`as before (rate per second x latency). Unit tests (+2):`rate 0.5, timeUnitSec 10`gives`rate 5`,
`timeUnit "10s"`; the default call is byte-for-byte unchanged.

`src/load/products/cal.ts` (CHANGED): Task 2's `CalSetupOptions.knee?: KneePlanSpec` becomes `slots?: { count: number }`; the knee case passes
`slotsNeeded(plan)`, the steady case passes `Math.ceil(1.05 * rate * durationSec)`. `calSetupWith` reads the slot supply once (`supplyWindowDays`, `pickSlotStarts`,
`getFreeSlots`) exactly as Task 2 §6.4 and writes `slotStarts`. If Task 2 is merged first this is a rename plus one caller; the plan builder keeps both
tests green.

`k6/cases/cal-load-003.js` (NEW):

```js
// P6-CAL-LOAD-003: Cal steady baseline at half the knee (plan Phase 4 task 5). Standalone, against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-003.example.json k6 run k6/cases/cal-load-003.js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { clockHooks } from "../lib/markers.js"; // Phase 3 Task 11
import { runCalBook } from "../journeys/cal-book.js";

const cfg = {
  rate: 3,
  durationSec: 30,
  maxLatencyMs: 2000,
  timeUnitSec: 1,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-003",
  windowDays: 28,
  slotStarts: [],
  ...loadLoadConfig([]),
};
const tags = { case: "P6-CAL-LOAD-003", journey: "cal-book" };
export const options = standardOptions({
  scenarios: {
    journey: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      timeUnitSec: cfg.timeUnitSec,
      exec: "journey",
      tags,
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // correctness only (RULE-001, D9): measure-only for latency
  tags,
});
export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);
export function journey() {
  runCalBook(cfg);
}
```

`CAL_LOAD_003` in `src/load/cases.ts`: `product: "cal"`, `label: "steady baseline, environment-bound"`, profiles `pr { rate: 3, durationSec: 30, maxLatencyMs: 2000 }`,
`full` the same with `durationSec: 120`, `steady` filled by `withSteadyProfile`; `telemetry: { product: "cal" }`; run `k6/cases/cal-load-003.js`; stages `setup:
calSetup({ slots })`, `reconcile: reconcileStage` (no overlapping accepted pairs under `HOST_OVERLAP_SQL`, `P6-OBS-CAL-002` counted under its id),
`cleanup: calCleanup`. `package.json`: `"load:cal-steady": "node scripts/load/run-load.ts --case P6-CAL-LOAD-003 --profile steady"`.

`P6-MED-LOAD-002` at the new rate: the case keeps its stages (`makeMedusaSetup({ stockFor: planned => ceil(planned / 2) })`,
`composeStages([reconcileStage, conservationStage])`); `k6/cases/med-load-002.js` passes `timeUnitSec` from the config to `openModelScenario`. `--profile
steady` gives rate 0.5 (illustrative), duration 120 s, `planned = 60`, stock 30 (the stock runs out half way, as in Phase 3). `"load:medusa-steady":
"node scripts/load/run-load.ts --case P6-MED-LOAD-002 --profile steady"`.

### 6.4 The band (`src/load/baseline-band.ts`, NEW)

```ts
export interface RunValues {
  runId: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number; // k6 summary http_req_duration "med", "p(95)", "p(99)" of the run (warm-up included: the summary cannot cut it; see below)
  errorRate: number;
  requestsPerSec: number;
  appCores?: number;
  rssMb?: number;
  dbActive?: number; // telemetry means over the hold minus 10 s; absent when the source is
}
export interface Band {
  min: number;
  max: number;
  n: number;
}
export interface BaselineBand {
  schema: 1;
  windowSec: 10;
  minWindowRequests: 40;
  products: Record<
    string,
    {
      caseId: string;
      n: number;
      runIds: string[];
      environment: string;
      metrics: Record<
        | "p50Ms"
        | "p95Ms"
        | "p99Ms"
        | "errorRate"
        | "requestsPerSec"
        | "appCores"
        | "rssMb"
        | "dbActive",
        Band | undefined
      >;
      windowP95: Band & { windows: number }; // min and max of the per-window p95s over all runs: the recovery reference of Task 6
    }
  >;
}
/** Run-level values from one downloaded run folder (verdict.json, k6-main-summary.json, telemetry-main.json, run-meta.json). */
export function runValues(folder: RunFolder): RunValues;
/** 10-second windows of http_req_duration p95 from the per-second bins; windows under 40 requests are dropped. */
export function windowP95s(
  bins: SecondBin[],
  t0Ms: number,
  holdFromSec: number,
  holdToSec: number,
): number[];
export function buildBand(input: {
  caseId: string;
  runs: Array<{ values: RunValues; windows: number[]; meta: RunMeta }>;
}): BaselineBand["products"][string];
export function parseBand(value: unknown): BaselineBand;
```

Run-level percentiles come from the k6 summary of the whole run (the first seconds included; the summary cannot exclude them); to keep that honest the
steady runs start at the target rate at once (no ramp) and the 10-second warm-up is **not** cut from the summary statistics but **is** cut from the
telemetry means and from the window list. The band stores `[min, max]` and `n`; nothing is averaged across metrics. `scripts/write-baseline-band.ts`
(NEW) takes `cal=<folder>,… medusa=<folder>,…`, reads the points file for the windows, applies `selectPublishable`, requires three VALID runs, prints the
table and writes `k6/thresholds/baseline-band.json` after `findHits` on its text. The band is a **record, not a gate**: no threshold in any k6 script reads
it (P6-RULE-001 is about gates; the only consumer is Task 6's recovery measurement and Task 11's A/A in Phase 4b).

### 6.5 CI (`perf.yml`, CHANGED; the steps are new, nothing existing changes)

In job `cal-smoke`, after the existing LOAD steps and before "Token scan of the LOAD results":

```yaml
- name: LOAD steady P6-CAL-LOAD-003 (steady baseline at 50 % of the knee, environment-bound)
  if: ${{ github.event_name != 'pull_request' }}
  id: cal_steady
  timeout-minutes: 6
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    status=0
    npm run load:cal-steady || status=$?
    if [ "$status" -eq 3 ]; then echo "::warning::LOAD run INVALID (see the job summary); excluded from the band (P6-RULE-005)"; status=0; fi
    exit "$status"
```

and the twin `LOAD steady P6-MED-LOAD-002` in job `medusa-load` (`timeout-minutes: 6`), never on pull requests (PRs keep the Phase 3 `pr` profile and
the Phase 3 steps). Both run after the races and after the race leak check (Phase 3 D5: the races come first in these jobs; `medusa-load` has none and runs after
`Start Medusa`). The existing token scan and artefact upload steps already cover `results/load/`. If `k6/thresholds/knee-bounds.json` is missing the step ends `ENV`
(exit 2) and the job goes red on a `main` run: that is intended (a steady baseline without a knee is not defined). The runs come from `workflow_dispatch` and any
scheduled run; **nothing here requires the nightly schedule**.

## 7. Oracles and assertions

(1) **Cal:** the post-load audit (accepted-only, client count equals database count exactly: the run ends normally, no interrupted iterations; no overlapping accepted pairs,
`P6-OBS-CAL-002` under its id), the leak check. (2) **Medusa:** the Phase 3 conservation oracle at the new rate (orders = stock when the stock runs out, orders never
above it, reservations consistent, available never negative) plus the audit. (3) **Validity:** a VALID verdict is required to enter the band (dropped
iterations 0, generator and runner CPU within the Phase 3 limits, no telemetry gap, no clock skew). (4) **Measure-only:** the only thresholds in the k6 scripts are
`checks` and `http_req_failed` (correctness; D9, RULE-001); no latency or throughput threshold exists or is added.

**PRODUCT BUG vs TEST BUG.** An overlap among distinct slots, a booking count mismatch, an oversell, an unreserved order or a 5xx at half the knee would be `PRODUCT BUG
(SUSPECTED)` with the run link, labelled only by the owner after repeated runs (rule 13). A missing knee-bounds file, a rate under 0.1, slot supply short, or a conservation
check on the wrong stock is a TEST BUG or ENV. A run that is INVALID because the runner was busy is excluded and listed, never "fixed" by loosening a limit. **No
`PRODUCT BUG (SUSPECTED)` was found by this probe.** No expected-failure marker, no skip.

## 8. Data isolation, cleanup, leak check

Same as the Phase 3 cases: prefix `caseDataPrefix(runPrefix, <case id>)`, cleanup by the database (Cal: cancel 70 ms per booking, 410 bookings 29 s; Medusa: cancel and archive 0.33 s per
order, 60 orders 20 s), leak check last, token scan in the `tokenScan` stage and in the job step. The CLIs write files only under `k6/thresholds/` after `findHits`.

## 9. CI, token scan, budget

| Job (existing) | Before (min, run 40144142420) | + new step estimate (min) | + new step cap (min) | After, estimates (min) | After, at the new cap (min) | Timeout | Margin at caps |
| -------------- | ----------------------------- | ------------------------- | -------------------- | ---------------------- | --------------------------- | ------- | -------------- |
| `cal-smoke`    | 6.6                           | 2.7                       | 6                    | 9.3                    | 12.6                        | 60      | 47.4           |
| `medusa-load`  | 3.1                           | 2.7                       | 6                    | 5.8                    | 9.1                         | 45      | 35.9           |

The measured "before" values are full-profile `main` dispatch durations; "at the new cap" adds the whole 6-minute cap instead of the estimate. Stop rule at 80 % of the step timeout: 4.8
minutes against an estimate of 2.7. No existing step timeout and no job timeout is raised. The steps never run on pull requests, so PR time is unchanged. Runner minutes: about 2.7 per product per run;
three dispatch runs add 16 minutes per product. If the first dispatch shows either step above 4.8 minutes, the fix is a shorter duration (the plan constant `STEADY_DURATION_SEC.full`), never a higher timeout.

## 10. Expected output

```text
$ npm run load:cal-steady
P6-CAL-LOAD-003 (steady baseline, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   steady rate 3 per second (50 % of the lower bound 6, knee-bounds.json), 120 s, 410 slots
  k6 main      exit 0  requests 778 dropped 0   p50 103 ms p95 175 ms p99 221 ms   (VM illustration)
  reconcile    ok   audit: 389 bookings, client 389 = database 389, 0 overlapping pairs
  cleanup      ok   389 bookings cancelled, leak check clean
  verdict      PASS  results/load/P6-CAL-LOAD-003/<run id>/verdict.json
$ node scripts/write-baseline-band.ts cal=… medusa=…        (5b, after three VALID runs each)
| product | n | p50 ms (min–max) | p95 ms (min–max) | p99 ms (min–max) | window p95 ms (min–max, windows) | run ids |
```

## 11. Environment changes (exact steps)

None for Cursor Cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) or Claude Code cloud (setup script, `.claude/hooks/session-start.sh`). No repo setting changes. The owner dispatches
`perf.yml` three times on `main` after 5a is merged (as in Phase 3 Task 11 §6.6; the dispatch group fix of that task keeps the runs from cancelling each other).

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Counts relative to B5 (§5 check 2).

**Part 5a** (`git switch -c feat/<build date>-p6-steady-baselines origin/main`)

| Step | Commit subject                                                             | `git add` paths                                                                                                                                                                                                                                            | Expected (`npm run check`)                                                                               |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0    | `docs(plans): bring the phase 4 task 5 plan onto the build branch`         | `docs/plans/2026-10-25-p6-phase4-task5-steady-baselines.md`                                                                                                                                                                                                | exit 0, B5                                                                                               |
| 1    | `feat(k6): let the open-model scenario run below one iteration per second` | `k6/lib/pure/options.js k6/cases/med-load-002.js tests/unit/k6-lib-options.test.ts`                                                                                                                                                                        | exit 0, **B5 + 2**                                                                                       |
| 2    | `feat(load): derive the steady rate from the knee bounds`                  | `src/load/knee/bounds.ts scripts/write-knee-bounds.ts tests/unit/knee-bounds.test.ts`                                                                                                                                                                      | exit 0, **B5 + 8**                                                                                       |
| 3    | `feat(load): record the knee lower bounds of cal and medusa`               | `k6/thresholds/knee-bounds.json tests/unit/knee-bounds-file.test.ts`                                                                                                                                                                                       | exit 0, **B5 + 9**                                                                                       |
| 4    | `feat(load): add the steady profile and the cal steady case`               | `src/load/types.ts src/load/steady.ts src/load/products/cal.ts src/load/cases.ts scripts/load/run-load.ts k6/cases/cal-load-003.js k6/cases/cal-load-003.example.json package.json tests/unit/steady-profile.test.ts tests/unit/load-cases-steady.test.ts` | exit 0, **B5 + 16**; `npm run load:cal-steady -- --profile pr` hits `ENV` without the file, runs with it |
| 5    | `feat(load): add the band record and its cli`                              | `src/load/baseline-band.ts scripts/write-baseline-band.ts tests/unit/baseline-band.test.ts`                                                                                                                                                                | exit 0, **B5 + 22**                                                                                      |
| 6    | `ci(perf): run the steady baselines on main`                               | `.github/workflows/perf.yml`                                                                                                                                                                                                                               | exit 0 (actionlint silent), B5 + 22                                                                      |

**Part 5b** (`git switch -c docs/<build date>-p6-steady-band origin/main` after three VALID steady runs per product)

| Step | Commit subject                                                    | `git add` paths                    | Expected                |
| ---- | ----------------------------------------------------------------- | ---------------------------------- | ----------------------- |
| 7    | `chore(thresholds): record the steady baseline band with run ids` | `k6/thresholds/baseline-band.json` | exit 0, B5 + 22         |
| 8    | `docs: add the steady baselines to the readme`                    | `README.md`                        | exit 0 (`readme-rules`) |

New unit tests by name (22): `k6-lib-options` (+2: fractional rate with `timeUnitSec` 10; default unchanged); `knee-bounds` (6: minimum of the lower rates; three VALID runs
required; push and `pr`-profile runs excluded; `parseKneeBounds` accepts and rejects (n ≠ run ids, duplicate ids); `steadyRateFor` rounds down to 0.1 and halves; rejects under 0.1 and an absent
product); `steady-profile` (4: `withSteadyProfile` sets rate, duration 120 and the doubled latency; `pr` and `full` untouched; ENV when the bounds lack the product; label is
the steady one); `load-cases-steady` (3: `CAL_LOAD_003` registered with telemetry and a steady slot; `MED_LOAD_002` gains the steady slot and keeps its stages; both
npm scripts exist); `baseline-band` (6: run-level values from fixtures; per-window p95 drops windows under 40 requests; band is min and max; INVALID run excluded; three runs required; run ids
unique). `knee-bounds-file` (1: the committed `k6/thresholds/knee-bounds.json` parses, has Cal and Medusa with `n >= 3`, unique digit-only run ids and a positive lower bound). Count 2 + 6 + 1 + 4 + 3 + 6 = **22**; steps 1 → +2, 2 → +6, 3 → +1, 4 → +7, 5 → +6.

Each part: push, `gh pr create` (rule 3), CI once (rule 15). Merge only when the owner says "merge". After 5a the owner dispatches `perf.yml` three times on `main`.

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                             | Mitigation                                                                  |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| R1  | The knee spread puts 50 % near saturation on a slow runner       | the rate uses the minimum lower bound; INVALID (not FAIL) if it happens     |
| R2  | A small number of requests per window makes the window band wide | window floor 40 requests; the band is honest about it; windows count stored |
| R3  | Steady runs add minutes to two jobs                              | §9, margin 36 to 47 minutes                                                 |
| R4  | The Cal slot supply is shared with the knee runs                 | cancelled bookings free slots; supply read per run                          |
| R5  | A knee bound moves after a product ref bump                      | the bounds file is data with run ids; a ref bump reruns the knees first     |

**Contradictions with the roadmap.**

| #   | Roadmap says                              | Probe shows                                                                             | Effect                                                                         |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| C1  | "≥ 3 VALID nightly runs"                  | the owner provides runs by dispatch; nothing may require the schedule                   | runs from dispatches and any later nightly                                     |
| C2  | "`k6/cases/med-load-002.js` (rate input)" | the case already takes `rate` from the profile, but fractional rates need `timeUnitSec` | §6.3                                                                           |
| C3  | "the window length that defines the band" | two kinds of value are needed (run and window)                                          | §3.3                                                                           |
| C4  | "`perf.yml` (nightly)"                    | the steps are `if: not pull_request`, i.e. dispatch, push to `main`, schedule           | push runs on `main` also run them; they are not used for the band (Task 11 Q1) |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-CAL-LOAD-013`: steady runs at 25 % and 75 % of the lower bound to show the curve below the knee (a latency-versus-rate table).
- `P6-X-LOAD-016`: a unit test that fails when any `k6/cases/*.js` reads `baseline-band.json` (the band is a record, not a gate).

**Open decisions** (option, evidence, recommended default).

- **Q1. Which lower bound.** (a) the minimum lower rate over the VALID knee runs (recommended: 50 % is then safe for every run; D3 says "the lower bound");
  (b) the median. Evidence: two VM runs gave the same range for Cal and for Medusa; the runner may spread more. **Default: (a).**
- **Q2. Steady duration.** (a) 120 s (recommended: 390 Cal requests per window of runs and 60 Medusa orders; 2.7 minutes per step); (b) 300 s (more windows, 5 minutes). **Default: (a).**
- **Q3. Where the steady rate lives.** (a) a committed `k6/thresholds/knee-bounds.json` with run ids (recommended: reviewable, RULE-001 baseline data, D13); (b) read from the latest knee
  artefact at run time (not reproducible). **Default: (a).**
- **Q4. A third profile name.** (a) `steady` as a third profile of the existing cases (recommended; one case id per measurement); (b) new case ids. **Default: (a).**
- **Q5. Documenso steady.** The roadmap defines no Documenso baseline case (Note 3). (a) none in this task; Task 6 takes 50 % of its knee directly (recommended); (b) add
  `P6-DOC-LOAD-011`. **Default: (a).**

## 14. Done when (roadmap, made measurable)

- [ ] 5a merged with `npm run check` exit 0 and **B5 + 22** unit tests; `k6/thresholds/knee-bounds.json` committed with run ids for Cal and Medusa.
- [ ] 3 VALID `main` dispatch (or scheduled) runs of `perf.yml` per product after 5a, each with the k6 summary, telemetry, chart and a clean audit; their run ids are in the 5b PR.
- [ ] `k6/thresholds/baseline-band.json` committed (5b) with the bands and run ids; the README table lists the bands, the environment label and the run ids; INVALID runs listed with reasons.
- [ ] No latency or throughput threshold exists in any k6 script (`grep -rn "http_req_duration" k6/cases k6/journeys` shows none in a threshold position).

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID runs with metrics, telemetry, chart, clean audit; band recorded with run ids; `npm run check` green: §14. Gap: runner values (§3.6).
- (b) Existing names grepped on the Task 10 head: `openModelScenario` (`k6/lib/pure/options.js`), `MED_LOAD_002` and `conservationStage`, `makeMedusaSetup`, `calSetupWith`,
  `src/load/runner.ts` (`runLoad`), `scripts/load/run-load.ts`, `src/load/medians.ts` (`selectPublishable`), `src/load/chart/k6-points.ts` (`SecondBin`),
  `.github/workflows/perf.yml` (`cal-smoke`, `medusa-load`). NEW with skeletons: §6.1. From Tasks 1, 2, 3, 11: the names in §4.
- (c) CI time: §9, margins 36 to 47 minutes; no existing timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) No owner answer is recorded as given; Q1 to Q5 are open with defaults.
