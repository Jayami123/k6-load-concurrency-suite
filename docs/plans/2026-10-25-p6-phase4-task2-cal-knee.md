# P6 Phase 4 Task 2: Cal booking-journey knee (`P6-CAL-LOAD-005`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 2", D2, D3, D13, D16. Method:
[2026-10-25-p6-phase4-task1-breakpoint-method.md](2026-10-25-p6-phase4-task1-breakpoint-method.md) (Task 1, **must be merged first**), after PRE-2
([2026-10-25-p6-phase4-pre2-cal-smoke-step-caps.md](2026-10-25-p6-phase4-pre2-cal-smoke-step-caps.md); `knee.yml` copies the `cal-smoke` setup steps with the caps PRE-2 gives them).
The p95 reference is `k6/thresholds/smoke-p95.json`, shipped by Phase 3 Task 11 (on main, PR #65, `6e307cf`).

**Paths.** Every path is a path on `main` after PRE-2 and Phase 4 Task 1 have merged. Paths created by Task 1 are marked "(Task 1)". The Phase 3 stack (Task 10 is PR #62,
`63c4d87`) and the smoke baseline (PR #65) are on main.

## 1. Header

- **Task.** Phase 4 Task 2. Case: `P6-CAL-LOAD-005` (P0).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-cal-knee`.
- **Base.** `origin/main` after PRE-2 and Task 1. B2 is measured at build time (865 at `2db9726`, plus the deltas of PRE-1, PRE-2 and Task 1).
- **Harness pin.** Unchanged (`v0.2.15`). **Environment change.** None.
- **Unit tests.** B2 = the count on `main` when the build starts. This plan adds **+14** (§12); expected B2 + 14.
- **Stop for owner review.** Yes (rule 10): a new CI workflow `knee.yml`, **dispatch only** (no `schedule:` block in any Phase 4a PR; the Saturday cron is a
  later PR, index G8). Q1 (decided) put the knee jobs there.

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

### 3.4 The audit must reconcile per intent (finding, **TEST BUG** of the count contract)

Both runs ended `FAIL` in the post-load audit under the Phase 3 count contract: `client was told ACCEPTED for 311 bookings, the database holds 318` and `327 / 334`. The
difference is 7 in both. k6 reported `336 started, 327 completed, 9 interrupted` for run 2: when the stop rule aborts k6, iterations that are mid-flight lose their response
although the booking is already committed (7 of the 9 had). **This is a TEST BUG of the audit contract in knee mode, with evidence; it is not a product bug.** A count slack
(`0 <= db - client <= interrupted`) would also let up to 9 duplicate or ghost bookings pass unseen, so the fix is per intent (Task 1 §6.8): iteration `n` is the attendee email
`<prefix>-i<n>@example.com` (`k6/journeys/cal-book.js:61`, `n` = `exec.scenario.iterationInTest` at line 17); the client logs one outcome line per finished iteration; every
booking maps to a started intent, no intent has two bookings, every `ok` intent has exactly one, every `fail` intent none, and only indeterminate intents (no outcome line) may
have 0 or 1, at most `interrupted` of them. Anything else is `PRODUCT BUG (SUSPECTED)`. The probe is consistent with 7 of the 9 interrupted intents having committed, but it
predates the outcome lines: **UNPROBED — confirm in the first CI dispatch:** the indeterminate-intent count against `interrupted`. No expected-failure marker is planned.

### 3.5 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. The knee range on the GitHub runner (same vCPU count and Postgres container; the range may differ): **UNPROBED**, three dispatch
   runs give it. The default plan's top (18 per second) is 2.3 times the VM knee; if the runner shows no stop, the run is INVALID
   (`no_knee`) and the dispatch is repeated with a higher `start_rate`/`step_rate`.
2. Job time on the runner (the §9 estimates for the copied setup steps are measured on 55 runner runs of `cal-smoke`, PRE-2 §3.2; the knee step itself is from the VM).
3. A cold Cal build when the cache key misses (`cal-next-<CAL_REF>-h0.2.15` is written by `perf.yml` on `main`; `knee.yml` only restores
   it): the harness `up` cap is 30 minutes as in `cal-smoke`; this VM needed about 14 minutes.
4. `db_cpu` (container CPU) on the runner: it reads there (30 of 30 `telemetry-main.json` files of the `p6-phase3` release zips report `sources.container` `present: true, errors: 0`,
   Task 1 §3.8 item 2); the VM's `tmpfs` cgroup is a VM-only failure. Nothing to confirm beyond the first knee telemetry file.
5. The Redis slot cache: **not active** in this stack (no Redis client); recorded here because Task 8 depends on it. It is not read by
   `getSchedule` in this journey (distinct 28-day windows per day, 2,000 ms cache irrelevant without Redis).

## 4. Depends on earlier plans

Task 1 (plan): `kneeOptions`, `beginKneeIteration`, `endKneeIteration`, `observeKneeResponses`, `kneeHooks`, `buildKneePlan`, `kneeStage`, `K6RunSpec.knee`,
`K6RunSpec.allowExits`, `kneePlanFromInputs`, the per-intent reconciliation (`parseIntentLog`, `auditByIntent`, `opts.onCommit`), `KneeReport`. On `main` (PR #65, `6e307cf`):
`k6/thresholds/smoke-p95.json`, `parseSmokeBaseline`, `smokeP95For` (`src/load/smoke-baseline.ts`). PRE-2: the step caps of `cal-smoke`. On `main`: `k6/journeys/cal-book.js`,
`k6/cases/cal-load-001.js`, `src/load/products/cal.ts` (`calSetupWith`, `calCleanupWith`, `calWindowDays`), `src/load/reconcile/cal.ts`,
`src/cal/api.ts` (`getFreeSlots`), `src/cal/oracle.ts` (`HOST_OVERLAP_SQL`, `CASE_LIVE_BOOKINGS_SQL`, `resolveHostSetup`, `caseLiveBookings`),
`scripts/bootstrap.sh`, `.github/workflows/perf.yml` (`cal-smoke` job as the template).

## 5. Build-time recheck

| #   | Check               | Command                                                                                                                                                                                                                                                                                   | Expected                                                                                                         |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Base                | `git fetch origin main && git log --oneline origin/main \| grep -c "knee"; grep -c "timeout-minutes" .github/workflows/perf.yml`                                                                                                                                                          | Task 1 merged (≥ 1) and PRE-2 merged (`cal-smoke` has no uncapped step, see PRE-2 §6); otherwise stop and report |
| 2   | Baseline            | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                                                                                                       | exit 0; `# tests` = B2 (measure; write it into the PR)                                                           |
| 3   | Names               | `grep -n "export function kneeOptions" k6/lib/knee.js; grep -n "export function kneePlanFromInputs" src/load/knee/plan-input.ts; grep -n "export function calWindowDays" src/load/products/cal.ts`                                                                                        | three hits; otherwise stop and report                                                                            |
| 4   | The p95 reference   | `node --input-type=module -e 'import { readFileSync } from "node:fs"; import { parseSmokeBaseline, smokeP95For } from "./src/load/smoke-baseline.ts"; console.log(smokeP95For(parseSmokeBaseline(JSON.parse(readFileSync("k6/thresholds/smoke-p95.json", "utf8"))), "P6-CAL-LOAD-001"))'` | prints `77.1246696` at `2db9726` (the file only changes by an owner-approved Phase 3 re-measurement)             |
| 5   | Cal is bootstrapped | `bash scripts/bootstrap.sh cal`; `export NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"` in a Claude Code cloud VM                                                                                                                                                             | exit 0                                                                                                           |
| 6   | The slot facts      | `npm run up:cal`, then the §3.1 probe (booked slots leave `getSchedule`; 270 days return ≥ 3,000 slots)                                                                                                                                                                                   | 320 → 318 after two bookings; ≥ 3,000 slots in 270 days                                                          |
| 7   | Product flags       | read `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER`, `UNKEY_ROOT_KEY` lengths from `products/cal/.env` (lengths only, never values)                                                                                                                                                             | both 0                                                                                                           |
| 8   | The case runs once  | `npm run load:cal-knee -- --profile pr` (§10), then `npm run down:cal`                                                                                                                                                                                                                    | exit 0 or 3 (INVALID is allowed on a noisy VM), `knee-report-main.md` written                                    |

## 6. Design

### 6.1 File tree

```text
k6/lib/pure/cal-slots.js                  NEW      slotFor(starts, n), scheduleWindow(target, days) (pure)
k6/journeys/cal-book.js                   CHANGED  cfg.slotStarts mode (deterministic slot, fixed 28-day window from the target's day); other modes unchanged
k6/cases/cal-load-005.js                  NEW      knee script (Task 1 library + the journey)
k6/cases/cal-load-005.example.json        NEW      example config for a standalone run
src/load/knee/cal-supply.ts               NEW      slotsNeeded(plan), supplyWindowDays(S), pickSlotStarts(slots, S)
src/load/knee/cal-intents.ts              NEW      CAL_INTENT_ROWS_SQL, calIntentOf(prefix, email), calRowsByIntent(rows, prefix) (§6.4b)
src/load/products/cal.ts                  CHANGED  calSetup({ knee: KneePlanSpec }): reads the supply once, writes slotStarts, preflight on supply
src/load/cases.ts                         CHANGED  + CAL_LOAD_005
package.json                              CHANGED  + load:cal-knee
.github/workflows/knee.yml                NEW      workflow_dispatch only; job cal-knee (Tasks 3, 4, 5, 6 add jobs)
README.md                                 CHANGED  + "Cal knee" section after the runs exist (11b-style docs step, §12 step 7)
tests/unit/k6-lib-cal-slots.test.ts, cal-knee-supply.test.ts, cal-knee-intents.test.ts, load-cases-cal-knee.test.ts   NEW
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

````js
// P6-CAL-LOAD-005: Cal booking knee (plan Phase 4 task 2). Standalone, against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-005.example.json k6 run k6/cases/cal-load-005.js
import { loadLoadConfig } from "../lib/config.js";
import { beginKneeIteration, endKneeIteration, kneeHooks, kneeOptions, observeKneeResponses } from "../lib/knee.js";
import { buildKneePlan } from "../lib/pure/knee.js";
import { runCalBook } from "../journeys/cal-book.js";

// Defaults equal k6/cases/cal-load-005.example.json (they let `k6 inspect` run the init context).
const cfg = {
  startRate: 2,
  stepRate: 2,
  holdSec: 30,
  rampSec: 2,
  maxSteps: 9,
  smokeP95Ms: 77.12, // the median of k6/thresholds/smoke-p95.json, P6-CAL-LOAD-001 (a real run reads it at setup)
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
  const intent = beginKneeIteration(plan);
  let committed = false;
  runCalBook(cfg, { onCommit: () => (committed = true) }); // called where the journey adds to p6_bookings_accepted
  endKneeIteration(intent, committed); // one outcome line per finished iteration (Task 1 §6.8)
}

(`kneeOptions` passes `exec` through `rampingOpenScenario`, which already accepts it.) Journey `check`s stay
(`getSchedule`, `book`); a failed check counts as an error only through `observeKneeResponses`, which classifies HTTP responses; a
journey failure with no HTTP error (the target not offered) is visible as `checks` failing, as an `outcome:"fail"` line, and as an `ok`/`fail`
intent with the wrong number of rows in the per-intent audit. The knee stage also reports the `checks` pass rate per step.

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
````

`calSetupWith` (CHANGED): `CalSetupOptions` gets `knee?: KneePlanSpec`. When set: after the normal config, call
`getFreeSlots(from, from + supplyWindowDays(S) days, eventTypeId)` once (the same function `src/cal/api.ts` exports; `from` = today
00:00 UTC + 2 days as `createSlotAllocator` does), `pickSlotStarts`, write `ctx.config.slotStarts`, `windowDays: 28`, the plan fields
(`startRate`, `stepRate`, `holdSec`, `rampSec`, `maxSteps`), and the audit config. A supply short of `S` returns `{ ok: false,
kind: "TEST BUG", reasons: ["slot supply …"] }` before any load. `windowDays` for the old modes still uses `calWindowDays`.

### 6.4b Rows by intent (`src/load/knee/cal-intents.ts`, NEW)

```ts
/** Same two tables and the same LIKE on a.email as CASE_LIVE_BOOKINGS_SQL (src/cal/oracle.ts lines 25 to 32); read-only through selectRows. */
export const CAL_INTENT_ROWS_SQL = `SELECT DISTINCT b.id, a.email FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id WHERE a.email LIKE $1 AND b.status IN ('accepted', 'pending')`;
/** "<prefix>-i<n>@example.com" → n; undefined when the email is not of this prefix or n is not a whole number (k6/lib/pure/prefix.js attendeeEmail). */
export function calIntentOf(prefix: string, email: string): number | undefined;
/** Rows per intent; a row that maps to no intent is a ghost row. Counts booking ids, so one booking with two attendee rows is one row. */
export function calRowsByIntent(
  rows: Array<{ id: number; email: string }>,
  prefix: string,
): { rowsByIntent: Map<number, number>; ghostRows: number };
```

`reconcileCal` (`src/load/reconcile/cal.ts`, CHANGED in Task 1) calls them when `counters.intents` is present and passes the result to `auditByIntent` (Task 1 §6.8).

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
`full` and `{ 2, 2, 12, 2, 3 }` on `pr`. `smokeP95Ms` comes from the setup stage through the shipped reader (PR #65): `smokeP95For(parseSmokeBaseline(JSON.parse(readFileSync(
"k6/thresholds/smoke-p95.json", "utf8"))), "P6-CAL-LOAD-001")`, the read of `tests/unit/smoke-baseline-file.test.ts:9`. If the file cannot be read or fails
`parseSmokeBaseline`, the setup returns `ENV: smoke p95 reference unreadable`; there is no default number in code. `reconcileStage` runs the Cal audit in per-intent mode (§6.4b,
Task 1 §6.8): every booking maps to a started intent, no intent has two bookings, `ok` intents have exactly one, `fail` intents none, only indeterminate intents 0 or 1; no
overlapping accepted pairs (`HOST_OVERLAP_SQL`, `P6-OBS-CAL-002` counted under its id); accepted-only. `CASES` gets the entry; `package.json` gets
`"load:cal-knee": "node scripts/load/run-load.ts --case P6-CAL-LOAD-005"`.

### 6.6 The p95 reference and the sanity ratio

The stop limit is `10 x smokeP95Ms`, `smokeP95Ms` = `cases["P6-CAL-LOAD-001"].medianP95Ms` of `k6/thresholds/smoke-p95.json` (**77.1246696 ms** at `2db9726`, so the limit is
about 771 ms), computed from the file at setup, written into `k6-config.json`, and printed in the report; it is never a constant in code. The smoke journey (28-day window from today,
index into the shrinking list) and the knee journey (28-day window from the target's day, fixed slot) do the same two requests; the VM's step-0 p95 (121 to 137 ms) against the
runner smoke median (77.1 ms) shows that the reference should come from the same environment class. The report prints the ratio `step 0 p95 / smoke median`; **a ratio above 2
is printed as a warning line in the job summary, not a failure** (it means the journeys or the runners differ; Q4). **UNPROBED — confirm in the first CI dispatch:** the step-0
p95 / 77.12 ms ratio.

### 6.7 The workflow (`.github/workflows/knee.yml`, NEW)

Dispatch only. No `schedule:` block (the Saturday cron is the later `ci(knee)` PR of index G8, which also changes the concurrency group). A new workflow file can only be
dispatched after it is on the default branch, so its first real run comes after this PR merges; PR CI proves only `actionlint` (in `npm run check`) and the perf.yml
`load-knee-selftest` job (index F14).

**(1) The job env: `cal-smoke`'s `env:` block, verbatim.** Print it with
`sed -n '/^  cal-smoke:/,/^    steps:/p' .github/workflows/perf.yml`; the output at `2db9726` is exactly these keys (all nine, then the four knee inputs are added):

```yaml
env:
  P6_WORKING_DIRECTORY: p6
  PRODUCTS_ROOT: ${{ github.workspace }}/products
  CAL_CHECKOUT_PATH: products/cal
  CAL_BASE_URL: http://127.0.0.1:3000
  # Fork trust-auth local DB (no password). Not a secret.
  CAL_DB_URL: postgresql://postgres@127.0.0.1:5450/calendso
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  COREPACK_ENABLE_STRICT: "0"
  TURBO_TELEMETRY_DISABLED: "1"
  NEXT_TELEMETRY_DISABLED: "1"
  KNEE_START_RATE: ${{ inputs.start_rate }}
  KNEE_STEP_RATE: ${{ inputs.step_rate }}
  KNEE_HOLD_SEC: ${{ inputs.hold_sec }}
  KNEE_MAX_STEPS: ${{ inputs.max_steps }}
```

**(2) The setup steps: the 16 `cal-smoke` steps from the first `actions/checkout` through `Start Cal (harness up)`, by exact name.**
`sed -n '/^  cal-smoke:/,/name: Race self-test/p' .github/workflows/perf.yml | rg "^      - (name|uses):"` prints, in order (YAML at `2db9726` lines 967 to 1091):
`actions/checkout@3d3c42e5… # v7.0.1` (path `p6`), `Checkout Cal fork`, `Verify Cal fork HEAD`, `Verify CAL_REF matches bootstrap.sh`, `actions/setup-node@949feb24… # v7.1.0`,
`Install P6 dependencies`, `Install k6 (pinned in .k6-version, checksum-verified)`, `Enable corepack`, `Restore Cal Yarn cache`, `Restore Cal node_modules cache`,
`Install Cal dependencies`, `Generate Cal Prisma client`, `Prepare Cal product .env and harness roots`, `Restore Cal build cache`, `Pull Cal images (3 tries, 15 s then 30 s)`,
`Start Cal (harness up)`. Every copied step carries a `timeout-minutes`, the same value PRE-2 gives it in `cal-smoke` (the table of §9; the uncapped ones get theirs here and in
PRE-2). The three cache **save** steps are not copied: this job only restores (the caches are written by `perf.yml` on pushes to `main`). The complete YAML:

```yaml
name: knee

on:
  workflow_dispatch:
    inputs:
      start_rate: { description: "Start rate (iterations per second)", default: "2", type: string }
      step_rate: { description: "Rate added per step", default: "2", type: string }
      hold_sec: { description: "Hold per step (seconds)", default: "30", type: string }
      max_steps: { description: "Maximum steps", default: "9", type: string }

permissions:
  contents: read

concurrency:
  group: knee-dispatch-${{ github.run_id }}
  cancel-in-progress: false

defaults:
  run:
    shell: bash

env:
  CAL_REF: c2b7ac44c66f24ffef1662b276f0653988a609a3 # same SHA as perf.yml and scripts/bootstrap.sh (the job verifies)

jobs:
  cal-knee:
    name: cal-knee
    runs-on: ubuntu-24.04
    timeout-minutes: 90
    env:
      P6_WORKING_DIRECTORY: p6
      PRODUCTS_ROOT: ${{ github.workspace }}/products
      CAL_CHECKOUT_PATH: products/cal
      CAL_BASE_URL: http://127.0.0.1:3000
      # Fork trust-auth local DB (no password). Not a secret.
      CAL_DB_URL: postgresql://postgres@127.0.0.1:5450/calendso
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
      COREPACK_ENABLE_STRICT: "0"
      TURBO_TELEMETRY_DISABLED: "1"
      NEXT_TELEMETRY_DISABLED: "1"
      KNEE_START_RATE: ${{ inputs.start_rate }}
      KNEE_STEP_RATE: ${{ inputs.step_rate }}
      KNEE_HOLD_SEC: ${{ inputs.hold_sec }}
      KNEE_MAX_STEPS: ${{ inputs.max_steps }}
    steps:
      # (3) The ref guard, first. Same text as evidence-release.yml lines 42 to 49; the release requires headBranch main.
      - name: Stop unless dispatched from main
        timeout-minutes: 1
        env:
          DISPATCH_REF: ${{ github.ref }}
        run: |
          set -euo pipefail
          [[ "$DISPATCH_REF" == "refs/heads/main" ]] \
            || { echo "::error::knee runs must be dispatched from main, not from $DISPATCH_REF"; exit 1; }

      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        timeout-minutes: 1
        with:
          persist-credentials: false
          path: ${{ env.P6_WORKING_DIRECTORY }}

      - name: Checkout Cal fork
        timeout-minutes: 2
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          repository: Jayami123/cal
          ref: ${{ env.CAL_REF }}
          path: ${{ env.CAL_CHECKOUT_PATH }}
          persist-credentials: false

      - name: Verify Cal fork HEAD
        timeout-minutes: 1
        run: |
          set -euo pipefail
          head="$(git -C "${CAL_CHECKOUT_PATH}" rev-parse HEAD)"
          if [ "$head" != "${CAL_REF}" ]; then
            echo "::error::Cal HEAD ${head} does not match CAL_REF ${CAL_REF}"
            exit 1
          fi

      - name: Verify CAL_REF matches bootstrap.sh
        timeout-minutes: 1
        run: |
          set -euo pipefail
          if ! grep -q "^CAL_REF=\"${CAL_REF}\"$" "${P6_WORKING_DIRECTORY}/scripts/bootstrap.sh"; then
            echo "::error::CAL_REF in perf.yml does not match scripts/bootstrap.sh"
            exit 1
          fi

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

      # Corepack downloads the Yarn the Cal fork pins from repo.yarnpkg.com.
      - name: Enable corepack
        timeout-minutes: 1
        working-directory: ${{ env.CAL_CHECKOUT_PATH }}
        run: |
          set -euo pipefail
          corepack enable
          version="$(yarn --version)"
          if [ "$version" != "4.12.0" ]; then
            echo "::error::yarn ${version} is not the 4.12.0 the Cal fork pins"
            exit 1
          fi

      - name: Restore Cal Yarn cache
        timeout-minutes: 1
        id: cal_yarn
        uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ${{ env.CAL_CHECKOUT_PATH }}/.yarn/cache
          key: cal-yarn-${{ hashFiles(format('{0}/yarn.lock', env.CAL_CHECKOUT_PATH)) }}

      - name: Restore Cal node_modules cache
        timeout-minutes: 2
        id: cal_nm
        uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ${{ env.CAL_CHECKOUT_PATH }}/node_modules
          key: ${{ runner.os }}-cal-nm-${{ env.CAL_REF }}-${{ hashFiles(format('{0}/yarn.lock', env.CAL_CHECKOUT_PATH)) }}

      # Always run: the node_modules cache holds only the root folder, not workspace-local
      # node_modules (e.g. a nested React copy). With both caches warm this is a quick link check.
      - name: Install Cal dependencies
        timeout-minutes: 3
        working-directory: ${{ env.CAL_CHECKOUT_PATH }}
        run: |
          set -euo pipefail
          yarn install --immutable

      - name: Generate Cal Prisma client
        timeout-minutes: 1
        working-directory: ${{ env.CAL_CHECKOUT_PATH }}
        run: |
          set -euo pipefail
          yarn workspace @calcom/prisma prisma generate

      - name: Prepare Cal product .env and harness roots
        timeout-minutes: 1
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        env:
          BOOTSTRAP_SKIP_INSTALL: "1"
        run: |
          set -euo pipefail
          bash scripts/bootstrap.sh cal

      - name: Restore Cal build cache
        timeout-minutes: 1
        id: cal_build
        uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ${{ env.CAL_CHECKOUT_PATH }}/apps/web/.next
          key: ${{ runner.os }}-cal-next-${{ env.CAL_REF }}-h0.2.15

      - name: Pull Cal images (3 tries, 15 s then 30 s)
        id: cal_pull
        timeout-minutes: 3
        working-directory: ${{ env.PRODUCTS_ROOT }}/cal/packages/prisma
        run: |
          set -euo pipefail
          bash "${{ github.workspace }}/p6/scripts/ci/compose-pull.sh" -p qa-harness-cal \
            -f "${{ env.PRODUCTS_ROOT }}/cal/packages/prisma/docker-compose.yml" \
            -f "${{ github.workspace }}/p6/node_modules/qa-portfolio-harness/docker/cal.compose.yml"

      - name: Start Cal (harness up)
        id: cal_up
        if: ${{ steps.cal_pull.outcome == 'success' }}
        # 6 min: the slowest Cal start over 55 cal-smoke runs was 255 s (PRE-2 section 3.2); cap >= 1.25 x that.
        timeout-minutes: 6
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: |
          set -euo pipefail
          SECONDS=0
          npm run up:cal
          echo "HARNESS_UP_SECONDS=${SECONDS}" >> "$GITHUB_ENV"

      - name: Knee P6-CAL-LOAD-005 (knee range, environment-bound)
        id: knee
        if: ${{ steps.cal_up.outcome == 'success' }}
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
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: node scripts/write-ci-job-summary.ts

      - name: Token scan of the knee results
        id: token_scan
        if: ${{ !cancelled() }}
        timeout-minutes: 2
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: node scripts/evidence-token-scan.mjs results/load

      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
        timeout-minutes: 3
        with:
          name: knee-cal
          path: ${{ env.P6_WORKING_DIRECTORY }}/results/load/
          if-no-files-found: warn
          retention-days: 90

      - name: Stop Cal (harness down)
        if: ${{ always() }}
        timeout-minutes: 1
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: |
          set -euo pipefail
          npm run down:cal || true
```

**(4) Concurrency and retention.** `knee-dispatch-${{ github.run_id }}` gives each dispatch its own group with `cancel-in-progress: false` (G8); uploads use `retention-days: 90`, the
GitHub maximum for public repos, instead of the 14 days of `perf.yml` (G7): the permanent evidence is the GitHub release, the Actions artefact is transient. **UNPROBED — confirm in
the first knee dispatch:** whether a repo-level retention setting clamps 90. Measurement: `curl -s https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/runs/<run id>/artifacts | jq '.artifacts[] | {name, expires_at}'`;
if it is clamped, release within (clamp − 2) days.

**Artefact name and kinds.** `knee-cal`: `verdict.json`, `run-meta.json`, `k6-main-summary.json`, `k6-main.log` (carries the intent lines), `telemetry-main.{json,csv}`,
`chart-main.html`, `knee-report-main.{json,md}`, `audit.json` — all among the kinds the release allowlist keeps (`json log csv html txt`, `evidence-release.yml` line 140). The
`k6-main.json.gz` points file stays in the Actions artefact and is removed from the release by that filter (`.gz` is not an allowed kind). Cal has no `pk_` key, so the gitleaks
scope (PR #68) is not involved.

The workflow runs on `main` only (the ref guard); it never runs on pull requests (D16). Every action is pinned by SHA as in `perf.yml`. **Evidence release:** `evidence-release.yml`
accepts runs of the `perf.yml` workflow id only today (`PERF_WORKFLOW_ID: "376454455"`, line 38); the list of workflow ids is **PRE-3**, done right after this PR merges, before the
first knee run set is released.

## 7. Oracles and assertions

Every LOAD case needs a correctness oracle. Here: (1) the **post-load audit** (Phase 3 Task 6, per intent after a stop: Task 1 §6.8): every booking maps to a started
intent, no intent has two bookings, an `ok` intent has exactly one, a `fail` intent none, only indeterminate intents 0 or 1 (at most `interrupted` of them), accepted-only, no
overlapping accepted pairs (`HOST_OVERLAP_SQL`; a pair counts under `P6-OBS-CAL-002`, never hidden); (2) the **leak check** after the cleanup sweep (`leakCheck`,
`src/cal/oracle.ts`); (3) the **knee contract**: the report is a KNEE with a range between two steps, or NO_KNEE/INVALID with its reason; the stop reason is the D2 rule
(`error_rate` or `p95`); (4) **supply**: the setup preflight and the `getSchedule` "target is offered" check (a failure is a TEST BUG: supply).

**PRODUCT BUG vs TEST BUG.** A ghost booking (no started intent), a duplicate booking for one intent, an `ok` intent with no booking, a `fail` intent with a booking, an overlapping
pair among distinct slots, a 5xx before the rule trips, or a database error line in the Cal log would be `PRODUCT BUG (SUSPECTED)` with the run link, labelled by the owner only
after repeated full-count runs (rule 13). A slot supply shortfall, a stale target list, more indeterminate intents than `interrupted`, or a plan that ends without a stop is a TEST
BUG or INVALID, never a product label. **No `PRODUCT BUG (SUSPECTED)` was found by this probe.** No expected-failure marker, no skip, no widened margin.

## 8. Data isolation, cleanup, leak check

Prefix: `caseDataPrefix(runPrefix, "P6-CAL-LOAD-005")` (lowercase `[a-z0-9-]`), attendee `i<n>` emails
(`attendeeEmail(prefix, "i"+n)`), one booking per iteration at its own slot. Cleanup: `calCleanupWith` cancels every live booking of
the prefix **found by the database** (not by the uids k6 saw: interrupted iterations never learned theirs), sequentially, 63 ms each
(2.8 minutes for 2,700); a failed cancel is a TEST BUG line and the sweep goes on; then `leakCheck`. Bookings made far in the future
(up to about 263 days) are cancelled the same way. No private-link or event-type change, so `calPriorLinks` is not used. Token scan:
the `tokenScan` stage and the workflow step; artefacts carry counts, rates and ids only.

## 9. CI, token scan, budget

Job `cal-knee` in `.github/workflows/knee.yml`, own timeout **90 minutes**, runs on `workflow_dispatch` only. Durations of the copied setup steps are the maximum over the 55
successful `cal-smoke` runs on `main` that PRE-2 §3.2 lists (46 push, 6 pull request, 3 dispatch; `https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/runs/<run id>/jobs`,
the three dispatch runs are 40177412186, 40178773022 and 40180625279); the caps are the same values PRE-2 gives `cal-smoke`.

| step name (as in YAML)                                | timeout-minutes | estimate (source)                                                                                           | 80 % stop | runs on this event?                       |
| ----------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------- |
| Stop unless dispatched from main                      | 1               | UNPROBED (a shell test; expect < 1 s)                                                                       | 48 s      | workflow_dispatch                         |
| `actions/checkout@3d3c42e5…` (path `p6`)              | 1               | 2 s (max of 55 `cal-smoke` runs, PRE-2 §3.2)                                                                | 48 s      | workflow_dispatch                         |
| Checkout Cal fork                                     | 2               | 10 s (same)                                                                                                 | 96 s      | workflow_dispatch                         |
| Verify Cal fork HEAD                                  | 1               | 1 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| Verify CAL_REF matches bootstrap.sh                   | 1               | 1 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| `actions/setup-node@949feb24…`                        | 1               | 5 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| Install P6 dependencies                               | 1               | 9 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| Install k6 (pinned in .k6-version, checksum-verified) | 2               | 2 s (same)                                                                                                  | 96 s      | workflow_dispatch                         |
| Enable corepack                                       | 1               | 2 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| Restore Cal Yarn cache                                | 1               | 14 s (same)                                                                                                 | 48 s      | workflow_dispatch                         |
| Restore Cal node_modules cache                        | 2               | 64 s (same)                                                                                                 | 96 s      | workflow_dispatch                         |
| Install Cal dependencies                              | 3               | 115 s (same)                                                                                                | 144 s     | workflow_dispatch                         |
| Generate Cal Prisma client                            | 1               | 8 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| Prepare Cal product .env and harness roots            | 1               | 0 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| Restore Cal build cache                               | 1               | 6 s (same)                                                                                                  | 48 s      | workflow_dispatch                         |
| Pull Cal images (3 tries, 15 s then 30 s)             | 3               | 16 s (same)                                                                                                 | 144 s     | workflow_dispatch                         |
| Start Cal (harness up)                                | 6               | 255 s (same; the dispatch runs: 53 to 72 s)                                                                 | 288 s     | workflow_dispatch                         |
| Knee P6-CAL-LOAD-005 (knee range, environment-bound)  | 15              | UNPROBED on the runner: VM about 5.5 min (stop near step 3 about 2 min, cleanup 2.8 min); first CI dispatch | 12 min    | workflow_dispatch (if `cal_up` succeeded) |
| Job summary (knee table)                              | 2               | 1 s (`cal-smoke` summary step, same runs)                                                                   | 96 s      | workflow_dispatch                         |
| Token scan of the knee results                        | 2               | 1 s (`cal-smoke` token scan, same runs)                                                                     | 96 s      | workflow_dispatch                         |
| `actions/upload-artifact@cf430e03…` (`knee-cal`)      | 3               | 2 s (same runs, upload steps)                                                                               | 144 s     | workflow_dispatch                         |
| Stop Cal (harness down)                               | 1               | 2 s (same runs)                                                                                             | 48 s      | workflow_dispatch                         |

Sum of the step caps: 1 + 1 + 2 + 1 + 1 + 1 + 1 + 2 + 1 + 1 + 2 + 3 + 1 + 1 + 1 + 3 + 6 + 15 + 2 + 2 + 3 + 1 = **52 min**. Job timeout **90**. 90 − 52 = **38 ≥ 10**. No range, no cache-save
allowance (the job only restores). The estimates sum to about 8 min with the VM knee step. If the first dispatch shows the knee step over 12 minutes (80 % of 15), or any
step above 80 % of its cap, that is a stop and report; the fix is a shorter hold or fewer steps, never a higher cap or timeout. **Cold path:** the build cache key
`cal-next-<CAL_REF>-h0.2.15` is written only by `perf.yml` on `main`; on a cache miss `Start Cal` takes about 14 minutes (VM) and trips its 6-minute cap. That is a visible failure,
not a silent one: the owner re-runs after a `perf.yml` push has warmed the cache. No existing job changes; no existing timeout is raised. A knee dispatch costs about 10 runner
minutes; three runs about 30.

## 10. Expected output

```text
$ npm run load:cal-knee -- --profile pr
P6-CAL-LOAD-005 (knee range, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   supply 152 slots (3 steps x 12 s hold), smoke p95 reference 77.12 ms
  k6 main      exit 99  steps 0..2 of 3   (stop rule: p95 >= 771 ms)  or  exit 0, no stop
  knee         KNEE between step 1 (4/s) and step 2 (6/s); stop: p95; first saturated: app_cpu (step 2)   | NO_KNEE -> INVALID no_knee
  reconcile    ok   audit (per intent): 121 started, 118 ok, 3 indeterminate, 121 bookings, 0 ghost, 0 duplicate; 0 overlapping accepted pairs (interrupted 3)
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
| 3    | `feat(load): map cal bookings to intents`                                  | `src/load/knee/cal-intents.ts tests/unit/cal-knee-intents.test.ts`                                                                    | exit 0, **B2 + 9**                                                                              |
| 4    | `feat(k6): add the fixed-slot mode to the cal journey and the knee script` | `k6/journeys/cal-book.js k6/cases/cal-load-005.js k6/cases/cal-load-005.example.json`                                                 | exit 0, B2 + 9; `k6 inspect` ok                                                                 |
| 5    | `feat(load): add the cal knee case and its setup`                          | `src/load/products/cal.ts src/load/cases.ts package.json tests/unit/load-products-cal.test.ts tests/unit/load-cases-cal-knee.test.ts` | exit 0, **B2 + 14**; `npm run load:cal-knee -- --profile pr` against a started Cal exits 0 or 3 |
| 6    | `ci(knee): add the knee workflow with the cal job`                         | `.github/workflows/knee.yml`                                                                                                          | exit 0 (actionlint silent), B2 + 14                                                             |
| 7    | `docs: describe the cal knee run and its dispatch inputs`                  | `README.md`                                                                                                                           | exit 0, B2 + 14                                                                                 |

New unit tests by name (14): `k6-lib-cal-slots` (3: `slotFor` returns the target and `undefined` past the supply; `scheduleWindow`
starts at 00:00 UTC of the target's day and ends `days` later; a target at 23:30 UTC stays in its day); `cal-knee-supply` (4:
`slotsNeeded` of the default plan is 2,835; `supplyWindowDays(2835)` is 263; `pickSlotStarts` dedupes, sorts and cuts; a short list throws
`TEST BUG: slot supply`); **`cal-knee-intents` (2: `calIntentOf` maps `<prefix>-i<n>@example.com` to `n` and rejects another prefix, a non-numeric leaf and a leaf with a suffix; `calRowsByIntent`
counts booking ids per intent, counts a row of no intent as a ghost row, and counts one booking with two attendee rows once)**; `load-cases-cal-knee` (3: the case, its run
(`allowExits [0, 99]`, `knee.maxVUs 160`) and telemetry product `cal`; the default plan's planned iterations fit the 3,000-slot cap; `package.json` has the script and the example config
parses with the keys the script reads); `load-products-cal` (+2: `calSetupWith` with `knee` writes `slotStarts`, plan fields and
`windowDays 28`; a supply shorter than `S` returns a TEST BUG before load). Count 3 + 4 + 2 + 3 + 2 = **14**; steps 1 → +3, 2 → +4, 3 → +2, 5 → +5. The workflow file has no unit test
(`actionlint` is part of `npm run check`); its cap table of §9 is checked by hand at build time with the script of PRE-2 §4.

After step 7: push, `gh pr create` (rule 3), CI once (rule 15): the PR runs only the product-free job of Task 1 (no product job
runs this workflow on a PR, and a new workflow cannot be dispatched before it is on `main`). Then, **after the owner merges**, PRE-3 widens the release check, and the owner dispatches
`knee.yml` three times on `main` (§14).

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                                    | Mitigation                                                                                                                                           |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Slot exhaustion ends the run before the knee                            | exact supply preflight; 5 % margin; INVALID/TEST BUG, never a knee                                                                                   |
| R2  | The single Next.js process makes CPU the first resource on every run    | a valid result, stated as environment-bound in the report label                                                                                      |
| R3  | The runner's knee is outside the default plan (below 2/s or above 18/s) | `no_knee` or a stop at step 0 is reported; dispatch inputs change the plan; no code change                                                           |
| R4  | A far-future booking horizon changes with a Cal ref bump                | the setup preflight reads the real slots; a bump runs the case again                                                                                 |
| R5  | k6 abort leaves in-flight bookings                                      | per-intent reconciliation (Task 1 §6.8): interrupted intents are indeterminate, at most `interrupted` of them; leftover bookings are swept by prefix |
| R6  | Cleanup of 2,700 bookings takes 3 minutes of job time                   | counted in §9                                                                                                                                        |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                                                | Probe shows                                                                        | Effect                                                                                      |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| C1  | "(getSchedule → book) with unique prefixed attendees"                                       | the Phase 3 slot choice shrinks with every booking (2 slots per booking) and races | fixed-slot mode in the journey (§3.1, §6.2)                                                 |
| C2  | "perf.yml (or a dispatch + weekly-Saturday knee workflow, D16)"                             | `perf.yml` has one cron and 14 jobs; the evidence release accepts one workflow id  | new dispatch-only `knee.yml` (Q1); release check widened in PRE-3; Saturday cron later (G8) |
| C3  | "step plan that reaches the stop rule within the job timeout (`cal-smoke` is 60 min today)" | the knee run is under 15 minutes in its own job                                    | own job and timeout 90                                                                      |
| C4  | "whether the `BotDetectionService` … refuses k6 traffic"                                    | it is off in the harness stack (env flag empty, not a team event)                  | recorded; no workaround needed                                                              |

**Proposed extras (out of scope until accepted; new IDs).** (`P6-CAL-LOAD-011` and `-012` are already proposed by Phase 3 Tasks 7 and 10, `-013` by Phase 4 Task 5 and
`-014` by Task 6; the next free numbers are used here.)

- `P6-CAL-LOAD-015`: attribution ramps. `getSchedule` only, then `book` only, to name which route saturates first (the probe: the booking
  request's p95 was 903 ms against 273 ms for `getSchedule` at the stop step).
- `P6-CAL-LOAD-016`: a knee with the slot cache path active (needs a Redis client in the harness; Task 8 decides after its probe).

**Decisions (owner, 2026-10-25).**

- **Q1. Where do the knee jobs live?** Decided (owner, 2026-10-25): (a) a new `knee.yml`; the release check is widened in PRE-3, right after this PR merges — `perf.yml` already has 14 jobs and
  one cron.
  Options considered: (a) a new `knee.yml` (dispatch-only here); (b) jobs in `perf.yml` guarded by `github.event_name`. Evidence: §6.7, C2.
- **Q2. Journey change.** Decided (owner, 2026-10-25): (a) a fixed-slot mode in `cal-book.js` — one journey, the smoke untouched; it also fixes the Phase 3 two-slot TEST BUG (index, known issues).
  Options considered: (a) a fixed-slot mode in `cal-book.js`; (b) a separate `cal-book-knee.js`. Evidence: §3.1.
- **Q3. Default plan.** Decided (owner, 2026-10-25): (a) start 2, step 2, hold 30 s, 9 steps — three steps above the VM knee, 2,835 slots.
  Options considered: (a) start 2, step 2, hold 30 s, 9 steps; (b) start 1, step 1 (finer, 18 steps, 2,000-slot cap, longer).
- **Q4. The smoke reference comes from a different journey variant.** Decided (owner, 2026-10-25): (a) accept the cross-variant reference (`smoke-p95.json`, `P6-CAL-LOAD-001`, 77.12 ms) and print the
  step-0 ratio as a warning above 2; UNPROBED — confirm in first CI dispatch: the step-0 p95 / 77.12 ms ratio.
  Options considered: (a) accept it and print the ratio as a warning above 2; (b) re-run the Phase 3 smoke on the fixed-slot journey.
- **Q5. Schedule.** Decided (owner, 2026-10-25): (b) dispatch only first — no `schedule:` block in this PR; the Saturday cron is the later `ci(knee): add the weekly saturday schedule` PR (index G8)
  once the release holds 3 VALID runs of every knee job.
  Options considered: (a) Saturday 03:43 UTC from the start; (b) dispatch only until three runs exist.
- **Q6. Artefact retention and early release (new).** Decided (owner, 2026-10-25): `retention-days: 90` on every `knee.yml` upload, and the release check accepts `knee.yml` runs from PRE-3
  onwards (right after this PR merges); a run set is released as soon as it has 3 VALID runs per case. UNPROBED — confirm in first CI dispatch: whether a repo-level retention setting clamps 90
  (the `expires_at` of the first artefact, §6.7 (4)); if clamped, release within (clamp − 2) days.
  Options considered: (a) 14 days and release at Task 6 (the first draft); (b) 90 days and early widening.

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B2 + 14** unit tests; `k6 inspect` lists the new scripts.
- [ ] 3 VALID `workflow_dispatch` runs of `knee.yml` on `main`, each with a KNEE report: range between two steps, stop reason, first
      saturated resource, `knee-report-main.md`, chart and telemetry, a clean per-intent audit (no ghost or duplicate booking, no overlap) or a recorded product bug under its ID; the three
      ranges and their spread (min and max of lower and upper rate) in the job summaries.
- [ ] Run ids and `run-meta.json` per run listed; INVALID runs listed with reasons and excluded.
- [ ] Nothing in the repo claims a number from the VM; README says "knee range" and carries the environment label.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID dispatch runs with range, stop reason, resource, clean audit; spread in the summary; `npm run
check` green: §14. Gap: runner values (§3.5).
- (b) Existing names grepped on `main` at `2db9726`: `k6/journeys/cal-book.js` (`runCalBook`), `k6/cases/cal-load-001.js`,
  `src/load/products/cal.ts` (`calSetupWith`, `calCleanupWith`, `calWindowDays`), `src/load/reconcile/cal.ts`, `src/cal/api.ts`
  (`getFreeSlots`), `src/cal/oracle.ts` (`resolveHostSetup`, `CASE_LIVE_BOOKINGS_SQL`), `scripts/bootstrap.sh`, `.github/workflows/perf.yml` (`cal-smoke`),
  `scripts/write-ci-job-summary.ts`, `src/load/smoke-baseline.ts`. From Task 1 / PRE-2 (NEW there): the names in §4. NEW here with skeletons: §6.1.
- (c) CI time: §9 (exact table, 52 min of caps in a 90-minute timeout, margin 38); no existing timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) Every owner answer is recorded in "Decisions (owner, 2026-10-25)" (§13); Q6 is new.
