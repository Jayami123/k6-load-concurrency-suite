# P6 Phase 4b Task 7: soak workflow and soaks (`P6-CAL-LOAD-008`, `P6-MED-LOAD-005`, `P6-DOC-LOAD-006`) (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 508 to 541 (Task 7), D4 (line 814), D16 (line 846),
Phase 3 D5. Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `86dbbde` (merged into this branch at `fe09ba6`; re-checked 2026-10-26 against main 86dbbde). Probe date 2026-10-25 (UTC), cloud VM
(4 vCPU, 15 GB, Node v22.23.3 for Cal and Medusa, v24.21.0 for Documenso), k6 v2.3.0. **VM timings prove that a step works; none
is a published number or a target.** Every runner value is marked "confirm in the first CI dispatch".

## 1. Header

- **Task and roadmap line:** Phase 4b Task 7 (soak workflow + three soaks), roadmap lines 508 to 541.
- **Cases and priority:**

| Case              | Priority           | What                                                                                                                       |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `P6-CAL-LOAD-008` | none (roadmap "—") | Cal booking-journey soak with slot recycling (L1), RSS / fds / pg connections slope, plateau, DB growth tracked separately |
| `P6-MED-LOAD-005` | none (roadmap "—") | Medusa checkout soak; no Redis or event-bus backlog to observe in the default harness (L13)                                |
| `P6-DOC-LOAD-006` | none (roadmap "—") | Documenso signing soak; web-process RSS / fds and pending-job backlog bounded                                              |

