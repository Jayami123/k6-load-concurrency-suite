# P6 Phase 1 Task 8: Phase 1 closeout (plan only)

This is the implementation plan a weaker model will build from. Do not write code until Jayami
approves this document. Plan only: no build, no PR, and no run is started by this document.

Structure follows [2026-10-21-p6-phase1-task7-doc-races.md](2026-10-21-p6-phase1-task7-doc-races.md)
(Task 7) and [2026-10-20-p6-phase1-task5-cal-race-003.md](2026-10-20-p6-phase1-task5-cal-race-003.md).
Source: [2026-10-20-p6-phase1-roadmap.md](2026-10-20-p6-phase1-roadmap.md), "Task 8: Phase 1 closeout", and
decision D2.

## Context

- Repo: [Jayami123/k6-load-concurrency-suite](https://github.com/Jayami123/k6-load-concurrency-suite) (P6).
  Plan branch **`plan/2026-10-20-p6-phase1`**.
- The build ships in **two pull requests**:
  - **PR 1**, `ci(medusa): …`, from **`feat/2026-10-22-p6-phase1-closeout`** into `main`. It changes one
    step in `perf.yml`. Merging it triggers run A (a push to `main`). Then the build dispatches run B.
  - **PR 2**, `docs(readme): …`, from a **fresh branch** `docs/2026-10-2x-p6-phase1-results`, cut from the
    `main` that contains PR 1 (replace `2x` with the build day, 22 or later). It carries the README. The
    evidence lives in a GitHub Release (§9 step 9), not in the repo.
- Cases: **no new cases** (roadmap, Task 8). The six Phase 1 cases are evidenced from CI: `P6-MED-RACE-001`,
  `P6-CAL-RACE-001`, `P6-CAL-RACE-002` (histogram publication), `P6-CAL-RACE-003`, `P6-DOC-RACE-001`,
  `P6-DOC-RACE-002`.
- Harness `qa-portfolio-harness#v0.2.11`. Products are pinned in `perf.yml` (`MEDUSA_REF`, `CAL_REF`,
  `DOCUMENSO_REF`). Never edit the harness, the forks or `src/races/*` here.
- Probe status: **done on 2026-10-21 (UTC)**, from GitHub only (`gh` and the GitHub API). No cloud-VM number is
  used anywhere in this document (AGENTS.md).

## 1. Header

- Repo state at the probe: `main` = `0f8bf23` (PR #16). Plan branch = `69ff98e` (this plan).
- Workflow `perf` (`.github/workflows/perf.yml`, id 376454455), state **active**.
- Ruleset `Main` (id 25341555), enforcement **active**, target = default branch.
- The cron came in with **commit `411bfa1`** ("ci(cal): run cal races nightly with full trial counts", 20 Oct,
  merged as PR #13 at 19:26 Colombo time, 13:56 UTC). It did not come in with PR #1.
- Artefacts are kept **14 days** (`retention-days: 14`). Artefacts of runs before 22 Oct expire from
  **3 Nov 2026**. The build downloads any older artefact it cites before then (§9 step 8).
- Timings are CI job or step durations from the run data, or per-trial values computed from the histograms
  (`(finishedAt − startedAt) ÷ trials`). They are not VM numbers.

## 2. Probe findings (required; no guessed values)

### 2.1 Every `perf.yml` run on `main` since PR #12

Job durations are wall clock from the run data.

| Run                                                                                            | Event        | PR  | Head SHA  | medusa-smoke (trials) | cal-smoke        | documenso-smoke  | Cal cases          | Documenso cases            |
| ---------------------------------------------------------------------------------------------- | ------------ | --- | --------- | --------------------- | ---------------- | ---------------- | ------------------ | -------------------------- |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298) | push         | #12 | `98b1c82` | success, 2.8 min (3)  | success, 5.6 min | not in workflow  | self-test only     | not in workflow            |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push         | #13 | `c3183d2` | success, 2.2 min (3)  | success, 4.5 min | not in workflow  | 001 (50)           | not in workflow            |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push         | #14 | `6d73fd3` | success, 2.9 min (3)  | success, 4.2 min | not in workflow  | 001 (50), 003 (30) | not in workflow            |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push         | #15 | `3c6b7c6` | success, 2.6 min (3)  | success, 4.6 min | success, 5.1 min | 001 (50), 003 (30) | self-test only (3)         |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push         | #16 | `0f8bf23` | success, 2.7 min (3)  | success, 4.4 min | success, 5.5 min | 001 (50), 003 (30) | 001, 002 (50), control (5) |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | **schedule** | —   | `0f8bf23` | success, 2.2 min (3)  | success, 3.7 min | success, 4.8 min | 001 (50), 003 (30) | 001, 002 (50), control (5) |

- Every `main` run in the table is green in all of its jobs.
- **The nightly fired.** The cron (`17 2 * * *`, from `411bfa1`) has one scheduled slot so far: 21 Oct
  02:17 UTC (07:47 Colombo). The run for it, `39563393657`, was created at **07:38 UTC** and finished green. So
  the schedule works, but it ran about 5 hours 20 minutes late. Whether GitHub keeps to the slot time is
  checked after the 22 Oct slot (Open question 1). It is evidence, because it runs on `main`.
- `workflow_dispatch`: no run yet. Run B will be the first.
- Pull-request runs: 37 in total. The latest is [39558975663](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39558975663)
  (`ff07910`). Its jobs: cal-smoke 4.3 min, medusa-smoke 2.9 min, documenso-smoke 2.2 min.

### 2.2 Full-count status

"Full count" means the case ran at the D2 count on `main` (push, schedule or workflow_dispatch). Cal 001 runs
at 50, Cal 003 at its cap of 30, Documenso at 50 and its control at 5.

| Product                                      | Full-count `main` runs today                                        | Still at the old count            | Verdict                |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------- | ---------------------- |
| Cal `P6-CAL-RACE-001`                        | 39434721131, 39449102426, 39484324139, 39561220290, 39563393657 (5) | none                              | full count             |
| Cal `P6-CAL-RACE-003`                        | 39449102426, 39484324139, 39561220290, 39563393657 (4)              | none                              | full count (cap 30)    |
| Documenso `P6-DOC-RACE-001`, `-002`, control | 39561220290, 39563393657 (2)                                        | none                              | full count             |
| Medusa `P6-MED-RACE-001`                     | none                                                                | all 6 `main` runs (3 trials each) | **not full count yet** |

**Medusa is the only product still at the old count.** The Medusa step hard-codes `RACE_TRIALS: "3"` for
every event. So no run is yet full count for all three jobs. Runs A and B (PR 1) are the first.

### 2.3 Histograms

All values are read from the `race-histograms-*` artefacts (`gh run download`). "Verdict" is what the spec
wrote. `fail` on a product-bug case is the planned `test.fail()` path (the step stays green; §5.2 and §6).

**Cal `P6-CAL-RACE-001` (identical slot, N=20, 50 trials per run).** Every full-count run: 50 ACCEPTED
(1 per trial), 950 redacted 400, 0 unexpected, 0 leaks, verdict `pass`.

| Run         | Event    | Head      | Accepted per trial | Redacted 400 (of 1000) | Per-trial time (s) |
| ----------- | -------- | --------- | ------------------ | ---------------------- | ------------------ |
| 39434721131 | push     | `c3183d2` | 1 (50 of 50)       | 950                    | 1.035              |
| 39449102426 | push     | `6d73fd3` | 1 (50 of 50)       | 950                    | 0.761              |
| 39484324139 | push     | `3c6b7c6` | 1 (50 of 50)       | 950                    | 1.009              |
| 39561220290 | push     | `0f8bf23` | 1 (50 of 50)       | 950                    | 0.965              |
| 39563393657 | schedule | `0f8bf23` | 1 (50 of 50)       | 950                    | 0.647              |

Median per-trial time over these five: **0.965 s** (n = 5). All five are the same count (50), so one median is
valid here.

**Cal `P6-CAL-RACE-003` (overlap, 30 trials per run, `verdict: fail` = planned `test.fail()`).**

| Run         | Event    | Double-booked | Clean | Refused legs | Per-trial time (s) |
| ----------- | -------- | ------------- | ----- | ------------ | ------------------ |
| 39449102426 | push     | 28 of 30      | 2     | 2            | 0.302              |
| 39484324139 | push     | 29 of 30      | 1     | 1            | 0.353              |
| 39561220290 | push     | 29 of 30      | 1     | 1            | 0.345              |
| 39563393657 | schedule | 24 of 30      | 6     | 6            | 0.268              |

Pooled over the four full-count runs: **110 of 120 trials double-booked (91.7%)**, all with both legs ACCEPTED.
The 10 clean trials are exactly the 10 trials with a refused leg (the other leg won). Median per-trial time
over the four runs: **0.324 s** (n = 4).

**Documenso (full count, two runs; both run the three cases).**

| Run                    | Case              | Trials | Result                                                                               | Per-trial time (s) |
| ---------------------- | ----------------- | ------ | ------------------------------------------------------------------------------------ | ------------------ |
| 39561220290 (push)     | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed (2 SIGNED per trial); `verdict: fail` = planned `test.fail()` | 2.50               |
| 39561220290 (push)     | `P6-DOC-RACE-002` | 50     | 50 SIGNED + 450 ALREADY_SIGNED; 50 of 50 single-sealed; 0 4xx, 0 5xx; `pass`         | 1.44               |
| 39561220290 (push)     | control           | 5      | 5 of 5 single-sealed; `pass`                                                         | 2.66               |
| 39563393657 (schedule) | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed; `fail` (planned)                                             | 2.23               |
| 39563393657 (schedule) | `P6-DOC-RACE-002` | 50     | 50 of 50 single-sealed; 0 4xx, 0 5xx; `pass`                                         | 1.34               |
| 39563393657 (schedule) | control           | 5      | 5 of 5 single-sealed; `pass`                                                         | 2.58               |

Documenso timings have n = 2 today. A median is published once runs A and B add two more (n = 4).

The web logs of both Documenso runs have 0 lines matching the token patterns (`api_…`, `Bearer `, `sessionId`).

**Medusa `P6-MED-RACE-001` (oversell, stock S = 5). Two separate series.**

3-trial series (old count, six `main` runs):

| Run         | Event    | Head      | Accepted per trial | Oversell | Per-trial time (s) |
| ----------- | -------- | --------- | ------------------ | -------- | ------------------ |
| 39429276298 | push     | `98b1c82` | 5                  | 0        | 12.525             |
| 39434721131 | push     | `c3183d2` | 5                  | 0        | 10.388             |
| 39449102426 | push     | `6d73fd3` | 5                  | 0        | 16.512             |
| 39484324139 | push     | `3c6b7c6` | 5                  | 0        | 14.280             |
| 39561220290 | push     | `0f8bf23` | 5                  | 0        | 14.676             |
| 39563393657 | schedule | `0f8bf23` | 5                  | 0        | 9.771              |

**3-trial median per trial: 13.40 s (n = 6).** This is one series with one trial count, so one median is valid.

50-trial series: runs A and B only (§9). **Each run's value is shown on its own, labelled "50 trials".** No median
is taken across the two runs until a third full-count Medusa run exists (D39). The 400 rows are out-of-stock
refusals (`loserType: not_allowed`), which are expected. The four Medusa extras (`extra-mixed-qty`, `extra-s0-n5`,
`extra-s1-n2`, `extra-same-cart`) cap themselves at 3 trials in the spec (`Math.min(raceTrialsFromEnv(), 3)`,
Task 2 D15). They take about 0.5 min in total in each run.

### 2.4 Medusa 50-trial step against the job timeout (Task 2 §2.12)

Task 2 estimated about 10 minutes for 50 trials. The step timings say a little more:

- Full-count race loop: 50 × 13.40 s (3-trial median) = 670 s ≈ **11.2 min**. With extras and self-test, the
  step is about 11.7 min. Worst 3-trial sample (16.51 s): 50 × 16.51 s = 826 s ≈ 13.8 min.
- Medusa job: today 2.7 min, of which the 3-trial `P6-MED-RACE-001` is about 0.7 min. After PR 1 the expected
  job is 2.7 − 0.7 + 11.2 ≈ **13.2 min** (worst ≈ 15.7 min).
- `medusa-smoke` has `timeout-minutes: 45`. The expected 13–16 min fits with about 30 min to spare, so the job
  timeout is not the limit. **The limit is the per-test Playwright timeout.** The `P6-MED-RACE-001` test sat in a
  describe with a fixed 180 s timeout, and 50 trials at 13.4 s (670 s) would exceed it. The fix scales that timeout
  with the trial count (D42).
- **Unknown until run A:** the 50-trial Medusa spread and duration. The build records both.

### 2.5 R8: root cause of the redacted 400 on overlap pairs (confirmed at `CAL_REF`)

**Source.** Read on 21 Oct from the Cal fork at **`c2b7ac44c66f24ffef1662b276f0653988a609a3`** (`CAL_REF`, the
pin in `perf.yml` and `bootstrap.sh`). Read-only, shallow fetch of that one commit. The file is
`packages/features/bookings/lib/service/RegularBookingService.ts`:

- lines 1267–1268, in a fenced block:

```ts
const seed = `${organizerUser.username}:${dayjs(reqBody.start).utc().format()}:${Date.now()}`;
const uid = translator.fromUUID(uuidv5(seed, uuidv5.URL));
```

Supporting facts from the same commit:

- `packages/prisma/schema.prisma` line 853: `uid String @unique` on the `Booking` model.
- `apps/web/pages/api/book/event.ts` (the route P6 calls) runs this booking path.
- `dayjs(...).format()` with no argument uses the default format `YYYY-MM-DDTHH:mm:ssZ`, so it has **second**
  precision. (Checked against the default format; the pinned dayjs version was not read.)

**Mechanism.** Two requests for the same host, with the same start second, that run in the same millisecond
get the same seed and so the same `uid`. The second `INSERT` violates `Booking_uid_key`, and Prisma raises
`P2002`. Cal's `redactError` then returns the generic 400 "An error occurred while querying the database."
That is the same redaction as `P6-OBS-CAL-001`, with a different constraint.

**Evidence from the runs.** Ten refused legs in 120 overlap trials across the four full-count runs. Each refused
leg's first log line and its `P2002` line share a millisecond, within ±1 ms:

| Run                    | Refused legs | Constraint at the same ms | Offset            |
| ---------------------- | ------------ | ------------------------- | ----------------- |
| 39449102426 (push)     | 2            | `Booking_uid_key`         | 0 ms, 0 ms        |
| 39484324139 (push)     | 1            | `Booking_uid_key`         | 0 ms              |
| 39561220290 (push)     | 1            | `Booking_uid_key`         | 0 ms              |
| 39563393657 (schedule) | 6            | `Booking_uid_key`         | 0 ms ×4, −1 ms ×2 |

Across the four logs, the `P2002` lines are `Booking_idempotencyKey_key` (1,102 to 1,120 per run; the CAL-001
losers) and `Booking_uid_key` (5 to 28 per run; the CAL-003 refused legs, plus others not yet mapped). The Prisma
line carries no traceId, so the match is by timestamp. That is strong, and recorded as such, but it is not a
direct proof.

**Corrected summary (replaces the earlier one).** In an overlap pair, one leg is meant to be refused. The
refused leg is the **second** of two same-host, same-start requests that land in the same millisecond. Its
refusal is correct; the **defect is the status code and the cause**. The status is a redacted 400 instead of a
409, and the cause is a `uid` that is not collision-safe, because it is built from a second-precision start and
`Date.now()`. No double booking happens in those trials. So this is a wrong-status defect, not a valid booking
being refused. Severity **low**.

**Why it matters for the test.** Overlap pairs with the same start in the same millisecond are rare (10 of 120
trials here). The cause does not explain the 110 double-booked trials: those are a separate defect (`P6-OBS-CAL-002`).

**Upstream.** Also present on upstream `calcom/cal.com` `main` as of 2026-10-21: default-branch HEAD `0f19cc4`,
`RegularBookingService.ts` lines 1267–1268, and `Booking.uid @unique` at `schema.prisma` line 853. This was read the
same day with a read-only shallow clone of upstream.

### 2.6 Nightly schedule

- The cron was added by **`411bfa1`** (PR #13, merged 20 Oct 19:26 Colombo). Earlier notes that said "since PR #1"
  were wrong.
- The first slot after it was **21 Oct 02:17 UTC**. Its run, **`39563393657`**, was created at **07:38 UTC** and is
  green. So the nightly ran about 5 h 20 min late. GitHub documents that scheduled runs can be delayed, so this
  alone is not a fault.
- **Check after tonight's slot (22 Oct 02:17 UTC).** Whether that run starts on time is the only open question
  here. Until then, a late run still counts as nightly evidence.
- Run B is a dispatch regardless, so the closeout does not wait for the schedule.

### 2.7 Required checks (ruleset `Main`)

- Ruleset `Main` (id 25341555) has three rules: `deletion`, `non_fast_forward`, and `pull_request` (0 approvals,
  no code-owner review). It has **no `required_status_checks` rule**. Classic branch protection is not set.
- **Today nothing blocks a merge on CI.** A red `medusa-smoke`, `cal-smoke` or `documenso-smoke` can be merged.
- Green `main` history (job name = status context):

| Check             | Green `main` runs                                                            | Count | At least two? |
| ----------------- | ---------------------------------------------------------------------------- | ----- | ------------- |
| `medusa-smoke`    | 39429276298, 39434721131, 39449102426, 39484324139, 39561220290, 39563393657 | 6     | yes           |
| `cal-smoke`       | the same 6 runs                                                              | 6     | yes           |
| `documenso-smoke` | 39484324139, 39561220290, 39563393657                                        | 3     | yes           |

- All three have at least two green `main` runs, so Jayami adds them **now** (§5.3, D33).

### 2.8 Upstream issue drafts

Drafts for Jayami to file (P6 files nothing upstream). The filing status is unknown here, because the upstream
repos are not in this session's scope. Jayami tells the build which ones are filed (Open question 7).

| Finding                                        | Draft                             | Location                                                        |
| ---------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `P6-OBS-CAL-001` (400 for 409, redacted P2002) | Task 4 Appendix A                 | [task4](2026-10-20-p6-phase1-task4-cal-race-001.md) (line 1207) |
| `P6-OBS-CAL-002` (double booking, high)        | Task 5 Appendix A                 | [task5](2026-10-20-p6-phase1-task5-cal-race-003.md) (line 1297) |
| `P6-OBS-DOC-002` (double seal, medium)         | Task 7 Appendix A                 | [task7](2026-10-21-p6-phase1-task7-doc-races.md) (line 2127)    |
| `P6-OBS-CAL-003` (uid not collision-safe, low) | **Appendix B of this plan** (new) | this document                                                   |

### 2.9 What the probe did not confirm

- Whether the nightly starts on time from now on (§2.6, check after 22 Oct).
- Whether any upstream issue is filed (§2.8).
- The 50-trial Medusa duration and spread (only 3-trial data exists).

## 3. CI change (PR 1: `.github/workflows/perf.yml`, the Medusa race step only)

Only the Medusa race step changes. Nothing else changes unless a run proves a timeout (none is proven, §2.4). The
step name changes too, because "3 trials" would be wrong on `main`.

Current (verbatim from `main` at `0f8bf23`):

```yaml
# API-only Playwright project: no browser install needed (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD above).
# The race spec reads MEDUSA_BASE_URL and MEDUSA_DB_URL from the job env.
- name: Race self-test (medusa-race, 3 trials)
  if: ${{ steps.medusa_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  env:
    RACE_TRIALS: "3"
    RACE_MAX_SPREAD_MS: "20"
  run: |
    set -euo pipefail
    npm run race:medusa
```

New:

```yaml
# API-only Playwright project: no browser install needed (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD above).
# The race spec reads MEDUSA_BASE_URL and MEDUSA_DB_URL from the job env.
# Roadmap D2: 3 trials on PRs, the full 50 on main (push, schedule, workflow_dispatch). The extras cap
# themselves at 3 in the spec (Task 2 D15), so only P6-MED-RACE-001 follows this count.
- name: Race P6-MED-RACE-001 + extras (medusa-race)
  if: ${{ steps.medusa_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  env:
    RACE_TRIALS: ${{ github.event_name == 'pull_request' && '3' || '50' }}
    RACE_MAX_SPREAD_MS: "20"
  run: |
    set -euo pipefail
    echo "### P6-MED-RACE-001 trials: ${RACE_TRIALS}" | tee -a "$GITHUB_STEP_SUMMARY"
    npm run race:medusa
```

Why each line:

- The `RACE_TRIALS` expression is the one the Cal and Documenso steps already use. A `push` to `main`, a
  `schedule` and a `workflow_dispatch` all take `'50'`.
- The `echo` goes to `$GITHUB_STEP_SUMMARY` and, through `tee`, to the job log. The count shows on the run page and in the log.
- No step-level `timeout-minutes`: the job timeout (45) fits (§2.4).
- The job name `medusa-smoke`, `RACE_MAX_SPREAD_MS` and the upload step do not change, so the required-check name
  (§5.3) does not change.

## 4. CI time per event (three jobs)

Job wall clock from the run data. The PR row is run 39558975663. The `main` rows are run 39561220290 and the
estimate in §2.4.

| Event                                      | medusa-smoke              | cal-smoke | documenso-smoke | Sum of job minutes    | Longest job (wall) |
| ------------------------------------------ | ------------------------- | --------- | --------------- | --------------------- | ------------------ |
| PR push, now (39558975663)                 | 2.9                       | 4.3       | 2.2             | 9.4                   | 4.3                |
| PR push, after PR 1                        | 2.9 (unchanged, 3 trials) | 4.3       | 2.2             | 9.4                   | 4.3                |
| `main` push, now (39561220290)             | 2.7                       | 4.4       | 5.5             | 12.6                  | 5.5                |
| `main` push, after PR 1 (estimate)         | **13.2** (worst 15.7)     | 4.4       | 5.5             | **23.1** (worst 25.6) | 13.2               |
| schedule, after PR 1 (estimate)            | 13.2 (worst 15.7)         | 3.7       | 4.8             | 21.7 (worst 24.2)     | 13.2               |
| `workflow_dispatch`, after PR 1 (estimate) | 13.2 (worst 15.7)         | 4.4       | 5.5             | 23.1 (worst 25.6)     | 13.2               |

- This repo is public, so these runs use GitHub's standard hosted runners at no cost (Jayami, Q8). The table is
  kept for **time**, not for money: the closeout's full-count runs take about 13 minutes of Medusa wall clock.
- PR runs do not change (Medusa stays at 3).

## 5. Open items this task closes or carries

### 5.1 Rerun-on-high-spread (the Medusa spread guard): closed, carried to Phase 2

- The item: "rerun a trial when its dispatch spread is high". Named out of scope in Task 5 and Task 7.
- The data says the guard is not needed. Max dispatch spread per case, across all `main` runs (`dispatchSpreadMs`):

| Case                          | Runs | Max spread (ms) | Limit (`RACE_MAX_SPREAD_MS`) |
| ----------------------------- | ---- | --------------- | ---------------------------- |
| `P6-MED-RACE-001` (3 trials)  | 6    | 2.8             | 20                           |
| `P6-CAL-RACE-001` (50 trials) | 5    | 7.6             | 20                           |
| `P6-CAL-RACE-003` (30 trials) | 4    | 1.6             | 20                           |
| `P6-DOC-RACE-001` (50 trials) | 2    | 0.5             | 20                           |
| `P6-DOC-RACE-002` (50 trials) | 2    | 0.7             | 20                           |

- **Decision D35:** closed as carried to the Phase 2 backlog, **not built**. A retry on a spread failure would be
  a retry to make a test pass, which the race rules forbid (Task 1: "Do not `test.fail()`, retries, or sleeps to
  'make it pass'"). The spread assertion stays a hard fail. The 50-trial Medusa spread is recorded in the
  README from runs A and B. If it exceeds about 10 ms, the item reopens.

### 5.2 R8 becomes `P6-OBS-CAL-003`, severity low, no test

- **Finding `P6-OBS-CAL-003`, severity low.** Summary: the booking `uid` is built from the host username, the
  start second and `Date.now()`, so two same-host, same-start requests in the same millisecond collide on
  `Booking_uid_key`. The loser gets Cal's redacted 400 instead of a 409. No double booking results.
- Why low: a wrong status code and a rare collision (10 of 120 overlap trials). Not a double booking. The
  double-booking defect is `P6-OBS-CAL-002`, which is high.
- Why a new ID, not a sub-bullet of `-001`: the constraint (`uid`, not the idempotency key) and the code cause
  differ.
- **Test: none, and no `test.fail()` for now** (Jayami, Q2). The count stays visible in `P6-CAL-RACE-003` as
  `loser_refused-db-error`, and the README describes it.
- **Upstream draft:** Appendix B. The code read in §2.5 confirms the cause at `CAL_REF`. Jayami files it.

### 5.3 Required checks: add all three now, by hand

Each check has at least two green `main` runs (§2.7), so Jayami adds them now, before PR 1 is opened. The steps:

1. GitHub, repository `Jayami123/k6-load-concurrency-suite` → **Settings** → **Rules** → **Rulesets** → **Main** →
   **Edit**.
2. Under **Rules**, click **Add rule** → **Require status checks to pass**.
3. Leave **Require branches to be up to date before merging** **off** (not asked for; it would make every PR
   re-run CI).
4. Search for and add each of these three checks, exactly: `medusa-smoke`, `cal-smoke`, `documenso-smoke`.
5. **Save changes**.

The same rule as JSON (the API equivalent, if Jayami prefers `gh api`):

```json
{
  "type": "required_status_checks",
  "parameters": {
    "required_status_checks": [
      { "context": "medusa-smoke" },
      { "context": "cal-smoke" },
      { "context": "documenso-smoke" }
    ],
    "strict_required_status_checks_policy": false,
    "do_not_enforce_on_create": false
  }
}
```

Check after saving (read-only; the build runs it):

```bash
gh api repos/Jayami123/k6-load-concurrency-suite/rulesets/25341555 \
  --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
```

Expected output (three lines):

```
medusa-smoke
cal-smoke
documenso-smoke
```

Once this is on, PR 1 cannot merge until its three jobs are green. PR 1 runs all three on its own head, so it can
satisfy the rule.

### 5.4 Upstream drafts and the new ID

- The three drafts (§2.8) and the new draft in Appendix B are for Jayami to file. The build does not check
  filing status.
- Jayami sends the build the URLs of any that are filed (Open question 7). The README then links them.

### 5.5 Phase 2 backlog carried from Task 8

Recorded here so it is not lost. Not built in Task 8.

1. **`P6-OBS-DOC-001` CI test.** Add a Documenso test that asserts a wrong password and a wrong CSRF token on
   sign-in return **401**, not 500, marked with `test.fail()` while the 500 persists. This turns the README-only
   finding into CI evidence, the same way the other bugs are recorded. (New test: Phase 2, not Task 8.)
2. **Rerun-on-high-spread.** Closed as carried (§5.1). Reopens if the 50-trial Medusa spread exceeds about 10 ms.
3. **`P6-OBS-CAL-003` test.** Only after the upstream `uid` fix ships: a same-start, same-millisecond pair that
   expects one 2xx and one 409, with `test.fail()` while the 400 persists. Not before (Jayami, Q2).

## 6. Known product bugs (the table the README carries)

| ID               | Severity             | Summary                                                                                                                                                               | Test (how it is recorded)                                                                                 | Evidence (run and artefact)                                                                                                                                                                 |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-CAL-001` | low (agreed)         | Concurrent identical-slot losers get a 400 "An error occurred while querying the database." (Prisma `P2002` on `Booking_idempotencyKey_key`, redacted) instead of 409 | `tests/cal/races/cal-race-001-identical-slot.spec.ts`: `test.fail()` on the loser-contract extra          | 39561220290 `race-histograms-cal`: `P6-CAL-RACE-001.json` (950 redacted 400 per 1000) and **`extra-loser-contract.json`** (the `test.fail()` test's own evidence: 57 redacted 400 per 60)   |
| `P6-OBS-CAL-002` | **high** (confirmed) | Two overlapping bookings on one host are both ACCEPTED                                                                                                                | `tests/cal/races/cal-race-003-overlap.spec.ts`: `test.fail()`                                             | 39561220290 and 39563393657 `race-histograms-cal`: `P6-CAL-RACE-003.json` (29 of 30, and 24 of 30, double-booked)                                                                           |
| `P6-OBS-CAL-003` | low                  | A same-start, same-millisecond pair collides on `Booking_uid_key`; the loser gets the redacted 400 instead of 409                                                     | none (no `test.fail()`, Jayami Q2); counted as `loser_refused-db-error` in `P6-CAL-RACE-003`              | 39449102426, 39484324139, 39561220290, 39563393657: `cal-web-log` (the `P2002` line) and `P6-CAL-RACE-003.json` (`refusedTraceIds`); code at `CAL_REF` `RegularBookingService.ts:1267–1268` |
| `P6-OBS-DOC-001` | low                  | A wrong password or CSRF token on sign-in returns 500                                                                                                                 | none in CI. README states the evidence as "probe + code path" (Task 6 §2.11). Phase 2 backlog §5.5 item 1 | Probe + code path. **No CI artefact** (stated plainly)                                                                                                                                      |
| `P6-OBS-DOC-002` | medium (approved)    | Two last recipients complete in parallel: double seal                                                                                                                 | `tests/documenso/races/doc-race-001-last-recipients.spec.ts`: `test.fail()`                               | 39561220290 and 39563393657 `race-histograms-documenso`: `P6-DOC-RACE-001.json` (50 of 50 double-sealed in each)                                                                            |

Notes:

- `test.fail()` is used only where a product bug is proven with repeated evidence (roadmap rule). The full-count CI
  evidence is: `-001` 5 runs, `-003` 4 runs, `DOC-002` 2 runs. For `-003` there is no `test.fail()` (§5.2).
- Each `test.fail()` line is already in place. This task changes none of them (§11).

## 7. README text (verbatim; placeholders are marked `{{…}}`)

PR 2 replaces the sections below. Every `{{…}}` is a value that does not exist yet: the run ids of runs A and B,
their numbers, and the medians that need them. Nothing else is a placeholder.

**Wording rule (used in every section):** the README says "`main` (push, schedule or `workflow_dispatch`)". It
does not say "main or nightly", because run B is a manual dispatch.

### 7.1 Intro (replaces the first paragraph after the title)

```markdown
P6 of the QA portfolio: load, concurrency and performance tests with [k6](https://grafana.com/docs/k6/)
against self-hosted products started by
[qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `v0.2.11`.

Phase 0 proved the harness and k6 smoke. Phase 1 is done: the race framework and the six race cases for
Medusa, Cal and Documenso (see "Phase 1 results" below). Every published number comes from a GitHub Actions run
on `main` (push, schedule or `workflow_dispatch`).
```

### 7.2 New section, placed before "## Rule for numbers"

```markdown
## Phase 1 results

Every number here comes from a GitHub Actions run on `main` (push, schedule or `workflow_dispatch`). No number
comes from a cloud VM or a laptop. A timing is a median of at least 3 runs **with the same trial count**; timings
at different trial counts are shown as separate series, never pooled.

Each run links to its run page. The histograms of each run are in the
[`p6-phase1` release](https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase1) as one zip per
run (`p6-<run-id>-evidence.zip`). The release does not expire; the Actions artefacts do (14 days).

Closeout runs (the two runs that hold all three product jobs at full count):
[{{RUN_A}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_A}}) (push to `main`,
`{{SHA_A}}`) and [{{RUN_B}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_B}})
(`workflow_dispatch` on `main`, `{{SHA_B}}`).

### Medusa oversell (`P6-MED-RACE-001`)

Stock S = 5. Pull requests run 3 trials. `main` (push, schedule or `workflow_dispatch`) runs 50. The extras run
3 trials in every event.

**3-trial series (before the count change):**

| Run                                                                                            | Event    | Trials | Accepted per trial | Oversell | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ------ | ------------------ | -------- | ------------------ |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298) | push     | 3      | 5                  | 0        | 12.53              |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push     | 3      | 5                  | 0        | 10.39              |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 3      | 5                  | 0        | 16.51              |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 3      | 5                  | 0        | 14.28              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 3      | 5                  | 0        | 14.68              |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 3      | 5                  | 0        | 9.77               |

3-trial median per trial: **13.40 s** (n = 6 runs, 3 trials each).

**50-trial series (the closeout runs; each run shown on its own):**

| Run                                                                                        | Event    | Trials | Accepted per trial | Oversell           | Per-trial time (s)  |
| ------------------------------------------------------------------------------------------ | -------- | ------ | ------------------ | ------------------ | ------------------- |
| [{{RUN_A}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_A}}) | push     | 50     | {{MED_A_ACCEPTED}} | {{MED_A_OVERSELL}} | {{MED_A_PER_TRIAL}} |
| [{{RUN_B}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_B}}) | dispatch | 50     | {{MED_B_ACCEPTED}} | {{MED_B_OVERSELL}} | {{MED_B_PER_TRIAL}} |

A median of the 50-trial series is not published: it has 2 runs, and the rule needs 3. The 400 rows are
out-of-stock refusals (`not_allowed`), which are expected.

### Cal identical slot (`P6-CAL-RACE-001`)

Pull requests run 5 trials. `main` runs 50. Per trial: 1 ACCEPTED, the rest refused.

| Run                                                                                            | Event    | Trials | Accepted per trial | Redacted 400 (of 1000 requests) | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ------ | ------------------ | ------------------------------- | ------------------ |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push     | 50     | 1                  | 950                             | 1.035              |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 50     | 1                  | 950                             | 0.761              |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 50     | 1                  | 950                             | 1.009              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 50     | 1                  | 950                             | 0.965              |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 50     | 1                  | 950                             | 0.647              |
| [{{RUN_A}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_A}})     | push     | 50     | 1                  | 950                             | {{CAL1_A}}         |
| [{{RUN_B}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_B}})     | dispatch | 50     | 1                  | 950                             | {{CAL1_B}}         |

