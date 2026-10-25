# P6 Phase 4 Task 2: Cal booking-journey knee (`P6-CAL-LOAD-005`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 2", D2, D3, D13, D16. Method:
[2026-10-25-p6-phase4-task1-breakpoint-method.md](2026-10-25-p6-phase4-task1-breakpoint-method.md) (Task 1, **must be merged first**).
The p95 reference comes from Phase 3 Task 11 ([2026-10-25-p6-phase3-task11-closeout.md](2026-10-25-p6-phase3-task11-closeout.md)).

**Paths.** Every path is a path on `main` after the Phase 3 stack and Phase 4 Task 1 have merged. Paths that exist only on the Task 10
branch are marked "(Phase 3 Task 10, merging)"; paths created by Task 1 or Task 11 are marked "(Task 1)" / "(Task 11)".

## 1. Header

- **Task.** Phase 4 Task 2. Case: `P6-CAL-LOAD-005` (P0).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-cal-knee`.
- **Base.** `origin/main` after Task 1 (and Task 11 for the p95 reference; §6.6 shows what to do if the file is missing).
- **Harness pin.** Unchanged (`v0.2.15`). **Environment change.** None.
- **Unit tests.** B2 = count on `main` when the build starts (Task 1 adds +61 to the 790 / 818 / 841 chain of its plan). This plan adds **+12**
  (§12); expected B2 + 12.
- **Stop for owner review.** Yes (rule 10): a new CI workflow `knee.yml` (dispatch plus a Saturday schedule, D16).
  Open decision Q1 asks where the knee jobs live.

## 2. What it proves

Where the Cal booking flow (getSchedule, then book) stops degrading gracefully, as a step range between two arrival rates, with the
resource that gave first and a clean post-load audit (no overlapping accepted pairs; every booking the client was told about is in the
database). Cal's production server (`next start`) is one process; on a 4-vCPU runner shared with k6 and Postgres the first limit is
expected to be that process's CPU. If so, that is a valid result, stated as environment-bound.

- **Finance and healthcare.** Where an appointment-booking flow stops degrading gracefully and which resource gives first: the
  evidence a clinic-scheduling or branch-booking system needs before sizing.

## 3. Live probe evidence

Probe date 2026-10-25 (UTC). Cloud VM (Node v22.23.3, 4 vCPU, 16 GB), k6 2.3.0, harness v0.2.15. Cal started with `npm run up:cal`
at `CAL_REF` `c2b7ac44` (cold build, about 14 minutes on this VM; `NODE_OPTIONS` carried `--max-old-space-size=8192`), stopped with
`down` at the end of the plan work. The ramp was driven through the real runner (`runLoad`, `calSetup`, `calCleanup`, the post-load
audit, the sampler) with a scratch k6 script and a scratch case in the scratchpad; nothing in the repo was edited or committed.
**VM timings prove that a step works; no number below is a target or a published value.** Runner values are marked "confirm in the
first CI dispatch".

### 3.1 Slot supply for the whole ramp (roadmap probe item 1)

```text
getSchedule, pro/30min, UTC, eventTypeId 3 (HOST_SETUP_SQL), start = today + 2 days:
  window 1 day: 16 slots 61 ms     7 d: 80 slots 79 ms    28 d: 320 slots 88 ms
  60 d: 704 slots 124 ms    120 d: 1376 slots 138 ms    270 d: 3104 slots 270 ms   (one day: 16 slots on a weekday, none on a weekend; 11.4 on average)
  1 day at +100 days: 16 slots 42 ms
