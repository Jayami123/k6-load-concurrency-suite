# P6 Phase 4 PRE-1: make the `P6-MED-LOAD-006` storm reach its threshold reliably (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Rules: [docs/agent-rules.md](../agent-rules.md). It is a prerequisite of the Phase 4a plans, built **first**
(index order: PRE-1, PRE-2, Task 1, Task 2, PRE-3, Tasks 3 and 4, Task 5, Task 6).

## 1. Header

- **Goal.** The `P6-MED-LOAD-006` retry storm reaches `STORM_SHARE` (0.5) on every run, with `judgeStorm` and `STORM_SHARE` **unchanged** (`src/load/retry-validity.ts`). No judge, threshold or assertion is weakened.
- **Why first.** The case also runs on every pull request: the `medusa-load` step `LOAD journey P6-MED-LOAD-006` runs with `--profile pr` when `github.event_name == 'pull_request'` (`.github/workflows/perf.yml`, the step
  after `P6-MED-LOAD-002`), so a flaky storm turns any PR's CI red, including the Phase 4 PRs. Phase 4 Task 3 uses the same Medusa stack and checkout journey, and a red `perf.yml` run cannot enter a release
  (`evidence-release.yml` requires conclusion `success`). **PRE-1 must be merged before Task 3** and is built before Task 1.
- **Base.** `origin/main` at `2db9726` or later. **Build branch.** `fix/<build date>-p6-med-load-006-storm`. **Commit type.** `fix(load)`.
- **PR title.** `fix(load): make the medusa retry storm reach its threshold reliably`.
- **Unit tests.** B0 = the count on `main` when the build starts (865 at `2db9726`, Node 24, `node --test tests/unit/*.test.ts`). This plan adds **+4** (§5); expected B0 + 4.
- **Harness pin / environment.** Unchanged. **Stop for owner review.** No (no workflow file, no shared runner label; only `src/load`, `k6/cases`, tests).

## 2. Evidence (every line was read or counted on 2026-10-25)

- **The failure.** Run 40178773022, attempt 1, job `medusa-load` (id 121125122107): `P6-MED-LOAD-006 FAIL results/load/P6-MED-LOAD-006/20261025T090121Z-c53f65ef/verdict.json` after 34.5 s (09:01:24 to 09:01:58); the
  job log carries no reason line. The BACKLOG (`docs/BACKLOG.md` lines 118-126) and the Phase 3 closeout (`docs/plans/2026-10-25-p6-phase3-closeout.md` lines 38-49) record "3 of 30 first attempts timed out against
  `STORM_SHARE` 0.5". Attempt 2 of the same run (job 121129550439) passed and is the one in the release zip (`20261025T092304Z-08a0cfda`). The failing attempt's artefact (`load-medusa`, artefact id 12592554291, 130,831 bytes)
  is only in the Actions artefacts: reading it needs authentication, and it expires 14 days after the run (about 2026-11-08).
- **The storm design.** `k6/cases/med-load-006.js`: `buildPlan({ stormTimeoutMs: 100, stormAttempts: 2, finalTimeoutMs: 30000, delayMs: 0 })` (`k6/lib/retry.js`); a first attempt that returns status 0 (client timeout) counts in
  `p6_first_timeouts`; `judgeStorm` needs `firstTimeouts / intents >= 0.5` and `retries >= firstTimeouts`. `k6/cases/med-load-006.example.json`: `maxLatencyMs 6000`, rate 1. The storm timeout 100 ms was chosen from a VM
  probe (Phase 3 Task 10 plan: first attempts timed out 21 of 21; `docs/plans/2026-10-24-p6-phase3-task10-retry-storms.md` line 57 and line 139).
- **The passing runs (release `p6-phase3`, zips `p6-<run id>-evidence.zip`, `load-medusa/P6-MED-LOAD-006/<attempt>/k6-main-summary.json`).**

  | run id      | attempt folder              | intents | first timeouts | attempts | k6 `http_req_duration` med / p95 / max (ms) |
  | ----------- | --------------------------- | ------- | -------------- | -------- | ------------------------------------------- |
  | 40177412186 | `20261025T084442Z-52b2804c` | 31      | 31             | 93       | 100.6 / 217.8 / 274.7                       |
  | 40178773022 | `20261025T092304Z-08a0cfda` | 31      | 31             | 93       | 100.8 / 224.2 / 459.6                       |
  | 40180625279 | `20261025T092829Z-823f4898` | 30      | 30             | 61       | 58.9 / 160.4 / 173.5                        |

  In the first two, every intent used all three attempts (93 = 31 x 3: two timed-out storm attempts, then the final one); in the third, 29 of 30 intents were answered by the **second** 100 ms attempt (61 attempts = 30 x 2 + 1).
  So on the runner the `complete` call finishes on the order of one to two storm timeouts (100 to 200 ms) after it is sent, and the third run was already fast enough for the second attempt to catch the finished order.