Median per-trial time (50 trials, all runs): {{CAL1_MEDIAN}} s (n = {{CAL1_N}}). The 950 redacted 400s per run are
`P6-OBS-CAL-001` (see Known product bugs).

### Cal overlap (`P6-CAL-RACE-003`)

Pull requests run 5 trials. `main` runs 30 (the case cap). A double-booked trial has both legs ACCEPTED on
overlapping windows. A refused leg is counted in its trial, and that trial is clean.

| Run                                                                                            | Event    | Trials | Double-booked   | Clean          | Refused legs     | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ------ | --------------- | -------------- | ---------------- | ------------------ |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 30     | 28              | 2              | 2                | 0.302              |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 30     | 29              | 1              | 1                | 0.353              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 30     | 29              | 1              | 1                | 0.345              |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 30     | 24              | 6              | 6                | 0.268              |
| [{{RUN_A}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_A}})     | push     | 30     | {{C3_A_DOUBLE}} | {{C3_A_CLEAN}} | {{C3_A_REFUSED}} | {{C3_A_PER_TRIAL}} |
| [{{RUN_B}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_B}})     | dispatch | 30     | {{C3_B_DOUBLE}} | {{C3_B_CLEAN}} | {{C3_B_REFUSED}} | {{C3_B_PER_TRIAL}} |