book slot 0 and slot 1 of the 28-day list      -> 200 ACCEPTED, 200 ACCEPTED
getSchedule 28 d again                          -> 318 slots; the first offered slot is now the third. BOOKED SLOTS ARE REMOVED from the list.
getSchedule +250 days, book its first slot      -> 200 ACCEPTED (no booking horizon on this event type)
```

Consequences, each a finding:

- **The Phase 3 journey's slot choice consumes two slots per booking.** `k6/journeys/cal-book.js` takes `slots[n]` of the window
  with `n = exec.scenario.iterationInTest`; the list shrinks with every booking, so iteration `n` sees `total - n` slots and needs
  `total - n > n`: the supply must be at least twice the planned iterations. `calWindowDays` (`src/load/products/cal.ts`) sizes the window
  to `planned + 34` slots (`ceil(planned / 11.4) + 3` days, minimum 28). It is correct for the smoke (`planned` up to about 160 inside
  28 days) and wrong beyond that. **TEST BUG (latent, Phase 3 journey), not a product bug**; evidence above. It is not triggered by
  `P6-CAL-LOAD-001` (60 planned iterations of 320 slots).
- **The same list shifts under concurrency.** Two iterations that read the list at different moments see different lists, so
  "index `n`" is not a stable slot. The probe at 20 iterations per second (400 planned, 39-day window, 294 requests before the run was
  overloaded) did not collide (100 % checks), but the design is racy by construction.
- **The knee journey therefore picks its slot without the shifting list.** Design: setup reads the free slots once
  (`getSchedule` over the supply window), stores the first `S` slot starts in the run config, and iteration `n` books
  `slotStarts[n]`; each iteration still calls `getSchedule` for a fixed 28-day window **starting at the day of its target slot** (so the
  per-iteration cost is constant, the same 28-day cost as the smoke) and checks that its target is offered. Unique target per
  iteration means no slot contention (`P6-CAL-LOAD-002` owns contention, Task 8).
- **Supply size.** `S = ceil(1.05 x sum over steps of rate x hold)`. For the default plan (start 2, step 2, hold 30 s, 9 steps =
  2,4,…,18 per second) that is `30 x (2+4+…+18) = 2,700` iterations, `S = 2,835`; the supply window is `ceil(S / 11.4) + 14` = 263
  days; one `getSchedule` of 270 days returned 3,104 slots in 270 ms, so the window fits. The config file for 1,500 slots was 48.5 KB
  (32 bytes per slot); 2,835 slots are 91 KB per VU `open()`: acceptable for 80 to 160 VUs.
- **Cleanup cost.** Cancelling 318 bookings took 20.1 s (63 ms each); 2,700 take about 2.8 minutes.

### 3.2 Does `BotDetectionService` refuse k6 traffic? (probe item 2)

No. 652 bookings from k6 (two knee runs, user agent `k6`; 638 of them seen by the client, see §3.4) were accepted. Why: `packages/features/bot-detection/BotDetectionService.ts`
returns at the first line unless `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER === "1"`, and even then only for **team** event types whose team has the
`booker-botid` feature. In the harness product `.env` the variable is present and **empty** (read: value length 0); `pro/30min` is not a
team event. `checkRateLimitAndThrowError` is a no-op because `UNKEY_ROOT_KEY` is present and empty (`packages/lib/rateLimit.ts` lines
34 to 41 return `{ success: true }`). No Redis client is configured (`UPSTASH_REDIS_REST_URL` is not in the product `.env`). Facts recorded
for Task 6 and Task 8: Cal has no limiter in this stack, and the slot cache has no Redis behind it.

### 3.3 The coarse ramp: where the knee is on the VM (sizing only)

Two runs of the held-step script (`start 2, step 2, hold 20 s, ramp 2 s, 8 steps`, smoke p95 taken as 80 ms so the stop is at 800 ms,
k6 abort with `delayAbortEval` 8 s; slots from the setup as in §3.1). Per step: arrival rate, iterations started of planned, http
p95, errors, application CPU (the group of `cal-web.pid`, mean of the samples inside the hold minus 2 s at each edge), database
sessions:

```text
run 1                                                                       run 2
step rate  started/planned  p95 ms  errors  app cores  db active/total  RSS    step rate  started/planned  p95 ms  app cores
0   2/s    40/40            137.0   0/80    0.43       1.0 / 21         664    0   2/s    40/40            121.3   0.40
1   4/s    80/80            165.9   0/160   0.75       1.0 / 21         685    1   4/s    80/80            162.6   0.68
2   6/s   120/120           274.7   0/240   0.97       1.1 / 21         914    2   6/s   120/120           232.4   0.94
3   8/s    47/160           906.1   0/83    1.08       1.0 / 21        1069    3   8/s    63/160            848.3   1.06   <- stop: p95 >= 800
exit 99 in both; k6 stopped 6 to 9 s into step 3; steps 4 to 7 never started
```

- **The knee on the VM is between 6 and 8 iterations per second, twice, the same step.** Application group CPU 0.94 to 0.97 cores at the
  last clean step and 1.06 to 1.08 at the stop step; database active sessions 1, waits 0 of 16 samples in every clean step, 0 locks;
  the health probe latency rose from 82 to 456 ms. First saturated resource by the Task 1 rule: `app_cpu` (≥ 0.9 cores from step 2).
  Postgres and the connection count are not the limit.
- **Which request moves p95.** From the points file, p95 per request name at steps 0, 1, 2, 3: `GET getSchedule` 74, 74, 105, 273 ms;
  `POST book` 128, 172, 253, **903** ms. The booking request carries the knee.
- **Generator headroom.** k6 used 0.027 cores on average (max 0.08); the runner was 28 % busy on average (max 46 %) at the knee;
  available memory never fell under 87.8 %. Peak VUs 80 of 80 pre-allocated (9 in use at the knee; the pool was sized for 18 per second).
  The generator is not the limit. The Cal process RSS grew from 664 to 1,117 MB during 75 s (context, not a finding).
- **The step plan reaches the stop rule well inside the job.** The default plan of §3.1 is 9 steps of 32 s = 4.8 minutes at most; the
  knee should trip around step 2 or 3 (about 100 s).
- **Dropped iterations were 0 in every clean step** (`started == planned`), so the Task 1 per-step validity rule is met.

### 3.4 The audit needs a slack for iterations the stop interrupted (finding, **TEST BUG**)

Both runs ended `FAIL` in the post-load audit: `client was told ACCEPTED for 311 bookings, the database holds 318` and `327 / 334`. The
difference is 7 in both. k6 reported `336 started, 327 completed, 9 interrupted` for run 2: when the stop rule aborts k6, iterations that
are mid-flight lose their response although the booking is already committed (7 of the 9 had). The database count minus the client
count is therefore between 0 and the number of interrupted iterations. **This is a TEST BUG of the audit contract in knee mode, with
evidence; it is not a product bug.** The fix is in Task 1 (the reconcile stage passes `interrupted = started - completed` to every
audit; the Cal audit accepts `0 <= db - client <= interrupted`). Anything outside the slack is still a `PRODUCT BUG (SUSPECTED)`. No
expected-failure marker is planned.

### 3.5 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. The knee range on the GitHub runner (same vCPU count and Postgres container; the range may differ): **UNPROBED**, three dispatch
   runs give it. The default plan's top (18 per second) is 2.3 times the VM knee; if the runner shows no stop, the run is INVALID
   (`no_knee`) and the dispatch is repeated with a higher `start_rate`/`step_rate`.
2. Job time on the runner (§9 estimates come from the VM and from the job `cal-smoke` run 40141809613).
3. A cold Cal build when the cache key misses (`cal-next-<CAL_REF>-h0.2.15` is written by `perf.yml` on `main`; `knee.yml` only restores
   it): the harness `up` cap is 30 minutes as in `cal-smoke`; this VM needed about 14 minutes.
4. `db_cpu` (container CPU) on the runner: the VM's `/sys/fs/cgroup` is `tmpfs`, so the source errors there (Task 1 §3.8); **confirm in
   the first CI dispatch**.
5. The Redis slot cache: **not active** in this stack (no Redis client); recorded here because Task 8 depends on it. It is not read by
   `getSchedule` in this journey (distinct 28-day windows per day, 2,000 ms cache irrelevant without Redis).

## 4. Depends on earlier plans

Task 1 (plan): `kneeOptions`, `beginKneeIteration`, `observeKneeResponses`, `kneeHooks`, `buildKneePlan`, `kneeStage`, `K6RunSpec.knee`,
`K6RunSpec.allowExits`, `kneePlanFromInputs`, the reconcile slack for interrupted iterations, `KneeReport`. Task 11 (plan):
`k6/thresholds/smoke-p95.json`, `parseSmokeBaseline`, `smokeP95For`. On `main` after Phase 3: `k6/journeys/cal-book.js`,
`k6/cases/cal-load-001.js`, `src/load/products/cal.ts` (`calSetupWith`, `calCleanupWith`, `calWindowDays`), `src/load/reconcile/cal.ts`,
`src/cal/api.ts` (`getFreeSlots`), `src/cal/oracle.ts` (`HOST_OVERLAP_SQL`, `resolveHostSetup`, `caseLiveBookings`),
`scripts/bootstrap.sh`, `.github/workflows/perf.yml` (`cal-smoke` job as the template).

## 5. Build-time recheck

| #   | Check               | Command                                                                                                                                                                                            | Expected                                                                      |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Base                | `git fetch origin main && git log --oneline origin/main \| grep -c "knee"`                                                                                                                         | Task 1 merged (≥ 1); otherwise stop and report                                |
| 2   | Baseline            | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                | exit 0; `# tests` = B2                                                        |
| 3   | Names               | `grep -n "export function kneeOptions" k6/lib/knee.js; grep -n "export function kneePlanFromInputs" src/load/knee/plan-input.ts; grep -n "export function calWindowDays" src/load/products/cal.ts` | three hits; otherwise stop and report                                         |
| 4   | The p95 reference   | `test -f k6/thresholds/smoke-p95.json && node -e "…parseSmokeBaseline…"` (§6.6)                                                                                                                    | the file exists with `P6-CAL-LOAD-001`; if not, see §6.6                      |
| 5   | Cal is bootstrapped | `bash scripts/bootstrap.sh cal`; `export NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"` in a Claude Code cloud VM                                                                      | exit 0                                                                        |
| 6   | The slot facts      | `npm run up:cal`, then the §3.1 probe (booked slots leave `getSchedule`; 270 days return ≥ 3,000 slots)                                                                                            | 320 → 318 after two bookings; ≥ 3,000 slots in 270 days                       |
| 7   | Product flags       | read `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER`, `UNKEY_ROOT_KEY` lengths from `products/cal/.env` (lengths only, never values)                                                                      | both 0                                                                        |
| 8   | The case runs once  | `npm run load:cal-knee -- --profile pr` (§10), then `npm run down:cal`                                                                                                                             | exit 0 or 3 (INVALID is allowed on a noisy VM), `knee-report-main.md` written |