- **Build branch pattern:** `feat/<build date>-p6-soak-workflow` (roadmap Task 7 table).
- **Unit-test delta:** **+23 against B 1103** (B0 1102 measured in S2 on `86dbbde`, plus the bound PR's +1; index §2 step 0b). Expected after the last step: **1126**. The delta is per step in §12.
- **Stop for owner review: yes.** It adds a new scheduled-capable workflow (`soak.yml`, rule B10 and D16), a new job in a shared
  CI file, and a runner budget that §9 shows. The schedule itself is a later `ci(soak)` PR, after three VALID dispatched 30-min
  soaks per product (index §6, run order 3 and 4).

## 2. What it proves

- A long-running service does not grow without bound: RSS, open fds and pg connections have no positive slope after warm-up, and
  the last third of the run is not higher than the middle third (plateau).
- Data growth is not read as a leak: DB size is tracked by its own SQL, separate from process RSS (L2).
- The pending-job backlog of Documenso's in-process jobs stays bounded (`P6-DOC-LOAD-006`).
- Transfer: the slow leak a payment gateway or an EHR interface engine shows only after hours, and the table growth a ledger
  adds on its own, which must not be mistaken for it.

## 3. Live probe evidence

Probe commands were run from the harness scripts only (`npm run up:<product>`, `node scripts/load/run-load.ts`, `npm run
down:<product>`). Medusa was started twice (see row M-1). Nothing was dispatched on GitHub; the one GitHub read was the Documenso
knee artefacts (row D-2). Scratch output lives outside the repo.

### 3.1 Roadmap item: a 2 h soak plus stack start and build fits the 6 h cap per product

| #   | Command                                                                                                                                                                                                                       | Output (trimmed)                                                                                                                          | Value it sets                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M-1 | `npm run up:medusa` (first try, no admin password in the shell)                                                                                                                                                               | exit 0, 100 s, `Medusa backend is up at http://127.0.0.1:9000 (production, 6.1 s from spawn to HTTP 200)`                                 | stack start ~100 s on the VM (build 45 s inside it)                                                                                                    |
| M-2 | `node scripts/load/run-load.ts --case P6-MED-LOAD-002 --profile steady` (first try)                                                                                                                                           | `outcome: ENV`, reason `Medusa seed() needs MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD in the harness .env`                             | not a product result: CI sets the admin password in a step of its own (`knee.yml` line 382); the local rerun exported a generated value, never printed |
| M-3 | `npm run down:medusa && npm run up:medusa`, then `node scripts/load/run-load.ts --case P6-MED-LOAD-002 --profile steady` (generated `MEDUSA_ADMIN_PASSWORD`, not printed; local runs reuse `$HOME/.p6/medusa-admin`, see §11) | exit 0, **139 s** wall, `P6-MED-LOAD-002 PASS results/load/P6-MED-LOAD-002/20261025T232345Z-f57779a7/verdict.json` (VALID, all stages ok) | the run's own stages: setup 6.1 s, k6 121.0 s, reconcile 0.1 s, cleanup 10.7 s                                                                         |
| M-4 | `npm run down:medusa`                                                                                                                                                                                                         | exit 0; `docker ps -a` shows 0 `qa-harness-*` containers and 0 product processes after it                                                 | stop works; no leftover                                                                                                                                |

So the 120 s steady run costs **139 s** plus the 100 s stack start: **about 4 min** for 2 min of load. For a 2 h soak the same arithmetic gives 6.1 s setup + 7,200 s k6 + 0.1 s reconcile + the cleanup of the orders (0.33 s each, roadmap 4a index finding 7: 5,040 orders × 0.33 s = 1,663 s = **27.7 min**) + 100 s start: **about 2 h 30 min** for Medusa (8,863 s of run plus 100 s of start and about 17 s of setup and reconcile). Cal and Documenso rows follow in §3.2 and §3.3.

**Finding M-F1 (not in the plan's scope, recorded for the owner).** In run M-3 the steady case `P6-MED-LOAD-002` was sized with `stockFor: (planned) => Math.ceil(planned / 2)` (`src/load/cases.ts` line 377, Phase 3 Task 8 owner decision Q1). The run had 84 planned iterations, 42 orders, and `p6_refused_at_line_item` = 42 (`k6-main-summary.json`, clean refusals, `http_req_failed` fails 0 of 506 requests). So half of the steady stream was refused by design. The 4a Task 5 band (`k6/thresholds/baseline-band.json`, P6-MED-LOAD-002 p95 median 220.63 ms) was measured the same way. **Consequence for this task:** a Medusa soak must size stock as `planned + 20` (the `makeMedusaSetup` default at `src/load/products/medusa.ts` line 120), never `planned / 2`. Otherwise the soak measures the refusal path after stock runs out. Open decision Q-MEDSTEADY in §13.

**Finding M-F2 (UNEXPLAINED, root cause UNPROBED).** The Medusa process RSS in run M-3 (`telemetry-main.json`, sampler field `proc.rssMb`, process group `members` = 1 throughout):

```text
t(s)   0     10     20     30     40     60     80    100    102     103    105    110    120
RSS    435   451    517    581    645    774    804    833    837     406    415    426    436   (MB)
```

RSS rose about 400 MB over the first 100 s, then fell by 430 MB in one second (102 s to 103 s) while `cpuTicks` kept rising (6,856 to 6,930) and `members` stayed 1. A restart would reset `cpuTicks`, so this is not a restart. Cause not found (candidates: a V8 or malloc release inside the same process, or the sampler reading another process of the group; both UNPROBED). **Consequence:** a least-squares slope over a window that contains such a step is not a leak signal on its own. The soak rule in §6.4 therefore reports two statistics (least squares and Theil–Sen) and a step count, and never reads one number as a verdict.

**CI 4a evidence for M-F2 (checked against the release zips, 2026-10-26).** The Medusa steady runs 40296658253 / 40296661816 / 40296665884 (`telemetry-main.csv`, 121 samples, `members` 1 throughout) rose 449→545, 454→573, 452→515 MB, with no sample-to-sample drop over 100 MB. The Cal steady runs rose 604→1527, 603→1526, 607→1784 MB, also with no drop. The VM step is not reproduced on CI. Hypothesis (unverified): a V8 major GC / heap shrink (same pid, CPU rising).

**Finding M-F3 (telemetry, measured).** `telemetry-main.json` of M-3: 121 samples over 119.996 s, `intervalMs` 1000, consecutive gaps median 1000 ms and max 1001 ms, **0 gaps over two intervals**, per-sample cost max 19 ms (`sampleCostMs`), **92,421 bytes = 764 bytes per sample**. Extrapolated to 2 h (7,200 samples): **5.5 MB** JSON, the same size as the roadmap 4a index's estimate (about 5.5 MB). The 4a index's effective interval of 1.0 to 1.3 s was measured on the first samples of a run with a slower database read; this run had 1.0 s throughout (the sampler's own cost stayed under 20 ms).

Cal rows (same session; the Cal stack was started once and stopped once):

| #   | Command                                                                                   | Output (trimmed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Value it sets                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | `npm run up:cal` (background, `UP_EXIT` read from the log)                                | exit 0 in **421 s** on the cache-less VM (not a CI number; the Cal `next build` compiled in 98 s, the rest was the seed and the TypeScript and asset steps). CI evidence: 9 of 9 4a `knee.yml` runs restored the Cal build cache (0–3 s); Start Cal took 52–70 s (19 % of the 6-min cap); PRE-2 worst case 255 s × 1.25 = 319 s ≤ 360 s. The 6-min cap stays (never raised). Only `perf.yml` cal-smoke saves the cache, which is evicted after 7 days unused, so the job summary warns on a cache miss | a cold Cal start is 421 s on the VM; `cal-knee` caps "Start Cal (harness up)" at 6 min; CI restores the build cache, so its start is 52–70 s                                 |
| C-2 | `node scripts/load/run-load.ts --case P6-CAL-LOAD-003 --profile steady`                   | exit 0, **147 s** wall, `P6-CAL-LOAD-003 PASS results/load/P6-CAL-LOAD-003/20261025T233524Z-8986f965/verdict.json`, VALID; stages: setup 0.4 s, k6 121.0 s, reconcile 0.1 s, cleanup **24.9 s**                                                                                                                                                                                                                                                                                                        | a 2-min steady run costs 147 s plus the start                                                                                                                                |
| C-3 | the same run's audit and points                                                           | `480 live booking(s)`; `accepted-only` ok; `client-matches-db 480/480`; `no-overlap 0`; `dropped_iterations` 0                                                                                                                                                                                                                                                                                                                                                                                         | the steady rate of 4 per second is VALID on the VM                                                                                                                           |
| C-4 | `telemetry-main.json` of C-2 (`node` summary, §3.1 method)                                | 121 samples in 119.997 s, `intervalMs` 1000, gap median 1000 ms, **max gap 1040 ms**, **0 gaps over two intervals**, **742 bytes per sample** (89,829 bytes), `sampleCostMs` **max 917 ms**                                                                                                                                                                                                                                                                                                            | the Cal sampler has one slow read (917 ms) but no gap; 2 h = 7,200 samples ≈ **5.3 MB**                                                                                      |
| C-5 | the same telemetry: RSS, fds, pg connections                                              | `rssMb` **582 → 1,086** in 120 s; `fds` 39 → 69; `db.total` 11 → 21                                                                                                                                                                                                                                                                                                                                                                                                                                    | Cal RSS grows through the steady phase, as the 4a index found (707 → 1,697 MB); the 30 s warm-up is too short for a 2-h soak: confirms the warm-up rule of §3.4              |
| C-6 | free slots of the run window after the cleanup (`getFreeSlots`, `src/cal/api.ts` line 17) | `count 519` for 2026-10-27 to 2026-12-10 (the run picked 504 slots, `slotStarts`)                                                                                                                                                                                                                                                                                                                                                                                                                      | **partial** slot-return evidence: 519 free after 480 cancels; the pre-run count was not recorded, so the exact restoration is UNPROBED (the build's step-4 probe records it) |
| C-7 | `npm run down:cal`                                                                        | exit 0; 0 `qa-harness-*` containers after it                                                                                                                                                                                                                                                                                                                                                                                                                                                           | stop works                                                                                                                                                                   |

**Finding C-F1 (Cal, the arithmetic of §3.2 is confirmed by the supply read).** A booking in C-2 removed its slot from the list the run picked, and the cleanup returned the window to 519 free slots, so cancelled bookings do return slots (partial, C-6).

### 3.2 Roadmap item: Cal slot supply for 2 h, and whether a cancel frees a slot

Facts already on main (Task 2 plan, `docs/plans/2026-10-25-p6-phase4-task2-cal-knee.md` §3.1, lines 46 to 49; §2 line 48): `getFreeSlots` over 270 days returned 3,104 slots in 270 ms; one day has 16 slots on a weekday, none on a weekend; **11.4 on average**. Cancelled bookings free their slots (Phase 1 allocator, confirmed by the cleanup sweeps; 4a index finding 1).

Arithmetic for the soak at the steady rate `steadyRateFor(bounds, "cal")` = 4 iterations per second (50 % of the knee lower bound 8, `k6/thresholds/knee-bounds.json` line 10):

| Duration          | Iterations (= bookings without recycling) | Days of supply at 11.4 per day | Share of the 3,104 slots that one 270-day read returns |
| ----------------- | ----------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| 30 min (1,800 s)  | 4 × 1,800 = 7,200                         | 632 days                       | 43 %                                                   |
| 120 min (7,200 s) | 4 × 7,200 = 28,800                        | 2,526 days                     | 11 %                                                   |

**Verdict on supply: without recycling the 2 h soak cannot run at 4 per second** (L1). Even the 30-min soak runs out after about 43 % of its arrivals, and a run that runs out of slots is INVALID, never PASS.

**Recycling design (proposed; the build probes it first in its own step).** Iteration `i` books slot `pool[i mod P]` and then cancels that booking in the same iteration, so each slot is free again before it is offered to the next cycle. With `P = 50`, a slot comes back every 50 / 4 = 12.5 s, far longer than one book + cancel (about 0.2 s at the probe's 70 ms per request). Supply then needs only `P` slots, not 28,800. The costs: each iteration sends one more request (the cancel), so the Cal write load roughly doubles, and a cancel that fails must count as a failure of the iteration (P6-CAL-LOAD-008 audit below). The per-iteration cancel uses `cancelBooking(uid)` (`src/cal/api.ts` line 59: CSRF token, then the cancel request); the k6 side needs the same CSRF flow, so the recycle mode is a journey change (§6.3).

The recycle mode itself (book then cancel in one iteration) is not in `main` yet, so it is probed by the build (step 4 of §12). What this session measured is row C-6: after 480 bookings and their cleanup cancels, the window held 519 free slots. That is consistent with cancels returning slots, and it is the input the recycle probe will compare against.

### 3.3 Roadmap item: telemetry gap rate over 2 h, and the Medusa and Documenso observability

- **Gap rule:** `findGaps` (`src/load/telemetry/gaps.ts` line 2) reports a gap when consecutive samples differ by more than `factor × intervalMs` with factor 2. The Medusa probe (M-F3) had no gap at all. The 2 h Cal and Documenso files are UNPROBED beyond their 2-min steady runs (§3.1 for Cal, DOC rows below).
- **Medusa event bus and Redis, observed from outside (L13, roadmap probe item "Medusa event-bus observability").** The `up:medusa` log of run M-3 says `redisUrl not found. A fake redis instance will be used.`, `Local Event Bus installed. This is not recommended for production.` and `Locking module: Using "in-memory" as default.` (the output of run M-3, which prints the backend's boot lines; scratch file outside the repo). So the default stack has **no Redis and no real event bus to observe**: the backlog part of `P6-MED-LOAD-005` reports "absent" in the default mode, and is measured only with `MEDUSA_REDIS=1` (the open decision Q-MEDREDIS, §13). The README (lines 709 to 716) gives the two-backend start with `MEDUSA_REDIS=1`.

Documenso rows (**blocked in this session**; the Documenso stack did not start):

| #   | Command                                                                                                                                                                                                          | Output (trimmed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Value it sets                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | `npm run up:documenso` (background)                                                                                                                                                                              | exit 1 in **2 s**: `Documenso local signing certificate missing at /home/user/products/documenso/apps/remix/example/cert.p12. Run npm ci in the Documenso fork, then retry.` The directory `/home/user/products/documenso` has **0 entries**: the fork was never cloned (`ls -A \| wc -l` = 0). **Fixed in S4 (2026-10-26):** `PRODUCTS_ROOT=/home/user/products bash scripts/bootstrap.sh documenso` clones the pinned fork (DOCUMENSO_REF `f4105e4`) and runs `npm ci` under Node 24, which writes `apps/remix/example/cert.p12` (README 'Run Documenso'). S4: bootstrap exit 0, HEAD `f4105e4`, cert.p12 present. | the Documenso probes ran in S4 (P-D1 to P-D6, index §9); the 2-h Documenso soak is UNPROBED                                                                                                                       |
| D-2 | the `p6-phase4a` release assets of this repository (`p6-<run id>-evidence.zip`, checked against the release's `SHA256SUMS.txt`, fetched with curl) for runs 40290101719, 40291101493 and 40291950598 (read-only) | each run's zip holds `knee-report-main.json`; `range`: **`lowerRate` 4, `upperRate` 5** in all three (S3 `write-knee-bounds`: lower 4, upper 5, n 3); all nine 4a knee reports have `lowSampleStop` false (release notes)                                                                                                                                                                                                                                                                                                                                                                                            | the Documenso knee lower bound is **4 per second** in all three valid runs (committed by the bound PR, step 0b; not on main until then). 50 % gives **2.0 per second**, the Documenso soak rate (`steadyRateFor`) |
| D-3 | seal lag per step in the same reports (`sealLag.byStep`)                                                                                                                                                         | seal p95 **423 ms** at step 0 (30 documents), rising to 2,104 ms at rate 4 and 2,846 ms at rate 5 (`steps`, `p95Ms`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | the soak at 2 per second is below the step 1 p95 (250 ms) of those runs; the seal lag at the soak rate is UNPROBED on the VM                                                                                      |
| D-4 | a web read of github.com/documenso/documenso/pull/3353                                                                                                                                                           | **web read, 2026-10-26**: open, not merged (last update 2026-09-09)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | upstream PR #3353 is open, not merged (Task 9 §3 names it; Q-PR3353: build PR only)                                                                                                                               |

### 3.4 Roadmap item: the slope and plateau rule, window sizes

- **Warm-up.** Probe M-F2 shows RSS still rising at 100 s on Medusa. The 4a index (finding 2) shows Cal RSS 707 → 1,697 MB over 170 s and Documenso 1,078 → 1,418 MB. A fixed 30 s warm-up is not enough for a 2 h soak, so the rule is `warmupSec = max(300, 0.2 × durationSec)`: 6 min for the 30-min soak, 24 min for the 2-h soak. The 2-min probes cannot test this rule (they are shorter than the warm-up); **UNPROBED: confirm from the first three VALID 30-min soaks.** CI 4a: Cal RSS 603→1526 to 607→1784 MB in 120 s (all three still rising); `max(300 s, 0.2 × duration)` stays.
- **Plateau windows.** The post-warm-up samples are split in thirds: middle third and last third. The 30-min soak has 24 min after warm-up (8 min per third); the 2-h soak has 96 min (32 min per third).
- **Thresholds.** No slope or ratio threshold is chosen in this plan. The probe data cannot set one (2-min runs, one step in M-F2). The build writes raw statistics first and sets the verdict thresholds in `k6/thresholds/soak-bounds.json` (a new file, D13) from the first three 30-min soaks per product that qualify for calibration, the same way `knee-bounds.json` and `baseline-band.json` were set (medians of ≥ 3 runs). **Calibration eligibility is separate from the publishable PASS.** A run qualifies only when its run metadata is valid, its telemetry artifact contains the required samples and finite derived statistics, its run-level `validity.verdict` is `VALID` with no `validity.reasons`, and its audit is clean. The telemetry check is needed because `judgeValidity` (`src/load/validity.ts`, `telemetry?` optional, line 20) gives no reason for a run without telemetry, so such a run can be VALID and would otherwise enter `soak-bounds.json` with no samples. Its `soakVerdict` may be `NO THRESHOLD YET`, because that verdict is what calibration produces. Calibration therefore must not use the PASS-only `selectPublishable` selector (`src/load/medians.ts`), which would exclude every pre-calibration run; it uses a new `selectSoakCalibration` selector (NEW, in `src/load/soak/verdict.ts`, unit-tested). Until that file exists the verdict is `NO THRESHOLD YET`, never PASS (Q-SOAKTHR, §13).

### 3.5 What the probe could not confirm

1. The 30-min and 2-h soaks themselves: **UNPROBED; confirm in the first CI dispatch.** The VM runs above are 2 min each.
2. Slot recycling in k6 (book + cancel per iteration) against the live Cal stack: §3.2 names the probe the build runs first (step 4 of §12, run before that commit and recorded in the build PR). **UNPROBED until then.**
3. Documenso backlog under sustained load: UNPROBED. Documenso cleanup per document: 55 ms (608 ms for 11 documents in S4, `P6-DOC-LOAD-001`).
4. The cause of M-F2: UNPROBED → P-SOAK-RSS (item 6).
5. The plateau and slope thresholds: UNPROBED (set from data later, Q-SOAKTHR).
6. **P-SOAK-RSS** (first 3 VALID 30-min Medusa soaks): list every RSS change < −100 MB between samples, with t, members/pid and cpuTicks. A members or pid change is a TEST BUG/ENV (restart). An in-process change is counted as a step, never a leak verdict on its own. Does not block Task 7.

## 4. Depends on

Main at `86dbbde` (re-checked 2026-10-26; all verified by grep or read):

- `k6/lib/pure/options.js`: `openModelScenario` (line 37), `standardOptions` (line 120); `k6/lib/pure/sizing.js`: `preAllocatedVUs({ rate, timeUnitSec, maxLatencyMs, safety = 1.25 })` (line 8), `maxVUs(pre, headroom = 1.5)` (line 19).
- `k6/journeys/cal-book.js` (`runCalBook`, the fixed-slot mode `cfg.slotStarts` at line 59, Task 2), `k6/journeys/med-checkout.js`, `k6/journeys/doc-sign.js`.
- `src/load/types.ts`: `LoadProfileName = "pr" | "full" | "steady"` (line 3), `LoadProfile` with `timeUnitSec` (line 17), `LoadLabel` (line 17 to 20).
- `src/load/cases.ts`: `MED_LOAD_002` (line 365, `stockFor: ceil(planned / 2)`), `makeMedusaSetup` default `planned + 20` (`src/load/products/medusa.ts` line 120); the knee cases and the steady profile (Task 5).
- `src/load/knee/bounds.ts`: `steadyRateFor(bounds, product)` (Task 5 §6.2, merged), `k6/thresholds/knee-bounds.json` (products `cal` and `medusa` only).
- `src/load/telemetry/sampler.ts`, `gaps.ts` (`findGaps`, line 2), `pg-stats.ts` (`PG_ACTIVITY_SQL` line 5, `PG_DB_SQL` line 11, `PG_MAX_CONNECTIONS_SQL` line 66, `readMaxConnections`).
- `src/cal/api.ts`: `getFreeSlots` (line 17), `createBooking` (line 49), `cancelBooking` (line 59); `src/cal/oracle.ts` (`CAL_INTENT_ROWS_SQL`, `CAL_ACCEPTED_PER_INTENT_SQL`, `SLOT_ACCEPTED_SQL`, leak SQL via `leakCheck`); `src/cal/run-case.ts`, `calCleanupWith`, `calSetupWith` (cleanup and setup).
- `src/medusa/oracle.ts`: `RESERVATION_QTY_SQL`, `INVENTORY_LEVEL_SQL`, `readOversellSnapshot`; `src/load/reconcile/medusa.ts`, `src/load/med-conservation.ts`; `MED_INTENT_ROWS_SQL` (per-intent rows, Task 1).
- `src/documenso/oracle.ts`: `SEAL_JOBS_SQL` (line 59), `EMAIL_JOBS_SQL` (line 67), `readTerminalJobs` (its terminal set is `COMPLETED` and `FAILED`, line 125), `STUCK_JOBS_FOR_RUN_SQL`; `src/load/reconcile/documenso.ts`; `src/load/pipeline-stage.ts` (`PIPELINE_SEAL_JOBS_SQL` line 39).
- `scripts/load/run-load.ts` (the runner, `--case`, `--profile`), `perf.yml` (product jobs, `timeout-minutes` values at the job level: `medusa-smoke` 45, `cal-smoke` 60, `documenso-smoke` 45 and the rest as in §9), `knee.yml` (dispatch-only, `cal-steady` line 644, `medusa-steady` line 852; the ref guard and the knee-artefact pattern to copy), `evidence-release.yml` (line 39 `EVIDENCE_WORKFLOW_IDS: "376454455 396253729"`).
- `tests/unit/evidence-release-ids.test.ts` line 8: asserts two ids, perf.yml first. **Not changed by this task.** The `soak.yml` id is added in its own `ci(evidence)` PR right after this workflow merges (the id exists only then). That PR changes `EVIDENCE_WORKFLOW_IDS` and `tests/unit/evidence-release-ids.test.ts` together; the id is read with the GitHub tools or pasted by the owner (L4).

**Not on main until step 0b (the documenso bound PR):** the Documenso knee lower bound entry in `k6/thresholds/knee-bounds.json` (`products.documenso`: lower 4, upper 5, n 3, from the released runs 40290101719 / 40291101493 / 40291950598). This task's Documenso soak takes its rate from that entry (§6.5), so the Documenso job waits for the bound PR (hard check in §5, row 1).

**4a lessons applied** (each is checked by the build step it names):

- `DANGEROUS_BYPASS_RATE_LIMITS` defaults to true (`scripts/harness.mjs` line 33, `||=`); only the limiter cases set "false".
- Minute-boundary alignment with a 5 s guard for limiter windows (`ALIGN_TOLERANCE_MS = 5000`, `src/load/spike/stage.ts`).
- `no_reference` → INVALID, never PASS.
- `low_sample_stop`: a stop on too few requests is flagged (`src/load/knee/stop-rule.ts`); all nine 4a knee reports have it false.
- The stop-step zero post-trim limitation (`P6-CAL-LOAD-005` run 1, 4a release notes): the knee range rests on the steps before the stop.
- Config-used tests for every new config field.
- k6 has no URL global: URLs are built by string concatenation.
- Cleanup never runs inside a limiter window under test.
- Per-intent audit with no slack (L9).
- The F-M2 ghost flag (Medusa): M-F2 stays UNEXPLAINED with its cause UNPROBED, never a product bug (§3.3).
- "knee range" wording, never "capacity" (R10).
- CI budget rules (§9): every step capped, the 80 % rule, retention 90.
- The owner dispatches in the UI and pastes the run ids.

## 5. Build-time recheck table

| #   | Check                                                                | Exact command                                                                                                                | Expected                                            | If it differs                                                                                                           |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | The Documenso bound PR merged (**hard stop for the Documenso part**) | `jq -e '.products.documenso.lowerBoundRate == 4' k6/thresholds/knee-bounds.json`                                             | `true`                                              | Stop. Do not build `documenso-soak`; build the Cal and Medusa parts and report the Documenso part as blocked            |
| 2   | Knee lower bounds unchanged for Cal and Medusa                       | `jq '.products \| {cal: .cal.lowerBoundRate, medusa: .medusa.lowerBoundRate}' k6/thresholds/knee-bounds.json`                | `{"cal":8,"medusa":1.5}`                            | The soak rates change with them (`steadyRateFor`). Recompute §3.2 and §6.5 from the new values and say so in the report |
| 3   | `main` still has no `soak.yml` and no `soak` profile                 | `ls .github/workflows/soak.yml src/load/soak 2>&1; grep -n '"soak"' src/load/types.ts`                                       | no such file; no match                              | Another session started the task. Stop and report (rule 10)                                                             |
| 4   | Cal recycle probe passes (§3.2)                                      | `node scripts/load/run-load.ts --case P6-CAL-LOAD-008 --profile soak` after the step-4 commit, on the stack the probe starts | exit 0; `slotsRemaining` ≥ pool size; cancels 100 % | Root-cause (TEST BUG or PRODUCT BUG) with evidence; do not lower the rate to hide it                                    |
| 5   | Telemetry file size and gap rate, 30 min                             | `node -e` over `telemetry-main.json` (before step 1 of §12)                                                                  | samples ≈ 1,800; gaps over 2 intervals = 0          | A gap is INVALID (`telemetry_gap`); read the sampler cost first                                                         |
| 6   | Job timeouts and step-cap sums                                       | `node` script of §9 over `.github/workflows/soak.yml`                                                                        | margin ≥ 10 for every job                           | Lower the in-script caps or raise the job timeout only if the sum still fits 6 h                                        |
| 7   | Workflow lint                                                        | `npm run lint:actions`                                                                                                       | exit 0                                              | Fix the workflow                                                                                                        |

## 6. Design

### 6.1 File tree

```text
.github/workflows/soak.yml                       NEW  dispatch-only in this task; three jobs: cal-soak, medusa-soak, documenso-soak
k6/cases/cal-load-008.js                         NEW  P6-CAL-LOAD-008 (header comment names the case)
k6/cases/med-load-005.js                         NEW  P6-MED-LOAD-005
k6/cases/doc-load-006.js                         NEW  P6-DOC-LOAD-006
k6/journeys/cal-book.js                          CHANGED  recycle mode: book, then cancel the booking in the same iteration (option `recycle`)
k6/lib/pure/recycle.js                           NEW  pure slot index for the recycle pool (testable without k6)
k6/thresholds/soak-bounds.json                   NOT CREATED HERE  (Q-SOAKTHR: written by the first soak-calibration PR)
src/load/soak/slope.ts                           NEW  least-squares and Theil–Sen slope after warm-up
src/load/soak/plateau.ts                         NEW  last-third vs middle-third plateau verdict
src/load/soak/db-growth.ts                       NEW  DB_SIZE_SQL, dbGrowthPerUnit (DB growth, separate from RSS)
src/load/soak/backlog.ts                         NEW  BACKLOG_SQL (PENDING + PROCESSING BackgroundJob rows, sampled once a minute)
src/load/soak/verdict.ts                         NEW  combines slope, plateau, step count, telemetry validity and audit into PASS / FAIL / TEST BUG / INVALID / NO THRESHOLD YET
src/load/types.ts                                CHANGED  LoadProfileName adds "soak"; LoadLabel adds "soak, environment-bound"
src/load/cases.ts                                CHANGED  registers CAL_LOAD_008, MED_LOAD_005, DOC_LOAD_006 (the soak profile)
scripts/load/run-load.ts                         CHANGED  reads SOAK_DURATION_MIN (30 or 120) for --profile soak; nothing else
tests/unit/soak-slope.test.ts                    NEW  6 tests
tests/unit/soak-plateau.test.ts                  NEW  5 tests
tests/unit/soak-db-growth.test.ts                NEW  3 tests
tests/unit/soak-profile.test.ts                  NEW  4 tests
tests/unit/soak-recycle.test.ts                  NEW  2 tests
tests/unit/soak-workflow.test.ts                 NEW  3 tests
README.md                                        CHANGED  section "Soaks" (after "Steady baselines")
```

### 6.2 Profile and rates (`src/load/cases.ts`, `src/load/types.ts`)

- The `soak` profile takes its rate from `steadyRateFor(bounds, product)` (Task 5), exactly as `steady` does. The duration is `SOAK_DURATION_MIN × 60`. Only 30 and 120 are accepted; any other value throws before any setup (exit 2, ENV).
- Rates: Cal = `steadyRateFor(bounds,"cal")` = 4 (from 8); Medusa = `steadyRateFor(bounds,"medusa")` = 0.7 (from 1.5, rounded down to 0.1; written to k6 as **7 per 10 s** with `timeUnitSec` 10, because k6 rejects a fractional rate in a 1-second unit, 4a Task 5 §3.5); Documenso = `steadyRateFor(bounds,"documenso")` = 2.0 per second (20 per 10 s with `timeUnitSec` 10; from the bound PR, step 0b; §4 and §5 row 1). **Q-SLOTS (L1): the Cal rate stays at 4 with recycling**; the arithmetic is in §3.2. The Cal rate is never lowered to fit the supply, because recycling removes the supply limit.
- VU pools (L17, `preAllocatedVUs` in `k6/lib/pure/sizing.js`): with `maxLatencyMs` taken as the worst-case iteration in ms: Cal (cancel path) 2,000 ms → `ceil(4 × 2 × 1.25) = 10`, `maxVUs` 15; Medusa 5,000 ms → `ceil(0.7 × 5 × 1.25) = 5`, `maxVUs` 8; Documenso 12,000 ms (PR #79, `iterationMs 12000`) → `ceil(2 × 12 × 1.25) = 30`, `maxVUs` 45. Any dropped iteration makes the run INVALID (`dropped_iterations`); the fix is a larger pool.

### 6.3 Cal case and recycle mode (`k6/journeys/cal-book.js` CHANGED, `k6/lib/pure/recycle.js` NEW)

```js
// k6/lib/pure/recycle.js
/**
 * Pure: the slot of iteration i in a pool of `size` slots. A slot is reused after `size` other iterations. It is
 * free again only if its own iteration finished the cancel within `size / rate` seconds. Sizing rule: `size >= rate x
 * worst-case iteration seconds`, and every request has a per-request timeout below `size / rate` (Cal: P = 50 at 4 per
 * second gives 12.5 s, against a 2 s worst case).
 * @param {number} iteration  the iteration index (exec.scenario.iterationInTest)
 * @param {number} size       the pool size P (>= 1)
 * @returns {number}          index into the pool, 0 <= i < size
 */
export function recycleSlotIndex(iteration, size) {
  if (!Number.isInteger(size) || size < 1)
    throw new Error("TEST BUG: recycle pool size must be an integer >= 1");
  return iteration % size;
}
```

```js
// k6/cases/cal-load-008.js  (P6-CAL-LOAD-008: Cal booking soak with slot recycling; L1, L13)
// Scenario: openModelScenario at the soak rate; each iteration books pool[i mod P] (fixed-slot mode, cfg.slotStarts),
// then cancels that booking (recycle: true). Oracle: CAL_INTENT_ROWS_SQL per intent + the cancel count per intent.
export const options = standardOptions({
  scenarios: {
    soak: openModelScenario({
      rate,
      durationSec,
      maxLatencyMs: 2000,
      exec: "soak",
      tags: { case: "P6-CAL-LOAD-008" },
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // not a threshold on latency: the soak verdict is in src/load/soak/verdict.ts
});
```

The journey change in `cal-book.js` adds one option, `recycle` (default false, so the smoke and the knee are unchanged):

- `recycle: true` → after a 2xx booking, call `cancelBooking` through the same CSRF flow the cleanup uses; count `p6_cancels_ok` and `p6_cancels_failed`. A failed cancel makes the iteration a FAIL in its intent line.
- The pool is the fixed slot list from setup (`calSetup({ slots })`, Task 2), read once.

### 6.4 Slope and plateau (`src/load/soak/slope.ts`, `src/load/soak/plateau.ts`, NEW)

```ts
// src/load/soak/slope.ts
export interface SoakPoint {
  tMs: number; // epoch milliseconds, the telemetry field `t`
  value: number; // rssMb, fds, db.total, ...
}
export interface SlopeResult {
  n: number; // points after warm-up
  slopePerMin: number | null; // least-squares slope, units per minute; null when n < 2
  theilSenPerMin: number | null; // median of pairwise slopes (robust to one step); null when n < 2
  stepsOver: number; // count of consecutive pairs whose change is more than 10 % of the window's median (a step, M-F2)
  reason: "ok" | "no samples" | "too few samples";
}

/** Warm-up in seconds for a soak of durationSec: max(300, 0.2 x durationSec). */
export function warmupSecFor(durationSec: number): number;

/**
 * Least-squares slope of value against time (minutes) over the points at or after warm-up, with the Theil–Sen slope and a
 * step count next to it. n = 0 returns reason "no samples" and never divides by zero (L7); n = 1 returns "too few samples".
 */
export function soakSlope(points: SoakPoint[], startMs: number, warmupSec: number): SlopeResult;
```

```ts
// src/load/soak/plateau.ts
export interface PlateauResult {
  n: number;
  middleMedian: number | null; // median of the middle third after warm-up; null when n < 3
  lastMedian: number | null; // median of the last third; null when n < 3
  ratio: number | null; // lastMedian / middleMedian; null when either is null or middleMedian is 0
  reason: "ok" | "no samples" | "too few samples" | "zero middle median";
}

/**
 * Compares the median of the last third of the post-warm-up points with the median of the middle third. It states no
 * verdict: the caller applies the threshold from k6/thresholds/soak-bounds.json (Q-SOAKTHR).
 */
export function plateauRatio(
  points: SoakPoint[],
  startMs: number,
  warmupSec: number,
): PlateauResult;
```

Rules, stated once: growth is reported when the least-squares slope is positive **and** the Theil–Sen slope is positive **and** the plateau ratio is above the threshold; a single step (`stepsOver` ≥ 1 with the two slopes disagreeing) is reported as `STEP`, not as growth.

### 6.5 DB growth, separate from RSS (`src/load/soak/db-growth.ts`, NEW)

```ts
// src/load/soak/db-growth.ts
/** Database size in bytes of the run's own database. NEW: pg_database_size is not read anywhere on main (checked). */
export const DB_SIZE_SQL = `SELECT pg_database_size(current_database())::bigint AS bytes`;

/**
 * Bytes added per unit of work (order, booking or document) between two reads. null when units is 0 (L7: no divide by zero).
 * The result is reported next to the RSS slope and never added to it.
 */
export function dbGrowthPerUnit(
  bytesStart: number,
  bytesEnd: number,
  units: number,
): { bytesPerUnit: number | null; reason: "ok" | "no units" };
```

Expected values from the probes: Medusa about 91 KB per order after cleanup (4a index finding 3); Medusa 5,040 orders in a 2-h run → about 459 MB of DB growth, which the build must show as DB growth and not as RSS.

### 6.6 CI: `soak.yml` (NEW, dispatch only in this task)

The file has three jobs, one per product. Each follows the `knee.yml` pattern: the ref guard (`Stop unless dispatched from main`), checkout, the product checkout and HEAD verify, setup, k6 install (checksum-verified, `scripts/install-k6.sh`), the product start (`npm run up:<product>`), one run step, the job summary, the token scan of the results, the upload with `retention-days: 90`, and the stop step with `if: always()`.

```yaml
name: soak

on:
  workflow_dispatch:
    inputs:
      product:
        description: "Which product soaks run: cal, medusa, documenso or all"
        type: choice
        options: [cal, medusa, documenso, all]
        default: cal
      duration_min:
        description: "Soak length in minutes (30 or 120)"
        type: choice
        options: ["30", "120"]
        default: "30"

permissions:
  contents: read

concurrency:
  group: soak-${{ github.event_name == 'schedule' && 'scheduled' || github.run_id }}
  cancel-in-progress: false

defaults:
  run:
    shell: bash

env:
  CAL_REF: c2b7ac44c66f24ffef1662b276f0653988a609a3 # same SHA as perf.yml, knee.yml and scripts/bootstrap.sh (the job verifies)
  MEDUSA_REF: f677db438f27294fc50e4c7c6612e71ff38eeff5 # same SHA as perf.yml, knee.yml and scripts/bootstrap.sh
  DOCUMENSO_REF: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c # same SHA as perf.yml, knee.yml and scripts/bootstrap.sh

jobs:
  cal-soak:
    name: cal-soak
    if: ${{ inputs.product == 'cal' || inputs.product == 'all' }}
    runs-on: ubuntu-24.04
    # 120 min: setup steps 29 (copied from cal-knee, includes Start Cal 6) + soak 165 + summary 2 + scan 2 + upload 5 + stop 1
    # = 204, job 225, margin 21. 30 min: 29 + 45 + 10 = 84, job 105, margin 21.
    timeout-minutes: ${{ inputs.duration_min == '120' && 225 || 105 }}
    env:
      P6_WORKING_DIRECTORY: p6
      PRODUCTS_ROOT: ${{ github.workspace }}/products
      CAL_CHECKOUT_PATH: products/cal
      CAL_BASE_URL: http://127.0.0.1:3000
      CAL_DB_URL: postgresql://postgres@127.0.0.1:5450/calendso # Fork trust-auth local DB (no password). Not a secret.
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
      COREPACK_ENABLE_STRICT: "0"
      TURBO_TELEMETRY_DISABLED: "1"
      NEXT_TELEMETRY_DISABLED: "1"
      SOAK_DURATION_MIN: ${{ inputs.duration_min }}
    steps:
      - name: Stop unless dispatched from main
        timeout-minutes: 1
        env:
          DISPATCH_REF: ${{ github.ref }}
        run: |
          set -euo pipefail
          [[ "$DISPATCH_REF" == "refs/heads/main" ]] \
            || { echo "::error::this workflow must be dispatched from main, not from $DISPATCH_REF"; exit 1; }
      # Checkout, Cal fork, verify HEAD and CAL_REF, setup-node, install P6 deps, install k6, corepack, Yarn and node_modules
      # caches, install Cal deps, Prisma client, product .env, build cache, pull images, Start Cal (harness up): copied from
      # knee.yml cal-knee lines 84 to 221 with the same timeout-minutes (the cal-steady job uses the same copy).
      - name: Soak P6-CAL-LOAD-008 (setup, run, audit and cleanup inside the step)
        timeout-minutes: ${{ inputs.duration_min == '120' && 165 || 45 }}
        run: |
          set -euo pipefail
          export PATH="/usr/local/bin:$PATH"
          node scripts/load/run-load.ts --case P6-CAL-LOAD-008 --profile soak --out "$P6_WORKING_DIRECTORY/results/load"
      - name: Job summary (soak table)
        if: ${{ !cancelled() }}
        timeout-minutes: 2
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: node scripts/write-ci-job-summary.ts
      - name: Token scan of the soak results
        id: token_scan
        if: ${{ !cancelled() }}
        timeout-minutes: 2
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: node scripts/evidence-token-scan.mjs results/load
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
        timeout-minutes: 5
        with:
          name: soak-cal-${{ inputs.duration_min }}
          path: ${{ env.P6_WORKING_DIRECTORY }}/results/load/
          if-no-files-found: error
          retention-days: 90
      - name: Stop Cal (harness down)
        if: ${{ always() }}
        timeout-minutes: 1
        working-directory: ${{ env.P6_WORKING_DIRECTORY }}
        run: npm run down:cal
```

```yaml
medusa-soak:
  name: medusa-soak
  needs: cal-soak
  if: ${{ always() && (inputs.product == 'medusa' || (inputs.product == 'all' && needs.cal-soak.result == 'success')) }}
  runs-on: ubuntu-24.04
  # 120 min: setup steps 21 (copied from medusa-knee, includes Start Medusa 3) + soak 165 + summary 2 + scan 2 + upload 5
  # + stop 1 = 196, job 225, margin 29. 30 min: 21 + 45 + 10 = 76, job 105, margin 29.
  timeout-minutes: ${{ inputs.duration_min == '120' && 225 || 105 }}
  env:
    P6_WORKING_DIRECTORY: p6
    PRODUCTS_ROOT: ${{ github.workspace }}/products
    MEDUSA_CHECKOUT_PATH: products/medusa-dtc-starter
    MEDUSA_BASE_URL: http://127.0.0.1:9000
    MEDUSA_DB_URL: postgres://medusa:medusa@127.0.0.1:5433/medusa # Public harness default database URL, not a secret.
    MEDUSA_ADMIN_EMAIL: admin@qa.local
    MEDUSA_SKIP_STOREFRONT: "1"
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
    COREPACK_ENABLE_STRICT: "0"
    SOAK_DURATION_MIN: ${{ inputs.duration_min }}
  steps:
    # Stop unless dispatched from main; checkout; Medusa fork checkout and HEAD verify; stub harness roots; setup-node;
    # P6 deps; k6 install; pnpm store and build caches; Generate the CI admin password (as knee.yml lines 382 to 389);
    # Pull Medusa images. Copied from knee.yml medusa-knee lines 285 to 397, same timeout-minutes, no other change.
    - name: Start Medusa (harness up)
      timeout-minutes: 3
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: npm run up:medusa
    - name: Soak P6-MED-LOAD-005 (setup, run, audit and cleanup inside the step)
      timeout-minutes: ${{ inputs.duration_min == '120' && 165 || 45 }}
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: node scripts/load/run-load.ts --case P6-MED-LOAD-005 --profile soak
    - name: Job summary (soak table)
      if: ${{ !cancelled() }}
      timeout-minutes: 2
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: node scripts/write-ci-job-summary.ts
    - name: Token scan of the soak results
      id: token_scan
      if: ${{ !cancelled() }}
      timeout-minutes: 2
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: node scripts/evidence-token-scan.mjs results/load
    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
      timeout-minutes: 5
      with:
        name: soak-medusa-${{ inputs.duration_min }}
        path: ${{ env.P6_WORKING_DIRECTORY }}/results/load/
        if-no-files-found: error
        retention-days: 90
    - name: Stop Medusa (harness down)
      if: ${{ always() }}
      timeout-minutes: 1
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: npm run down:medusa

documenso-soak:
  name: documenso-soak
  needs: medusa-soak
  if: ${{ always() && (inputs.product == 'documenso' || (inputs.product == 'all' && needs.medusa-soak.result == 'success')) }}
  runs-on: ubuntu-24.04
  # Same arithmetic as cal-soak: 225 for 120 min, 105 for 30 min (the 2-h cleanup total is UNPROBED: confirm in the first dispatch).
  timeout-minutes: ${{ inputs.duration_min == '120' && 225 || 105 }}
  env:
    P6_WORKING_DIRECTORY: p6
    PRODUCTS_ROOT: ${{ github.workspace }}/products
    DOCUMENSO_CHECKOUT_PATH: products/documenso
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
    COREPACK_ENABLE_STRICT: "0"
    SOAK_DURATION_MIN: ${{ inputs.duration_min }}
  steps:
    # Stop unless dispatched from main; checkout; Documenso fork checkout, HEAD verify and DOCUMENSO_REF verify; setup-node
    # (Node 24 for Documenso, as knee.yml documenso-knee lines 529 to 537); P6 deps; k6 install; Documenso deps; harness roots;
    # map the webhook host; build cache; pull images. Copied from knee.yml documenso-knee lines 486 to 589, same timeouts.
    # The Start step below is the knee.yml step at lines 590 to 600 (timeout 5), written out here.
    - name: Start Documenso (harness up, rate limits bypassed)
      timeout-minutes: 5
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: npm run up:documenso
    - name: Soak P6-DOC-LOAD-006 (setup, run, audit and cleanup inside the step)
      timeout-minutes: ${{ inputs.duration_min == '120' && 165 || 45 }}
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: node scripts/load/run-load.ts --case P6-DOC-LOAD-006 --profile soak
    - name: Job summary (soak table)
      if: ${{ !cancelled() }}
      timeout-minutes: 2
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: node scripts/write-ci-job-summary.ts
    - name: Token scan of the soak results
      id: token_scan
      if: ${{ !cancelled() }}
      timeout-minutes: 2
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: node scripts/evidence-token-scan.mjs results/load
    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
      timeout-minutes: 5
      with:
        name: soak-documenso-${{ inputs.duration_min }}
        path: ${{ env.P6_WORKING_DIRECTORY }}/results/load/
        if-no-files-found: error
        retention-days: 90
    - name: Stop Documenso (harness down)
      if: ${{ always() }}
      timeout-minutes: 1
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: npm run down:documenso
```

The setup steps of the Medusa and Documenso jobs are not rewritten here: each is a verbatim copy of the named `knee.yml` lines (same names, same `timeout-minutes`), so the diff against `knee.yml` is exactly the job names, the `if:` lines, the `SOAK_DURATION_MIN` env, the case and profile in the run step, and the artefact name. The Documenso job never sets `DANGEROUS_BYPASS_RATE_LIMITS=false` (D12: only `P6-DOC-LOAD-004` and `-009` use the limiter profile).

**Token scan before every upload** is the `token_scan` step with `outcome == 'success'` in the upload condition.

**Permissions** stay `contents: read`. No job needs more.

### 6.7 The run-load wiring (`scripts/load/run-load.ts` CHANGED, `src/load/soak/verdict.ts` NEW)

```ts
// src/load/soak/verdict.ts
export type SoakVerdict =
  "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID" | "NO THRESHOLD YET";
/**
 * The soak verdict from the parts that are already computed: the telemetry validity (gaps, drops), the per-intent audit,
 * the slope and plateau statistics, and the thresholds in soak-bounds.json (when present). Order of precedence:
 * TEST BUG (setup or slots ran out, L1) > INVALID (telemetry gap, dropped iterations, generator limit) > FAIL (audit or
 * a threshold) > NO THRESHOLD YET (no soak-bounds.json entry for the product) > PASS.
 */
export function soakVerdict(input: {
  auditOk: boolean;
  invalidReasons: string[];
  testBugReasons: string[];
  slopeRpm: SlopeResult;
  plateau: PlateauResult;
  thresholds: { slopePerMin: number; plateauRatio: number } | null;
}): { verdict: SoakVerdict; reasons: string[] };
```

`run-load.ts` gets a `soak` profile name, reads `SOAK_DURATION_MIN` (30 or 120; other values exit 2 before setup), and writes `soak.json` (the statistics, not the points) next to `verdict.json`. The points file stays `k6-main.json.gz` and is never published (L5, `*.json.gz` stays out of the release).

### 6.8 Budget of the probe steps (for the owner, §9)

Points and telemetry for one 2-h run: points `k6-main.json.gz` (size unknown for 28,800 iterations; the 4a index gave 92 KB to 1.9 MB per probe, up to tens of MB for a product knee) and `telemetry-main.json` about 5.5 MB. **UNPROBED:** the 2-h points size; the upload step's cap (5 min) is an estimate.

## 7. Oracles and assertions

| Case              | Oracle (name on main, or NEW)                                                                                                                                                                                                                                                                                                                                              | What it checks                                                                                                                                                                                                          | Verdict mapping                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-CAL-LOAD-008` | `CAL_INTENT_ROWS_SQL` (per intent, Task 1), `CAL_ACCEPTED_PER_INTENT_SQL`, `leakCheck` (after cleanup)                                                                                                                                                                                                                                                                     | every iteration has one intent line and one outcome; every accepted booking is one intent; cancels per intent equal accepted bookings (NEW counter `p6_cancels_ok`, L9: no count slack)                                 | PASS needs audit ok, telemetry VALID, slope and plateau under the thresholds. Slots run out → TEST BUG (L1). Telemetry gap or dropped iteration → INVALID. Audit mismatch → FAIL (PRODUCT BUG SUSPECTED) |
| `P6-MED-LOAD-005` | `MED_INTENT_ROWS_SQL` (per intent), `readMedusaSnapshot`, `RESERVATION_QTY_SQL` and `INVENTORY_LEVEL_SQL` (stock ≥ orders), `readOversellSnapshot`                                                                                                                                                                                                                         | every iteration has one order or one refusal line; orders ≤ stock; no reservation without a live order (4a finding 7)                                                                                                   | Same mapping. Redis / event-bus backlog: `absent` in the default mode (M-F3), `measured` only with `MEDUSA_REDIS=1` (Q-MEDREDIS)                                                                         |
| `P6-DOC-LOAD-006` | `PIPELINE_SEAL_JOBS_SQL`, `PIPELINE_EMAIL_JOBS_SQL` (per document), `readTerminalJobs`, `STUCK_JOBS_FOR_RUN_SQL`; NEW: `BACKLOG_SQL` (src/load/soak/backlog.ts): the count of `BackgroundJob` rows with status `PENDING` or `PROCESSING`, the two statuses that are not terminal (`TERMINAL_JOB_STATUSES` is `COMPLETED` and `FAILED`, `src/documenso/oracle.ts` line 125) | per-document seal, email and webhook exactly once for the sequential stream (L9); the backlog of PENDING + PROCESSING jobs is sampled once a minute and its last value must return to 0 within 60 s of the last arrival | Same mapping; backlog that does not return to 0 → FAIL (PRODUCT BUG SUSPECTED)                                                                                                                           |

**Known bugs, counted under their own IDs (never hidden, never added to PASS):**

- `P6-OBS-CAL-001` (redacted 400 on a losing booking): not expected in a sequential soak (no contention); a count > 0 is recorded under the ID.
- `P6-OBS-CAL-003` (`Booking_uid_key` P2002 log lines): counted by the log-grep rule (Phase 3 Task 5) as a characterisation; not a verdict input.
- `P6-OBS-DOC-002` (duplicate seal on a concurrent last-recipient pair): the soak is sequential, so the count is expected 0; any count is recorded under the ID.
- `P6-OBS-DOC-006` (suspected, reset-password 500): not on the soak path; not counted here. **Only the owner labels it.**

## 8. Data isolation, cleanup and leak check

- **Run prefix** (`src/races/prefix.ts`, as in every case): `p6-qa-<run id>-<case>`. Every created entity carries `<prefix>-i<n> <intent>` in its title or email: the attendee email for Cal, the cart email for Medusa, the document title for Documenso.
- **Cleanup sweep:** `calCleanupWith` (Cal: booking cancel and archive; with recycling most bookings are already cancelled, so the sweep handles only leftovers), `medusaCleanupWith` (orders cancelled and archived, 0.33 s each), `documensoCleanupWith` (envelope delete; 55 ms per document in S4, §9).
- **Leak check:** `leakCheck` (`src/cal/oracle.ts`, `src/documenso/oracle.ts`, Medusa equivalent) on the run prefix after cleanup. **Expected output: 0 rows** for every table the case touches (`LEAK_LIVE_ORDERS_SQL`, `LEAK_LIVE_RESERVATIONS_SQL`, `LEAK_USERS_SQL`, `LIVE_ENVELOPE_LEAK_SQL` as applicable). Command: `node scripts/load/run-load.ts --case <case> --profile soak` prints `leak 0 rows` in its summary; a non-zero count is a TEST BUG until the cause is shown.
- **Documenso limiter:** the Documenso soak runs on the default profile. `DANGEROUS_BYPASS_RATE_LIMITS` defaults to true (`scripts/harness.mjs` line 33, `||=`), so the cleanup never lands in a limiter window under test.

## 9. CI, token scan and budget

Job timeouts follow `docs/plans/2026-10-25-p6-phase4-pre2-cal-smoke-step-caps.md` (the 4a PRE-2 rule: every step has `timeout-minutes`; the in-script stop is 80 % of the step cap). The soak k6 step is one run-load step (setup, k6, drain, audit, cleanup), so its cap is the run length plus the stages:

**120-min case (the arithmetic the roadmap asks for):**

| step                                                                                                                                               | cap (min)               | basis                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Setup steps: checkout, fork and HEAD verify, setup-node, P6 deps, k6, corepack, caches, Cal deps, Prisma, .env, build cache, images, Start Cal (6) | 29                      | the 22 `cal-knee` steps minus its knee, summary, scan, upload and stop steps (computed from `knee.yml` by a `node` sum in this plan run) |
| Soak P6-CAL-LOAD-008 (setup 1 + k6 120 + drain 1 + audit 3 + cleanup of leftovers + margin)                                                        | 165                     | 120 / 0.8 = 150 minimum for the 80 % rule; 165 keeps the 80 % stop at 132 min, above the 120-min run                                     |
| Job summary, token scan, upload (5, up from 3 for a 2-h artefact), stop                                                                            | 2 + 2 + 5 + 1 = 10      | `cal-knee` caps, upload raised with its own arithmetic                                                                                   |
| **Sum of step caps**                                                                                                                               | **29 + 165 + 10 = 204** |                                                                                                                                          |
| **Job timeout**                                                                                                                                    | **225**                 | margin 225 − 204 = **21 ≥ 10** ✓                                                                                                         |

The 30-min case: soak step 45, sum 29 + 45 + 10 = 84, job 105, margin 21. Medusa: setup 21 (copied from `medusa-knee`), sum 21 + 165 + 10 = 196, job 225, margin 29; its soak step covers 120 min of k6, the 27.7 min of order cleanup and about 1 min of audit, about 149 min, so the 165 cap keeps a 16-min margin on the probe arithmetic. Documenso: setup 22 (from `documenso-knee`), sum 22 + 165 + 10 = 197, job 225, margin 28, cleanup per document 55 ms (S4, 11 documents). The 6 h runner cap (360 min) is far above 225.

Medusa soak: its setup steps come from `medusa-knee`; the soak step's arithmetic is in the paragraph above (about 149 min against the 165 cap). **Confirm in the first CI dispatch:** if the real cleanup is slower than 0.33 s per order, the step can reach its cap; a step that reaches its cap is INVALID (the run did not finish its audit), never a PASS, and any cap raise goes in its own PR with its arithmetic.

Documenso soak: 14,400 documents at 2.0 per second; cleanup measured in S4 at about 55 ms per document (608 ms for 11 documents, `P6-DOC-LOAD-001`); the 2-h cleanup total is UNPROBED. The step cap of 165 is a placeholder until the first 120-min dispatch: **confirm in the first CI dispatch**.

**Cap tables, every job** (every step has `timeout-minutes`; 30-min values in brackets). The 80 % rule holds for each soak step: k6 120 min / cap 165 = 73 %, 30 min / cap 45 = 67 %. Retention stays 90 days.

| job              | step                                | cap (min)          | basis                                                              |
| ---------------- | ----------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `cal-soak`       | setup (checkout to Start Cal)       | 29                 | the `cal-knee` steps before the run step (Start Cal 6)             |
| `cal-soak`       | soak `P6-CAL-LOAD-008`              | 165 [45]           | 120 / 0.8 = 150 minimum                                            |
| `cal-soak`       | summary, token scan, upload, stop   | 2 + 2 + 5 + 1 = 10 | upload 5 for a 2-h artefact                                        |
| `medusa-soak`    | setup (checkout to Start Medusa)    | 21                 | the `medusa-knee` steps before the run step (Start Medusa 3)       |
| `medusa-soak`    | soak `P6-MED-LOAD-005`              | 165 [45]           | about 149 min of real work against 165                             |
| `medusa-soak`    | summary, token scan, upload, stop   | 10                 | as `cal-soak`                                                      |
| `documenso-soak` | setup (checkout to Start Documenso) | 22                 | the `documenso-knee` steps before the run step (Start Documenso 5) |
| `documenso-soak` | soak `P6-DOC-LOAD-006`              | 165 [45]           | placeholder until the first 120-min dispatch                       |
| `documenso-soak` | summary, token scan, upload, stop   | 10                 | as `cal-soak`                                                      |

Sums and margins, 120 min [30 min]: cal 29 + 165 + 10 = 204, job 225, margin 21 [84, job 105, margin 21]; medusa 21 + 165 + 10 = 196, job 225, margin 29 [76, job 105, margin 29]; documenso 22 + 165 + 10 = 197, job 225, margin 28 [77, job 105, margin 28]. Every margin is at least 10.

**Token scan:** `scripts/evidence-token-scan.mjs` over the results folder before the upload (the `token_scan` step, upload guarded by its success).

**Budget per dispatch:** a 120-min soak of one product is about 3 h 15 min of runner time (225 cap, real run about 2 h 50 min); all three products in one `all` dispatch run **sequentially** in three jobs: about 9 h of runner time, which is one run per dispatch. **The soak schedule (Q-SOAKSCHED) is out of this PR.**

## 10. Expected output

```text
[soak] P6-CAL-LOAD-008 rate 4.0/s (steadyRateFor cal from knee-bounds.json, lower bound 8) duration 1800 s warmup 360 s
[soak] recycle pool P=50; cancels ok <cancels_ok>, cancels failed <cancels_failed>
[soak] slope rss <slope_rss_mb_per_min> MB/min (least squares), theil-sen <theil_rss> MB/min, steps <steps_rss>
[soak] plateau ratio <plateau_ratio> (last third / middle third)
[soak] db growth <db_bytes_per_booking> bytes per booking (DB_SIZE_SQL, separate from RSS)
[soak] audit per intent ok: <intents> intents, <accepted> accepted, <cancelled> cancelled, leak 0 rows
P6-CAL-LOAD-008 <PASS | FAIL (PRODUCT BUG) | TEST BUG | INVALID | NO THRESHOLD YET> results/load/P6-CAL-LOAD-008/<run id>/verdict.json
```

Medusa and Documenso print the same lines with their own counters. Every value above is a placeholder; no number in this plan is a result.

## 11. Environment changes

**None.** Cursor Cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) and Claude Code cloud (the setup script in the environment settings, `.claude/hooks/session-start.sh`) need no change. The probes used the existing `NODE_OPTIONS=--use-openssl-ca --max-old-space-size=8192` of this session (Cal `next build`, as `docs/handoff/2026-10-24-p6-phase3-autonomous-run.md` notes) and `/opt/node24` for Documenso.

Repo settings by hand: none for this task.

**Fresh state (X6):** the Medusa admin password persists in `$HOME/.p6/medusa-admin` (mode 600; `MEDUSA_ADMIN_PASSWORD` wins; CI generates one per job, `src/medusa/admin-password.ts`), so a rerun reuses the login. Harness state persists across down and up. CI jobs start on a fresh runner. A local fresh state waits for the harness `reset:<product>` command (its own harness PR and pin bump); there is no hand volume removal.

## 12. Build order

Each step is one commit. After each step: `npm run check` (expected count below). Tests first, then code, then workflow, then README.

| Step | Commit message                                           | Files                                                                                                                                                                          | Unit tests after the step (from B 1103: B0 1102 plus the bound PR)                                                       |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | `feat(load): add the soak slope and plateau statistics`  | `src/load/soak/slope.ts`, `src/load/soak/plateau.ts`, `tests/unit/soak-slope.test.ts` (6), `tests/unit/soak-plateau.test.ts` (5)                                               | 1114 (tests and code in one commit: a test file cannot pass before its module exists, and the rules forbid a red commit) |
| 2    | `feat(load): add the database growth read`               | `src/load/soak/db-growth.ts`, `tests/unit/soak-db-growth.test.ts` (3)                                                                                                          | 1117                                                                                                                     |
| 3    | `feat(load): add the soak profile and the verdict`       | `src/load/types.ts`, `src/load/cases.ts`, `src/load/soak/verdict.ts`, `scripts/load/run-load.ts`, `tests/unit/soak-profile.test.ts` (4)                                        | 1121                                                                                                                     |
| 4    | `feat(k6): add the slot recycle mode to the cal journey` | `k6/lib/pure/recycle.js`, `k6/journeys/cal-book.js`, `k6/cases/cal-load-008.js`, `k6/cases/med-load-005.js`, `k6/cases/doc-load-006.js`, `tests/unit/soak-recycle.test.ts` (2) | 1123                                                                                                                     |
| 5    | `ci(soak): add the dispatch-only soak workflow`          | `.github/workflows/soak.yml`, `tests/unit/soak-workflow.test.ts` (3)                                                                                                           | 1126                                                                                                                     |
| 6    | `docs(load): describe the soaks in the readme`           | `README.md`                                                                                                                                                                    | 1126                                                                                                                     |

**Expected after the last step: 1126** (B 1103 + 23). Commit identity: the environment's git identity; no attribution lines (rule A3).

The `k6 inspect` check in `npm run check` covers the three new cases. `npm run lint:actions` covers `soak.yml`.

## 13. Risks, proposed extras and open decisions

**Open decisions (each with options, evidence and a recommended answer):**

- **Q-SLOTS (L1): Cal soak rate versus recycling.** Options: (a) recycle with the rate at 4 per second (recommended; arithmetic §3.2: 28,800 bookings in 2 h cannot come from 3,104 slots); (b) lower the rate to 0.43 per second so 2 h fits 3,104 slots (weakens the load, not the invariant); (c) several event types or hosts (more setup). Decided: **(a)**, recycle with the rate at 4 per second.
- **Q-MEDSTEADY (finding M-F1): Medusa steady stock.** Options: (a) keep `P6-MED-LOAD-002` at `ceil(planned/2)` and state in the band that half the stream is refused by design; (b) add a non-depleting steady profile with `planned + 20` for the latency band. Evidence: 42 of 84 refused (M-3). Decided: **(b)**, `planned + 20` for soak and invariants (the steady-band rule is a Task 5 follow-up).
- **Q-SOAKTHR: thresholds.** Options: (a) set the slope and plateau thresholds from the first three VALID 30-min soaks per product, written to `k6/thresholds/soak-bounds.json` by a calibration PR (recommended, the same rule as the knee bounds, D13); (b) set them now from a guess (rejected: no evidence, rule 9 "never tune to pass"). Decided: **(a)**, calibrate from the first three VALID 30-min soaks per product.
- **Q-SOAKSCHED: the schedule.** Nightly 30 min (`cron`, offset from `17 2 * * *` and `43 3 * * 6`) and Sunday 2 h (D4). Decided: own `ci(soak)` PR after calibration (index run order 3 and 4), not in this PR.
- **Q-MEDREDIS: Medusa Redis for `P6-MED-LOAD-005`.** Options: (a) default fake Redis, backlog reported `absent` (recommended for the first soak; M-F3); (b) `MEDUSA_REDIS=1` for the soak (real Redis, costs one more container; README lines 709 to 716). Decided: **(a)** fake Redis first; `MEDUSA_REDIS=1` in Task 10's two-instance runs.
- **Q-DOCRATE:** Resolved: the bound PR (step 0b) from the released 4a runs; 2.0/s.

**Proposed extras (new unused IDs; out of scope until the owner accepts):**

- `P6-CAL-LOAD-017`: the cancel success count per intent under soak (the recycle audit as its own case). Grep for `P6-CAL-LOAD-017` on main: no match.
- `P6-X-LOAD-024`: DB growth per unit as its own reported figure (the SQL in §6.5 as an extra, not a verdict). Grep: no match.

**Risks:**

- The probe M-F2 step (−430 MB in one second): if it recurs in a 2-h soak it breaks a naive slope; the two-statistic rule and the step count exist for it. Root cause UNPROBED.
- Cancel traffic doubles the Cal write load; the soak can then fail on the product (a PRODUCT BUG only if the audit fails, not because of the rate).
- The Medusa and Documenso cleanups inside the step cap (§9): if they overrun, the run is INVALID and the cap is raised in its own PR with its arithmetic.
- CI minutes: about 9 h of runner time per `all` dispatch.

## 14. Done when (roadmap, made measurable)

Roadmap "Done when": "≥ 3 VALID nightly 30-min soaks and ≥ 1 VALID weekly 2-h soak per product with slopes, plateau verdicts, DB growth and a clean audit; `npm run check` (actionlint) green." Measured as follows for this task (the build PR):

1. `npm run check` exits 0 with **1126** tests, `# fail 0`.
2. `soak.yml` exists, is dispatch-only, has the three product jobs, and `npm run lint:actions` exits 0.
3. Three VALID dispatched 30-min soaks per product (run IDs recorded in the build PR's follow-up) are the gate for the schedule PR (`ci(soak)`), not for this PR. **The roadmap's "nightly" and "weekly" counts are met by the later schedule PR and its runs, not by this PR.**
4. Each VALID run has `soak.json` (slopes, plateau, DB growth) and its audit in the artefact `soak-<product>-30`.

## 15. Rule self-check

- **Rule A1 (branch names):** the build branch is `feat/<date>-p6-soak-workflow` (roadmap). The plan branch is `plan/…` (rule 6).
- **Rules A2 to A5 (commits, staging, attribution, identity):** explicit paths only; no attribution lines; the environment's identity.
- **Rule B7 (live probe first):** §3 has the probes; the Cal rows are in §3.2 and the Documenso rows in §3.3.
- **Rule B9 (contradictions and open questions):** §13 lists the open decisions with a recommendation each; the Medusa stock finding M-F1 contradicts the steady-band reading and is raised as Q-MEDSTEADY.
- **Rule B10 (stop for review):** yes, §1.
- **Rule C12 (never weaken an assertion):** no threshold is set without data (Q-SOAKTHR); the verdict is `NO THRESHOLD YET` until then.
- **Industry practice:** k6 open-model arrival rate (`constant-arrival-rate`, the k6 executor docs, the same basis as Phase 3 D1); the plateau and warm-up discipline follows the Google SRE book's advice to measure steady state after warm-up and to separate data growth from leaks in capacity reviews; GitHub Actions `timeout-minutes` accepts expressions and is capped at 6 h per job (GitHub docs, "Workflow syntax").
- **Rule 20 (plan self-check):** (a) every roadmap "Done when" item is measured in §14 or moved to the schedule PR (stated); (b) grep of every named function and path is in §4 (`src/load/telemetry/gaps.ts` line 2, `src/cal/api.ts` lines 17, 49, 59, `k6/lib/pure/sizing.js` lines 8 and 19, `src/documenso/oracle.ts` lines 59, 67, 125); new names are marked NEW; (c) the CI budget (§9) includes the cleanup inside the step and the margin ≥ 10; (d) every new function has a skeleton (§6); (e) no owner answer is recorded as given.