Pooled over all runs: {{C3_POOLED_DOUBLE}} of {{C3_POOLED_TOTAL}} trials double-booked (today: 110 of 120, 91.7%).
Median per-trial time (30 trials, all runs): {{C3_MEDIAN}} s (n = {{C3_N}}). `P6-OBS-CAL-002` is the product bug
(high). The refused legs are `P6-OBS-CAL-003` (low).

### Cal histogram publication (`P6-CAL-RACE-002`)

`P6-CAL-RACE-002` (histogram publication) is evidenced by the `race-histograms-cal` artefact of every cited `main`
run, which holds `P6-CAL-RACE-001.json` and `P6-CAL-RACE-003.json`, and by the same two files in the `p6-phase1`
release zips. This subsection adds no numbers; the Cal numbers are in the sections above.

### Documenso completion races (`P6-DOC-RACE-001`, `P6-DOC-RACE-002`, control)

Pull requests run 5 trials. `main` runs 50, and the control 5.

| Run                                                                                            | Event    | Case              | Trials | Result                                                     | Per-trial time (s)   |
| ---------------------------------------------------------------------------------------------- | -------- | ----------------- | ------ | ---------------------------------------------------------- | -------------------- |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed (`P6-OBS-DOC-002`)                  | 2.50                 |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | `P6-DOC-RACE-002` | 50     | 50 of 50 single seal; 50 SIGNED, 450 ALREADY_SIGNED; 0 5xx | 1.44                 |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | control           | 5      | 5 of 5 single seal                                         | 2.66                 |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed (`P6-OBS-DOC-002`)                  | 2.23                 |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | `P6-DOC-RACE-002` | 50     | 50 of 50 single seal; 0 5xx                                | 1.34                 |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | control           | 5      | 5 of 5 single seal                                         | 2.58                 |
| [{{RUN_A}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_A}})     | push     | `P6-DOC-RACE-001` | 50     | {{DOC1_A}}                                                 | {{DOC1_A_PER_TRIAL}} |
| [{{RUN_A}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_A}})     | push     | `P6-DOC-RACE-002` | 50     | {{DOC2_A}}                                                 | {{DOC2_A_PER_TRIAL}} |
| [{{RUN_A}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_A}})     | push     | control           | 5      | {{DOCC_A}}                                                 | {{DOCC_A_PER_TRIAL}} |
| [{{RUN_B}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_B}})     | dispatch | `P6-DOC-RACE-001` | 50     | {{DOC1_B}}                                                 | {{DOC1_B_PER_TRIAL}} |
| [{{RUN_B}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_B}})     | dispatch | `P6-DOC-RACE-002` | 50     | {{DOC2_B}}                                                 | {{DOC2_B_PER_TRIAL}} |
| [{{RUN_B}}](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/{{RUN_B}})     | dispatch | control           | 5      | {{DOCC_B}}                                                 | {{DOCC_B_PER_TRIAL}} |