## 6. Design

### 6.1 File tree

```text
k6/lib/pure/cal-slots.js                  NEW      slotFor(starts, n), scheduleWindow(target, days) (pure)
k6/journeys/cal-book.js                   CHANGED  cfg.slotStarts mode (deterministic slot, fixed 28-day window from the target's day); other modes unchanged
k6/cases/cal-load-005.js                  NEW      knee script (Task 1 library + the journey)
k6/cases/cal-load-005.example.json        NEW      example config for a standalone run
src/load/knee/cal-supply.ts               NEW      slotsNeeded(plan), supplyWindowDays(S), pickSlotStarts(slots, S)
src/load/products/cal.ts                  CHANGED  calSetup({ knee: KneePlanSpec }): reads the supply once, writes slotStarts, preflight on supply
src/load/cases.ts                         CHANGED  + CAL_LOAD_005
package.json                              CHANGED  + load:cal-knee
.github/workflows/knee.yml                NEW      workflow_dispatch + Saturday schedule; job cal-knee (Tasks 3 and 4 add jobs)
README.md                                 CHANGED  + "Cal knee" section after the runs exist (11b-style docs step, §12 step 7)
tests/unit/k6-lib-cal-slots.test.ts, cal-knee-supply.test.ts, load-cases-cal-knee.test.ts   NEW
tests/unit/load-products-cal.test.ts      CHANGED  (+2)
```

