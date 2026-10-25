# P6 Phase 4b Task 8: Cal invariants under load (`P6-CAL-LOAD-002`, `P6-CAL-LOAD-006`) (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 543 to 580 (Task 8), D15 (line 841), D16 (line 846), D10 (line 826). Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `e27ad5a`. Probe date 2026-10-25 (UTC), cloud VM (4 vCPU, 15 GB, Node v22.23.3, k6 v2.3.0). **VM timings prove that a step works; none is a published number or a target.**

## 1. Header

- **Task and roadmap line:** Phase 4b Task 8, Cal invariants under steady load, roadmap lines 543 to 580.
- **Cases and priority:** `P6-CAL-LOAD-002` (P0, burst on one free slot inside steady load: exactly one ACCEPTED); `P6-CAL-LOAD-006` (P1, stale read after commit, D15 contract).
- **Build branch pattern:** `feat/<build date>-p6-cal-load-invariants`.
- **Unit-test delta:** **+14 against B0 1025** (`main` at `e27ad5a`). If Task 6 merges first (+36), B = 1061 and the expected count is **1075**. Breakdown in §12.
- **Stop for owner review: yes.** A new CI job (or a new mode in `knee.yml`, Q-PLACE) and a new k6 scenario on the shared Cal stack. Rule B10.

## 2. What it proves

- Contention guards hold while the system is busy: one free slot, many simultaneous attempts, exactly one ACCEPTED booking (the "no double-sold seat" invariant).
- A committed booking leaves the offer: after the 2xx, the slot is not offered again (D15, "never offered again" while the slot cache is inactive; bounded staleness if it is active).
- Known bugs stay counted under their IDs (`P6-OBS-CAL-001`, `P6-OBS-CAL-003`), not hidden.
- Transfer: a clinic or branch calendar must never sell one appointment twice under a busy front desk, and a booked slot must stop being offered to the next patient.

## 3. Live probe evidence

Probes run in this plan session with the harness scripts only. Cal was started with `npm run up:cal` (exit 0, 421 s, cold build on the VM) and stopped with `npm run down:cal` (exit 0, 0 leftover containers).