Per-trial medians (n = {{DOC_N}} runs at 50 trials): {{DOC_MEDIANS}}. Published only once n ≥ 3, which the closeout gives.

### Known product bugs

Each bug is recorded in CI by the test named below, with the run that shows it. A `test.fail()` line turns red
("expected to fail but passed") once the bug is fixed, and is then removed.

| ID               | Severity | What happens                                                                                                                                                                      | Test                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P6-OBS-CAL-001` | low      | Concurrent identical-slot losers get 400 "An error occurred while querying the database." (Prisma `P2002` on the idempotency key, redacted) instead of 409                        | `cal-race-001-identical-slot.spec.ts`: `test.fail()` on the loser contract | [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) `race-histograms-cal`: `P6-CAL-RACE-001.json` and `extra-loser-contract.json`                                                                                                                                                                                                         |
| `P6-OBS-CAL-002` | high     | Two overlapping bookings on one host are both ACCEPTED                                                                                                                            | `cal-race-003-overlap.spec.ts`: `test.fail()`                              | [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) `race-histograms-cal`: `P6-CAL-RACE-003.json`                                                                                                                                                                                                                                         |
| `P6-OBS-CAL-003` | low      | A same-host, same-start request pair in the same millisecond collides on the booking `uid` (`Booking_uid_key`); the loser gets the redacted 400 instead of 409. No double booking | none (no `test.fail()`)                                                    | [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) `cal-web-log` and `P6-CAL-RACE-003.json` (`refusedTraceIds`); code: [`RegularBookingService.ts` L1267–1268 at `c2b7ac44`](https://github.com/Jayami123/cal/blob/c2b7ac44c66f24ffef1662b276f0653988a609a3/packages/features/bookings/lib/service/RegularBookingService.ts#L1267-L1268) |
| `P6-OBS-DOC-001` | low      | A wrong password or CSRF token on sign-in returns 500                                                                                                                             | none in CI yet (Phase 2 backlog)                                           | **Probe + code path.** Not a CI artefact. The Task 6 probe is the evidence until the Phase 2 CI test lands                                                                                                                                                                                                                                                                           |
| `P6-OBS-DOC-002` | medium   | Two last recipients complete in parallel: double seal                                                                                                                             | `doc-race-001-last-recipients.spec.ts`: `test.fail()`                      | [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) `race-histograms-documenso`: `P6-DOC-RACE-001.json`                                                                                                                                                                                                                                   |

### Phase 1 status

Phase 1 of the master plan is **done**. The six cases are evidenced from `main` runs: `P6-MED-RACE-001`,
`P6-CAL-RACE-001`, `P6-CAL-RACE-002`, `P6-CAL-RACE-003`, `P6-DOC-RACE-001`, `P6-DOC-RACE-002`. Closeout runs:
{{RUN_A}} and {{RUN_B}}. Open product bugs: the five above.
```

### 7.3 Medusa section (add one line under "### Medusa oversell histogram", after the existing bullets)

```markdown
- Trial count: pull requests run 3 trials; `main` (push, schedule or `workflow_dispatch`) runs 50. The extras run 3.
```

The Cal and Documenso sections already state their trial counts, so they need no change.

## 8. Environment

**Cursor cloud** (`.cursor/environment.json`, `AGENTS.md`).

- Automatic from the repo: npm packages are installed, and `scripts/bootstrap.sh medusa` clones the Medusa fork.
  Docker is started by the environment's `start` command.
- Before any harness command, the shell exports `PATH="/usr/local/bin:$PATH"` (Cursor puts its own Node 22.14
  first; Medusa needs Node 22.23).
- Pasted by hand: **nothing.**

