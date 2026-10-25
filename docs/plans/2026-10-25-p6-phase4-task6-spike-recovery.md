# P6 Phase 4 Task 6: spikes at 150 % and recovery (`P6-CAL-LOAD-004`, `P6-MED-LOAD-003`, `P6-DOC-LOAD-004`, `-009`, `P6-MED-LOAD-010`, `P6-CAL-LOAD-010` gated) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 6", Notes 4 to 6, D3, D12, D14, D16, D17. Inputs:
[Task 1](2026-10-25-p6-phase4-task1-breakpoint-method.md) (method, streaming points reader, interrupted slack),
[Tasks 2, 3, 4](2026-10-25-p6-phase4-task2-cal-knee.md) (knee ranges and `knee.yml`),
[Task 5](2026-10-25-p6-phase4-task5-steady-baselines.md) (knee bounds, steady rates, baseline band) and
[Phase 3 Task 11](2026-10-25-p6-phase3-task11-closeout.md) (release filter D14, run selection). **Task 6 closes Phase 4a** with the interim release
`p6-phase4a`.

**Paths.** Every path is a path on `main` after the Phase 3 stack and Phase 4 Tasks 1 to 5 (and 11) have merged. Paths created by those tasks are
marked "(Task N)".

## 1. Header

- **Task.** Phase 4 Task 6. Cases: `P6-CAL-LOAD-004` (P-, characterisation), `P6-MED-LOAD-003`, `P6-DOC-LOAD-004`, accepted extras `P6-DOC-LOAD-009`,
  `P6-MED-LOAD-010`, and `P6-CAL-LOAD-010` (**gate fails: moves to "Later", §3.7**).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branches (pattern), two parts:** `feat/<build date>-p6-spike-recovery` (6a: code, workflow jobs, release filter check) and
  `docs/<build date>-p6-phase4a-release` (6b: release notes, README, after the spike runs exist).
- **Base.** `origin/main` after Tasks 1 to 5 and 11.
- **Harness pin.** Unchanged. **Environment change.** None (the limiter profile is an environment variable on one step, §6.8).
- **Unit tests.** B6 = count on `main` when the build starts. This plan adds **+37** in 6a and **+0** in 6b (§12); expected B6 + 37.
- **Stop for owner review.** **Yes, twice (rule 10):** new jobs in `knee.yml`, and a change to the shared `evidence-release.yml` (it must accept the
  `knee.yml` runs). No harness pin and no shared runner label change.

## 2. What it proves