### 6.2 Pure slot helpers (`k6/lib/pure/cal-slots.js`, NEW)

```js
const DAY = 86400000;

/**
 * The target start of iteration n; undefined when the supply is exhausted (the journey records a failed step, which the
 * knee stage reports as a TEST BUG: supply).
 * @param {string[]} starts ISO starts, ascending, unique
 * @param {number} n exec.scenario.iterationInTest
 * @returns {string | undefined}
 */
export function slotFor(starts, n) {
  return starts[n];
}

/**
 * The getSchedule window of one iteration: `days` days from 00:00 UTC of the target's day (constant cost per iteration).
 * @param {string} target
 * @param {number} days
 * @returns {{ startTime: string, endTime: string }}
 */
export function scheduleWindow(target, days) {
  const day = Math.floor(Date.parse(target) / DAY) * DAY;
  return {
    startTime: new Date(day).toISOString(),
    endTime: new Date(day + days * DAY).toISOString(),
  };
}
```

`k6/journeys/cal-book.js` (CHANGED): in `runCalBook(cfg, opts)`, when `cfg.slotStarts` is set, the first step becomes:

```js
{
  name: "getSchedule",
  run: () => {
    const target = slotFor(cfg.slotStarts, n); // supply exhausted: the step fails (TEST BUG)
    if (target === undefined) return { ok: false };
    const w = scheduleWindow(target, 28);
    const input = { json: { ...baseInput, startTime: w.startTime, endTime: w.endTime } };
    const r = request("GET", `${cfg.baseUrl}/api/trpc/slots/getSchedule?input=${encodeURIComponent(JSON.stringify(input))}`, "GET getSchedule");
    if (r.status !== 200) return { ok: false };
    const offered = Object.values(r.json("result.data.json.slots")).flat().map((s) => s.time);
    // the target must be offered (it is ours alone); otherwise the setup list is stale: a TEST BUG
    return { ok: offered.some((t) => Date.parse(t) === Date.parse(target)), data: { start: target } };
  },
},
```

The `book` step and everything after it are unchanged (it reads `s.start`). Without `cfg.slotStarts` the journey is byte-for-byte the
Phase 3 behaviour (the smoke, `-007`, `-009` keep using it).

### 6.3 The knee script (`k6/cases/cal-load-005.js`, NEW)

```js
// P6-CAL-LOAD-005: Cal booking knee (plan Phase 4 task 2). Standalone, against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-005.example.json k6 run k6/cases/cal-load-005.js
import { loadLoadConfig } from "../lib/config.js";
import { beginKneeIteration, kneeHooks, kneeOptions, observeKneeResponses } from "../lib/knee.js";
import { buildKneePlan } from "../lib/pure/knee.js";
import { runCalBook } from "../journeys/cal-book.js";

// Defaults equal k6/cases/cal-load-005.example.json (they let `k6 inspect` run the init context).
const cfg = {
  startRate: 2,
  stepRate: 2,
  holdSec: 30,
  rampSec: 2,
  maxSteps: 9,
  smokeP95Ms: 100,
  pre: 80,
  max: 160,
  delayAbortEvalSec: 10,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-005",
  windowDays: 28,
  slotStarts: [],
  ...loadLoadConfig([]),
};
const plan = buildKneePlan(cfg);
export const options = kneeOptions({
  ...cfg,
  plan,
  exec: "journey",
  tags: { case: "P6-CAL-LOAD-005", journey: "cal-book" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("cal");
export function journey() {
  beginKneeIteration(plan);
  runCalBook(cfg);
}
```

(`kneeOptions` passes `exec` through `rampingOpenScenario`, which already accepts it.) Journey `check`s stay
(`getSchedule`, `book`); a failed check counts as an error only through `observeKneeResponses`, which classifies HTTP responses; a
journey failure with no HTTP error (the target not offered) is visible as `checks` failing and as a `book` step missing, and the
audit's client-vs-database comparison catches a missing booking. The knee stage also reports the `checks` pass rate per step.

### 6.4 Supply and setup (`src/load/knee/cal-supply.ts`, NEW; `calSetup`, CHANGED)

```ts
import type { KneePlanSpec } from "../types.ts";

/** ceil(1.05 x sum of rate x holdSec over the steps): the slots the plan can book, with 5 % margin. */
export function slotsNeeded(p: KneePlanSpec): number {
  let sum = 0;
  for (let i = 0; i < p.maxSteps; i += 1) sum += (p.startRate + i * p.stepRate) * p.holdSec;
  return Math.ceil(sum * 1.05);
}
/** Days of getSchedule that hold S slots: ceil(S / 11.4) + 14. */
export function supplyWindowDays(slots: number): number {
  return Math.ceil(slots / 11.4) + 14;
}
/** Ascending, unique ISO starts, the first `count`. Throws "TEST BUG: slot supply …" when fewer are free. */
export function pickSlotStarts(offered: string[], count: number): string[] {
  const starts = [...new Set(offered.map((s) => new Date(s).toISOString()))].sort();
  if (starts.length < count)
    throw new Error(`TEST BUG: slot supply ${starts.length} < needed ${count}`);
  return starts.slice(0, count);
}
```