**Claude Code cloud** (`.claude/hooks/session-start.sh`, `AGENTS.md`).

- Automatic from the repo: the session-start hook starts Docker and puts `/usr/local/bin` (Node 22.23) first on
  PATH through `$CLAUDE_ENV_FILE`. The environment's setup script installs the tools.
- Documenso needs Node 24. `npm run up:documenso` and `bootstrap.sh documenso` pick `/opt/node24` themselves.
- Pasted by hand: **nothing** for the build. A `gh` login warning (`GH_TOKEN`) appeared during the probe, but every
  `gh` read succeeded. If a later `gh` call fails, report it and check the GitHub access settings. Do not paste a
  token into the chat.

Neither environment needs a secret for this task. The ruleset change (§5.3) is done in the GitHub UI by Jayami.

## 9. Build steps (for the weaker model; in order)

Rules for the whole build: never `git add -A`; never print a token; never edit a product fork, the harness
package, or a `test.fail()` line. Stop and report on any output that differs from the expected output. Use
`S="$(mktemp -d)"` for scratch files; never the repo, and never `$HOME`.

### PR 1: `ci(medusa): …`

**Step 0. Branch and the plan doc.**

```bash
export PATH="/usr/local/bin:$PATH"
git fetch origin main plan/2026-10-20-p6-phase1
git checkout -B feat/2026-10-22-p6-phase1-closeout origin/main
git checkout origin/plan/2026-10-20-p6-phase1 -- docs/plans/2026-10-21-p6-phase1-task8-closeout.md
git status --short
```

Expected: `A  docs/plans/2026-10-21-p6-phase1-task8-closeout.md` and nothing else.

**Step 1. Baseline.**

```bash
npm ci
npm run check
```

Expected: Prettier clean, typecheck clean, `k6 inspect: 4 script(s) ok.`, unit tests `# fail 0`.

**Step 2. Edit the Medusa race step in `.github/workflows/perf.yml`.** Replace the block in §3 "Current" with the
block in §3 "New". Change nothing else. Then:

```bash
git diff --stat
npx prettier --check .github/workflows/perf.yml
```

Expected: `1 file changed`, about 9 changed lines, and `All matched files use Prettier code style!`. Check by eye
that the new step is indented 6 spaces, like the Cal race steps.

**Step 3. Local check.** `npm run check`. Expected: the same as step 1. Do not push on any other result.

**Step 4. Commit, push, open PR 1.**

```bash
git add .github/workflows/perf.yml docs/plans/2026-10-21-p6-phase1-task8-closeout.md
git commit -m "ci(medusa): run the 50-trial race on main, schedule and manual runs; 3 on PRs"
git push -u origin feat/2026-10-22-p6-phase1-closeout
```

No trailers on the commit (the rule for this task). Retry a push up to 4 times, with 2 s, 4 s, 8 s and 16 s
backoff, only on network errors.

Open PR 1 into `main` with the title `ci(medusa): run the 50-trial race on main, schedule and manual runs; 3 on PRs`.
If the repo has a PR template (`.github/pull_request_template.md`), follow its headings. The body states: the one
step changed (§3), the trial counts per event, and that run A and run B are the closeout runs. Expected: the three
jobs (`medusa-smoke`, `cal-smoke`, `documenso-smoke`) all run on the PR and go green (they are required, §5.3).

**Step 5. Jayami merges PR 1.** The build waits here. Merging creates run A on `main` automatically. Run A's count is
checked against its log and its histogram in step 6, once run A has finished.

### Closeout runs A and B

**Step 6. Run A (automatic, from the merge).**

```bash
gh run list -R Jayami123/k6-load-concurrency-suite --workflow perf.yml --branch main --limit 3 \
  --json databaseId,headSha,event,status,conclusion
```

Expected: a `push` run whose `headSha` is the merge commit. Wait for it to finish:
`gh run watch <RUN_A> -R Jayami123/k6-load-concurrency-suite --exit-status`. Expected: exit 0.
Record `{{RUN_A}}` and `{{SHA_A}}`.

Check the count:

```bash
gh run view {{RUN_A}} -R Jayami123/k6-load-concurrency-suite --log | grep "P6-MED-RACE-001 trials"
```

Expected: `P6-MED-RACE-001 trials: 50`. Any other value: stop and report.

Confirm the same count from the histogram, not only from the log. The histogram's `trials` field must be 50:

```bash
S="$(mktemp -d)"
gh run download {{RUN_A}} -R Jayami123/k6-load-concurrency-suite -n race-histograms-medusa -D "$S"
node -p "require('$S/P6-MED-RACE-001.json').trials"
```

Expected: `50`. Any other value: stop and report.

**Step 7. Run B (dispatch, after run A is green).**

```bash
gh workflow run perf.yml -R Jayami123/k6-load-concurrency-suite --ref main
```

Find it with the same `gh run list` command (the `event` is `workflow_dispatch`), then watch it to exit 0 and run
the same grep. Record `{{RUN_B}}` and `{{SHA_B}}`. Run B is always a dispatch: a scheduled run never stands in for
it, even one that is green at full count.

**Step 8. Download, token-scan and check R8.**

```bash
S="$(mktemp -d)"
for r in {{RUN_A}} {{RUN_B}} 39563393657 39561220290 39484324139 39449102426 39434721131 39429276298; do
  mkdir -p "$S/$r"
  gh run download "$r" -R Jayami123/k6-load-concurrency-suite -D "$S/$r"
done
find "$S" -type f | sort
```

Expected: for each run, the `race-histograms-*` folders and `k6-summary-*`; `cal-web-log/` for every run with
`P6-CAL-RACE-003`; `documenso-web-log/` for the two Documenso runs. Runs `39429276298`–`39484324139` expire on
**3 Nov 2026**. Download them now, as this step does, and do not rely on them after that date.

Token scan over every file that goes into a zip (every `*.json` and `*.log` under each run folder, the same
set step 9 zips). Expected output: nothing. Any printed line (a file with a non-zero count) is a stop:

```bash
for r in "$S"/*/; do
  grep -rcE 'api_[A-Za-z0-9]{8,}|Bearer |sessionId' "$r" --include='*.json' --include='*.log' | grep -v ':0$' || true
done
```

**R8 check at `CAL_REF` (read-only).** This re-confirms §2.5 before the upstream draft (Appendix B) is filed:

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --no-checkout --filter=blob:none https://github.com/Jayami123/cal "$S/cal"
git -C "$S/cal" fetch --depth 1 origin "$(grep -oE 'CAL_REF: [0-9a-f]{40}' .github/workflows/perf.yml | awk '{print $2}')"
git -C "$S/cal" checkout -q FETCH_HEAD
git -C "$S/cal" rev-parse HEAD
grep -nE 'const seed = .*Date\.now\(\)|const uid = translator\.fromUUID\(uuidv5' "$S/cal/packages/features/bookings/lib/service/RegularBookingService.ts"
grep -nE '^\s+uid\s+String\s+@unique' "$S/cal/packages/prisma/schema.prisma"
```

Expected: the `rev-parse` line equals `CAL_REF` (`c2b7ac44…`); the grep prints lines 1267 and 1268 (the seed and
the uid); the schema grep prints line 853. Any other result: stop and report (the pin or the code has changed).

Then map each refused leg to its constraint (Appendix A, `refused.cjs`):

```bash
node "$S/refused.cjs" "$S/{{RUN_A}}/race-histograms-cal/P6-CAL-RACE-003.json" "$S/{{RUN_A}}/cal-web-log/cal-web.log"
node "$S/refused.cjs" "$S/{{RUN_B}}/race-histograms-cal/P6-CAL-RACE-003.json" "$S/{{RUN_B}}/cal-web-log/cal-web.log"
```

Expected: one line per refused leg, `Booking_uid_key` within ±1 ms (as in §2.5). Any other constraint, or
`NOT FOUND`: stop and report it. Do not add an ID by guessing.

**Step 9. Evidence release (not in the repo).** After the token scan (step 8) is clean, first check that the
release does not exist yet:

```bash
gh release view p6-phase1 -R Jayami123/k6-load-concurrency-suite
```

Expected: an error that the release is not found (non-zero exit). If the command prints a release, **stop and
report it. Never delete or overwrite an existing release.**

Then zip and create the release:

```bash
for r in 39429276298 39434721131 39449102426 39484324139 39561220290 39563393657 {{RUN_A}} {{RUN_B}}; do
  (cd "$S/$r" && zip -rq "$S/p6-$r-evidence.zip" . -i '*.json' '*.log')
done
gh release create p6-phase1 -R Jayami123/k6-load-concurrency-suite --target {{SHA_A}} \
  --title "P6 Phase 1 evidence (CI)" --notes "Histograms and Cal web logs of the CI runs cited in the README. One zip per run." \
  "$S"/p6-*-evidence.zip