Overload is refused cleanly, or queued without damage, and the system comes back in a measured time: steady (50 % of the knee's lower bound) → spike (150 %) →
steady, with a contract per product, the **recovery time** (the first window back inside the baseline band), and a post-spike audit that proves correctness held.
Cal and Medusa have no limiter in the harness stacks, so their result is a **characterisation** (the probe saw no refusal at all; the product queues).
Documenso has a real limiter, run as its own start on the production-like limiter profile (D12, a configuration profile, not a workaround).

- **Finance and healthcare.** Under a burst a trading API or a patient portal must refuse with a clear 4xx (or 429), never crash, and return to normal in a measured time.

## 3. Live probe evidence

Probe date 2026-10-25 (UTC). Cloud VM (Node v22.23.3, Documenso on Node v24.21.0, 4 vCPU, 16 GB), k6 2.3.0, harness v0.2.15, every product started with
`npm run up:<product>` and stopped with `down` (one stack at a time). The spikes ran through the real runner with scratch k6 scripts in the scratchpad; nothing in
the repo was edited or committed. Steady = 50 % and spike = 150 % of the **VM** knee lower bounds the coarse ramps found (Cal 6 per second, Medusa 1.0, Documenso 3).
**VM timings prove that a step works; no number below is a target or a published value.**

### 3.1 The three spike shapes on the VM (sizing only)

Windows are 10 s, taken from the points file by response time. Steady phase 40 s, spike 30 s (plus 2 s ramps), then a recovery watch.

```text
product, rates (steady -> spike)       steady window p95        peak window p95          back inside the steady range            statuses                dropped  VUs (vus_max)
Cal       3 -> 9 /s, pre 80/max 200    168..220 ms (p50 95..109)  11,137 ms (win 70-80 s)  first window 84-86 s: 12 s after spike end  all 200 (0 4xx, 0 5xx)   24       104 of 80 pre
Cal       3 -> 9 /s, pre 160/max 300   (same shape)              20,501 ms (win 80-82 s)  first window 96-98 s: 22 s after spike end   all 200                  14       174 of 160 pre
Medusa    0.5 -> 1.5 /s, pre 60         366..503 ms (p50 120..180) 13,970 ms (win 80-90 s)  window 150-160 s: about 76 s after spike end  all 200 (0 4xx, 0 5xx)   0        60 of 60
Documenso 1.5 -> 4.5 /s, pre 80         295..332 ms (p50 45..63)   5,424 ms (win 80-90 s)   window 140-150 s: about 66 s after spike end   all 200 but 1 transport reset  0     80 of 80
```

- **No product refused anything.** Cal and Medusa accepted every request (no limiter, no queue limit) and answered late: the spike shows up as latency of 11 to 20 seconds, not as
  4xx. So the roadmap contract "every refusal is a 4xx with a body" is **vacuous for Cal and Medusa**: it holds (there is none), and the case is a characterisation of
  latency inflation and recovery (Note 6; for Medusa the roadmap said "no built-in limiter (to verify)": verified, §3.3).
- **Recovery is a drain of a backlog**: excess arrivals (spike - capacity) x spike length divided by spare capacity (capacity - steady). Cal: (9-7) x 32 / (7-3) = 16 s, measured 12 to 22 s;
  Medusa and Documenso take longer because each iteration is nine or eight sequential requests.
- **Documenso (limiter bypassed, the default profile)**: seal lag p95 9.6 s, max 10.4 s during the spike; 355 documents, 0 missing stages, backlog drained at once. One request
  (`POST /api/v2/envelope/create`, multipart) got `read: connection reset by peer` out of 3,196 requests (Task 4 §3.1: an observation, not labelled).

### 3.2 Generator headroom at 150 % (roadmap probe item 1, Note 4)

CPU is not the limit: in the Cal spike (pre 160) k6 used 0.027 cores on average (max 0.12), the runner 28.7 % busy (max 52.6 %), memory available never under 82.8 %. The
**VU pool is**: with `preAllocatedVUs` 160 and a peak need of 174, the 14 VUs above the pre-allocation were started lazily and 14 iterations were dropped (exactly the difference);
with pre 80 the drops were 24. An open-model spike keeps starting iterations while the old ones wait, so the VUs in flight equal the arrivals not yet finished. Sizing rule
(unit-tested, §6.2): `pre = ceil((spikeRate x (spikeSec + rampSec) + steadyRate x 5) x 1.1)`, `max = ceil(pre x 1.3)`. Default plan: Cal (9 x 34 + 15) x 1.1 = 353.1 → pre 354, max
461; Medusa (1.5 x 34 + 2.5) x 1.1 = 58.85 → pre 59, max 77; Documenso limiter profile (0.6 x 34 + 1) x 1.1 = 23.5 → pre 24, max 32. Any dropped iteration still makes the run INVALID
(`dropped_iterations`: the generator, not the product, was the limit), and the fix is a larger pool, never an accepted drop.

### 3.3 Medusa: any limiter or queue at `MEDUSA_REF`? (probe item 2)

None. `apps/backend/src` has no rate-limit or throttle code (grep for `rate.?limit|throttl` over `src`, `medusa-config.ts`, `package.json`: no match); the generated runtime config
(`.medusa/server/medusa-config.js`) is `defineConfig({ projectConfig: { databaseUrl, http: { cors, jwtSecret, cookieSecret } } })` with no modules: in-memory event bus and lock, no queue.
The spike above confirms it (0 refusals).

### 3.4 Documenso: where the limiter is, its coverage, and the pre-set variable (probe item 3)

The limiter is at `packages/lib/server-only/rate-limit/` (`rate-limit.ts`, `rate-limits.ts`, `rate-limit-middleware.ts`) at `DOCUMENSO_REF` `f4105e47`, so the proposal's path was right.
`scripts/harness.mjs` sets `DANGEROUS_BYPASS_RATE_LIMITS ||= "true"`, so a pre-set `false` wins: started with `DANGEROUS_BYPASS_RATE_LIMITS=false npm run up:documenso`, the web
process environment (`/proc/<pid>/environ`, the one variable) read `=false` and the limiter answered 429s as below. Coverage and the measured counts (VM, one source IP, fresh database):

| Route family (`router.ts` / auth routes)                                                                                                                                                                                                           | Limiter (`rate-limits.ts`)                        | Probed: request that first got 429                                                                                                                                        | Body family | 429 headers present |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------- |
| `/api/trpc/*`                                                                                                                                                                                                                                      | `api.trpc` 100 per minute                         | 101st                                                                                                                                                                     | A           | yes                 |
| `/api/v2/*` (and `/api/v2-beta/*`)                                                                                                                                                                                                                 | `api.v2` 1000 per minute                          | 1001st                                                                                                                                                                    | A           | yes                 |
| `/api/v1/*`                                                                                                                                                                                                                                        | `api.v1` 1000 per minute                          | 1001st                                                                                                                                                                    | A           | yes                 |
| `/api/files/upload-pdf`                                                                                                                                                                                                                            | `api.file-upload` 20 per minute                   | 21st                                                                                                                                                                      | A           | yes                 |
| `/api/ai/*`                                                                                                                                                                                                                                        | `api.ai` 3 per minute                             | 4th                                                                                                                                                                       | A           | yes                 |
| `POST /api/auth/email-password/authorize`                                                                                                                                                                                                          | `auth.login` 10 per 15 min (per email), 50 global | 11th                                                                                                                                                                      | B           | yes                 |
| `POST …/forgot-password`                                                                                                                                                                                                                           | `auth.forgot-password` 3 per hour, 20 global      | 4th                                                                                                                                                                       | B           | yes                 |
| `POST …/resend-verify-email`                                                                                                                                                                                                                       | `auth.resend-verify-email` 3 per hour             | 4th                                                                                                                                                                       | B           | yes                 |
| `POST …/verify-email`                                                                                                                                                                                                                              | `auth.verify-email` 5 per 15 min                  | 6th                                                                                                                                                                       | B           | yes                 |
| `POST …/reset-password`                                                                                                                                                                                                                            | `auth.reset-password` 5 per hour                  | 6th                                                                                                                                                                       | B           | yes                 |
| `signup` (3 per 3 h), `update-password` (5 per 15 min, needs a session), `passkey` (10 per 15 min), `request-2fa-email` (5 per 15 min, tRPC), `link-org-account` (5 per hour), `report-sender` (1 per 7 days), `sync-subscription` (10 per 15 min) | listed in `rate-limits.ts` / auth routes          | **UNPROBED: confirm at build time** (need a session, a credential, billing or a state that the harness does not provide; `signup` is used once by the runner's own setup) | not probed  | not probed          |

- **Body family A** (middleware routes): `{"error":"Too many requests, please try again later."}`, `content-type: application/json`, headers `Retry-After` (seconds, e.g. 19), `X-RateLimit-Limit`, `X-RateLimit-Remaining: 0`,
  `X-RateLimit-Reset` (epoch seconds).
- **Body family B** (auth routes): `{"code":"UNKNOWN_ERROR","message":"","statusCode":429}` with the same headers: a 429 with no readable message (a design smell, not a bug: the headers carry the retry hint). It matches the Phase 1
  Task 6 probe.
- **The journey and the limiter.** The signing journey makes 4 `/api/trpc` calls (two `signFieldWithToken`, two `completeDocumentWithToken`) and 5 `/api/v2` calls per document, so the tRPC limit
  (100 per minute) binds at **0.42 documents per second** (25 per minute), far below the knee (3 to 4 per second on the VM). A "150 % of the knee" spike on the limiter profile would be refused from
  the first seconds of the _steady_ phase. The case therefore sizes its rates from the limiter that binds (steady 0.2, spike 0.6 documents per second: 48 and 144 tRPC calls per minute);
  the capacity-type Documenso spike runs on the default profile (proposed extra `P6-DOC-LOAD-012`, evidence in §3.1).
- **Limiter-profile spike (probed, steady 0.2 -> spike 1.0, 52 documents)**: setup (sign-up, sign-in, API token) passed on the fresh database; v2 calls 100 % 200 (52 each); tRPC `signFieldWithToken` and
  `completeDocumentWithToken` 82 x 200 and 22 x 429 each; 41 of 52 documents completed, the 11 refused at the sign step stayed unsigned; windows 6 and 7 (60 to 80 s) held all 44 429s; window p95
  308 to 400 ms steady and 158 to 361 ms during and after the spike (refusals are fast); no 5xx, no timeout; back to baseline at once (the 1-minute window rolled). 0 missing stages for the 41 completed documents is the
  Task 4 rule (§6.5).
- **Auth routes answer 500 for client errors (P6-OBS-DOC-001 and a new instance).** In the same probe: `authorize` with a bad CSRF token → HTTP **500** `{"code":"INVALID_REQUEST","message":"Invalid CSRF token"}` (known:
  `P6-OBS-DOC-001`); `reset-password` with an unknown token → HTTP **500** `{"code":"NOT_FOUND","message":"NOT_FOUND"}`, 5 of 5 requests. **`PRODUCT BUG (SUSPECTED)`: a client error on an auth route
  (unknown reset token) is a 500, the same mechanism as `P6-OBS-DOC-001`; evidence: 5 of 5 in one probe run, request shape in §6.6. Only the owner confirms the label.** The `-009` run counts these under
  `P6-OBS-DOC-001` (extended list), never hides them, and never asserts a status for the requests before the first 429.

### 3.5 Cal: unset limiter and `BotDetectionService` under a spike (probe item 4)

`UNKEY_ROOT_KEY` is present and **empty** in the harness product `.env` (value length 0), so `rateLimiter()` returns the always-succeed stub (`packages/lib/rateLimit.ts` lines 34 to 41). `BotDetectionService` returns at
its first line unless `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER === "1"` (present and empty here) and only for team event types: it refused none of the k6 bookings of the knee, steady and spike runs (about 2,000). No Redis client
is configured. Cal accepts everything and queues (§3.1).

### 3.6 Window length, the storm definition and the baseline (probe item 5)

- **Window:** 10 s, at least 40 requests (Cal 60, Medusa 45, Documenso 120 per window at the steady rates).
- **5xx storm:** any window in which 5xx responses are at least 5 **and** more than 1 % of that window's responses (the D2 error threshold applied per window). The three spikes had **0** 5xx, so no run
  has come near it. A transport error (status 0) is counted separately; the same rule applies (Documenso's single reset is 1 of 120 in its window, under both limits).
- **Baseline for recovery:** the union of (a) the run's own pre-spike windows (the first 10 s are skipped) and (b) the Task 5 band `windowP95` of that product when `k6/thresholds/baseline-band.json`
  exists; the upper bound is the larger `max`. **Recovery time** = from the end of the spike (the last arrival of the spike hold) to the end of the first of **two consecutive** windows whose p95 is at or
  below the upper bound; if none occurs within the watch period the result is "recovery not reached in N s" (a result, recorded, never hidden, still VALID). Documenso has no Task 5 baseline case, so its reference
  is (a) only.
- Watch period: three times the measured recovery rounded up to 60 s: Cal 120 s (measured 12 to 22 s), Medusa 240 s (76 s), Documenso 180 s (66 s); the limiter profile 120 s.

### 3.7 `P6-MED-LOAD-010` and `P6-CAL-LOAD-010` (probe items 6 and 7)

**Medusa reservations.** Medusa v2 reserves stock at cart **completion**, not when an item is added:

```text
variant stocked 10; 6 carts prepared (line item, address, shipping, payment session) and NOT completed:   reservation_item live 0, inventory_level.reserved_quantity 0
2 of them completed (200 each):                                                                              reservation_item live 2, reserved_quantity 2
4 carts remain with completed_at null; cleanup (cancel and archive of the 2 orders):                         reservation_item live 0 (46 of 46 soft-deleted after the 46-order knee run), reserved_quantity 0
```

So an abandoned cart can never hold stock: the release rule is "nothing is reserved until completion; a cancelled order soft-deletes its reservation". `P6-MED-LOAD-010` is meaningful as an invariant
check under a spike with deliberately abandoned carts: live reservation rows = live orders, `reserved_quantity` = units of live orders, available = stock - live orders >= 0, and a final probe purchase of an
available unit still succeeds.

**Cal holds.** The gate for `P6-CAL-LOAD-010` is "the Cal journey uses `reserveSlot`". It does **not**: `grep -rn reserveSlot k6 src` finds nothing; the journey calls `getSchedule` and `POST /api/book/event` only.
`reserveSlotHandler` exists at `CAL_REF` (`packages/trpc/server/routers/viewer/slots/reserveSlot.handler.ts`): it upserts `SelectedSlots` (`userId`, `slotUtcStartDate`, `slotUtcEndDate`, `uid`, `releaseAt =
now + MINUTES_TO_BOOK`, default 5 minutes); a hold is a row with `releaseAt` in the future and the slot is "held" until then or until the booking. **Gate result: fails. `P6-CAL-LOAD-010` moves to "Later" with
this evidence** (roadmap D17). Proposed extra `P6-CAL-LOAD-014` would add `reserveSlot` to a Cal journey variant (the oracle: `SELECT … FROM "SelectedSlots" WHERE "releaseAt" > now()` scoped by event type and the
prefix of the run's slots, plus a `getSchedule` that offers every released slot again).

### 3.8 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. All runner values: recovery times, peak p95, the knee-derived rates (the VM rates above are sizing).
2. The seven auth and tRPC-inline limiters of §3.4 (and the tRPC-inline 429 body: a third family is possible).
3. Limiter state across reruns on the same database: auth limits last up to 7 days; a fresh CI database per job is clean, a local rerun needs the harness volume removed (`docker volume rm
qa-harness-documenso_…` after `down`).
4. Task 5's band for Cal and Medusa on the runner; Documenso has none.
5. The `knee.yml` workflow id for the release check (known only after Task 2 merges: `gh api repos/Jayami123/k6-load-concurrency-suite/actions/workflows/knee.yml --jq .id`).

## 4. Depends on earlier plans

Task 1: `readPointsGzStream`, `KneePlanSpec` conventions, `LoadLabel`, `allowExits`, the interrupted slack (not needed: spikes end normally), `observeKneeResponses` pattern. Task 2: `knee.yml`, the Cal
fixed-slot mode and slot supply (`slotsNeeded`, `pickSlotStarts`). Task 3: the Medusa case, `stockForKnee` (pattern). Task 4: the pipeline stage in knee mode (completed documents only). Task 5: `knee-bounds.json`,
`steadyRateFor`, `baseline-band.json`, `openModelScenario({ timeUnitSec })`, `withSteadyProfile`. Task 11: `scripts/ci/filter-evidence.sh`, `runIdOf`, `selectPublishable`. On `main`: `k6/journeys/{cal-book,med-checkout,doc-sign}.js`,
`src/load/reconcile/*`, `src/medusa/oracle.ts` (`RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `readOversellSnapshot`), `src/documenso/run-case.ts`, `.github/workflows/evidence-release.yml`.

## 5. Build-time recheck

| #   | Check                | Command                                                                                                                                                                                          | Expected                                                            |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1   | Base                 | `git fetch origin main && git log --oneline origin/main \| grep -c "knee\|steady"`                                                                                                               | Tasks 1 to 5 merged                                                 |
| 2   | Baseline             | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                              | exit 0; `# tests` = B6                                              |
| 3   | The inputs exist     | `test -f k6/thresholds/knee-bounds.json k6/thresholds/baseline-band.json` and `parseKneeBounds` accepts Cal, Medusa and Documenso (Task 4's runs)                                                | the three products have a bound; otherwise stop and report          |
| 4   | Cal gate             | `grep -rn "reserveSlot" k6 src \|\| echo none`                                                                                                                                                   | `none` (then `-010` stays in "Later")                               |
| 5   | Limiter variable     | `DANGEROUS_BYPASS_RATE_LIMITS=false npm run up:documenso`; read `/proc/<pid>/environ` for that variable (name and value only)                                                                    | `false`                                                             |
| 6   | 429 shapes           | the §3.4 loop for `trpc` (101 requests)                                                                                                                                                          | 100 non-429, then 429 body A, `Retry-After`, `X-RateLimit-*`        |
| 7   | Release id check     | `jq -e --arg ids "376454455 999" '((.workflowDatabaseId\|tostring) as $w \| ($ids\|split(" ")\|index($w)) != null) and .headBranch == "main" and .conclusion == "success"'` on a sample run JSON | `true` for id 376454455, `false` for another id (probed 2026-10-25) |
| 8   | Release filter (D14) | download one `knee-*` and one `spike-*` artefact of a `main` dispatch, run `scripts/ci/filter-evidence.sh`, list the files                                                                       | `csv`, `html`, `json`, `log`; no `json.gz`                          |

## 6. Design

### 6.1 File tree

```text
k6/lib/pure/spike.js                         NEW      buildSpikePlan, phaseAt, spikeVus, classifySpikeResponse (pure)
k6/lib/spike.js                              NEW      k6-facing: spikeOptions, beginSpikeIteration, observeSpikeResponses, spikeHooks
k6/journeys/med-checkout.js                  CHANGED  opts.abandon(n): stop before "complete" and count p6_abandoned (P6-MED-LOAD-010)
k6/cases/{cal-load-004,med-load-003,doc-load-004}.js + .example.json   NEW   spike scripts
src/load/recovery.ts                         NEW      windows from bins, recoveryTime, stormCheck, bandFor (pure)
src/load/spike/contract.ts                   NEW      evaluateSpike (per-product contract), SpikeReport
src/load/spike/stage.ts                      NEW      spikeStage (reconcile slot): points, report, token scan, files
src/load/spike/limiter-contract.ts           NEW      ROUTES table, runLimiterContract (P6-DOC-LOAD-009), judgeRoute (pure)
src/load/spike/med-abandon.ts                NEW      judgeAbandon (P6-MED-LOAD-010 oracle on the audit snapshot) + probe purchase
src/load/gates/cal-hold.ts                   NEW      reserveSlotGate (P6-CAL-LOAD-010 gate, evidence string)
src/load/chart/k6-points.ts                  CHANGED  SecondBin + status counts (2xx, 4xx, 429, 5xx, 0) per second
src/load/cases.ts                            CHANGED  + CAL_LOAD_004, MED_LOAD_003, DOC_LOAD_004, DOC_LOAD_009
package.json                                 CHANGED  + load:cal-spike, load:medusa-spike, load:documenso-limiter, load:documenso-limiter-contract
.github/workflows/knee.yml                   CHANGED  (Tasks 2 to 4 created it) + jobs cal-spike, medusa-spike, documenso-limiter
.github/workflows/evidence-release.yml       CHANGED  accepts a list of workflow ids (shared workflow)
docs/releases/p6-phase4a.md                  NEW      6b
README.md                                    CHANGED  6b: "Phase 4a results"
tests/unit/{k6-lib-spike,recovery,spike-contract,limiter-contract,med-abandon,cal-hold-gate,load-cases-spike,evidence-release-ids}.test.ts   NEW
```

### 6.2 The spike scenario (`k6/lib/pure/spike.js`, NEW; `k6/lib/spike.js`, NEW)

```js
/**
 * Stages for steady -> spike -> steady, rates in iterations per second (timeUnitSec makes fractions whole, Task 5):
 *  steady hold (steadySec), ramp to the spike (rampSec), spike hold (spikeSec), ramp back (rampSec), recovery hold (watchSec).
 * @param {{ steadyRate: number, spikeRate: number, steadySec: number, spikeSec: number, rampSec: number, watchSec: number, timeUnitSec?: number }} p
 * @returns {{ stages: Array<{ target: number, duration: string }>, startRate: number, timeUnitSec: number, marks: { steadyEnd: number, spikeStart: number, spikeEnd: number, end: number } }}
 */
export function buildSpikePlan(p) {
  /* marks in seconds from the scenario start; throws on rate <= 0, spikeRate <= steadyRate, any duration <= 0 */
}

/** "steady" | "ramp-up" | "spike" | "ramp-down" | "recovery" at an elapsed time. */
export function phaseAt(plan, elapsedMs) {
  /* … */
}

/** pre = ceil((spikeRate x (spikeSec + rampSec) + steadyRate x 5) x 1.1), max = ceil(pre x 1.3) */
export function spikeVus({ steadyRate, spikeRate, spikeSec, rampSec }) {
  /* … */
}

/** @returns {"ok" | "refused_with_body" | "refused_no_body" | "limited" | "server_error" | "transport" | "other"} 429 is "limited" (with or without a body); other 4xx are refusals */
export function classifySpikeResponse(status, bodyIsJson) {
  /* … */
}
```

`k6/lib/spike.js` (NEW) mirrors Task 1's `k6/lib/knee.js`: `spikeOptions(cfg)` builds the scenario with `rampingOpenScenario` (+ `timeUnitSec`), `preAllocatedVUs/maxVUs` from `spikeVus`,
and the standard options with **correctness thresholds only** (`checks` is dropped in spike scripts because refusals are expected: the thresholds are `p6_resp_5xx_storm: none`; there is no latency
threshold anywhere); `beginSpikeIteration(plan)` tags the VU with `phase`; `observeSpikeResponses()` hooks `observeResponses` (Task 1) and adds Counters `p6_resp_ok`, `p6_resp_4xx_body`,
`p6_resp_4xx_nobody`, `p6_resp_429`, `p6_resp_5xx`, `p6_resp_transport`, each tagged with `phase`; `spikeHooks(markerUrl)` = clock markers plus a Gauge `p6_spike_t0_ms` from `setup()`.
The three case scripts are the Task 2/3/4 scripts with `spikeOptions` in place of `kneeOptions`:

```js
// k6/cases/cal-load-004.js (the Medusa and Documenso twins differ in the journey and the config keys)
const cfg = {
  steadyRate: 3,
  spikeRate: 9,
  steadySec: 60,
  spikeSec: 30,
  rampSec: 2,
  watchSec: 120,
  timeUnitSec: 1,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-004",
  windowDays: 28,
  slotStarts: [],
  ...loadLoadConfig([]),
};
const plan = buildSpikePlan(cfg);
export const options = spikeOptions({
  ...cfg,
  plan,
  exec: "journey",
  tags: { case: "P6-CAL-LOAD-004", journey: "cal-book" },
});
export const { setup, teardown } = spikeHooks(__ENV.MARKER_URL);
observeSpikeResponses();
export function journey() {
  beginSpikeIteration(plan);
  runCalBook(cfg);
}
```

### 6.3 Recovery and contract (`src/load/recovery.ts`, `src/load/spike/contract.ts`, NEW)

```ts
export interface Window {
  index: number;
  fromMs: number;
  toMs: number;
  requests: number;
  p95Ms?: number;
  status: { ok: number; r4xx: number; r429: number; r5xx: number; transport: number };
}

/** 10-second windows over the per-second bins (SecondBin with status counts, Task 6 change of k6-points.ts). Windows under 40 requests keep their counts and have no p95. */
export function windowsFromBins(bins: SecondBin[], t0Ms: number, windowSec?: number): Window[];

/** Upper bound of the reference: max over the run's pre-spike window p95s (first 10 s skipped) and, when given, the Task 5 band's windowP95.max. */
export function referenceUpper(preSpike: Window[], band?: { max: number }): number;

/** Seconds from `spikeEndMs` to the end of the first of `consecutive` (2) windows with p95 <= upper; undefined when never. */
export function recoverySeconds(
  windows: Window[],
  spikeEndMs: number,
  upper: number,
  consecutive?: number,
): number | undefined;

/** True for a window with >= 5 5xx and 5xx / total > 1 %. */
export function isStorm(w: Window): boolean;
```

`evaluateSpike(input)` returns the report and findings; it is pure and per product:

| Check                              | Cal (characterisation)                                                         | Medusa (characterisation)             | Documenso (limiter profile)                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| no 5xx storm (any window)          | PRODUCT BUG (SUSPECTED) if violated                                            | same                                  | same                                                                                                                                              |
| every non-2xx is a 4xx with a body | holds trivially (0 refusals); counted                                          | same                                  | every 429 has a body (A or B) and the headers; other non-2xx are findings                                                                         |
| no transport-error storm           | window rule                                                                    | window rule                           | window rule (one reset in 3,196 is under it)                                                                                                      |
| refusals exist                     | not required                                                                   | not required                          | **at least 10 429s** during the spike, else `INVALID no_refusals` (the spike did not exceed the limiter: a test that cannot fail is not accepted) |
| 429 only on covered routes         | n/a                                                                            | n/a                                   | 429 on `/api/trpc/*` only (v2 calls never exceed 1000 per minute); another route with 429 is reported                                             |
| recovery                           | seconds or "not reached in N s"                                                | same                                  | seconds (429 stops and p95 back inside the reference)                                                                                             |
| dropped iterations                 | 0 else INVALID                                                                 | 0 else INVALID                        | 0 else INVALID                                                                                                                                    |
| post-spike audit                   | Cal audit (no overlapping accepted pairs, client = database exactly: no abort) | Medusa audit and conservation (below) | Documenso audit and pipeline on completed documents (Task 4 §6.4); unfinished = refused documents, equal to the documents with a 429              |

The report label is `"characterisation"` for Cal (and Medusa), `"limiter contract"` for Documenso; both are printed in the job summary next to the recovery time. Verdict mapping: a violated check is `PRODUCT BUG
(SUSPECTED)` (never a final label), `INVALID` for generator reasons, `TEST BUG` for plan faults. `spikeStage` (reconcile slot) reads the points file with `readPointsGzStream`, builds windows, runs
`evaluateSpike`, writes `spike-report-<label>.json` and `.md` after `findHits`, and puts the recovery time into `verdict.json`.

### 6.4 Cal (`P6-CAL-LOAD-004`), Medusa (`P6-MED-LOAD-003`, `P6-MED-LOAD-010`)

- `CAL_LOAD_004` (`src/load/cases.ts`): `label: "steady baseline, environment-bound"` is not used; add `LoadLabel` `"spike characterisation, environment-bound"`. Rates come from the Task 5 bounds: steady = `steadyRateFor` (50 %), spike = `1.5 x
lowerBound` (150 %), rounded to 0.1. Stages `setup: calSetup({ slots })` (supply `ceil(1.05 x planned)`), `reconcile: composeStages([spikeStage, reconcileStage])`, `cleanup: calCleanup`. Default plan: steady 60 s, ramp 2, spike 30, ramp 2,
  recovery watch 120 s → about 1,040 iterations → 1,090 slots (96 days). `P6-OBS-CAL-002` counted under its id.
- `MED_LOAD_003`: same shape; stock `ceil(1.2 x planned) + 10`; `reconcile: composeStages([spikeStage, reconcileStage, conservationStage, abandonStage])`. Contract adds the **post-spike stock invariant**: `orders <= S`, units = reservations,
  `reserved_quantity` = units, `available >= 0` (`readOversellSnapshot`).
- `P6-MED-LOAD-010` (same run, own ID and checks): `med-checkout.js` gets `opts.abandon = (n) => n % 4 === 3` (every fourth iteration stops after "payment session", before "complete", counter `p6_abandoned`). `judgeAbandon` (pure) takes
  `{ abandoned, orders, reservationRowsLive, reservedQuantity, stock, probePurchase }` and reports: reservation rows live = orders, `reserved_quantity` = orders, available = stock - orders >= 0, and the **probe purchase**: after the spike the stage
  completes one more checkout of the variant through the store API (`prepareReadyCart`, `completeCart`, `src/medusa/store.ts`), expected 200; a refusal while available > 0 is `PRODUCT BUG (SUSPECTED)` ("abandoned carts block stock").
  The release rule recorded in the report: "reserved at completion only; a cancelled order soft-deletes its reservation" (§3.7).

### 6.5 Documenso (`P6-DOC-LOAD-004`, `P6-DOC-LOAD-009`) and the limiter profile

`DOC_LOAD_004`: rates from the **limiter** that binds, not from the knee (§3.4): `steadyRate = 0.2`, `spikeRate = 0.6` documents per second (constants with the arithmetic in the code comment: 100 tRPC per minute / 4 per document = 25 per minute, 0.42 per second; 50 % ≈ 0.2, 150 % ≈ 0.6), steady 60 s, spike 30 s, watch 120 s. `knownBugs: ["P6-OBS-DOC-001"]`
extends to the auth routes the case may touch (it touches none; only `-009` does). `reconcile: composeStages([spikeStage, reconcileStage, pipelineStage])` in knee mode (Task 4): completed documents only; the unfinished ones must equal the documents that had
a 429 (`p6_resp_429` per iteration, counted by the script). **Setup runs inside the limiter profile**: `documensoSetup` signs up, signs in and mints the token with the limiter on; the first run on a fresh database uses signup 1 of 3, login 1 of 10, a few tRPC calls: verified by the probe. Two reruns
within three hours on the same database exhaust `auth.signup` (3 per 3 h): the CI job has a fresh database; the local note is in §3.8.

`DOC_LOAD_009` (`src/load/spike/limiter-contract.ts`, NEW; a runner case with no k6 process): table `ROUTES` of the probed routes of §3.4 (`id`, method, path, body factory, `max`, `family` A or B, `preLimitStatuses` "not asserted"); `judgeRoute(observations, route)` (pure): the
first `max` responses are not 429, response `max + 1` is 429 with status 429, `content-type: application/json`, the body of its family (A exactly `{"error":"Too many requests, please try again later."}`; B exactly `{"code":"UNKNOWN_ERROR","message":"","statusCode":429}`), `Retry-After` an integer >= 1,
`X-RateLimit-Limit` = `max`, `X-RateLimit-Remaining` = `0`, `X-RateLimit-Reset` an epoch second in the future. Pre-limit statuses are **recorded, not asserted**; a 5xx among them is counted (`P6-OBS-DOC-001`, extended to `reset-password` with an unknown token as a `PRODUCT BUG (SUSPECTED)` instance, §3.4) and
never fails the case. Requests per route: 101 (tRPC), 1,001 (v1), 1,001 (v2), 21, 4, 11, 4, 4, 6, 6 = about 2,250, sequential, about 40 s on the VM. The routes of §3.4's "UNPROBED" row are listed in the report as **not asserted, with the reason**, never claimed. The stage
returns `TEST BUG` if fewer than the expected requests were answered.

### 6.6 Request shapes used by the probe (for the builder)

`authorize`: `POST /api/auth/email-password/authorize` JSON `{ email, password (>= 6), csrfToken }`; `forgot-password` and `resend-verify-email`: `{ email }`; `verify-email`: `{ token }`; `reset-password`: `{ token, password }` (password >= 8 characters); tRPC
probe: `GET /api/trpc/p6.probe`; v2: `GET /api/v2/envelope/p6probe`; v1: `GET /api/v1/documents`; upload: `POST /api/files/upload-pdf` (empty body, answers 400 before the limiter counts out); ai: `POST /api/ai/p6` JSON `{}`.

### 6.7 `P6-CAL-LOAD-010` (gated; in "Later")

`src/load/gates/cal-hold.ts` (NEW): `reserveSlotGate(files: Record<string, string>): { passes: boolean; evidence: string }`, true only if a file under `k6/journeys` or `k6/cases` contains `reserveSlot`. A unit test pins the current result (no file → `passes: false`, evidence
"the Cal journey calls getSchedule and POST /api/book/event only"). README "Later" lists `P6-CAL-LOAD-010` with that evidence and the proposed extra `P6-CAL-LOAD-014`.

### 6.8 CI: jobs in `knee.yml` and the limiter profile as its own start

Add to `.github/workflows/knee.yml`: `cal-spike` (as `cal-knee`, step `npm run load:cal-spike`, timeout 90), `medusa-spike` (as `medusa-knee`, step `npm run load:medusa-spike`, timeout 60) and `documenso-limiter` (timeout 60). The last differs from every other Documenso job:

```yaml
- name: Start Documenso on the production-like limiter profile (D12; harness up)
  id: doc_up
  timeout-minutes: 10
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  env:
    # A configuration profile, not a workaround: the harness keeps a pre-set value (scripts/harness.mjs uses ||=).
    DANGEROUS_BYPASS_RATE_LIMITS: "false"
  run: |
    set -euo pipefail
    npm run up:documenso
- name: Limiter contract P6-DOC-LOAD-009
  timeout-minutes: 8
  run: npm run load:documenso-limiter-contract
- name: Spike P6-DOC-LOAD-004 on the limiter profile
  timeout-minutes: 12
  run: npm run load:documenso-limiter # exit 3 (INVALID) is a warning, as in the knee jobs
- name: Stop Documenso (harness down)
  if: ${{ always() }}
  timeout-minutes: 5
  run: npm run down:documenso
```

The `env:` block is on the start step only, so no other Documenso step or job sees it. A unit test greps `knee.yml` and `perf.yml` and asserts `DANGEROUS_BYPASS_RATE_LIMITS: "false"` appears once, in job `documenso-limiter`.

### 6.9 The evidence release accepts the `knee.yml` runs (shared workflow; owner review)

`.github/workflows/evidence-release.yml`: replace `PERF_WORKFLOW_ID: "376454455"` by `EVIDENCE_WORKFLOW_IDS: "376454455 <knee.yml id>"` (look the id up with the `gh api … workflows/knee.yml --jq .id` command of §3.8) and the check in "Check each run, then download its artefacts" by:

```bash
jq -e --arg ids "$EVIDENCE_WORKFLOW_IDS" \
  '((.workflowDatabaseId|tostring) as $w | ($ids|split(" ")|index($w)) != null) and .headBranch == "main" and .conclusion == "success"' \
  "$RUNNER_TEMP/run.json" > /dev/null \
  || { echo "::error::run $id is not a successful perf.yml or knee.yml run on main"; exit 1; }
```

Probed with sample JSON (§5 check 7). Everything else in the workflow is untouched (the notes check, the tag rule `^p6-[a-z0-9-]+$` which allows `p6-phase4a`, the token scan, gitleaks, the zip step). The run ids of `perf.yml` runs (steady baselines) and `knee.yml` runs (knees, spikes) both go into `docs/releases/p6-phase4a.md`. The unit test (`evidence-release-ids`, 2) asserts the variable name and that no single-id comparison remains. **D14 verification** (check 8 above): the zips of the release contain `csv` and `html` of the knee and spike runs; the points files stay out (Task 11 Q2).

## 7. Oracles and assertions

Every case has a contract and a post-spike audit (`P6-X-LOAD-005`): Cal (no overlapping accepted pairs, accepted-only, client = database), Medusa (orders <= stock, reservations = live orders, available >= 0, one payment per order, probe purchase), Documenso (one seal per completed document, no
stuck jobs, drained, unfinished = refused). Contract: §6.3. The Documenso `-009` oracle is the table of §6.5. Anything surprising is labelled with evidence: **PRODUCT BUG (SUSPECTED): `reset-password` with an unknown token answers HTTP 500 (§3.4)**; no expected-failure marker is planned for it (repeated-run evidence needed first: rule 13).
A 5xx storm, an audit violation, a probe purchase refused while stock is available, a 429 on a non-covered route or a 429 without its body or headers is `PRODUCT BUG (SUSPECTED)`. Plan faults (supply, stock, config, window rules), INVALID reasons and recovery not reached are not product labels.

## 8. Data isolation, cleanup, leak check

Prefix per case (`caseDataPrefix`); Cal bookings, Medusa orders/product/customers, Documenso envelopes/webhook/token/account are swept by the Phase 3 cleanup stages, each followed by its leak check. `-009` makes no product data except limiter rows (the harness database is dropped with the job; a local rerun note in
§3.8). Token scan: `tokenScan` stage and the workflow step; reports hold counts, headers (names and the three `X-RateLimit-*` numbers, no cookie) and body families only.

## 9. CI, token scan, budget

| Job (new, in `knee.yml`) | Timeout | Estimate (min)                                                                  | Worst at caps (min) | Margin | Notes                                                                        |
| ------------------------ | ------- | ------------------------------------------------------------------------------- | ------------------- | ------ | ---------------------------------------------------------------------------- |
| `cal-spike`              | 90      | 3.1 setup + 4.7 run + 1.2 cleanup + 1 post = **10**                             | 62                  | 28     | run: 60 + 2 + 30 + 2 + 120 = 214 s plus drain; 1,040 bookings cancel in 73 s |
| `medusa-spike`           | 60      | 1.1 + 5.5 (60+34+240 s plus orders cleanup 0.5 min) + 1 = **8**                 | 40                  | 20     | recovery watch 240 s                                                         |
| `documenso-limiter`      | 60      | 1.8 setup + 0.7 contract (2,250 requests) + 3.7 spike + 0.5 cleanup + 1 = **8** | 38                  | 22     | `-009` step cap 8, spike step cap 12                                         |

Per-step caps and the 80 % stop rule: spike step 15 (stop 12) for Cal and Medusa; `-009` 8 (stop 6.4, estimate 0.7); Documenso spike 12 (stop 9.6, estimate 3.7). If a first dispatch shows a step above its stop rule, the fix is a shorter hold or watch, never a higher timeout.
`evidence-release.yml` (job timeout 30): download of about 12 runs (3 per case family) of 2 to 5 MB each, filter and scans: estimate 3 minutes. No existing job changes; no existing timeout is raised. Runner minutes per dispatch of the whole workflow: about 26; three: about 78.

## 10. Expected output

```text
$ npm run load:cal-spike
P6-CAL-LOAD-004 (spike characterisation, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   steady 3/s (50 % of 6), spike 9/s (150 %), 1,090 slots, pre 354 / max 461
  k6 main      exit 0   dropped 0
  spike        characterisation: 0 refusals, 0 5xx, 0 transport errors; peak window p95 11,137 ms (VM illustration); reference upper 220 ms; recovery 12 s after the spike end
  reconcile    ok   audit: client = database = 1,038; 0 overlapping accepted pairs
  verdict      PASS | INVALID
$ npm run load:documenso-limiter-contract
P6-DOC-LOAD-009  trpc ok (429 at 101, family A)  v2 ok (1001)  v1 ok (1001)  upload ok (21)  ai ok (4)  authorize ok (11, family B) … not asserted: signup, update-password, passkey, request-2fa-email, link-org-account, report-sender, sync-subscription (reasons in the report)
```

(Illustrative VM-class values; nothing is published from them.)

## 11. Environment changes (exact steps)

None for Cursor Cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) or Claude Code cloud (setup script, `.claude/hooks/session-start.sh`); the limiter variable is set on one workflow step, and for a local run as `DANGEROUS_BYPASS_RATE_LIMITS=false npm run up:documenso` (then `npm run
down:documenso`). **Manual repo settings:** none. The owner dispatches `knee.yml` three times and then `evidence-release.yml` with `tag=p6-phase4a` (§12).

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Counts relative to B6 (§5 check 2).

**Part 6a** (`git switch -c feat/<build date>-p6-spike-recovery origin/main`)

| Step | Commit subject                                                          | `git add` paths                                                                                                                                                                                       | Expected (`npm run check`)                                                                                    |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0    | `docs(plans): bring the phase 4 task 6 plan onto the build branch`      | `docs/plans/2026-10-25-p6-phase4-task6-spike-recovery.md`                                                                                                                                             | exit 0, B6                                                                                                    |
| 1    | `feat(k6): add the spike plan, sizing and response classes`             | `k6/lib/pure/spike.js tests/unit/k6-lib-spike.test.ts`                                                                                                                                                | exit 0, **B6 + 5**                                                                                            |
| 2    | `feat(load): measure recovery and storms from windows`                  | `src/load/recovery.ts src/load/chart/k6-points.ts tests/unit/recovery.test.ts`                                                                                                                        | exit 0, **B6 + 12**                                                                                           |
| 3    | `feat(load): add the spike contract and its stage`                      | `src/load/spike/contract.ts src/load/spike/stage.ts tests/unit/spike-contract.test.ts`                                                                                                                | exit 0, **B6 + 18**                                                                                           |
| 4    | `feat(k6): add the k6 spike library and the three spike scripts`        | `k6/lib/spike.js k6/cases/cal-load-004.js k6/cases/cal-load-004.example.json k6/cases/med-load-003.js k6/cases/med-load-003.example.json k6/cases/doc-load-004.js k6/cases/doc-load-004.example.json` | exit 0, B6 + 18; `k6 inspect` ok                                                                              |
| 5    | `feat(load): add the medusa abandoned-cart check`                       | `k6/journeys/med-checkout.js src/load/spike/med-abandon.ts tests/unit/med-abandon.test.ts`                                                                                                            | exit 0, **B6 + 22**                                                                                           |
| 6    | `feat(load): add the documenso limiter contract`                        | `src/load/spike/limiter-contract.ts tests/unit/limiter-contract.test.ts`                                                                                                                              | exit 0, **B6 + 29**                                                                                           |
| 7    | `feat(load): record the failed gate of the cal slot-hold case`          | `src/load/gates/cal-hold.ts tests/unit/cal-hold-gate.test.ts`                                                                                                                                         | exit 0, **B6 + 31**                                                                                           |
| 8    | `feat(load): add the spike and limiter cases`                           | `src/load/cases.ts package.json tests/unit/load-cases-spike.test.ts`                                                                                                                                  | exit 0, **B6 + 35**; the three `npm run load:*-spike -- --profile pr` runs exit 0 or 3 against started stacks |
| 9    | `ci(knee): add the spike jobs and the limiter job to the knee workflow` | `.github/workflows/knee.yml`                                                                                                                                                                          | exit 0 (actionlint silent), B6 + 35                                                                           |
| 10   | `ci(evidence): accept the runs of the knee workflow in the release`     | `.github/workflows/evidence-release.yml tests/unit/evidence-release-ids.test.ts`                                                                                                                      | exit 0, **B6 + 37**                                                                                           |

**Part 6b** (`git switch -c docs/<build date>-p6-phase4a-release origin/main` after three VALID runs of every case)

| Step | Commit subject                                 | `git add` paths               | Expected                |
| ---- | ---------------------------------------------- | ----------------------------- | ----------------------- |
| 11   | `docs: add the phase 4a release notes`         | `docs/releases/p6-phase4a.md` | exit 0, B6 + 37         |
| 12   | `docs: add the phase 4a results to the readme` | `README.md`                   | exit 0 (`readme-rules`) |

After 12 and the owner's merge, the owner dispatches `evidence-release.yml` from `main` with `tag=p6-phase4a`, `target_sha` = the 6b merge commit and `run_ids` = the run ids in the notes (knee runs of Tasks 2 to 4, steady runs of Task 5, spike runs of this task); the report records
`gh release view p6-phase4a`.

New unit tests by name (37): `k6-lib-spike` (5: plan stages and marks; bad input rejected; `phaseAt` boundaries; `spikeVus` sizing of the default plans (354/461, 59/77, 24/32); response classes incl. 429 and status 0); `recovery` (7: windows of 10 s with the 40-request floor; upper bound from pre-spike
windows and a band; recovery with two consecutive windows; a single dip is not recovery; never recovered → undefined; storm needs 5 and 1 %; a window with 5xx under 1 % is not a storm); `spike-contract` (6: clean characterisation; 5xx storm; refusal without body; Documenso needs ≥ 10 429s else `no_refusals`; 429 on a non-covered route; dropped iterations make INVALID);
`med-abandon` (4: abandon every fourth; reservations equal orders; a reservation for an abandoned cart is a PRODUCT BUG line; a refused probe purchase with stock available is a PRODUCT BUG line); `limiter-contract` (7: route table lists the 10 probed routes with their max; family A and B bodies; header checks; the 429 index; pre-limit 5xx recorded under `P6-OBS-DOC-001` not failing;
unprobed routes listed with reasons; too few answers is a TEST BUG); `cal-hold-gate` (2: no file mentions `reserveSlot` → fails with evidence; a file that does → passes); `load-cases-spike` (4: four cases registered with labels and `allowExits`; the Cal and Medusa rates derive from the bounds; the Documenso rates are the limiter constants; the `package.json` scripts exist);
`evidence-release-ids` (2). Count 5 + 7 + 6 + 4 + 7 + 2 + 4 + 2 = **37**; steps 1 → +5, 2 → +7, 3 → +6, 5 → +4, 6 → +7, 7 → +2, 8 → +4, 10 → +2.

Each part: push, `gh pr create` (rule 3), CI once (rule 15). Merge only when the owner says "merge", one at a time (workflow edits).

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                               | Mitigation                                                         |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| R1  | Generator saturation at 150 %                                      | VU pool sized for every arrival (§3.2); drops make the run INVALID |
| R2  | The limiter profile leaks into other Documenso steps               | env on one step; test asserts it appears once                      |
| R3  | Recovery never reached inside the watch period                     | recorded as "not reached in N s", VALID                            |
| R4  | A rerun on the same Documenso database finds auth limits exhausted | fresh CI database; local note                                      |
| R5  | `evidence-release.yml` change breaks the release                   | probed jq; unit test; dry-run on a sample JSON; owner review       |
| R6  | Spike windows are noisy                                            | 40-request floor, two consecutive windows, ≥ 3 runs                |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                             | Probe shows                                                                  | Effect                                                                 |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C1  | "every refusal is a 4xx with a body" for Cal, Medusa                     | no refusals at all; the products queue (11 to 20 s latency)                  | characterisation; the check holds vacuously                            |
| C2  | Documenso steady 50 % / spike 150 % "of the knee" on the D12 profile     | the tRPC limiter binds at 0.42 documents per second, an order below the knee | rates from the limiter; the capacity spike is extra `P6-DOC-LOAD-012`  |
| C3  | "Any 500 on the sign-in route links to `P6-OBS-DOC-001`"                 | `reset-password` with an unknown token is also a 500                         | the link covers auth routes; new instance is `PRODUCT BUG (SUSPECTED)` |
| C4  | `P6-CAL-LOAD-010` "gated on `reserveSlot`"                               | the journey never calls it                                                   | gate fails; "Later" (§3.7)                                             |
| C5  | CI: `workflow_dispatch` plus weekly Saturday in `perf.yml`/knee workflow | the release accepts one workflow id                                          | §6.9                                                                   |
| C6  | "recovery = first window back inside the baseline band"                  | Documenso has no Task 5 baseline                                             | the run's own pre-spike windows are part of the reference (§3.6)       |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-DOC-LOAD-012`: the Documenso spike at 150 % of the knee on the default profile (limiter bypassed): seal lag and recovery under overload (VM: seal lag p95 9.6 s, recovery 66 s, one transport reset).
- `P6-CAL-LOAD-014`: the Cal journey variant with `reserveSlot` and the post-spike `SelectedSlots` release check (the gate evidence of §3.7).
- `P6-DOC-LOAD-013`: assert the tRPC-inline limiters (`request-2fa-email`, `link-org-account`, `sync-subscription`) once a session and billing state exist in the harness.
- `P6-MED-LOAD-013`: the Medusa spike on the Redis-lock mode (`MEDUSA_REDIS=1`, `MEDUSA_LOCK=redis`).

**Open decisions** (option, evidence, recommended default).

- **Q1. Workflow name.** `knee.yml` now hosts knees, spikes and the limiter job. (a) keep the name (fewer moves, recommended); (b) rename to `limits.yml` in Task 2 before anything is built. **Default: (a).**
- **Q2. Documenso `-004` rates.** (a) the limiter-bound rates 0.2 and 0.6 (recommended; §3.4); (b) the roadmap's 50 % and 150 % of the knee (the steady phase would already be refused). **Default: (a).**
- **Q3. Reference for recovery.** (a) the run's own pre-spike windows plus the Task 5 band when it exists (recommended); (b) the Task 5 band only (Documenso would have none). **Default: (a).**
- **Q4. The new suspected bug.** `reset-password` unknown token → 500. (a) record it as `PRODUCT BUG (SUSPECTED)` under an extended `P6-OBS-DOC-001` and ask the owner for the label after three runs (recommended); (b) a new ID. **Default: (a); the owner decides the label.**
- **Q5. `evidence-release.yml` change.** (a) accept a list of workflow ids (recommended; one workflow, one release); (b) dispatch the release twice, once per workflow. Evidence: the workflow checks one id and one tag; a second release would need a second tag. **Default: (a).**
- **Q6. Phase 4a closeout document.** (a) none now; Task 14 covers both releases (roadmap; recommended); (b) a short 4a closeout from the template. **Default: (a).**
- **Q7. Spike length.** (a) 30 s at 150 % (recommended; VM: backlog drained in 12 to 76 s); (b) 60 s (a longer backlog, longer recovery watch). **Default: (a).**

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B6 + 37** unit tests; `k6 inspect` lists the three spike scripts.
- [ ] 3 VALID runs per case (`P6-CAL-LOAD-004`, `P6-MED-LOAD-003` with `-010` inside, `P6-DOC-LOAD-004`, `P6-DOC-LOAD-009`) from `knee.yml` dispatches on `main`, each with the contract result, the recovery time (or "not reached in N s"), telemetry, a clean audit or a recorded product bug / characterisation; Cal labelled
      characterisation; `P6-MED-LOAD-010` landed; `P6-CAL-LOAD-010` in "Later" with the gate evidence.
- [ ] `evidence-release.yml` accepts the `knee.yml` runs; the interim release `p6-phase4a` exists with `docs/releases/p6-phase4a.md`; `unzip -l` of one release zip shows `csv` and `html` files (the D14 filter verified; no `json.gz`).
- [ ] README "Phase 4a results": knee ranges (Tasks 2 to 4), steady bands (Task 5), spike characterisations and the limiter contract, with run ids, environment labels and INVALID runs listed; the word "capacity" appears only as "not capacity".
- [ ] Phase 4a exit: knee ranges for three products from ≥ 3 VALID runs, baselines and spikes evidenced, release published.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID runs per case with contract, recovery, clean audit; Cal characterisation; `-009` and `-010` land; `P6-CAL-LOAD-010` lands or "Later" with gate evidence; widened filter verified; `p6-phase4a` published; `npm run check` green: §14. Gap: runner values (§3.8).
- (b) Existing names grepped on the Task 10 head (all present): `k6/journeys/{cal-book,med-checkout,doc-sign}.js`, `src/load/chart/k6-points.ts` (`SecondBin`, `aggregatePoints`), `src/load/reconcile/*`, `src/load/med-conservation.ts` (`conservationStage`), `src/medusa/oracle.ts` (`RESERVATION_QTY_SQL`,
  `INVENTORY_LEVEL_SQL`, `readOversellSnapshot`), `src/medusa/store.ts` (`prepareReadyCart`, `completeCart`), `src/documenso/run-case.ts`, `scripts/harness.mjs` (`||=`), `.github/workflows/evidence-release.yml` (`PERF_WORKFLOW_ID`). NEW with skeletons: §6.1. From Tasks 1 to 5, 11: §4.
- (c) CI time: §9, margins 20 to 28 minutes; no existing timeout raised; the release job estimate 3 of 30 minutes.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) No owner answer is recorded as given; Q1 to Q7 are open with defaults.