- **Hypothesis (not proved).** The first-attempt timeout 100 ms sits next to the runner's `complete` latency. On a fast attempt the answer arrives inside 100 ms for most intents (27 of 30 in the failing attempt), no timeout
  happens, and `judgeStorm` correctly reports "no storm". The case then proves nothing and says so; the TEST BUG is the fixed 100 ms, not the judge. An alternative explanation is that the quick answers were not
  successes but fast non-`ok` replies that count in neither `p6_first_timeouts` nor `p6_retry_ok`; the failing attempt's `k6-main-summary.json` (`p6_attempts`, `p6_retry_*`, `http_req_duration`) separates the two.
- **UNPROBED, with the measurement that settles it.** (1) The failing attempt's counters: download artefact id 12592554291 with an authenticated `gh run download 40178773022 -n load-medusa` before about 2026-11-08 and read
  `load-medusa/P6-MED-LOAD-006/20261025T090121Z-c53f65ef/k6-main-summary.json`. (2) The distribution of the `complete` latency on the runner: add the request name to the case's reported percentiles in the first fix
  dispatch (the points file `k6-main.json.gz` has `http_req_duration` per request name) and read p5 and p50 of `POST /store/carts/:id/complete`.

## 3. Fix options, ranked

| Rank | Option                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Why                                                                                                                                                       | Risk                                                                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Tie the first-attempt timeout to the measured `complete` latency.** The setup stage times a few throwaway `complete` calls (the cart helpers `prepareReadyCart` and `completeCart` of `src/medusa/store.ts`), takes the **minimum** latency `m`, and writes `stormTimeoutMs = clamp(floor(m / 4), 5, 100)` into `k6-config.json`; `med-load-006.js` reads `cfg.stormTimeoutMs ?? 100`. A timeout of a quarter of the fastest observed `complete` cannot be beaten by the same call, on any runner speed. | deterministic by construction, no magic number, the judge and `STORM_SHARE` stay as they are                                                              | the probe orders must be cancelled by the cleanup (they carry the case prefix) and counted in the stock (+3); `m` is a runner-speed measurement (UNPROBED value)            |
| 2    | A lower constant (25 ms, as the Documenso storm uses)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | one line                                                                                                                                                  | a constant is again a guess against a runner whose latency is unknown; could flip the other way (a 25 ms timeout also times out the final cart steps if the plan is reused) |
| 3    | Raise the arrival rate inside the `pr`/`full` profiles                                                                                                                                                                                                                                                                                                                                                                                                                                                     | none: the storm depends on the latency of one request, not on load; a higher rate only raises the latency a little and changes the case's validity limits | rejected                                                                                                                                                                    |
| 4    | Add a server-side delay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | only through existing harness configuration; none exists, and a fork or harness edit is a **hard stop** for this work                                     | rejected                                                                                                                                                                    |

**Recommended: option 1** (decision Q1 below is open until the owner answers).

## 4. Steps (junior guide)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. `git switch -c fix/<build date>-p6-med-load-006-storm origin/main`; `npm run check` after each commit, expected counts relative to B0.

| Step | Commit subject                                                            | `git add` paths                                                                                                                                     | Expected                            |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 0    | `docs(plans): bring the phase 4 pre-1 plan onto the build branch`         | `docs/plans/2026-10-25-p6-phase4-pre1-med-load-006-storm-fix.md`                                                                                    | exit 0, B0                          |
| 1    | `fix(load): add the storm timeout rule`                                   | `src/load/storm-timeout.ts tests/unit/storm-timeout.test.ts`                                                                                        | exit 0, **B0 + 3**                  |
| 2    | `fix(load): measure the medusa complete latency in the retry-storm setup` | `src/load/products/medusa.ts src/load/cases.ts k6/cases/med-load-006.js k6/cases/med-load-006.example.json tests/unit/load-cases-med-storm.test.ts` | exit 0, **B0 + 4**; `k6 inspect` ok |

Skeleton of step 1:

```ts
/** Quarter of the fastest measured complete latency, never above the old fixed 100 ms and never below 5 ms. */
export function stormTimeoutFor(minCompleteMs: number): number {
  if (!Number.isFinite(minCompleteMs) || minCompleteMs <= 0)
    throw new Error("TEST BUG: no complete latency measured");
  return Math.min(100, Math.max(5, Math.floor(minCompleteMs / 4)));
}
```