`calSetupWith` (CHANGED): `CalSetupOptions` gets `knee?: KneePlanSpec`. When set: after the normal config, call
`getFreeSlots(from, from + supplyWindowDays(S) days, eventTypeId)` once (the same function `src/cal/api.ts` exports; `from` = today
00:00 UTC + 2 days as `createSlotAllocator` does), `pickSlotStarts`, write `ctx.config.slotStarts`, `windowDays: 28`, the plan fields
(`startRate`, `stepRate`, `holdSec`, `rampSec`, `maxSteps`), and the audit config. A supply short of `S` returns `{ ok: false,
kind: "TEST BUG", reasons: ["slot supply …"] }` before any load. `windowDays` for the old modes still uses `calWindowDays`.

### 6.5 The case (`src/load/cases.ts`, CHANGED)

```ts
export const CAL_LOAD_005: LoadCase = {
  id: "P6-CAL-LOAD-005",
  title: "Cal booking journey knee: held ramping-arrival-rate steps",
  product: "cal",
  label: "knee range, environment-bound",
  profiles: {
    // rate = start rate; durationSec = total planned seconds of the default plan (9 steps x 32 s); maxLatencyMs sizes nothing here
    pr: { rate: 2, durationSec: 96, maxLatencyMs: 2000 }, // 3 steps (2, 4, 6/s) x 12 s hold: a smoke of the machinery
    full: { rate: 2, durationSec: 288, maxLatencyMs: 2000 },
  },
  telemetry: { product: "cal" },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/cal-load-005.js",
      env: {},
      allowExits: [0, 99],
      knee: { ...kneePlanFor(ctx), smokeP95Ms: ctx.config.smokeP95Ms as number, maxVUs: 160 },
    },
  ],
  stages: {
    setup: calSetup({ knee: true }),
    reconcile: composeStages([kneeStage, reconcileStage]),
    cleanup: calCleanup,
  },
};
```

`kneePlanFor(ctx)` (Task 1) reads `startRate`, `stepRate`, `holdSec`, `rampSec`, `maxSteps` from the dispatch inputs through
`kneePlanFromInputs(ctx.env, DEFAULTS)` with the defaults `{ startRate: 2, stepRate: 2, holdSec: 30, rampSec: 2, maxSteps: 9 }` on
`full` and `{ 2, 2, 12, 2, 3 }` on `pr`. `smokeP95Ms` comes from the setup stage: `smokeP95For(parseSmokeBaseline(JSON.parse(readFileSync(
"k6/thresholds/smoke-p95.json"))), "P6-CAL-LOAD-001")` (Task 11). If the file is missing the setup returns `ENV: smoke p95 reference
missing (Phase 3 Task 11 not merged)`; there is no default number in code. `reconcileStage` runs the Cal audit with the interrupted
slack (Task 1): no overlapping accepted pairs (`HOST_OVERLAP_SQL`, `P6-OBS-CAL-002` counted under its id), accepted-only,
`0 <= db - client <= interrupted`. `CASES` gets the entry; `package.json` gets
`"load:cal-knee": "node scripts/load/run-load.ts --case P6-CAL-LOAD-005"`.

### 6.6 The p95 reference and the sanity ratio