| #    | Roadmap probe item                                                                                      | Command                                                                                                                                                                                                                          | Output (trimmed)                                                                                                                                                                                                                                                                        | Value it sets                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C8-1 | Is the `getSchedule` slot cache active (Redis client) in the harness stack?                             | 4a Task 2 plan §137 (main, Task 2 §3.1 probe) and the 4a index finding 5 on `origin/plan/2026-10-25-p6-phase4a-plans`; this session: `docker ps` during the Cal run showed only `qa-harness-cal-postgres-1` (no Redis container) | Cal's `getSchedule` slot cache has no Redis behind it: **inactive**. This session did not re-read the Cal env for a Redis URL (value not printed); the 4a evidence is the source                                                                                                        | D15 contract: **"never offered again after commit"** applies to `P6-CAL-LOAD-006`                                                                      |
| C8-2 | Does a booked slot leave `getSchedule` at once?                                                         | 4a index finding 5: "320 → 318 slots right after two bookings"                                                                                                                                                                   | verified in 4a; not re-probed here                                                                                                                                                                                                                                                      | slots leave `getSchedule` immediately (the stale window is 0 without the cache)                                                                        |
| C8-3 | Cal steady run, 120 s at 4 per second (background for `-002` and `-006`: steady rate and runner config) | `node scripts/load/run-load.ts --case P6-CAL-LOAD-003 --profile steady`                                                                                                                                                          | exit 0, 147 s, `P6-CAL-LOAD-003 PASS results/load/P6-CAL-LOAD-003/20261025T233524Z-8986f965/verdict.json`; `VALID`; 480 iterations, 480 accepted, `dropped_iterations` 0; audit `rows 480 live booking(s)`, `accepted-only 0 not accepted`, `client-matches-db 480/480`, `no-overlap 0` | the steady rate 4 per second and the 120 s hold are VALID on the VM (the band uses them, Task 5)                                                       |
| C8-4 | Cal web log carries the P2002 line without tokens                                                       | `grep -c "Booking_uid_key" $HOME/p6-probe-cal-steady.log` (run output); the Cal web log at `/home/user/k6-load-concurrency-suite/...` as the harness prints it                                                                   | **UNPROBED**: the steady run made no collision, so no P2002 line appeared in its output; the P2002 signature needs a collision (the burst itself). Confirm in the build's step-4 probe                                                                                                  | `P6-OBS-CAL-003` counting rule is probed only with the burst                                                                                           |
| C8-5 | The `getSchedule` call k6 makes                                                                         | `k6/journeys/cal-book.js` lines 36 to 59 (fixed-slot mode, `cfg.slotStarts`) and the Task 2 plan §6.2                                                                                                                            | the journey reads one 28-day window per iteration (`windowDays` 28 in `k6-config.json` of run C8-3); `getSchedule` is called with the fixed window of the target day                                                                                                                    | the burst reads one fixed slot list (no shifting list, the Phase 3 two-slot bug is fixed by Task 2's fixed-slot mode)                                  |
| C8-6 | Free slots of the window after cleanup (slot return, Task 7 §3.2 evidence)                              | `node $SP/slots.ts 2026-10-27T00:00:00.000Z 2026-12-10T00:00:00.000Z 3` (`getFreeSlots`, `src/cal/api.ts` line 17) after the C8-3 cleanup                                                                                        | `count 519` (the run picked 504 slots, `slotStarts` in `k6-config.json`)                                                                                                                                                                                                                | the window still holds at least the picked slots after 480 cancels (**partial**: the pre-run count was not recorded, so exact restoration is UNPROBED) |
| C8-7 | Burst size and timing inside steady load                                                                | **UNPROBED** here: a burst of N simultaneous `createBooking` calls on one slot was not run (the stack was stopped after C8-3 to keep the one-stack rule for Documenso)                                                           | —                                                                                                                                                                                                                                                                                       | the build's step-4 probe sets N (proposal: 8 attempts within 100 ms, inside the steady stream)                                                         |

**Known signal from the steady run (C8-3), relevant to `-002`:** `sampler` `maxSampleCostMs` 917 ms and `RSS` 582 to 1,086 MB over 120 s (Task 7 §3.1 finding M-F2 is the Medusa case of the same unexplained step; Cal's RSS grows through the steady phase, so the Task 8 burst runs must not read RSS as a verdict).

### 3.1 What the probe could not confirm (UNPROBED, with the reason)

1. The burst outcome (C8-7): one ACCEPTED per burst, the loser histogram, and the redacted 400 of `P6-OBS-CAL-001`: not run in this session (time and the one-stack rule). **Confirm at build time** in the first step-4 probe.
2. The P2002 log signature (C8-4) under a real collision: **confirm at build time.**
3. Whether `getSchedule` ever offers a booked slot again after commit with the cache inactive: the 4a probe says no (C8-2); the build re-probes with a 2-second poll after the 2xx (§6.4).
4. The Cal `Booking_uid_key` collision rate versus load (`P6-OBS-CAL-003`): **UNPROBED**; the characterisation needs several bursts.

## 4. Depends on

Main at `e27ad5a`, verified by grep or read in this plan run:

- `k6/journeys/cal-book.js`: `runCalBook` (line 18), fixed-slot mode (`cfg.slotStarts`, line 59), `acceptedCounter` `p6_bookings_accepted` (line 8). Task 2, merged.
- `k6/cases/cal-load-003.js` (steady case, rate from `steadyRateFor`), `k6/cases/cal-load-005.js` (knee, fixed-slot mode).
- `src/cal/api.ts`: `getFreeSlots` (line 17), `createBooking` (line 49), `cancelBooking` (line 59), `createSlotAllocator` (line 90).
- `src/cal/payloads.ts`: `bookingBody` (line 25), `pickFreeSlot` (line 65), `parseBookingResponse` (line 72, the 400 and 409 shapes), `overlapLegs` (line 105), `attendeeEmail` (line 10).
- `src/cal/oracle.ts`: `SLOT_ACCEPTED_SQL`, `HOST_OVERLAP_SQL`, `OVERLAP_PAIRS_SQL`, `CAL_INTENT_ROWS_SQL`, `CAL_ACCEPTED_PER_INTENT_SQL`, `CAL_LINK_USAGE_SQL`, `readSlotAccepted`, `readWindowAccepted`, `readHostOverlaps`, `readOverlapPairs`, `leakCheck`.
- `src/load/products/cal.ts`: `calSetupWith` (line 172), `calCleanupWith` (line 234), `CalSetupOptions` (line 49).
- `src/load/knee/cal-supply.ts`: `slotsNeeded`, `supplyWindowDays`, `pickSlotStarts` (Task 2, merged).
- `src/load/telemetry/log-grep.ts` (the log-grep rule, Phase 3 Task 5) for the P2002 line.
- `perf.yml` `cal-smoke` (line 983 to 1295 of the file on main, 31 steps, all capped, sum 39 against 60: PRE-2 is on main, commit `eb440e4`).

**Task 6 (not on main at `e27ad5a`):** none for `-002` and `-006`. The Cal spike (Task 6) and the steady band (Task 5, on main) are independent.

**Slot cache (D15):** inactive in the harness stack (C8-1), so the "never offered again" contract applies. The contract for the active case is written into §6.4 as a future branch, not built, because no Redis exists (`P6-CAL-LOAD-016` in Task 2's extras would test it).

## 5. Build-time recheck table

| #   | Check                                                          | Exact command                                                                                                                                                                       | Expected                                                                     | If it differs                                                                                          |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Task 6 status (no dependency, recorded)                        | `git ls-remote --tags origin \| grep p6-phase4a`                                                                                                                                    | not printed until Task 6 release                                             | not a blocker for this task                                                                            |
| 2   | Slot cache still inactive                                      | `grep -rn "withSlotsCache\|redis" products/cal/packages/trpc/server/routers/viewer/slots/util.ts \| head -3`, and `docker ps --format '{{.Names}}' \| grep -i redis` during the run | no Redis container; cache wrapper with no client                             | the D15 contract changes: write the bounded-staleness branch (§6.4) and say so                         |
| 3   | Steady rate still 4 per second                                 | `jq '.products.cal.lowerBoundRate' k6/thresholds/knee-bounds.json`                                                                                                                  | 8, so `steadyRateFor` = 4                                                    | recompute the burst rate and the steady rate, state the change                                         |
| 4   | Burst probe (C8-7) passes before the commit that adds the case | `node scripts/load/run-load.ts --case P6-CAL-LOAD-002 --profile pr` on the stack the probe starts                                                                                   | exit 0 or 1 with the expected classification; exactly one ACCEPTED per burst | a second ACCEPTED is a PRODUCT BUG (SUSPECTED) with the rows as evidence; never tune the burst to pass |
| 5   | `getSchedule` exclusion of a booked slot                       | the §6.4 poll after the 2xx                                                                                                                                                         | the slot is absent within one poll                                           | a stale offer is recorded and classified per D15                                                       |
| 6   | `npm run check`                                                | `npm run check`                                                                                                                                                                     | exit 0                                                                       | fix before the next step                                                                               |

## 6. Design

### 6.1 File tree

```text
k6/cases/cal-load-002.js                       NEW  P6-CAL-LOAD-002 (burst inside steady load)
k6/cases/cal-load-006.js                       NEW  P6-CAL-LOAD-006 (stale-read probe during steady load)
k6/journeys/cal-burst.js                       NEW  the burst scenario unit (one target slot, N simultaneous attempts)
k6/lib/pure/burst.js                           NEW  pure target schedule for the burst (start offsets within the window)
src/load/cal/burst.ts                          NEW  classifyBurst: exactly-one rule, loser histogram, known-bug counts
src/load/cal/stale.ts                          NEW  classifyStale: D15 contract (never offered again, or bounded staleness)
src/load/cases.ts                              CHANGED  registers CAL_LOAD_002 and CAL_LOAD_006
tests/unit/cal-burst.test.ts                   NEW  7 tests
tests/unit/cal-stale.test.ts                   NEW  5 tests
tests/unit/cal-burst-schedule.test.ts          NEW  2 tests
perf.yml OR knee.yml                           CHANGED  Q-PLACE: own job (see §9); a job named cal-invariants
README.md                                      CHANGED  section "Cal invariants under load"
```

### 6.2 The burst (`P6-CAL-LOAD-002`)

Steady load at the `P6-CAL-LOAD-003` rate runs on the same stack; at a fixed time inside the hold (proposal: 40 s after the steady start) one free slot S is chosen from the setup list and N simultaneous `createBooking` calls are fired inside 100 ms (`k6/journeys/cal-burst.js`). The steady stream continues during the burst.

```ts
// src/load/cal/burst.ts
export interface BurstAttempt {
  intent: string; // "<prefix>-i<n> burst" (run prefix, the intent line of the audit)
  status: number | null; // HTTP status, null on a transport error
  bodyKind: "accepted" | "slot-taken" | "redacted-400" | "conflict-409" | "other";
}
export interface BurstVerdict {
  accepted: number; // ACCEPTED rows on S in the database (SLOT_ACCEPTED_SQL), not the client count
  attempts: number;
  histogram: Record<BurstAttempt["bodyKind"], number>;
  verdict: "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
  knownBugs: { "P6-OBS-CAL-001": number; "P6-OBS-CAL-003": number }; // counted, never a verdict input
}

/** Exactly one ACCEPTED row on the target slot is PASS. Zero is a TEST BUG when the slot was free (setup check), two or more is a FAIL (PRODUCT BUG). Any 5xx is a FAIL (PRODUCT BUG) per Task 8 §2. */
export function classifyBurst(input: {
  targetSlot: string;
  accepted: number;
  attempts: BurstAttempt[];
  slotFreeAtSetup: boolean;
  fiveXx: number;
}): BurstVerdict;
```

Rules (stated, unit-tested):

- Two or more ACCEPTED on S → FAIL (PRODUCT BUG, SUSPECTED until repeated, rule 13).
- Zero ACCEPTED with the slot free at setup → TEST BUG (the burst did not run its attempt).
- Any HTTP 5xx in the burst → FAIL (PRODUCT BUG, SUSPECTED); the redacted 400 of `P6-OBS-CAL-001` is counted, not a failure.
- `P6-OBS-CAL-003` (`Booking_uid_key` P2002 lines in the web log via `src/load/telemetry/log-grep.ts`) is a characterisation count per burst, not a verdict input.

### 6.3 The stale read (`P6-CAL-LOAD-006`)

Under steady load, the case books S (the burst's target, a second free slot), then polls `getSchedule` for the window every 2 s for 60 s, recording the first poll that no longer offers S (the time-to-disappear). With the cache **inactive** (C8-1), the contract is "never offered again after commit": the case FAILS (PRODUCT BUG, SUSPECTED) if any poll after the 2xx offers S. With the cache **active** (a future harness with Redis), the contract is bounded staleness: S may be offered for at most `DEFAULT_SLOTS_CACHE_TTL` (2000 ms, `packages/trpc/server/routers/viewer/slots/util.ts` line 79 at `CAL_REF`) plus a margin, and any booking attempt on a stale offer is refused (never a second ACCEPTED). The branch is written in `src/load/cal/stale.ts` and tested; only the inactive branch runs in CI until a Redis client exists.

```ts
// src/load/cal/stale.ts
export interface StalePoll {
  tMs: number;
  offered: boolean;
}
export type StaleContract = "never-offered-again" | "bounded-staleness";
export interface StaleVerdict {
  contract: StaleContract; // the contract that applied, recorded in the verdict (D15)
  staleCount: number; // polls after commit that still offered S
  timeToDisappearMs: number | null; // null when S was never offered again after commit (the expected inactive result)
  verdict: "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG";
  reasons: string[];
}
/** Classifies the polls after the commit. contract is passed by the caller from the cache probe (C8-1 result), never inferred. */
export function classifyStale(input: {
  contract: StaleContract;
  commitMs: number;
  polls: StalePoll[];
  ttlMs: number;
  marginMs: number;
  secondAcceptedOnS: boolean;
}): StaleVerdict;
```

`secondAcceptedOnS` true is always a FAIL (PRODUCT BUG) under either contract.

### 6.4 k6 cases

```js
// k6/cases/cal-load-002.js  (P6-CAL-LOAD-002: one free slot, N simultaneous bookings, inside steady load; D15 n/a)
// Scenario: steady constant-arrival-rate journey at the P6-CAL-LOAD-003 rate (steadyRateFor cal) + one burst scenario that
// starts at burstAtSec inside the hold. Oracle: SLOT_ACCEPTED_SQL on S, classifyBurst.
export const options = standardOptions({
  scenarios: {
    steady: openModelScenario({
      rate,
      durationSec,
      maxLatencyMs: 2000,
      exec: "steady",
      tags: { case: "P6-CAL-LOAD-002" },
    }),
    burst: {
      executor: "shared-iterations",
      vus: N,
      iterations: N,
      startTime: `${burstAtSec}s`,
      exec: "burst",
      maxDuration: "30s",
    },
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // a 4xx is expected for losers; the verdict is in classifyBurst
});
```

```js
// k6/cases/cal-load-006.js  (P6-CAL-LOAD-006: stale read after commit; D15 contract inactive: never offered again)
// Scenario: steady load; one booking of S (fixed-slot), then a 60 s poll of getSchedule every 2 s. Oracle: classifyStale.
```

`N` = 8 attempts in 100 ms (proposal, to be confirmed by the build's probe, C8-7). `burstAtSec` = 40 (steady hold 120 s).

### 6.5 CI (`perf.yml` or `knee.yml`, Q-PLACE)

Recommended (Q-PLACE option a): a new job `cal-invariants` in `perf.yml`, `schedule` and `workflow_dispatch` only (the roadmap's nightly for product invariants, D16), its own timeout and step caps. Its steps copy `cal-smoke` setup (checkout, fork, harness up) with the same `timeout-minutes` values, then one run step per case, the token scan, upload with `retention-days: 14` (perf.yml's 14 days, the same as its other artefacts), and the stop step with `if: always()`. The job cap: setup 29 (the setup steps copied from `cal-knee`, whose computed setup sum is 29 in Task 7 §9; it includes Start Cal 6) + burst run 6 + stale run 3 + summary, scan, upload 2 + 2 + 3 + stop 1 = 46, job timeout 60, margin 14 ≥ 10. The burst and stale runs are the two step caps; the 6 and 3 come from the k6 durations (3 min and 2 min) with the 80 % rule applied as in §9 of Task 7. The steady run inside the burst case is 120 s, so the burst case is 3 min of k6 and the stale case is 2 min.

Q-PLACE alternatives are in §13.

### 6.6 Oracles and assertions (per case)

- `P6-CAL-LOAD-002`: `SLOT_ACCEPTED_SQL` on S (exactly one row with status ACCEPTED), the per-intent rows (`CAL_INTENT_ROWS_SQL`, one outcome line per attempt, no count slack, L9), the redacted 400 counted under `P6-OBS-CAL-001`, the P2002 count under `P6-OBS-CAL-003`, any 5xx = FAIL (PRODUCT BUG SUSPECTED).
- `P6-CAL-LOAD-006`: `classifyStale` with the inactive contract, plus `secondAcceptedOnS` from `SLOT_ACCEPTED_SQL`.
- The steady stream keeps its own audit (`CAL_INTENT_ROWS_SQL`, `HOST_OVERLAP_SQL`), so the burst cannot hide a double booking elsewhere.

### 6.7 Known bugs

- `P6-OBS-CAL-001` (redacted 400, [calcom/cal.diy#30375](https://github.com/calcom/cal.diy/issues/30375)): counted per burst.
- `P6-OBS-CAL-003` (P2002 on `Booking_uid_key`, [#30376](https://github.com/calcom/cal.diy/issues/30376)): counted as a characterisation.
- `P6-OBS-CAL-002` (the host overlap, counted by `HOST_OVERLAP_SQL` under its ID if it appears).

## 7. Oracles (summary)

| Case   | Oracle                                    | Verdict                                                                                                                                                    |
| ------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-002` | `SLOT_ACCEPTED_SQL` on S; `classifyBurst` | PASS: exactly one ACCEPTED. FAIL (PRODUCT BUG): ≥ 2 ACCEPTED or a 5xx. TEST BUG: zero ACCEPTED with the slot free. INVALID: dropped iterations (generator) |
| `-006` | `classifyStale` (inactive contract)       | PASS: S never offered after commit. FAIL (PRODUCT BUG): a poll after commit offers S, or a second ACCEPTED                                                 |

## 8. Data isolation, cleanup and leak check

- Run prefix in every created entity: the attendee email `<prefix>-i<n>@…` (`attendeeEmail`, `src/cal/payloads.ts` line 10), and the intent `<prefix>-i<n> burst` / `<prefix>-i<n> steady` in the audit line.
- Cleanup sweep: `calCleanupWith` (cancel and archive of every booking of the run). **Measured:** 480 bookings in the C8-3 cleanup took 24.9 s (52 ms each).
- Leak check: `leakCheck` on the run prefix; **expected output: 0 rows** in the live bookings table after the sweep.

## 9. CI, token scan and budget

Q-PLACE recommended option (a), a new job in `perf.yml` (§6.5). The arithmetic for that job: setup 29 (the `cal-smoke` setup steps, copied) + 6 + 3 + 2 + 2 + 3 + 1 = 46 against a job of 60: margin 14 ≥ 10 ✓. Real durations from C8-3 on the VM: stack start 421 s (cold, cache miss), steady run 147 s, cleanup 24.9 s. **Confirm in the first CI dispatch** (the runner's cold start may differ).

The token scan runs before every upload (the `token_scan` step, upload guarded by its outcome). Permissions: `contents: read`.

## 10. Expected output

```text
P6-CAL-LOAD-002 burst: slot <slot>, attempts <N>, accepted 1, slot-taken <N-1>, redacted-400 <r>, 5xx 0, dropped 0 → PASS
P6-CAL-LOAD-006 stale: contract never-offered-again, polls <P>, offered after commit 0 → PASS
P6-OBS-CAL-001 count <r>, P6-OBS-CAL-003 count <p>
```

Placeholders only; no value here is a result.

## 11. Environment changes

None. Cursor Cloud and Claude Code cloud need no change. The Cal `next build` uses the session's `NODE_OPTIONS` (8 GB heap, as in Task 7 §11).

## 12. Build order

| Step | Commit message                                          | Files                                                                                                                                | Unit tests after the step (B0 1025)      |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1    | `feat(load): add the burst classifier`                  | `src/load/cal/burst.ts`, `tests/unit/cal-burst.test.ts` (7), `tests/unit/cal-burst-schedule.test.ts` (2) with `k6/lib/pure/burst.js` | 1034                                     |
| 2    | `feat(load): add the stale-read classifier`             | `src/load/cal/stale.ts`, `tests/unit/cal-stale.test.ts` (5)                                                                          | 1039                                     |
| 3    | `feat(k6): add the burst and stale scenarios`           | `k6/journeys/cal-burst.js`, `k6/cases/cal-load-002.js`, `k6/cases/cal-load-006.js`, `src/load/cases.ts`                              | 1039 (`npm run check` runs `k6 inspect`) |
| 4    | `ci(perf): add the cal invariants job`                  | `.github/workflows/perf.yml` (new job `cal-invariants`)                                                                              | 1039 (plus `lint:actions`)               |
| 5    | `docs(load): describe the cal invariants in the readme` | `README.md`                                                                                                                          | 1039                                     |

**Expected after the last step: 1039** (B0 1025 + 9 from step 1 + 5 from step 2 = **+14**; steps 3 to 5 add no unit tests). With Task 6 merged first: 1061 + 14 = 1075. Commit identity: the environment's. No attribution lines.

## 13. Risks, proposed extras and open decisions

**Open decisions:**

- **Q-PLACE (where the invariant cases run).** Options: (a) a new job `cal-invariants` in `perf.yml`, schedule and dispatch only (recommended; the `cal-smoke` cap sum is already at its job limit, and the 4a Task 5 Q6 precedent puts heavy steps in their own jobs); (b) a new mode `invariants` in `knee.yml`; (c) a new workflow. Evidence: `cal-smoke` on main is 31 of 31 capped, sum 39 against 60 (PRE-2 merged, commit `eb440e4`), so a steps-in-`cal-smoke` option would consume the margin the roadmap needs. Recommended: **(a)**.
- **Q-BURST (N and the start time).** Options: N = 8 within 100 ms (recommended, the build's probe confirms it); or N = 20. Evidence: none probed yet (C8-7). Recommended: **8**, then raise only with evidence.
- **Q-STALECONTRACT.** The inactive contract is recorded now (C8-1). If the owner wants the active-cache branch tested, a Redis client must be added to the harness (`P6-CAL-LOAD-016`, Task 2 extras). Recommended: **keep inactive**, record it.

**Proposed extras (new unused IDs):** none needed by this task. (`P6-CAL-LOAD-016` is already the Task 2 extra for the active cache: not reused.)

**Risks:**

- Burst and steady load compete for slots: the burst's slot must be taken from the list the steady stream does not use (the build reserves it at setup).
- The cache margin for the active branch is not set (no data): the branch stays unexercised until a Redis client exists.
- The P2002 line may not appear at all on the VM (no collision); its count can be zero, which is a finding, not a pass of `P6-OBS-CAL-003`.

## 14. Done when (roadmap, made measurable)

Roadmap: "≥ 3 VALID runs each: `-002` exactly one ACCEPTED per burst with known bugs counted under their IDs; `-006` passes the D15 contract that applies (bounded staleness with no second ACCEPTED, or never offered), with the applied contract recorded; `npm run check` green."

Measured here: (1) `npm run check` exits 0 with 1039 tests (1075 with Task 6); (2) three VALID `cal-invariants` dispatches (run IDs listed in the build PR's follow-up), each with one ACCEPTED per burst and the contract `never-offered-again` recorded in `verdict.json`; (3) `P6-OBS-CAL-001` and `-003` counts printed per run.

## 15. Rule self-check

- **A1, A2, A3, A5:** plan branch, lowercase Conventional Commits, explicit paths, no attribution lines, environment identity.
- **B7 (probe first):** §3 has probes C8-1 to C8-7; C8-7 and C8-4 are UNPROBED with the reason.
- **B9:** §13 lists three open decisions with recommendations; contradictions: none new (the roadmap's "CI change in cal-smoke" is replaced by Q-PLACE).
- **B10:** stop for review (§1).
- **C12 (never weaken an assertion):** the burst rule fails on two ACCEPTED; the stale rule fails on any offer after commit under the inactive contract.
- **Industry practice:** exactly-once under contention and the arrival-rate burst follow the k6 `shared-iterations` and `constant-arrival-rate` executor docs (Grafana k6 documentation); the "one winner under contention" test is the Phase 1 primitive of this repo; GitHub Actions job caps: GitHub docs ("Workflow syntax", `timeout-minutes`).
- **F (plan self-check):** (a) roadmap "Done when" measured in §14; (b) every named function is grep-verified in §4 (`src/cal/api.ts` lines 17, 49, 59, 90; `src/cal/payloads.ts` lines 10, 25, 65, 72, 105; `k6/journeys/cal-book.js` lines 8, 18, 59); new names marked NEW; (c) the CI budget is in §9 with margin 14; (d) skeletons in §6; (e) no owner answer recorded as given.