Step 2: `makeMedusaSetup` gets an option `stormProbe: { carts: 3 }`; for `P6-MED-LOAD-006` only, after the stock is made it completes three throwaway carts through the store API, records the `complete` times with `performance.now()`, and stores
`ctx.config.stormTimeoutMs = stormTimeoutFor(Math.min(...times))`. The case's stock sizing is unchanged; the probe adds 3 units to it (`stockFor` result + 3). The probe orders carry the case prefix and are cancelled by `medusaCleanup`
(sequential, 0.33 s each). `k6/cases/med-load-006.js`: `stormTimeoutMs: cfg.stormTimeoutMs ?? 100` in `buildPlan`; the example config gets `"stormTimeoutMs": 100`. `judgeStorm` and `STORM_SHARE` are not edited.

## 5. Tests (+4)

`storm-timeout` (3: a quarter of the minimum, rounded down; the clamp at 5 and at 100; non-positive or non-finite input throws); `load-cases-med-storm` (1: **regression test on the storm configuration** — `STORM_SHARE` is 0.5, `judgeStorm` still fails a
3-of-30 run, the case's setup writes `stormTimeoutMs`, the k6 script reads it, and the example config has the key). Count 3 + 1 = **4**. No existing test is edited.

## 6. CI cap table (G6): no step is added or changed

The change is code under `src/load` and `k6/cases`; `perf.yml` is untouched. The job that runs the case is `medusa-load` (timeout 45). Its existing capped steps and the measured durations (17 runs: 3 dispatch, 6 pull request, 8 push; jobs API):

| step name (as in YAML)                                                             | timeout-minutes                 | estimate (source)                                                                      | 80 % stop         | runs on this event? |
| ---------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- | ----------------- | ------------------- |
| LOAD journey P6-MED-LOAD-006 (complete retry storm, functional load, not capacity) | 4 on pull requests, 6 otherwise | 20 s on pull requests (max of 6), 43 s otherwise (max of 11); the probe adds about 3 s | 3.2 min / 4.8 min | all events          |
| LOAD journey P6-MED-LOAD-001 / -002                                                | 4 / 6                           | 21 s / 17 s on pull requests; 43 s / 39 s otherwise                                    | 3.2 min / 4.8 min | all events          |
| Install k6                                                                         | 2                               | 1 s                                                                                    | 96 s              | all events          |
| Pull Medusa images                                                                 | 6                               | 14 s                                                                                   | 4.8 min           | all events          |
| Token scan of the LOAD results                                                     | 2                               | 0 s                                                                                    | 96 s              | all events          |

Sum of the capped steps (script of PRE-2 §4): 22 on pull requests, 28 otherwise, job timeout 45, margin 23 / 17 (both at least 10). `medusa-load` also has 15 steps without a `timeout-minutes`, a finding for a later PR (PRE-2 §5 table), not changed here.

## 7. Done when

- [ ] `npm run check` exit 0 with B0 + 4 unit tests, including the regression test on the storm configuration.
- [ ] **10 consecutive full-profile runs reach the storm** (`judgeStorm` ok, `firstTimeouts / intents >= 0.5`): UNPROBED; measure in the fix PR's dispatches (`gh workflow run perf.yml --ref <branch>` is the owner's act; the PR's own CI adds the `pr`-profile runs). Report the 10 run ids and each share.
- [ ] `STORM_SHARE` and `judgeStorm` are byte-identical to `main` (`git diff origin/main -- src/load/retry-validity.ts` is empty).
- [ ] The measured `m` and the derived `stormTimeoutMs` of every run are in the run's `k6-config.json` (numbers only).

## 8. Risks

| ID  | Risk                                                             | Mitigation                                                                                                                                                                 |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The probe's `complete` is not representative (a cold first call) | take the minimum of three; the timeout is a quarter of it, so a slower real call still times out                                                                           |
| R2  | A very small timeout (5 ms) times out the final step too         | the final step keeps its own 30 s timeout (`finalTimeoutMs`)                                                                                                               |
| R3  | The hypothesis is wrong (fast non-`ok` replies)                  | the failing attempt's summary (§2 UNPROBED 1) decides before the PR is opened; if it shows fast errors, that is a different finding and the plan is revised, not the judge |
| R4  | The failing artefact expires                                     | read it by about 2026-11-08                                                                                                                                                |

## 9. Decisions (owner, 2026-10-25)

- **Order.** Decided (owner, 2026-10-25): PRE-1 is built first, before Task 1's PR, and merged before Task 3 — the case runs on every PR, and a red `perf.yml` run cannot enter a release.
- **Judge.** Decided (owner, 2026-10-25): `judgeStorm` and `STORM_SHARE` stay unchanged; a case that cannot reach the storm is fixed in the case, never in the judge.
- **Q1. Fix option.** Open (no owner answer recorded): recommended default option 1 (§3). Options: 1 measured timeout, 2 constant 25 ms, 3 higher rate (rejected), 4 server delay (rejected, hard stop).