```

Expected: the release URL on stdout. The `-i` filter keeps only `*.json` and `*.log` files. The k6 summary JSON
(`k6-summary-*`) matches `*.json`, so it is kept too; that is intended. Every file kept is one the step 8 scan read.

The release is public and is created on purpose, because it is the evidence store (Jayami, Q4). Create it once.

**Step 10. Timings and summaries.** Run the summary script (Appendix A, `summ.cjs`) on the histograms of runs A and B,
and compute the medians named in §7 (the Cal 001 and 003 medians over all runs at that count, the Medusa 3-trial
median over its 6 runs, and the Documenso medians over the 4 runs at 50 trials, once A and B add their values).
Write each value down with its trial count. Do not pool the 3-trial and 50-trial Medusa values (D39).

### PR 2: the README and the results (`docs/...`)

**Step 11. Fresh branch from the new `main`.** Only after PR 1 is merged:

```bash
git fetch origin main
git checkout -B docs/2026-10-2x-p6-phase1-results origin/main
```

Replace `2x` with the build day (22 or later). The branch is new; it does not reuse the PR 1 branch.

**Step 12. Edit `README.md`.** Apply §7.1, §7.2 and §7.3 with every `{{…}}` replaced by a value from step 10.

```bash
npm run format:check
grep -n '{{' README.md || echo "no placeholders left"
```

Expected: Prettier clean and `no placeholders left`. A line printed by `grep` means a value is missing: stop.

**Step 13. Commit, push, open PR 2.**

```bash
npm run check
git add README.md
git commit -m "docs(readme): add phase 1 results from main runs and mark phase 1 done"
git push -u origin docs/2026-10-2x-p6-phase1-results
```

Open PR 2 into `main` (title: `docs(readme): add phase 1 results from main runs and mark phase 1 done`).

**Step 14. Jayami merges PR 2.** Then check the Done-when list (§10) and report run ids, conclusions, the Medusa
trial line, the medians, the R8 output, and the release URL.

## 10. Done when, and what the build waits for

**Done when** (all of these):

1. PR 1 is merged. Run A (push) and run B (dispatch) are green in all three jobs at full count: Medusa 50, Cal 50
   and 30, Documenso 50 and control 5.
2. The `p6-phase1` release holds one zip per cited run, and each closeout zip contains its `race-histograms-*`
   JSON. The Cal zips contain `cal-web.log`.
3. The README cites only `main` runs (push, schedule or `workflow_dispatch`). Every run it cites is one of those in
   §2.1 or runs A and B. There is no PR run and no VM number.
4. Every open product bug has its evidence linked (§7 "Known product bugs"). `P6-OBS-DOC-001` is stated as "probe +
   code path", with its Phase 2 test in the backlog (§5.5).
5. `npm run check` is green on PR 2's branch.
6. The three required checks are in the `Main` ruleset (§5.3), set by Jayami.

**The build waits for:**

- Jayami to add the three required checks (§5.3), before PR 1 is opened.
- Jayami to merge PR 1. Run A starts automatically from that merge.
- Run A to finish green. Only then the build dispatches run B.
- Jayami to merge PR 2 (the README). Then the Phase 1 status is done.
- Jayami's answer on which upstream issues are filed (Q7), so the README can link them. Until then the README
  says the issues are drafted, not filed.

**How the build fills the placeholders:** run A's id and SHA go into `{{RUN_A}}` and `{{SHA_A}}`, and run B's into
`{{RUN_B}}` and `{{SHA_B}}`. The per-run values come from step 10. The medians come from step 10 and name their trial
counts. Run `39561220290` and the nightly `39563393657` keep their own links and need no placeholder. Where a value
is still missing, leave the placeholder and stop. Do not write a guess.

## 11. Rules

- **No product fork and no harness package is edited.** This task changes `perf.yml` (one step),
  `tests/medusa/races/med-race-001-oversell.spec.ts` (describe timeouts only, D42), `README.md`, and this plan doc. The evidence goes in a release, not a commit.
- **No secret or token anywhere**: not in the README, the plan, a commit, a release, a log or the chat. The probe
  read the run API only. Signed artefact download links are temporary and are not written down.
- **No `test.fail()` change.** Each existing line stays as it is. A new `test.fail()` needs repeated proof and is
  out of scope here (§5.2).
- **A failing `main` run is root-caused, never re-run blindly.** Classify it as PRODUCT BUG (with the histogram and
  the log line that prove it), TEST BUG (the spec or oracle is wrong; fix the test), or ENV (runner, cache,
  network; show the step log). A re-run is allowed only to confirm an ENV diagnosis, once. A second failure is real.
- **Timings come only from `main` runs**, with the median rule (at least 3 runs, same trial count). A timing with
  n < 3 is not published (Documenso until the closeout, Medusa 50-trial).
- **No number from a cloud VM** (AGENTS.md).
- **Read-only where it says read-only.** The R8 clone is read-only. The build changes no Cal or Documenso data.
- **Commits: environment identity, no trailers.** No `Claude-Session`, no `Co-Authored-By`, no "Generated with".
  `GIT_AUTHOR_*` and `GIT_COMMITTER_*` come from the environment; they are not rewritten.
- **Two PRs, as in §1.** The build opens PR 1 and PR 2 only as the plan says. No other PR.

## 12. Risks

1. **Medusa 50-trial duration and spread.** Expected job about 13 min, worst about 16 min, against a 45-min timeout.
   The 50-trial spread is unknown until run A. If the job ever times out, root-cause it (ENV or PRODUCT BUG) before
   raising the timeout.
2. **The nightly ran late** (§2.6). It is evidence, but its timing is not reliable yet. Run B is a dispatch so the
   closeout does not wait on the schedule.
3. **Artefact retention is 14 days.** Runs before 22 Oct expire from 3 Nov. The release is the lasting store (step 9).
   Download before 3 Nov (step 8).
4. **R8 mechanism is confirmed at `CAL_REF`, by code and by logs, but the log match is by timestamp** (within ±1 ms,
   no traceId on the Prisma line). The code read is strong; the log link is strong, not a proof. Recorded as such.
5. **`P6-OBS-DOC-001` has no CI artefact.** It is "probe + code path" and stated plainly. The Phase 2 test closes
   the gap (§5.5 item 1).
6. **Required checks change the merge flow.** Once the three are required, PRs wait for all three. Documenso's PR job
   is about 2.2 min.
7. **A `test.fail()` can flip.** If Cal or Documenso ships a fix before the closeout, the matching test turns red
   ("expected to fail but passed"). Remove that one line and update the README (§6). It is not a flake.
8. **The `gh` login warning** (`GH_TOKEN`) appears in this container, but reads work. If a later read fails, it is an
   access problem, not a code problem.

## 13. Decisions (continue from D31)

- **D32 Medusa trial count follows D2.** The step is `'3'` on pull requests and `'50'` on `main` (push, schedule,
  `workflow_dispatch`). Extras stay capped at 3 (Task 2 D15). Only the one step changes.
- **D33 Required checks are added by hand, now.** The `Main` ruleset gets one rule with the three job names. No
  code change, no classic branch protection, strict up-to-date off. Each check already has at least two green `main`
  runs (§2.7).
- **D34 R8 is `P6-OBS-CAL-003`, severity low, no test, no `test.fail()`.** Mechanism confirmed at `CAL_REF`:
  `uid = f(username, start second, Date.now())` collides for same-host, same-start requests in the same millisecond,
  which fails `Booking_uid_key` (P2002) and is redacted to 400. Wrong status, no double booking. The earlier summary
  "a valid booking is refused" is withdrawn.
- **D35 The rerun-on-high-spread item is closed as carried to the Phase 2 backlog, not built.** Maximum measured
  spread is 7.6 ms against a 20 ms limit. A spread retry would be a retry to make a test pass.
- **D36 Run B is always a `workflow_dispatch`.** No scheduled run stands in for it, even a green one at full count. The
  nightly ran late (§2.6), so the closeout does not wait on it. The nightly
  `39563393657` is cited as `main` evidence, labelled "schedule".
- **D37 Evidence lives in a GitHub Release (`p6-phase1`), one zip per cited run.** It does not expire. The README
  links the release and the run pages. No `docs/evidence/` commit. (Jayami, Q4.)
- **D38 No job-timeout change for Medusa.** The expected 13–16 min fits the 45-min job timeout. The limit that applies
  is the per-test Playwright timeout, scaled by D42.
- **D39 Timings are not pooled across trial counts.** The Medusa 3-trial series (n = 6) is one median, labelled "3
  trials". The Medusa 50-trial values are shown per run, labelled "50 trials", with no median until n ≥ 3. Cal and
  Documenso have one trial count each, so their medians are valid.
- **D40 `P6-OBS-DOC-001` is "probe + code path" in the README,** with a Phase 2 CI test (401 instead of 500, marked
  `test.fail()`) in the backlog (§5.5). It is not left README-only for good. (Jayami, Q5.)
- **D41 Two PRs.** PR 1 is the CI change (`ci(medusa): …`) on the feat branch. Merging it triggers run A. The build
  then dispatches run B. PR 2 (`docs/2026-10-2x-p6-phase1-results`) is cut fresh from the new `main` and carries the
  README. The evidence goes in the release, so PR 2 has no evidence files.
- **D42 The Medusa per-test timeout scales with the trial count.** `P6-MED-RACE-001` gets its own describe with
  `timeout: 60_000 + trials * 30_000` (30 s per trial, about 2x the worst measured 16.5 s; 50 trials gives 1 560 s).
  The extras keep a fixed 180 s in their own describe and cap at 3 trials. The framework self-test keeps 60 s: run
  `39561220290` measured 0.212 s for 3 trials (`framework-self-test.json`, `startedAt` to `finishedAt`), about 71 ms
  per trial, so 50 trials take about 3.5 s. Assertions, titles, case IDs and `src/races/*` do not change. (The
  number is D42, not D41: D41 already records the two PRs.)

## 14. Open questions for Jayami

1. **Nightly timing.** The first slot (21 Oct 02:17 UTC) ran late, at 07:38 UTC (run `39563393657`, green). Please check
   after tonight's slot (22 Oct 02:17 UTC): does it start on time? Nothing else depends on it. Run B is a dispatch.
2. **`P6-OBS-CAL-003`.** Approved as a new ID, low, with no test and no `test.fail()` (D34). The upstream draft is in
   Appendix B. The upstream check is done (§2.5), so this is your call on when to file it.
3. **`P6-OBS-CAL-001`.** Low, agreed (recorded in §6 and §7).
4. **Evidence store.** A GitHub Release `p6-phase1`, not `docs/evidence/` (D37), agreed. The build creates the release
   once run A is green (step 9).
5. **`P6-OBS-DOC-001`.** Probe + code path in the README, plus the Phase 2 CI test in §5.5, agreed (D40).
6. **Required checks.** Add the three by hand now, before PR 1 (§5.3, D33). Agreed.
7. **Upstream issues.** Which of these have you filed, and what are the URLs? (1) `P6-OBS-CAL-001` (Task 4 Appendix A),
   (2) `P6-OBS-CAL-002` (Task 5 Appendix A), (3) `P6-OBS-DOC-002` (Task 7 Appendix A), (4) `P6-OBS-CAL-003` (Appendix B,
   not yet filed). The README will link the ones you give me.
8. **CI time.** Accepted; the repo is public, so standard runners cost nothing (§4).
9. **Medusa median.** Covered by D39: the 3-trial series and the 50-trial values are separate. No pooled median.
10. **Rerun-on-high-spread.** Closed as carried to Phase 2 (D35). Agreed.

## Appendix A. Scripts (scratch only; never committed)

Save each script in `$S`, the `mktemp -d` scratch directory. Run with `node`.

`summ.cjs` prints one line per histogram, with its trial count and per-trial time:

```js
// usage: node summ.cjs <histogram.json>...
const fs = require("fs");
const path = require("path");
for (const f of process.argv.slice(2)) {
  const h = JSON.parse(fs.readFileSync(f, "utf8"));
  const secs = (Date.parse(h.finishedAt) - Date.parse(h.startedAt)) / 1000;
  const oracle = typeof h.oracle === "object" && h.oracle ? h.oracle : {};
  console.log(
    [
      path.basename(path.dirname(f)),
      h.caseId,
      `trials ${h.trials}`,
      `status ${JSON.stringify(h.statusCounts)}`,
      `verdict ${h.verdict}`,
      `viol ${(h.invariantViolations || []).length}`,
      `double ${oracle.trialsDoubleBooked ?? oracle.trialsDoubleSeal ?? "n/a"}`,
      `refused ${oracle["loser_refused-db-error"] ?? 0}`,
      `per-trial ${(secs / h.trials).toFixed(3)} s`,
    ].join(" | "),
  );
}
```

`refused.cjs` matches each refused trace to the Prisma constraint at the same millisecond:

```js
// usage: node refused.cjs <P6-CAL-RACE-003.json> <cal-web.log>
const fs = require("fs");
const hist = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const lines = fs.readFileSync(process.argv[3], "utf8").split("\n");
const ids = (hist.oracle.refusedTraceIds || "")
  .split(",")
  .filter(Boolean)
  .map((x) => x.slice(x.indexOf(":") + 1));
const p2002 = lines
  .filter((l) => l.includes("P2002"))
  .map((l) => {
    const c = l.match(/violates unique constraint \\+"([A-Za-z_]+)/);
    try {
      return { t: Date.parse(JSON.parse(l)._meta.date), c: c ? c[1] : "?" };
    } catch {
      return null;
    }
  })
  .filter(Boolean);
for (const id of ids) {
  const hit = lines.find((l) => l.includes(id));
  if (!hit) {
    console.log(id, "NOT FOUND in log");
    continue;
  }
  const t = Date.parse(JSON.parse(hit)._meta.date);
  const near = p2002.filter((p) => Math.abs(p.t - t) <= 1).map((p) => `${p.c} (${p.t - t} ms)`);
  console.log(id, "at", new Date(t).toISOString(), "P2002 within 1 ms:", near.join(", ") || "none");
}
```

Note: the log escapes the constraint name (`\\\"Booking_uid_key\\\"`), so the regex matches the name after the
backslashes. A `?` in the output means the escape differs: stop, do not read it as a pass. The window is 1 ms (±1 ms
is the observed range, §2.5); a line outside it prints `none`.

## Appendix B. Upstream draft: `P6-OBS-CAL-003` (for Jayami to file; not filed by P6)

**Title:** Booking `uid` is not collision-safe: same-host, same-start bookings in the same millisecond fail with a
redacted 400

**Body (paste as is; it contains no secrets):**

> When two booking requests for the same host and the same start time reach the server in the same millisecond, the
> second one fails with a generic 400 ("An error occurred while querying the database.") instead of a conflict
> response.
>
> Cause, read at the pinned commit `c2b7ac44c66f24ffef1662b276f0653988a609a3`:
>
> - `packages/features/bookings/lib/service/RegularBookingService.ts`, lines 1267–1268:
>
>   ```ts
>   const seed = `${organizerUser.username}:${dayjs(reqBody.start).utc().format()}:${Date.now()}`;
>   const uid = translator.fromUUID(uuidv5(seed, uuidv5.URL));
>   ```
>
> - The seed has second precision (the default dayjs format) and a millisecond timestamp. Two requests with the same
>   host and start second that run in the same millisecond get the same `uid`.
> - `packages/prisma/schema.prisma`: `uid String @unique` on `Booking`. The second insert fails with Prisma `P2002`
>   on `Booking_uid_key`.
> - Error redaction turns the `P2002` into the generic 400, so the caller cannot tell the cause (the same redaction as
>   the identical-slot case, reported separately).
>
> Reproduction: two `POST /api/book/event` requests for one host, the same start, fired together. About 1 in 12
> overlap trials in our runs (10 of 120) produced the redacted 400 on the second request. The first request was
> accepted. No double booking resulted.
>
> Expected: a non-colliding `uid` (for example random, or with a random component), so a concurrent same-start request
> is not refused by the `uid` constraint. Where a unique violation is still possible, the response should be a 409
> conflict, not a redacted 400.
>
> Also present on upstream `calcom/cal.com` `main` as of 2026-10-21 (`RegularBookingService.ts` lines 1267–1268).

**Notes for Jayami (not part of the issue):** the reproduction counts come from our CI runs
(`P6-CAL-RACE-003`, runs 39449102426, 39484324139, 39561220290, 39563393657). Attach the redacted log lines and the
trace ids from `refusedTraceIds`, with no tokens.

## Addendum: evidence release via workflow

**Status: plan only, for Jayami's review.** This addendum makes no code, workflow, release or run. The build starts only
after Jayami approves it. Written 21 Oct 2026 (UTC).

It replaces **§9 step 9** (the `gh release create` from a local zip). It is **deviation 1** of Task 8: the release was not
created, and this session cannot create releases.

### 1. Why a workflow makes the release

- This session cannot create a release. The zips were meant to sit in the build scratchpad, but none exists now.
- The evidence still exists as Actions artefacts on GitHub. They expire after 14 days (3 Nov 2026 for runs before 22 Oct).
- A workflow run on GitHub can download those artefacts, scan them, zip them and create the release. Nothing is built by
  hand. It runs only when Jayami dispatches it. It uses `github.token`, so there is no PAT and no new secret.
- The release is still the evidence store (D37): public, does not expire, one zip per run.

### 2. Read-only check (done 21 Oct; nothing was changed or committed)

Source: the `race-histograms-documenso` artefact of each run. Each one holds `P6-DOC-RACE-001.json`. The four artefacts were
downloaded into the scratchpad. Each run has its own directory. The check ran with `python3 -I` over a script in its own
directory. Each message is grouped with every digit run replaced by `N`.

Result. **The same 7 messages, with the same counts, in all four runs:**

| Message (per-trial numbers removed)                              | 39561220290 | 39563393657 | 39577832657 (run A) | 39580025937 (run B) |
| ---------------------------------------------------------------- | ----------- | ----------- | ------------------- | ------------------- |
| `PRODUCT BUG: Signing Complete! for recipient N xN, expected N`  | 100         | 100         | 100                 | 100                 |
| `PRODUCT BUG: seal jobs N, expected N`                           | 50          | 50          | 50                  | 50                  |
| `PRODUCT BUG: DOCUMENT_COMPLETED rows N, expected N`             | 50          | 50          | 50                  | 50                  |
| `PRODUCT BUG: DocumentData delta N, expected N (original + one sealed)` | 50   | 50          | 50                  | 50                  |
| `PRODUCT BUG: completed-email jobs N, expected N`                | 50          | 50          | 50                  | 50                  |
| `PRODUCT BUG: DOCUMENT_COMPLETED deliveries N, expected N`       | 50          | 50          | 50                  | 50                  |
| `PRODUCT BUG: WebhookCall rows N, expected N`                    | 50          | 50          | 50                  | 50                  |
| **Total**                                                        | **400**     | **400**     | **400**             | **400**             |
| Lines not starting with `PRODUCT BUG`                            | 0           | 0           | 0                   | 0                   |

**50 trials × 8 = 400.** Every line starts with `PRODUCT BUG`. The verdict is `fail`, which is the planned `test.fail()`
for `P6-OBS-DOC-002`. The `Signing Complete!` line appears twice per trial, so it is 100 per run.

Runs `39561220290` and `39563393657` were checked from their artefacts. They are the earlier runs the brief named.

### 3. Files (all new, one CI PR)

| Path                                       | What it is                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `.github/workflows/evidence-release.yml`   | the workflow (§4). `workflow_dispatch` only                            |
| `scripts/evidence-token-scan.mjs`          | the token scan (§5). Prints file and line only                         |
| `tests/unit/evidence-token-scan.test.ts`   | unit tests for the scan (§5)                                           |
| `docs/releases/p6-phase1.md`               | the release notes (§6). It must be on `main` before the dispatch       |

- Branch: `ci/2026-10-21-p6-evidence-release`, cut from `main` at **`4aecc2d`**.
- PR title: `ci: add workflow to publish run evidence as a release`. One PR. Jayami merges it.
- Before the push, run `npm run check` (AGENTS.md). If `npm run typecheck` rejects the `.mjs` import in the test, add
  `scripts/evidence-token-scan.d.mts` with the three exported declarations. Do not loosen `tsconfig`.
- The commit identity is the environment's. No `Co-Authored-By`, `Generated with` or `Claude-Session` trailers.

### 4. The workflow, exactly

Create `.github/workflows/evidence-release.yml`. Action pins are the ones `perf.yml` already uses. The `checkout` pin is
`3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7.0.1`).

```yaml
name: evidence-release

on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Release tag, for example p6-phase1"
        required: true
        type: string
      target_sha:
        description: "Full 40-character commit SHA the release points at"
        required: true
        type: string
      run_ids:
        description: "Space-separated perf.yml run ids on main"
        required: true
        type: string

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write
      actions: read
    env:
      GH_TOKEN: ${{ github.token }}
      GH_REPO: ${{ github.repository }}
      TAG: ${{ inputs.tag }}
      TARGET_SHA: ${{ inputs.target_sha }}
      RUN_IDS: ${{ inputs.run_ids }}
      PERF_WORKFLOW_ID: "376454455"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Validate inputs
        run: |
          set -euo pipefail
          [[ "$TAG" =~ ^p6-[a-z0-9-]+$ ]] || { echo "::error::tag must match ^p6-[a-z0-9-]+$"; exit 1; }
          [[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::target_sha must be 40 lowercase hex characters"; exit 1; }
          [[ -n "$RUN_IDS" ]] || { echo "::error::run_ids is empty"; exit 1; }
          for id in $RUN_IDS; do
            [[ "$id" =~ ^[0-9]+$ ]] || { echo "::error::every run id must be digits only"; exit 1; }
          done
          [[ -f "docs/releases/$TAG.md" ]] || { echo "::error::docs/releases/$TAG.md is missing on this commit"; exit 1; }

      - name: Stop if the release already exists
        run: |
          set -euo pipefail
          if gh release view "$TAG" > /dev/null 2> "$RUNNER_TEMP/release-view.err"; then
            echo "::error::release $TAG already exists. Stopping. A release is never overwritten."
            exit 1
          fi
          grep -qi 'not found' "$RUNNER_TEMP/release-view.err" \
            || { echo "::error::gh release view failed for a reason other than not-found"; exit 1; }

      - name: Check each run and download its artefacts
        run: |
          set -euo pipefail
          for id in $RUN_IDS; do
            gh run view "$id" --json workflowDatabaseId,headBranch,conclusion,event,headSha > "$RUNNER_TEMP/run.json"
            jq -e --argjson wf "$PERF_WORKFLOW_ID" \
              '.workflowDatabaseId == $wf and .headBranch == "main" and .conclusion == "success"' \
              "$RUNNER_TEMP/run.json" > /dev/null \
              || { echo "::error::run $id is not a successful perf.yml run on main"; exit 1; }
            gh run download "$id" --dir "$RUNNER_TEMP/evidence/$id"
            find "$RUNNER_TEMP/evidence/$id" -type f ! -name '*.json' ! -name '*.log' -delete
          done

      - name: Scan every file for tokens (any hit stops the job before upload)
        run: |
          set -euo pipefail
          node scripts/evidence-token-scan.mjs "$RUNNER_TEMP/evidence"

      - name: Build one zip per run and the checksum file
        run: |
          set -euo pipefail
          out="$RUNNER_TEMP/release"
          mkdir -p "$out"
          for id in $RUN_IDS; do
            (cd "$RUNNER_TEMP/evidence/$id" && zip -rq "$out/p6-$id-evidence.zip" .)
          done
          (cd "$out" && sha256sum -- *.zip > SHA256SUMS.txt)
          ls -l "$out"

      - name: Create the release
        run: |
          set -euo pipefail
          gh release create "$TAG" \
            --target "$TARGET_SHA" \
            --title "P6 Phase 1 evidence (CI)" \
            --notes-file "docs/releases/$TAG.md" \
            "$RUNNER_TEMP"/release/*.zip "$RUNNER_TEMP/release/SHA256SUMS.txt"
```

Why it is shaped this way:

- Inputs reach the scripts only through `env:`. No `${{ inputs.* }}` appears inside a `run:` block (script injection).
- Node and `zip` come with the runner image. The scan uses only built-in Node modules, so no `setup-node` step is needed.
- The guard runs before any download. If the release exists, the job stops. Nothing is deleted or overwritten.
- The release is created in one call, last. A failure before it leaves no release behind.

### 5. The token scan (committed, with unit tests)

Patterns: the same three as the step 8 grep (`api_[A-Za-z0-9]{8,}`, `Bearer `, `sessionId`). The scan prints the file
and line number. It never prints the matched text.

`scripts/evidence-token-scan.mjs`:

```js
// Scans evidence files for tokens before they go into a release.
// Prints file and line only. The matched text is never printed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The same patterns as the Task 8 step 8 grep.
export const PATTERNS = [/api_[A-Za-z0-9]{8,}/, /Bearer /, /sessionId/];

export function findHits(text) {
  const lines = [];
  text.split("\n").forEach((line, index) => {
    if (PATTERNS.some((pattern) => pattern.test(line))) lines.push(index + 1);
  });
  return lines;
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

export function scanTree(root) {
  return listFiles(root)
    .map((file) => ({ file: relative(root, file), lines: findHits(readFileSync(file, "utf8")) }))
    .filter((hit) => hit.lines.length > 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [root] = process.argv.slice(2);
  if (!root) {
    console.error("usage: node scripts/evidence-token-scan.mjs <dir>");
    process.exit(2);
  }
  const hits = scanTree(root);
  for (const { file, lines } of hits) console.error(`TOKEN PATTERN: ${file} line ${lines.join(", ")}`);
  if (hits.length > 0) {
    console.error("stop: nothing was uploaded");
    process.exit(1);
  }
  console.log("token scan: clean");
}
```

`tests/unit/evidence-token-scan.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { findHits } from "../../scripts/evidence-token-scan.mjs";

test("clean text has no hits", () => {
  assert.deepEqual(findHits('{"ok":true}\n{"n":2}'), []);
});

test("reports the line number of each hit", () => {
  assert.deepEqual(findHits("ok\napi_TESTONLY1\nok"), [2]);
});

test("Bearer and sessionId are hits", () => {
  assert.deepEqual(findHits('Authorization: Bearer x\n{"sessionId":1}'), [1, 2]);
});

test("a short api_ word is not a hit", () => {
  assert.deepEqual(findHits("api_short"), []);
});
```

Expected: `npm run test:unit` passes all four. `npm run check` is green. The `api_TESTONLY1` string is a fake used only in the
test.

### 6. Release notes: `docs/releases/p6-phase1.md`

This file is committed on `main` in the CI PR, so the dispatch can read it. It lists every run in the release. Use only what
§2.1 and §2.2 show, plus runs A and B.

```markdown
# P6 Phase 1 evidence (CI)

One zip per CI run. Each zip holds the `*.json` and `*.log` files of that run's artefacts. `SHA256SUMS.txt` lists the
checksums. The release does not expire; the Actions artefacts do (14 days).

| Run                                                                                | Event    | Head SHA  | What it proves                                                    |
| ---------------------------------------------------------------------------------- | -------- | --------- | ----------------------------------------------------------------- |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298) | push     | `98b1c82` | Cal self-test only                                                |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push     | `c3183d2` | `P6-CAL-RACE-001` (50)                                            |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | `6d73fd3` | `P6-CAL-RACE-001` (50), `P6-CAL-RACE-003` (30)                    |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | `3c6b7c6` | `P6-CAL-RACE-001` (50), `P6-CAL-RACE-003` (30), Documenso self-test (3) |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | `0f8bf23` | Medusa (50), Cal 001 (50) and 003 (30), Documenso 001, 002 (50), control (5) |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | `0f8bf23` | the same cases as `39561220290` (nightly)                         |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | `4aecc2d` | **Run A.** The same cases, at full count, after PR #18            |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | `4aecc2d` | **Run B.** The same cases, at full count                          |

**Run A replaces `39569437056`.** That run is a failed push on `main` (PR #17, `ef8696b`). Its `cal-smoke` job failed in
the `P6-CAL-RACE-003` extra. Run A is the green run that the closeout cites instead.
```

Replace the bold "what it proves" wording only if Jayami changes it at review. The table row for `39429276298` uses the
§2.1 "Cal cases" column. The row text for `39577832657` and `39580025937` says "the same cases" because the artefact list
(§2 above) shows the full Medusa, Cal and Documenso set.

### 7. Dispatch: click by click (Jayami)

1. Open the repository on GitHub and click the **Actions** tab.
2. In the left list, click **evidence-release**. If it is not there, the CI PR is not merged yet.
3. Click **Run workflow** (right side of the page).
4. In **Use workflow from**, choose **Branch: main**.
5. Fill the three boxes:
   - `tag`: `p6-phase1`
   - `target_sha`: `4aecc2d3cb69fffcde3b2282e23ff489d90a6090`
   - `run_ids`: `39429276298 39434721131 39449102426 39484324139 39561220290 39563393657 39577832657 39580025937`
6. Click the green **Run workflow** button.
7. Click the new run in the list. Wait for the **publish** job to turn green.
8. The last step prints the release URL. Send that link to Claude.

If the run turns red, do not dispatch again. Send the link to Claude. A red run before "Create the release" creates nothing.

### 8. Verification after the release (done by Claude, with read-only checks)

1. The release `p6-phase1` exists. Its target is `4aecc2d…`. It has 9 assets: 8 zips and `SHA256SUMS.txt`.
2. Each zip's file list matches the artefact file list of its run. For each run, `gh release download p6-phase1 -p "p6-<id>-evidence.zip"`,
   then `unzip -Z1` on that zip. Compare the result with the `*.json` and `*.log` file list of that run's artefacts (fetched the
   same way as §2). Expected: identical lists, one per run.
3. `sha256sum -c SHA256SUMS.txt` in the download directory prints `OK` for every zip.

**Reference for step 2.** The brief asks to compare against the scratchpad zips. None exists, so the artefact file lists are
the reference. The zips are built from the same files, so the lists must match. Jayami confirms this change at review (open
item Q2).

### 9. Environments: Cursor and Claude cloud

- **No change is needed in either environment.** The workflow runs on GitHub-hosted runners. It needs no new secret, env var,
  domain, network host or setup step.
- The Cal stack is not running in this session (`docker ps -a` lists no containers). So `npm run down:cal` was not needed.

### 10. Order of work (replaces §9 steps 8 and 9 for the release)

1. Jayami approves this addendum.
2. Branch `ci/2026-10-21-p6-evidence-release` from `4aecc2d`. Add the four files (§3). Run `npm run check`. Push.
3. Open the CI PR. Jayami merges it.
4. Jayami dispatches the workflow (§7). Claude verifies (§8).
5. Only then does **PR 2 (the README)** start. The README links the release.

Step 8 of the closeout still does its R8 read-only check. The token scan of the old step 8 is now inside the workflow.

### 11. Risks

1. **Artefact expiry.** The runs before 22 Oct (`39429276298`–`39484324139`) expire on **3 Nov 2026**. The dispatch must happen before then.
2. **A `gh` JSON field name.** The check step uses `workflowDatabaseId`. If `gh run view --json` rejects a name, the step fails before
   any upload. Fix only the field name and say so.
3. **Permissions.** If the repository or organization caps `GITHUB_TOKEN` at read, the create step fails with a 403. Stop and
   report it. Do not add a PAT. The fix is a repository setting, and it is Jayami's call.
4. **The "not found" wording.** The guard greps for `not found`. Check the exact text on the first dispatch. If it differs,
   change only that grep, and say so.
5. **No retries.** A failed run is reported, not re-dispatched. Only Jayami dispatches again, and only after the cause is known.

### 12. Deviations from the brief, and open items

Deviations (stated so they can be checked):

- **D-a.** The brief asked for a read-only check on the existing scratchpad zips. None existed. Part A (§2) downloaded the
  `race-histograms-documenso` artefact of each run from GitHub into fresh directories instead. The files are the same artefacts.
- **D-b.** §8 step 2 compares against artefact file lists, not scratchpad zips, for the reason in §8.
- **D-c.** The brief says run `39569437056` failed as a TEST BUG in `cal-smoke` (a seeded Yoga booking overlapped the 09:00Z
  window). I read its failed-job log. It fails in the `P6-CAL-RACE-003` extra, on "sequential first booking not accepted:
  409 … `no_available_users_found_error`", labelled `PRODUCT BUG`. The log has no Yoga or 09:00Z text. The release notes in §6
  say only what the log shows.
- **D-d.** The brief says PR #18 "also skips pending seed bookings". I found no change about pending bookings in PR #18's
  commits (`4d8e447`, `4deefba`). The notes do not say it.

Open items for Jayami:

- **Q1.** Is the failure cause for `39569437056` what the brief says (a TEST BUG), or what the log shows? The release notes wait for this answer.
- **Q2.** Accept the artefact file lists as the verification reference (D-b), or do you want the scratchpad zips rebuilt first?
- **Q3.** Is there a PR #18 change about pending seed bookings that I did not find? If yes, point at it, and the notes will cite it.