The stop limit is `10 x smokeP95Ms`, `smokeP95Ms` = `cases["P6-CAL-LOAD-001"].medianP95Ms` of `k6/thresholds/smoke-p95.json`
(Task 11 §6.5), read at setup, written into `k6-config.json`, and printed in the report. The smoke journey (28-day window from today,
index into the shrinking list) and the knee journey (28-day window from the target's day, fixed slot) do the same two requests; the
VM's step-0 p95 (121 to 137 ms) against the CI example smoke p95 (75.8 ms from a different machine) shows that the reference must
come from the same environment class. The report prints the ratio `step 0 p95 / smoke median`; **a ratio above 2 is printed as a
warning line in the job summary, not a failure** (it means the journeys or the runners differ; Open decision Q4).

### 6.7 The workflow (`.github/workflows/knee.yml`, NEW)

```yaml
name: knee
on:
  workflow_dispatch:
    inputs:
      start_rate: { description: "Start rate (iterations per second)", default: "2", type: string }
      step_rate: { description: "Rate added per step", default: "2", type: string }
      hold_sec: { description: "Hold per step (seconds)", default: "30", type: string }
      max_steps: { description: "Maximum steps", default: "9", type: string }
  schedule:
    - cron: "43 3 * * 6" # Saturday 03:43 UTC, off the top of the hour; soaks own Sunday (D4, D16)
permissions: { contents: read }
concurrency:
  group: knee-${{ github.event_name == 'schedule' && 'weekly' || format('dispatch-{0}', github.run_id) }}
  cancel-in-progress: false
defaults: { run: { shell: bash } }
env:
  CAL_REF: c2b7ac44c66f24ffef1662b276f0653988a609a3 # same SHA as perf.yml and scripts/bootstrap.sh (the job verifies)
jobs:
  cal-knee:
    name: cal-knee
    runs-on: ubuntu-24.04
    timeout-minutes: 90
    env:
      {
        …same job env as cal-smoke… ; KNEE_START_RATE: "${{ inputs.start_rate }}",
        KNEE_STEP_RATE: "${{ inputs.step_rate }}",
        KNEE_HOLD_SEC: "${{ inputs.hold_sec }}",
        KNEE_MAX_STEPS: "${{ inputs.max_steps }}",
      }
    steps: # the steps of cal-smoke from "checkout" to "Start Cal (harness up)" unchanged (same pinned action SHAs, same cache keys, restore only), then:
      - name: Knee P6-CAL-LOAD-005 (knee range, environment-bound)
        id: knee
        timeout-minutes: 15
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: |
          set -euo pipefail
          status=0
          npm run load:cal-knee -- --profile full || status=$?
          # exit 3 is INVALID: shown in the summary, excluded from the knee statistics (P6-RULE-005), the job stays green
          if [ "$status" -eq 3 ]; then echo "::warning::knee run INVALID (see the job summary)"; status=0; fi
          exit "$status"
      - name: Job summary (knee table)
        if: ${{ !cancelled() }}
        timeout-minutes: 2
        run: node scripts/write-ci-job-summary.ts
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      - name: Token scan of the knee results
        id: token_scan
        if: ${{ !cancelled() }}
        timeout-minutes: 2
        run: node scripts/evidence-token-scan.mjs results/load
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
        timeout-minutes: 3
        with:
          {
            name: knee-cal,
            path: "${{ env.P6_WORKING_DIRECTORY }}/results/load/",
            if-no-files-found: warn,
            retention-days: 14,
          }
      - name: Stop Cal (harness down)
        if: ${{ always() }}
        timeout-minutes: 5
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: npm run down:cal
```

The `inputs.*` values are empty on a scheduled run, so `kneePlanFromInputs` falls back to its defaults for empty strings. The
workflow runs on `main` only (`schedule` runs on the default branch; a dispatch from another ref is refused in the first step with the
same `github.ref` guard `evidence-release.yml` uses). Every action is pinned by SHA as in `perf.yml`; `actionlint` (in
`npm run check`) validates the file. It never runs on pull requests (D16); PRs run the product-free self-test of Task 1.
**Evidence release note (cross-task):** `evidence-release.yml` accepts runs of the `perf.yml` workflow id only
(`PERF_WORKFLOW_ID`), so `knee` runs cannot be released until Task 6 widens that check (Q1).

## 7. Oracles and assertions

Every LOAD case needs a correctness oracle. Here: (1) the **post-load audit** (Phase 3 Task 6 + Task 1's slack): accepted-only, client
count vs database within the interrupted slack, no overlapping accepted pairs (`HOST_OVERLAP_SQL`; a pair counts under
`P6-OBS-CAL-002`, never hidden); (2) the **leak check** after the cleanup sweep (`leakCheck`, `src/cal/oracle.ts`); (3) the **knee
contract**: the report is a KNEE with a range between two steps, or NO_KNEE/INVALID with its reason; the stop reason is the D2 rule
(`error_rate` or `p95`); (4) **supply**: the setup preflight and the `getSchedule` "target is offered" check (a failure is a TEST
BUG: supply).

**PRODUCT BUG vs TEST BUG.** An overlapping pair among distinct slots, a booking the client did not see beyond the interrupted slack, a
5xx before the rule trips, or a database error line in the Cal log would be `PRODUCT BUG (SUSPECTED)` with the run link, labelled by
the owner only after repeated full-count runs (rule 13). A slot supply shortfall, a stale target list, an audit mismatch within the
interrupted slack, or a plan that ends without a stop is a TEST BUG or INVALID, never a product label. **No `PRODUCT BUG (SUSPECTED)` was
found by this probe.** No expected-failure marker, no skip, no widened margin.

## 8. Data isolation, cleanup, leak check

Prefix: `caseDataPrefix(runPrefix, "P6-CAL-LOAD-005")` (lowercase `[a-z0-9-]`), attendee `i<n>` emails
(`attendeeEmail(prefix, "i"+n)`), one booking per iteration at its own slot. Cleanup: `calCleanupWith` cancels every live booking of
the prefix **found by the database** (not by the uids k6 saw: interrupted iterations never learned theirs), sequentially, 63 ms each
(2.8 minutes for 2,700); a failed cancel is a TEST BUG line and the sweep goes on; then `leakCheck`. Bookings made far in the future
(up to about 263 days) are cancelled the same way. No private-link or event-type change, so `calPriorLinks` is not used. Token scan:
the `tokenScan` stage and the workflow step; artefacts carry counts, rates and ids only.

## 9. CI, token scan, budget

Job `cal-knee` in `.github/workflows/knee.yml`, own timeout **90 minutes**, runs on `workflow_dispatch` and Saturday only (D16).
Estimate (warm caches) from run 40141809613's `cal-smoke` steps: checkout 4 s, P6 deps 7 s, caches 32 s, Cal deps 48 s, Prisma 8 s,
build cache 5 s, pull 8 s, `up:cal` 71 s = **about 3.1 min**; knee step ≤ 4.8 min of k6 (9 steps of 32 s) but it should stop near
step 3 (about 2 min) plus setup (supply read 0.3 s) and teardown; audit and cleanup 0.1 + 2.8 min; summary, scan, upload, `down`
about 1 min. **Estimate 7 to 11 min.** Cold build allowance (cache miss): `up:cal` took about 14 min on the VM; cap 30.

| Step                               | `timeout-minutes` | Estimate (min)                         | Stop rule (80 %)    |
| ---------------------------------- | ----------------- | -------------------------------------- | ------------------- |
| setup steps up to Prisma/bootstrap | 2 to 8 each       | 1.7                                    | per step            |
| Cal pull                           | 6                 | 0.15                                   | 4.8                 |
| `up:cal` (harness)                 | 30                | 1.2 warm, 14 cold                      | 24                  |
| **knee step**                      | **15**            | 5.5 (incl. 2.8 cleanup, 9 steps worst) | **12**              |
| summary / scan / upload / down     | 2 / 2 / 3 / 5     | 1                                      | 1.6 / 1.6 / 2.4 / 4 |

Worst case at the caps of the steps that can run long (`up` 30 + knee 15) plus the warm setup, post steps and the three cache-save
allowances is **about 62 minutes**; job timeout 90, **margin 28**. With estimates: 11 minutes. If the first dispatch shows the knee step
over 12 minutes (80 % of its 15), the fix is a shorter hold or fewer steps, never a higher timeout. No existing job changes; no
existing timeout is raised. A knee dispatch costs about 15 runner minutes; three runs about 45.

## 10. Expected output

```text
$ npm run load:cal-knee -- --profile pr
P6-CAL-LOAD-005 (knee range, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   supply 152 slots (3 steps x 12 s hold), smoke p95 reference 100 ms
  k6 main      exit 99  steps 0..2 of 3   (stop rule: p95 >= 1000 ms)  or  exit 0, no stop
  knee         KNEE between step 1 (4/s) and step 2 (6/s); stop: p95; first saturated: app_cpu (step 2)   | NO_KNEE -> INVALID no_knee
  reconcile    ok   audit: 0 overlapping accepted pairs; client 118, database 121 (interrupted 3)
  cleanup      ok   121 bookings cancelled, leak check clean
  verdict      PASS | INVALID  results/load/P6-CAL-LOAD-005/<run id>/verdict.json
```

(Values are illustrative VM-class numbers; the PR profile is a smoke of the machinery and may end INVALID `no_knee`, which is
accepted for the PR step: it is not a published result.) The job summary prints `knee-report-main.md`: the range, both rates, the stop
reason, the first saturated resource, the run id and the environment label.

## 11. Environment changes (exact steps)

None for Cursor Cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) or Claude Code cloud (setup script,
`.claude/hooks/session-start.sh`). Cal needs `NODE_OPTIONS` with `--max-old-space-size=8192` on a Claude Code cloud VM that sets
`--use-openssl-ca` (already documented in `docs/handoff/2026-10-24-p6-phase3-autonomous-run.md`; the build here inherited it). Manual
repo settings: none. A knee dispatch is started from the Actions tab ("Run workflow" on `main`) by the owner.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-cal-knee origin/main`.
Counts relative to B2 (§5 check 2).

| Step | Commit subject                                                             | `git add` paths                                                                                                                       | Expected (`npm run check`)                                                                      |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0    | `docs(plans): bring the phase 4 task 2 plan onto the build branch`         | `docs/plans/2026-10-25-p6-phase4-task2-cal-knee.md`                                                                                   | exit 0, B2                                                                                      |
| 1    | `feat(k6): add the cal slot helpers`                                       | `k6/lib/pure/cal-slots.js tests/unit/k6-lib-cal-slots.test.ts`                                                                        | exit 0, **B2 + 3**                                                                              |
| 2    | `feat(load): size and pick the cal slot supply of a knee`                  | `src/load/knee/cal-supply.ts tests/unit/cal-knee-supply.test.ts`                                                                      | exit 0, **B2 + 7**                                                                              |
| 3    | `feat(k6): add the fixed-slot mode to the cal journey and the knee script` | `k6/journeys/cal-book.js k6/cases/cal-load-005.js k6/cases/cal-load-005.example.json`                                                 | exit 0, B2 + 7; `k6 inspect` ok                                                                 |
| 4    | `feat(load): add the cal knee case and its setup`                          | `src/load/products/cal.ts src/load/cases.ts package.json tests/unit/load-products-cal.test.ts tests/unit/load-cases-cal-knee.test.ts` | exit 0, **B2 + 12**; `npm run load:cal-knee -- --profile pr` against a started Cal exits 0 or 3 |
| 5    | `ci(knee): add the knee workflow with the cal job`                         | `.github/workflows/knee.yml`                                                                                                          | exit 0 (actionlint silent), B2 + 12                                                             |
| 6    | `docs: describe the cal knee run and its dispatch inputs`                  | `README.md`                                                                                                                           | exit 0, B2 + 12                                                                                 |

New unit tests by name (12): `k6-lib-cal-slots` (3: `slotFor` returns the target and `undefined` past the supply; `scheduleWindow`
starts at 00:00 UTC of the target's day and ends `days` later; a target at 23:30 UTC stays in its day); `cal-knee-supply` (4:
`slotsNeeded` of the default plan is 2,835; `supplyWindowDays(2835)` is 263; `pickSlotStarts` dedupes, sorts and cuts; a short list throws
`TEST BUG: slot supply`); `load-cases-cal-knee` (3: the case, its run (`allowExits [0, 99]`, `knee.maxVUs 160`) and telemetry
product `cal`; the default plan's planned iterations fit the 3,000-slot cap; `package.json` has the script and the example config
parses with the keys the script reads); `load-products-cal` (+2: `calSetupWith` with `knee` writes `slotStarts`, plan fields and
`windowDays 28`; a supply shorter than `S` returns a TEST BUG before load). Count 3 + 4 + 3 + 2 = **12**; steps 1 → +3, 2 → +4,
4 → +5.

After step 6: push, `gh pr create` (rule 3), CI once (rule 15): the PR runs only the product-free job of Task 1 (no product job
runs this workflow on a PR). Then, **after the owner merges**, the owner dispatches `knee.yml` three times on `main` (§14).

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                                    | Mitigation                                                                                 |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| R1  | Slot exhaustion ends the run before the knee                            | exact supply preflight; 5 % margin; INVALID/TEST BUG, never a knee                         |
| R2  | The single Next.js process makes CPU the first resource on every run    | a valid result, stated as environment-bound in the report label                            |
| R3  | The runner's knee is outside the default plan (below 2/s or above 18/s) | `no_knee` or a stop at step 0 is reported; dispatch inputs change the plan; no code change |
| R4  | A far-future booking horizon changes with a Cal ref bump                | the setup preflight reads the real slots; a bump runs the case again                       |
| R5  | k6 abort leaves in-flight bookings                                      | the audit slack of Task 1; leftover bookings are swept by prefix                           |
| R6  | Cleanup of 2,700 bookings takes 3 minutes of job time                   | counted in §9                                                                              |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                                                | Probe shows                                                                        | Effect                                               |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| C1  | "(getSchedule → book) with unique prefixed attendees"                                       | the Phase 3 slot choice shrinks with every booking (2 slots per booking) and races | fixed-slot mode in the journey (§3.1, §6.2)          |
| C2  | "perf.yml (or a dispatch + weekly-Saturday knee workflow, D16)"                             | `perf.yml` has one cron and 14 jobs; the evidence release accepts one workflow id  | new `knee.yml` (Q1); release check widened in Task 6 |
| C3  | "step plan that reaches the stop rule within the job timeout (`cal-smoke` is 60 min today)" | the knee run is under 15 minutes in its own job                                    | own job and timeout 90                               |
| C4  | "whether the `BotDetectionService` … refuses k6 traffic"                                    | it is off in the harness stack (env flag empty, not a team event)                  | recorded; no workaround needed                       |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-CAL-LOAD-011`: attribution ramps. `getSchedule` only, then `book` only, to name which route saturates first (the probe: the booking
  request's p95 was 903 ms against 273 ms for `getSchedule` at the stop step).
- `P6-CAL-LOAD-012`: a knee with the slot cache path active (needs a Redis client in the harness; Task 8 decides after its probe).

**Open decisions** (option, evidence, recommended default).

- **Q1. Where do the knee jobs live?** (a) a new `knee.yml` (dispatch + Saturday), release check widened to a list of workflow ids in Task 6
  (recommended; `perf.yml` already has 14 jobs and one cron, and a Saturday cron there would run every race job on Saturday too);
  (b) jobs in `perf.yml` guarded by `github.event_name`. Evidence: §6.7, C2. **Default: (a).**
- **Q2. Journey change.** (a) a fixed-slot mode in `cal-book.js` (recommended: one journey, the smoke untouched); (b) a separate
  `cal-book-knee.js`. Evidence: §3.1. **Default: (a).**
- **Q3. Default plan.** (a) start 2, step 2, hold 30 s, 9 steps (recommended: three steps above the VM knee, 2,835 slots); (b) start 1, step 1
  (finer, 18 steps, 2,000-slot cap, longer). **Default: (a).**
- **Q4. The smoke reference comes from a different journey variant.** (a) accept it and print the step-0 ratio as a warning above 2
  (recommended); (b) re-run the Phase 3 smoke on the fixed-slot journey in Task 11. **Default: (a).**
- **Q5. Cal on a Saturday schedule at 03:43 UTC.** (a) as proposed; (b) dispatch only until three runs exist. **Default: (b) for the first
  weeks, (a) once three VALID runs are in the release.**

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B2 + 12** unit tests; `k6 inspect` lists the new scripts.
- [ ] 3 VALID `workflow_dispatch` runs of `knee.yml` on `main`, each with a KNEE report: range between two steps, stop reason, first
      saturated resource, `knee-report-main.md`, chart and telemetry, a clean audit (no overlap, client vs database within the interrupted
      slack) or a recorded product bug under its ID; the three ranges and their spread (min and max of lower and upper rate) in the job
      summaries.
- [ ] Run ids and `run-meta.json` per run listed; INVALID runs listed with reasons and excluded.
- [ ] Nothing in the repo claims a number from the VM; README says "knee range" and carries the environment label.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID dispatch runs with range, stop reason, resource, clean audit; spread in the summary; `npm run
check` green: §14. Gap: runner values (§3.5).
- (b) Existing names grepped on the Task 10 head: `k6/journeys/cal-book.js` (`runCalBook`), `k6/cases/cal-load-001.js`,
  `src/load/products/cal.ts` (`calSetupWith`, `calCleanupWith`, `calWindowDays`), `src/load/reconcile/cal.ts`, `src/cal/api.ts`
  (`getFreeSlots`), `src/cal/oracle.ts` (`resolveHostSetup`), `scripts/bootstrap.sh`, `.github/workflows/perf.yml` (`cal-smoke`),
  `scripts/write-ci-job-summary.ts`. From Task 1 / Task 11 (NEW there): the names in §4. NEW here with skeletons: §6.1.
- (c) CI time: §9, worst 62 of 90 minutes; no existing timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) No owner answer is recorded as given; Q1 to Q5 are open with defaults.
