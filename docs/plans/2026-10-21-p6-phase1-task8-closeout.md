# P6 Phase 1 Task 8: Phase 1 closeout (plan only)

This is the implementation plan a weaker model will build from. Do not write code until Jayami
approves this document. Plan only: no build, no PR, no run has been started by this document.

Structure follows [2026-10-21-p6-phase1-task7-doc-races.md](2026-10-21-p6-phase1-task7-doc-races.md)
(Task 7) and [2026-10-20-p6-phase1-task5-cal-race-003.md](2026-10-20-p6-phase1-task5-cal-race-003.md).
Source: [2026-10-20-p6-phase1-roadmap.md](2026-10-20-p6-phase1-roadmap.md), section "Task 8: Phase 1
closeout" and decision D2.

## Context

- Repo: [Jayami123/k6-load-concurrency-suite](https://github.com/Jayami123/k6-load-concurrency-suite)
  (P6). Plan branch **`plan/2026-10-20-p6-phase1`**, merged with `origin/main` at `0f8bf23` (PR #16,
  Task 7 merged). Written there only; no PR.
- Build branch (later): **`feat/2026-10-22-p6-phase1-closeout`**, cut from `origin/main`. Its first
  commit brings this doc in with
  `git checkout origin/plan/2026-10-20-p6-phase1 -- docs/plans/2026-10-21-p6-phase1-task8-closeout.md`.
- Cases: **no new cases** (roadmap, Task 8). All six Phase 1 cases are evidenced from CI: `P6-MED-RACE-001`,
  `P6-CAL-RACE-001`, `P6-CAL-RACE-002` (histogram publication), `P6-CAL-RACE-003`, `P6-DOC-RACE-001`,
  `P6-DOC-RACE-002`.
- Harness `qa-portfolio-harness#v0.2.11`. Products pinned in `perf.yml` (`MEDUSA_REF`, `CAL_REF`,
  `DOCUMENSO_REF`). Never edit the harness, the forks or `src/races/*` here.
- Probe status: **done on 2026-10-21 (UTC)**, from GitHub only (`gh` and the GitHub MCP tools). No cloud
  VM number is used anywhere in this document (AGENTS.md). The probe read run ids, job data, artefacts
  and histogram JSON; it changed nothing in the repo, the forks or the harness.

## 1. Header

- Probe date 2026-10-21. Repo state: `main` = `0f8bf23`. Plan branch = `bf64e33` (a merge of `main`).
- Workflow `perf` (`.github/workflows/perf.yml`, id 376454455), state **active**.
- Ruleset `Main` (id 25341555), enforcement **active**, target the default branch.
- Artefacts are kept **14 days** (`retention-days: 14` in `perf.yml`). The earliest artefact expires
  2026-11-03. This matters for the README links (§7, Decision D37).
- Timings below are **CI job and step durations** from the GitHub run data, or per-trial values
  computed from the histograms' `startedAt` and `finishedAt`. They are not VM numbers.

## 2. Probe findings (required; no guessed values)

### 2.1 Every `perf.yml` run on `main` since PR #12

Runs with event `push` on `main` (the merge commits). Durations are job wall clock from the run data.

| Run                                                                                            | PR  | Head SHA  | medusa-smoke     | cal-smoke        | documenso-smoke  | Cal cases in the run | Documenso cases in the run      |
| ---------------------------------------------------------------------------------------------- | --- | --------- | ---------------- | ---------------- | ---------------- | -------------------- | ------------------------------- |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298) | #12 | `98b1c82` | success, 2.8 min | success, 5.6 min | not in workflow  | self-test only (3)   | not in workflow                 |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | #13 | `c3183d2` | success, 2.2 min | success, 4.5 min | not in workflow  | 001 (50)             | not in workflow                 |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | #14 | `6d73fd3` | success, 2.9 min | success, 4.2 min | not in workflow  | 001 (50), 003 (30)   | not in workflow                 |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | #15 | `3c6b7c6` | success, 2.6 min | success, 4.6 min | success, 5.1 min | 001 (50), 003 (30)   | self-test only (3)              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | #16 | `0f8bf23` | success, 2.7 min | success, 4.4 min | success, 5.5 min | 001 (50), 003 (30)   | 001 (50), 002 (50), control (5) |

- Every `main` run is green in all of its jobs (the three PR-era run ids are PRs and are not counted).
- **Nightly `schedule`: zero runs.** `gh api .../workflows/376454455/runs?event=schedule` returns
  `total_count: 0`. The cron `17 2 * * *` has been on `main` since PR #1 (2026-10-18), and no scheduled
  run exists. See §2.6.
- **`workflow_dispatch`: zero runs** on record.
- Pull-request runs exist (37 in total). The latest one used for PR timings is
  [39558975663](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39558975663) (`ff07910`,
  Task 7 branch). Its jobs: cal-smoke 4.3 min, medusa-smoke 2.9 min, documenso-smoke 2.2 min.

### 2.2 Which runs are full-count

"Full count" means the case ran at the D2 count on `main`: Cal 001 at 50, Cal 003 at 30 (its cap), Documenso
at 50, and Medusa at 50.

| Product                                  | Full-count `main` runs today                           | Still at the old count            | Verdict                |
| ---------------------------------------- | ------------------------------------------------------ | --------------------------------- | ---------------------- |
| Cal `P6-CAL-RACE-001`                    | 39434721131, 39449102426, 39484324139, 39561220290 (4) | none                              | full count             |
| Cal `P6-CAL-RACE-003`                    | 39449102426, 39484324139, 39561220290 (3)              | none                              | full count (cap 30)    |
| Documenso `P6-DOC-RACE-001/002`, control | 39561220290 (1)                                        | none                              | full count, first run  |
| Medusa `P6-MED-RACE-001`                 | none                                                   | all 5 `main` runs (3 trials each) | **not full count yet** |

**Medusa is the only product still at the old count.** The Medusa step in `perf.yml` hard-codes
`RACE_TRIALS: "3"` for every event. So no `main` run is yet a full-count run for all three jobs. Run
39561220290 is green and full count for Cal and Documenso, but Medusa there ran 3 trials. It therefore
does not count as one of the two closeout runs (§10).

### 2.3 Histograms of the latest full-count runs

All numbers are read from the `race-histograms-*` artefacts of the run ids shown (`gh run download`).
"Verdict" is the value the spec wrote. A `fail` verdict on a product bug is the planned `test.fail()` path
(the step itself stays green because the `test.fail()` expectation holds; see §5.2).

**Cal `P6-CAL-RACE-001` (identical slot, N=20, 50 trials per run).** Each run: 50 ACCEPTED (1 per
trial), 950 redacted 400 (`db-unique-redacted`), 0 unexpected, 0 leaks. Verdict `pass`.

| Run         | Head      | Accepted per trial  | Redacted 400 per 1000 requests | Per-trial time (s) |
| ----------- | --------- | ------------------- | ------------------------------ | ------------------ |
| 39434721131 | `c3183d2` | 1 (50 of 50 trials) | 950                            | 1.04               |
| 39449102426 | `6d73fd3` | 1 (50 of 50)        | 950                            | 0.76               |
| 39484324139 | `3c6b7c6` | 1 (50 of 50)        | 950                            | 1.01               |
| 39561220290 | `0f8bf23` | 1 (50 of 50)        | 950                            | 0.96               |

Median per-trial time over these four runs: **0.99 s** (n = 4).

**Cal `P6-CAL-RACE-003` (overlap, 30 trials per run, `verdict: fail` = planned `test.fail()`).**

| Run         | Head      | Double-booked trials | Clean trials | Refused legs (`refusedTraceIds`) | Per-trial time (s) |
| ----------- | --------- | -------------------- | ------------ | -------------------------------- | ------------------ |
| 39449102426 | `6d73fd3` | 28 of 30             | 2            | 2                                | 0.302              |
| 39484324139 | `3c6b7c6` | 29 of 30             | 1            | 1                                | 0.353              |
| 39561220290 | `0f8bf23` | 29 of 30             | 1            | 1                                | 0.345              |

Pooled over the three full-count runs: **86 of 90 trials double-booked (95.6%)**, all on the
"both legs ACCEPTED" outcome. The median per-trial time is **0.345 s** (n = 3). Each refused-leg trial is a
clean trial: the other leg won, so no double booking happened in it.

**Documenso `P6-DOC-RACE-001`, `P6-DOC-RACE-002` and the control (run 39561220290 only, n = 1).**

| Case                                    | Trials | Result                                                                                                              | Per-trial time (s) |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `P6-DOC-RACE-001` (two last recipients) | 50     | **50 of 50 double-sealed** (2 SIGNED per trial, `sealJobsRetriedTotal` 50); `verdict: fail` = planned `test.fail()` | 2.50               |
| `P6-DOC-RACE-002` (same recipient ×10)  | 50     | 50 SIGNED + 450 ALREADY_SIGNED, **0 4xx, 0 5xx**, 50 of 50 single-sealed; verdict `pass`                            | 1.44               |
| Control `extra-doc-sequential-control`  | 5      | 5 of 5 single-sealed; verdict `pass`                                                                                | 2.66               |

Timings are n = 1, so **no Documenso timing is published** until the two closeout runs add samples (§7).
The `documenso-web-log` of this run has 0 lines that match the token patterns (`api_…`, `Bearer `,
`sessionId`).

**Medusa `P6-MED-RACE-001` (oversell, stock S=5, 3 trials per run, the old count).**

| Run         | Head      | Accepted (orders) per trial | Oversell | Per-trial time (s) |
| ----------- | --------- | --------------------------- | -------- | ------------------ |
| 39429276298 | `98b1c82` | 5                           | 0        | 12.52              |
| 39434721131 | `c3183d2` | 5                           | 0        | 10.39              |
| 39449102426 | `6d73fd3` | 5                           | 0        | 16.51              |
| 39484324139 | `3c6b7c6` | 5                           | 0        | 14.28              |
| 39561220290 | `0f8bf23` | 5                           | 0        | 14.68              |

The 400 rows are `loserType: not_allowed` (out of stock), which is the clean refusal the README already
describes. Median of the five per-trial samples: **14.28 s** (n = 5, all 3-trial runs). The Medusa extras
(`extra-mixed-qty`, `extra-s0-n5`, `extra-s1-n2`, `extra-same-cart`) cap themselves at 3 trials in the spec
(`Math.min(raceTrialsFromEnv(), 3)`, Task 2 D15). They take about 0.5 min in total in each run.

### 2.4 Medusa 50-trial step against the job timeout (Task 2 §2.12)

Task 2 estimated about 10 minutes for 50 trials. The real step timings say a little more:

- Per-trial time at 3 trials: samples 10.39–16.51 s, median 14.28 s (§2.3).
- Full-count race loop: 50 × 14.28 s = 714 s ≈ **11.9 min**. Extras and self-test add about 0.5 min, so the
  step is about **12.4 min**. Worst observed sample (16.51 s): 50 × 16.51 = 826 s ≈ 13.8 min, plus extras.
- Medusa job: today 2.7 min, of which the 3-trial `P6-MED-RACE-001` is 0.73 min. After the change the expected job is
  2.7 − 0.73 + 11.9 ≈ **13.9 min** (worst ≈ 15.7 min).
- `medusa-smoke` has `timeout-minutes: 45`. The expected 14–16 min **fits** with about 30 min to spare.
  No timeout change is needed (Decision D38).
- **Risk:** the 50-trial Medusa spread is unknown (only 3-trial spreads exist, max 2.8 ms, §5.1).

### 2.5 R8: the CI-only redacted 400 on same-start Cal pairs (Task 5 §13)

R8 asked: when a run shows `refusedTraceIds`, grep `cal-web-log` for the traceId, record the Prisma code and
target, then decide whether it is a new finding. Done for the four refused legs in the three full-count runs:

| Run         | Refused legs | traceId (from `P6-CAL-RACE-003.json`)                                             | Log time (UTC)             | Prisma code and target at the same timestamp   |
| ----------- | ------------ | --------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------- |
| 39449102426 | 2            | `trace_Vgxbc2ui-gSxhRO9ALeZB` (trial 5), `trace_FldQWEPN3ifZmponf5D3G` (trial 17) | 15:34:49.728, 15:34:53.320 | `P2002`, `Booking_uid_key` (0 ms offset, both) |
| 39484324139 | 1            | `trace_yre81k4JVfI4Sf2VwwgD0` (trial 21)                                          | 19:36:53.594               | `P2002`, `Booking_uid_key` (0 ms)              |
| 39561220290 | 1            | `trace__MAvOcdrdUxdbI3VtDY5g` (trial 13)                                          | 07:24:08.528               | `P2002`, `Booking_uid_key` (0 ms)              |

- The refused leg is the **same redaction bug as `P6-OBS-CAL-001`** (Prisma `P2002` → generic 400 text
  "An error occurred while querying the database."). But the **unique constraint is different**: the
  identical-slot losers hit `Booking_idempotencyKey_key` (1,117–1,120 lines per run), while the refused
  legs hit `Booking_uid_key` (5–9 lines per run in total).
- The Prisma line carries **no traceId**. The match is by timestamp: each refused trace's first log line
  and its `P2002` line share the same millisecond. That is strong but not a proof. It is recorded as such.
- **Why `uid` collides is unknown.** `uid` is a per-booking identifier, so a collision between two different
  bookings is surprising. It suggests `uid` is derived from something both legs share, or the two legs
  write the same row. Confirming that needs Cal's source at `CAL_REF` (read-only), which this probe did not
  do (Open question 2).
- **Reproduction count.** 4 refused legs in 90 pooled trials of 003 over 3 full-count runs (4.4%), and
  in all 3 of 3 runs that have 003. The "did not reproduce in ~225 local trials" note in R8 is not the
  question any more: it is reproduced in CI, in every full-count run.
- Classification (proposed; §5.2): **new finding `P6-OBS-CAL-003`, severity medium** (no double booking
  in those trials, but a valid booking is refused with a generic 400 under overlap).

### 2.6 Nightly schedule

- `perf.yml` has `schedule: cron "17 2 * * *"` on `main`. The workflow is `active`.
- **No `schedule` run exists** (`total_count: 0`), 3 days after the cron landed on `main`.
- The probe cannot see why (no Actions settings access beyond the run API). The likely causes are: GitHub
  skipped the scheduled runs, or the schedule is disabled in the Actions UI. Jayami must check
  (Open question 1).
- Until it fires, **the nightly is not evidence** (README rule: `main` and nightly runs). The second
  closeout run therefore uses `workflow_dispatch` (§10).

### 2.7 Required checks (ruleset `Main`)

- The ruleset `Main` (id 25341555) is active and has **three** rules: `deletion`, `non_fast_forward`, and
  `pull_request` (0 approvals required, no code-owner review). It has **no `required_status_checks` rule**.
- Branch protection (classic) is not set (`Branch not protected`, 404).
- **Today nothing blocks a merge on CI.** A red `medusa-smoke`, `cal-smoke` or `documenso-smoke` can be
  merged.
- Green history on `main` (job name = status context):

| Check (job name)  | Green `main` runs                                               | Count | At least two?     |
| ----------------- | --------------------------------------------------------------- | ----- | ----------------- |
| `medusa-smoke`    | 39429276298, 39434721131, 39449102426, 39484324139, 39561220290 | 5     | yes               |
| `cal-smoke`       | the same 5 runs                                                 | 5     | yes               |
| `documenso-smoke` | 39484324139, 39561220290                                        | 2     | yes (exactly two) |

- The exact change is in §5.3. It is made **by hand** in the GitHub UI (or with the one API call given there).
  The build must not change the ruleset in code.

### 2.8 Upstream issue drafts (P6-OBS-CAL-001, -CAL-002, -DOC-002)

The drafts exist in the plan docs (for Jayami to file; P6 files nothing upstream):

| Finding                                 | Draft                | Location                                                                                                                                                         |
| --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-CAL-001` (400 for 409)          | Appendix A of Task 4 | [task4 Appendix A](2026-10-20-p6-phase1-task4-cal-race-001.md#appendix-a-draft-upstream-issue-for-jayami-to-file-not-filed-by-p6) (line 1207)                    |
| `P6-OBS-CAL-002` (double booking, high) | Appendix A of Task 5 | [task5 Appendix A](2026-10-20-p6-phase1-task5-cal-race-003.md#appendix-a-draft-upstream-issue-for-p6-obs-cal-002-for-jayami-to-file-not-filed-by-p6) (line 1297) |
| `P6-OBS-DOC-002` (double seal, medium)  | Appendix A of Task 7 | [task7 Appendix A](2026-10-21-p6-phase1-task7-doc-races.md#appendix-a-draft-upstream-issue-for-p6-obs-doc-002-for-jayami-to-file-not-filed-by-p6) (line 2127)    |

- **Filing status is not checkable from here.** The upstream repos are outside this session's GitHub scope
  (only `jayami123/k6-load-concurrency-suite` is in scope). So this document does not say whether they are
  filed. Jayami confirms. (The three drafts were written in Tasks 4, 5 and 7.)
- There is **no draft for `P6-OBS-CAL-003`** (R8). §5.4 says what to do.

### 2.9 What the probe did not confirm

- The nightly schedule (§2.6).
- Whether the upstream issues are filed (§2.8).
- The Medusa 50-trial timing and spread (only 3-trial data exists).
- Two closeout runs with Medusa at 50 (they do not exist yet; they are the build's output).
- Artefact availability after 14 days (retention).
- Why `Booking_uid_key` collides (needs Cal's source, §2.5).

## 3. CI change (`perf.yml`, the Medusa race step only)

Only the Medusa race step changes. Nothing else in `perf.yml` changes unless a run proves a timeout (none is
proven, §2.4). The step name is changed too: "3 trials" in the old name would be wrong on `main`.

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
# Roadmap D2: 3 trials on PRs, the full 50 on main, nightly and workflow_dispatch. The extras cap
# themselves at 3 in the spec (Task 2 D15), so only P6-MED-RACE-001 follows this count.
- name: Race P6-MED-RACE-001 + extras (medusa-race)
  if: ${{ steps.medusa_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  env:
    RACE_TRIALS: ${{ github.event_name == 'pull_request' && '3' || '50' }}
    RACE_MAX_SPREAD_MS: "20"
  run: |
    set -euo pipefail
    echo "### P6-MED-RACE-001 trials: ${RACE_TRIALS}" >> "$GITHUB_STEP_SUMMARY"
    npm run race:medusa
```

Why each line:

- `RACE_TRIALS` expression: the same pattern as the Cal and Documenso steps (`github.event_name ==
'pull_request' && … || …`). A `push` to `main`, a `schedule` and a `workflow_dispatch` all take `'50'`.
- The `echo` into `$GITHUB_STEP_SUMMARY`: the same as the Cal steps, so the count is visible on the run page.
- No `timeout-minutes` on the step: the job timeout (45) fits (§2.4).
- Job name `medusa-smoke`, `RACE_MAX_SPREAD_MS` and the upload step are unchanged, so the required-check
  names (§5.3) do not change.

Expected CI minutes per event: see §4.

## 4. CI minutes per event (three heavy jobs)

Job wall clock from the run data. The PR row is the latest PR run (39558975663). The `main` rows come from
run 39561220290 and the estimate in §2.4.

| Event                                             | medusa-smoke              | cal-smoke | documenso-smoke | Sum of job minutes    | Longest job (wall) |
| ------------------------------------------------- | ------------------------- | --------- | --------------- | --------------------- | ------------------ |
| PR push, now (39558975663)                        | 2.9                       | 4.3       | 2.2             | 9.4                   | 4.3                |
| PR push, after this change                        | 2.9 (unchanged, 3 trials) | 4.3       | 2.2             | 9.4                   | 4.3                |
| `main` push, now (39561220290)                    | 2.7                       | 4.4       | 5.5             | 12.6                  | 5.5                |
| `main` push, after this change (estimate)         | **13.9** (worst 15.7)     | 4.4       | 5.5             | **23.8** (worst 25.6) | 13.9               |
| nightly `schedule`, after this change (estimate)  | 13.9 (worst 15.7)         | 4.4       | 5.5             | 23.8 (worst 25.6)     | 13.9               |
| `workflow_dispatch`, after this change (estimate) | 13.9 (worst 15.7)         | 4.4       | 5.5             | 23.8 (worst 25.6)     | 13.9               |

- The change adds **about 11 job-minutes per `main` push, nightly or manual run**. A nightly alone adds about
  30 × 11.2 ≈ 336 job-minutes a month, plus any `main` pushes.
- PR runs do not change (Medusa stays at 3).
- GitHub bills each job rounded up per minute, so the billed total is a little above these sums. Check the
  billing page after the first closeout run.

## 5. Open items this task closes or carries

### 5.1 Rerun-on-high-spread (the Medusa spread guard) — close as carried, not built

- The item: "rerun a trial when its dispatch spread is high". Named as out of scope in Task 5 (`No rerun-
on-high-spread logic (Task 8)`) and Task 7 (`rerun-on-spread logic`).
- The data says the guard is not needed now. Max dispatch spread per case, across all `main` runs
  (`dispatchSpreadMs`, from the histogram trials):

| Case                          | Runs | Max spread (ms) | Limit (`RACE_MAX_SPREAD_MS`) |
| ----------------------------- | ---- | --------------- | ---------------------------- |
| `P6-MED-RACE-001` (3 trials)  | 5    | 2.8             | 20                           |
| `P6-CAL-RACE-001` (50 trials) | 4    | 7.6             | 20                           |
| `P6-CAL-RACE-003` (30 trials) | 3    | 1.6             | 20                           |
| `P6-DOC-RACE-001` (50 trials) | 1    | 0.5             | 20                           |
| `P6-DOC-RACE-002` (50 trials) | 1    | 0.7             | 20                           |

- **Decision D35:** carry to the Phase 2 backlog, **not built**. A retry on a spread failure would be a
  retry to make a test pass, which the race rules forbid (Task 1: "Do not `test.fail()`, retries, or
  sleeps to 'make it pass'"). The spread assertion stays a hard fail. The 50-trial Medusa spread is the
  one unknown (§2.9); the build records it in the README, and if it exceeds ~10 ms the item is reopened.

### 5.2 R8 finding ID and severity — proposed

- **Proposed finding `P6-OBS-CAL-003`, severity medium.** Evidence: §2.5 (4 refused legs, 3 of 3 runs with
  003, all `P2002` `Booking_uid_key` at 0 ms). Rationale for medium, not high: no double booking happens in
  those trials; a valid booking gets a generic 400. Rationale for a new ID, not a sub-bullet of `-001`: the
  constraint and so the likely cause differ (`uid`, not the idempotency key).
- **Test:** none. No `test.fail()` (the rule needs a _proven_ product bug with repeated evidence, and the
  cause is unproven). The count stays visible in `P6-CAL-RACE-003` as `loser_refused-db-error`. The README
  describes it.
- **Escalate later** to a `test.fail()` only if the closeout runs show a refused leg **plus** the second
  leg accepted in the _same_ trial as a double booking, or if the cause is confirmed.
- The build greps the two closeout runs' `cal-web-log` (§9 step 7) and records any new refused legs and
  their constraint. If a closeout run shows a **different** constraint, stop and report (do not add an ID
  by guessing).

### 5.3 Required checks: the exact ruleset change (by hand)

Today the `Main` ruleset (id 25341555) has no status-check rule. Add it **by hand**, in this order:

1. GitHub, repository `Jayami123/k6-load-concurrency-suite` → **Settings** → **Rules** → **Rulesets** →
   **Main** → **Edit**.
2. Under **Rules**, click **Add rule** → **Require status checks to pass**.
3. Leave **Require branches to be up to date before merging** **off** (not asked for; it would make every
   PR re-run CI).
4. Search for and add each of these three checks, exactly: `medusa-smoke`, `cal-smoke`, `documenso-smoke`
   (the search only offers a check that has run on the repo, and all three have).
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

Check after saving (the build runs this, read-only):

```bash
gh api repos/Jayami123/k6-load-concurrency-suite/rulesets/25341555 \
  --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
```

Expected output (three lines, in any order):

```
medusa-smoke
cal-smoke
documenso-smoke
```

Note: once this rule is on, a PR cannot merge until all three jobs are green. Documenso's PR job is 2.2 min
(§4), so this costs little.

### 5.4 Upstream issue drafts and the new ID

- The three drafts exist (§2.8). Jayami files them (P6 files nothing upstream). The build does not check
  filing status.
- For `P6-OBS-CAL-003` there is no draft. Recommended: Jayami asks for one (Open question 2), written in
  the Task 4 Appendix A style once its root cause is read at `CAL_REF`.

## 6. Known product bugs (the table the README carries)

| ID                              | Severity                                       | Summary                                                                                                                              | Test (how it is recorded)                                                                        | Evidence (run and artefact)                                                                                              |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `P6-OBS-CAL-001`                | low (proposed; Task 4 set no severity, §14 Q3) | Concurrent identical-slot losers get a 400 "An error occurred while querying the database." (Prisma `P2002` redacted) instead of 409 | `tests/cal/races/cal-race-001-identical-slot.spec.ts`, `test.fail()` on the loser-contract extra | run 39561220290, `race-histograms-cal`: `P6-CAL-RACE-001.json` (950 redacted 400 per 1000), `extra-loser-contract.json`  |
| `P6-OBS-CAL-002`                | **high** (confirmed)                           | Two overlapping bookings on one host are both ACCEPTED                                                                               | `tests/cal/races/cal-race-003-overlap.spec.ts`, `test.fail()`                                    | run 39561220290, `race-histograms-cal`: `P6-CAL-RACE-003.json` (29 of 30 double-booked)                                  |
| `P6-OBS-CAL-003` (proposed, R8) | medium (proposed)                              | A valid booking in an overlapping pair is refused with a generic 400 on a `Booking_uid_key` unique violation                         | none (no `test.fail()`); counted as `loser_refused-db-error` in `P6-CAL-RACE-003`                | runs 39449102426, 39484324139, 39561220290: `P6-CAL-RACE-003.json` (`refusedTraceIds`), `cal-web-log` (the `P2002` line) |
| `P6-OBS-DOC-001`                | low                                            | A wrong password or CSRF token on sign-in returns 500                                                                                | none (README only, Task 6 §2.11)                                                                 | **no CI artefact**: Task 6 probe only (gap, §14 Q5)                                                                      |
| `P6-OBS-DOC-002`                | medium (approved)                              | Two last recipients complete in parallel: double seal (2 DocumentData, 2 completed emails, 2 webhooks)                               | `tests/documenso/races/doc-race-001-last-recipients.spec.ts`, `test.fail()`                      | run 39561220290, `race-histograms-documenso`: `P6-DOC-RACE-001.json` (50 of 50 double-sealed)                            |

Notes:

- `test.fail()` is used only where a product bug is proven with repeated evidence (roadmap rule for
  `test.fail()`). The full-count CI evidence today is 4 runs for `-001`, 3 for `-003`, and 1 for `DOC-002`.
  Runs A and B add two more for `DOC-002` (§10). For `-003` (R8) there is no `test.fail()` (§5.2).
- Each `test.fail()` line is already in place. This task changes none of them (§11).

## 7. README text (verbatim; placeholders are marked `{{…}}`)

The build replaces the **whole** of the README sections shown here. Every `{{…}}` placeholder is a value
that does not exist yet (run ids and numbers from the two closeout runs). Nothing else is a placeholder.

### 7.1 Intro (replaces the first paragraph after the title)

```markdown
P6 of the QA portfolio: load, concurrency and performance tests with [k6](https://grafana.com/docs/k6/)
against self-hosted products started by
[qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `v0.2.11`.

Phase 0 proved the harness and k6 smoke. Phase 1 is done: the race framework and the six race cases for
Medusa, Cal and Documenso (§ "Phase 1 results" below). Every published number comes from a GitHub Actions
run on `main` or a nightly run.
```

### 7.2 New section, placed before "## Rule for numbers"

```markdown
## Phase 1 results

Every number here comes from a GitHub Actions run on `main` or a nightly `schedule` run. A timing is the
median of at least 3 runs. No number comes from a cloud VM or a laptop. Each run links to its run page;
the histograms are the `race-histograms-*` artefacts on that run page. Artefacts are kept 14 days, so the
run page is the lasting link.

Closeout runs (the two runs that hold all three product jobs at full count):
[{{RUN_A}}]({{RUN_A_URL}}) (push to `main`, `{{SHA_A}}`) and
[{{RUN_B}}]({{RUN_B_URL}}) (`workflow_dispatch` on `main`, `{{SHA_B}}`).

### Medusa oversell (`P6-MED-RACE-001`)

Stock S = 5. Pull requests run 3 trials; `main`, nightly and manual runs run 50. The extras run 3 trials.

| Run                                                                                            | Event                 | Trials | Accepted per trial | Oversell           | Per-trial time (s)  |
| ---------------------------------------------------------------------------------------------- | --------------------- | ------ | ------------------ | ------------------ | ------------------- |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298) | push, `98b1c82`       | 3      | 5                  | 0                  | 12.52               |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push, `c3183d2`       | 3      | 5                  | 0                  | 10.39               |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push, `6d73fd3`       | 3      | 5                  | 0                  | 16.51               |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push, `3c6b7c6`       | 3      | 5                  | 0                  | 14.28               |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push, `0f8bf23`       | 3      | 5                  | 0                  | 14.68               |
| [{{RUN_A}}]({{RUN_A_URL}})                                                                     | push, `{{SHA_A}}`     | **50** | {{MED_A_ACCEPTED}} | {{MED_A_OVERSELL}} | {{MED_A_PER_TRIAL}} |
| [{{RUN_B}}]({{RUN_B_URL}})                                                                     | dispatch, `{{SHA_B}}` | **50** | {{MED_B_ACCEPTED}} | {{MED_B_OVERSELL}} | {{MED_B_PER_TRIAL}} |

The 3-trial rows are the history before the count change. The full-count rows are the evidence.
Per-trial median over all main and nightly runs: {{MED_MEDIAN}} s (n = {{MED_N}}). The 400 rows are
out-of-stock refusals (`not_allowed`), which are expected.

### Cal identical slot (`P6-CAL-RACE-001`)

Pull requests run 5 trials; `main`, nightly and manual runs run 50. Per trial: 1 ACCEPTED, the rest refused.

| Run                                                                                            | Event                 | Trials | Accepted per trial | Redacted 400 (of 1000 requests) | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | --------------------- | ------ | ------------------ | ------------------------------- | ------------------ |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push, `c3183d2`       | 50     | 1                  | 950                             | 1.04               |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push, `6d73fd3`       | 50     | 1                  | 950                             | 0.76               |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push, `3c6b7c6`       | 50     | 1                  | 950                             | 1.01               |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push, `0f8bf23`       | 50     | 1                  | 950                             | 0.96               |
| [{{RUN_A}}]({{RUN_A_URL}})                                                                     | push, `{{SHA_A}}`     | 50     | 1                  | 950                             | {{CAL1_A}}         |
| [{{RUN_B}}]({{RUN_B_URL}})                                                                     | dispatch, `{{SHA_B}}` | 50     | 1                  | 950                             | {{CAL1_B}}         |

Median per-trial time: {{CAL1_MEDIAN}} s (n = {{CAL1_N}}). The 950 redacted 400s per run are
`P6-OBS-CAL-001` (see Known product bugs).

### Cal overlap (`P6-CAL-RACE-003`)

Pull requests run 5 trials; `main`, nightly and manual runs run 30 (the case cap). A double-booked trial
has both legs ACCEPTED on overlapping windows. A refused leg is counted in its trial, which is clean.

| Run                                                                                            | Event                 | Trials | Double-booked   | Clean          | Refused legs     | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | --------------------- | ------ | --------------- | -------------- | ---------------- | ------------------ |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push, `6d73fd3`       | 30     | 28              | 2              | 2                | 0.302              |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push, `3c6b7c6`       | 30     | 29              | 1              | 1                | 0.353              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push, `0f8bf23`       | 30     | 29              | 1              | 1                | 0.345              |
| [{{RUN_A}}]({{RUN_A_URL}})                                                                     | push, `{{SHA_A}}`     | 30     | {{C3_A_DOUBLE}} | {{C3_A_CLEAN}} | {{C3_A_REFUSED}} | {{C3_A_PER_TRIAL}} |
| [{{RUN_B}}]({{RUN_B_URL}})                                                                     | dispatch, `{{SHA_B}}` | 30     | {{C3_B_DOUBLE}} | {{C3_B_CLEAN}} | {{C3_B_REFUSED}} | {{C3_B_PER_TRIAL}} |

Median per-trial time: {{C3_MEDIAN}} s (n = {{C3_N}}). Pooled double-booked: {{C3_POOLED}} of {{C3_TOTAL}}
trials. `P6-OBS-CAL-002` is the product bug (high).

### Documenso completion races (`P6-DOC-RACE-001`, `P6-DOC-RACE-002`, control)

Pull requests run 5 trials; `main`, nightly and manual runs run 50 (the control: 5).

| Case                 | Run                                                                                            | Trials | Result                                                     | Per-trial time (s)   |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- | -------------------- |
| `P6-DOC-RACE-001`    | [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | 50     | 50 of 50 double-sealed (`P6-OBS-DOC-002`)                  | 2.50                 |
| `P6-DOC-RACE-002`    | [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | 50     | 50 of 50 single seal; 50 SIGNED, 450 ALREADY_SIGNED; 0 5xx | 1.44                 |
| control (sequential) | [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | 5      | 5 of 5 single seal                                         | 2.66                 |
| `P6-DOC-RACE-001`    | [{{RUN_A}}]({{RUN_A_URL}})                                                                     | 50     | {{DOC1_A}}                                                 | {{DOC1_A_PER_TRIAL}} |
| `P6-DOC-RACE-002`    | [{{RUN_B}}]({{RUN_B_URL}})                                                                     | 50     | {{DOC2_B}}                                                 | {{DOC2_B_PER_TRIAL}} |

Timings are published once they have a median of at least 3 runs: {{DOC_TIMING_STATUS}}.

### Known product bugs

Each bug is recorded in CI by the test named below, with the run that proves it. A `test.fail()` line turns
red ("expected to fail but passed") once the bug is fixed, and is then removed.

| ID                    | Severity          | What happens                                                                                                                       | Test                                                                       | Evidence                                                                                                                                          |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-CAL-001`      | low (proposed)    | Concurrent identical-slot losers get 400 "An error occurred while querying the database." (Prisma `P2002` redacted) instead of 409 | `cal-race-001-identical-slot.spec.ts`, `test.fail()` on the loser contract | [{{RUN_A}}]({{RUN_A_URL}}) `race-histograms-cal` `P6-CAL-RACE-001.json`                                                                           |
| `P6-OBS-CAL-002`      | high              | Two overlapping bookings on one host are both ACCEPTED                                                                             | `cal-race-003-overlap.spec.ts`, `test.fail()`                              | [{{RUN_A}}]({{RUN_A_URL}}) `race-histograms-cal` `P6-CAL-RACE-003.json`                                                                           |
| `P6-OBS-CAL-003` (R8) | medium (proposed) | A valid booking in an overlapping pair is refused with a generic 400 (Prisma `P2002` on `Booking_uid_key`)                         | none; counted as `loser_refused-db-error` in `P6-CAL-RACE-003`             | [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) `cal-web-log`, `P6-CAL-RACE-003.json`              |
| `P6-OBS-DOC-001`      | low               | A wrong password or CSRF token on sign-in returns 500                                                                              | none (README only)                                                         | Task 6 probe (not a CI artefact)                                                                                                                  |
| `P6-OBS-DOC-002`      | medium            | Two last recipients complete in parallel: double seal                                                                              | `doc-race-001-last-recipients.spec.ts`, `test.fail()`                      | [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) `race-histograms-documenso` `P6-DOC-RACE-001.json` |

### Phase 1 status

Phase 1 of the master plan is **done**. Cases evidenced from `main` runs: `P6-MED-RACE-001`, `P6-CAL-RACE-001`,
`P6-CAL-RACE-002`, `P6-CAL-RACE-003`, `P6-DOC-RACE-001`, `P6-DOC-RACE-002`. Closeout runs:
{{RUN_A}} and {{RUN_B}}. Open product bugs: the five above.
```

### 7.3 Medusa section (add one line under "### Medusa oversell histogram", after the existing bullets)

```markdown
- Trial count: pull requests run 3 trials; `main`, nightly and manual runs run 50 (the extras run 3).
```

(The existing Cal and Documenso sections already state the trial counts and need no change.)

## 8. Environment

Two cloud environments run this repo. For each, what is automatic and what must be pasted by hand:

**Cursor cloud** (`.cursor/environment.json`, `AGENTS.md`).

- Automatic from the repo: npm packages are installed, and `scripts/bootstrap.sh medusa` clones the Medusa
  fork; Docker is started by the environment's `start` command.
- Before any harness command, the shell must `export PATH="/usr/local/bin:$PATH"` (Cursor puts its own Node
  22.14 first; Medusa needs Node 22.23). This is a per-shell step, written in `AGENTS.md`, not a secret.
- Pasted by hand: **nothing.**

**Claude Code cloud** (`.claude/hooks/session-start.sh`, `AGENTS.md`).

- Automatic from the repo: the session-start hook starts Docker and puts `/usr/local/bin` (Node 22.23)
  first on PATH through `$CLAUDE_ENV_FILE`; the environment's setup script installs the tools.
- Documenso needs Node 24. `npm run up:documenso` and `bootstrap.sh documenso` pick `/opt/node24` themselves.
- Pasted by hand: **nothing** for the build. The `gh` CLI printed a `GH_TOKEN` login warning during this
  probe, but every `gh run` and `gh api` read succeeded, so no token needs pasting. (If a later `gh` call
  fails, say so and check the GitHub access settings rather than pasting a token into the chat.)

Neither environment needs a secret for this task. The ruleset change (§5.3) is done in the GitHub UI by
Jayami, not in either environment.

## 9. Build steps (for the weaker model; repo root; in order)

Rules for the whole build: never `git add -A`; never print a token; never edit a product fork, the harness
package, or any `test.fail()` line. Stop and report on any output that differs from the expected output.

### Step 0. Branch and the plan doc

```bash
export PATH="/usr/local/bin:$PATH"
git fetch origin main plan/2026-10-20-p6-phase1
git checkout -B feat/2026-10-22-p6-phase1-closeout origin/main
git checkout origin/plan/2026-10-20-p6-phase1 -- docs/plans/2026-10-21-p6-phase1-task8-closeout.md
git status --short
```

Expected: `A  docs/plans/2026-10-21-p6-phase1-task8-closeout.md` and nothing else.

### Step 1. Baseline

```bash
npm ci
npm run check
```

Expected: Prettier clean, typecheck clean, `k6 inspect: 4 script(s) ok.`, unit tests `# fail 0`.

### Step 2. Edit the Medusa race step in `.github/workflows/perf.yml`

Replace the block in §3 ("Current") with the block in §3 ("New"). Change nothing else. Then:

```bash
git diff --stat
npx prettier --check .github/workflows/perf.yml
```

Expected: `1 file changed`, about 9 lines in the diff, and `All matched files use Prettier code style!`.

Check the YAML by eye: the step indentation is 6 spaces (same as the Cal race steps). The check named
`medusa-smoke` does not change (only the step name does).

### Step 3. Local check (must be green before push)

```bash
npm run check
```

Expected: the same as step 1. Do not push on any other result.

### Step 4. Commit and push (no PR unless Jayami asks)

```bash
git add .github/workflows/perf.yml docs/plans/2026-10-21-p6-phase1-task8-closeout.md
git commit -m "ci(medusa): run 50 trials on main, nightly and manual; 3 on PRs"
git push -u origin feat/2026-10-22-p6-phase1-closeout
```

No trailers on the commit (the user's rule for this task). Retry the push up to 4 times with 2 s, 4 s, 8 s,
16 s backoff only on network errors.

### Step 5. Run A (automatic after merge)

The build merges only when Jayami says so (Jayami opens and merges the PR). Then the push to `main` starts
run A. Find it:

```bash
gh run list -R Jayami123/k6-load-concurrency-suite --workflow perf.yml --branch main --limit 3 \
  --json databaseId,headSha,event,status,conclusion
```

Expected: a `push` run whose `headSha` is the merge commit, `status` `completed`, `conclusion` `success`.
Record its id as `{{RUN_A}}` and its SHA as `{{SHA_A}}`.

Check the step count on the run page: the Medusa step summary must say `### P6-MED-RACE-001 trials: 50`.

```bash
gh run view {{RUN_A}} -R Jayami123/k6-load-concurrency-suite --log | grep "P6-MED-RACE-001 trials"
```

Expected: a line `P6-MED-RACE-001 trials: 50`. If it says 3, stop and report (the expression is wrong).

### Step 6. Run B (workflow_dispatch on main)

The nightly has not fired (§2.6), so run B is manual:

```bash
gh workflow run perf.yml -R Jayami123/k6-load-concurrency-suite --ref main
```

Then find it with the same `gh run list` command as in step 5 (look for `event` `workflow_dispatch`).
Record `{{RUN_B}}` and `{{SHA_B}}`. Expected: `conclusion` `success`, and the same `trials: 50` line.

If the nightly fires before run B, it is a valid second run as well. Use whichever one is green and full
count first, and record the choice in the README.

### Step 7. Download the artefacts and summarise (read-only)

Keep the downloads out of the repo. Use the scratchpad directory for the work:

```bash
# S = this session's scratchpad directory (never /tmp, never the repo). Set it by hand:
S="<session scratchpad directory>"; mkdir -p "$S"
for r in {{RUN_A}} {{RUN_B}}; do
  mkdir -p "$S/$r"
  gh run download "$r" -R Jayami123/k6-load-concurrency-suite -D "$S/$r"
done
find "$S" -type f | sort
```

Expected: for each run, `race-histograms-cal/`, `race-histograms-medusa/`, `race-histograms-documenso/`,
and `cal-web-log/`, `documenso-web-log/`, plus the `k6-summary-*` folders.

Summarise with the script in Appendix A (kept in the scratchpad, never in the repo):

```bash
node "$S/summ.cjs" "$S"/{{RUN_A}}/race-histograms-*/*.json "$S"/{{RUN_B}}/race-histograms-*/*.json
```

Expected per full-count run: `P6-MED-RACE-001 … trials 50`, `P6-CAL-RACE-001 … trials 50`, `P6-CAL-RACE-003 …
trials 30`, `P6-DOC-RACE-001/002 … trials 50`, control `… trials 5`, and `viol 0` on every case that is
not a planned `test.fail()` (`P6-DOC-RACE-001` has 400 expected violations; the verdict is `fail` by design).

Token check (must print `0` for every line; a non-zero count is a stop):

```bash
for r in {{RUN_A}} {{RUN_B}}; do
  grep -cE 'api_[A-Za-z0-9]{8,}|Bearer |sessionId' "$S/$r/documenso-web-log/documenso-web.log" || true
done
```

### Step 8. R8 check (for `P6-OBS-CAL-003`)

For each run, list the refused legs and the Prisma constraint at the same millisecond:

```bash
node "$S/refused.cjs" "$S/{{RUN_A}}/race-histograms-cal/P6-CAL-RACE-003.json" "$S/{{RUN_A}}/cal-web-log/cal-web.log"
node "$S/refused.cjs" "$S/{{RUN_B}}/race-histograms-cal/P6-CAL-RACE-003.json" "$S/{{RUN_B}}/cal-web-log/cal-web.log"
```

(`refused.cjs` is the second script in Appendix A.) Expected: one line per refused trace with
`P2002 Booking_uid_key` at 0 ms, the same as §2.5. If a line shows any other constraint, or no match, stop
and report it (do not add an ID by guessing).

### Step 9. Timings (the medians the README needs)

Per-trial time = (`finishedAt` − `startedAt`) ÷ `trials`, from each histogram. The summary script prints it.
Medians are over all `main` and nightly runs of that case (n = number of runs). Compute the Medusa median
over all five 3-trial runs plus runs A and B (n = 7). The per-trial rate is comparable across counts; the
README says so.

### Step 10. Fill the README placeholders and commit

Replace every `{{…}}` in §7 with the value from the summaries. Apply §7.1–§7.3 to `README.md`. Then:

```bash
npm run format:check
grep -n '{{' README.md || echo "no placeholders left"
```

Expected: Prettier clean and `no placeholders left`. If the grep prints a line, a value is missing: stop.

Commit (no trailers) and push:

```bash
git add README.md
git commit -m "docs(readme): add phase 1 results from main runs and mark phase 1 done"
git push -u origin feat/2026-10-22-p6-phase1-closeout
```

### Step 11. Ruleset (by hand, then verify)

Jayami does §5.3 in the GitHub UI. Then the build runs the read-only check from §5.3 and expects the three
lines. Do not change the ruleset in code.

### Step 12. Stop and report

Report, in one message: run ids A and B; their conclusions per job; the Medusa trial line; the Medusa median
per-trial time; any new refused-leg constraint; whether the nightly fired; and the ruleset check output.

## 10. Done when, and what the build waits for

**Done when** (all of these):

1. Two green `main` runs (A and B) with all three jobs `success`, each at full count: Medusa 50, Cal 50 and
   30, Documenso 50 and 5 (control). Run A is the push after this change merges; run B is a
   `workflow_dispatch` (or the nightly, if it fires).
2. All histograms are attached to both runs (the `race-histograms-cal`, `-medusa`, `-documenso` artefacts
   exist on each run).
3. The README cites only runs A and B and the three earlier `main` runs listed in §7 (no PR run, no VM).
4. Every open product bug has its evidence linked (§7 "Known product bugs": CAL-001, CAL-002, CAL-003,
   DOC-001, DOC-002). DOC-001 has no CI artefact yet (Open question 5).
5. `npm run check` is green on the build branch.
6. The ruleset has the three required checks (§5.3), set by Jayami.

**The build waits for** (not for anything else):

- The CI change from §3 to be merged to `main` (Jayami merges it). Run A is then created automatically.
- Run B: a `workflow_dispatch` of `perf.yml` on `main`, started by the build (§9 step 6), or the nightly.
- Documenso and Cal already have full-count `main` data in run 39561220290. They do not need to wait, but
  they need a second and third full-count sample (A and B) for their timings to have a median of 3.

**How the build fills the placeholders:** run A's id and SHA go into `{{RUN_A}}`, `{{RUN_A_URL}}`, `{{SHA_A}}`;
run B's into the `_B` set; the per-run values come from the step 7 summary; the medians from step 9. Run
`39561220290` keeps its own link for the 003 and Documenso rows and needs no placeholder. Where a value is
still missing, leave the placeholder and stop: do not write a guess.

## 11. Rules

- **No product fork and no harness package is edited.** This task changes `perf.yml` (one step), `README.md`
  and this plan doc only.
- **No secret or token anywhere**: not in the README, the plan, a commit, a log or the chat. The probe read
  the run API only. The signed artefact download links (temporary, from the API) are not written anywhere.
- **No `test.fail()` change.** Each existing line stays as it is. A new `test.fail()` needs repeated proof and
  is out of scope here (§5.2).
- **A failing `main` run is root-caused, never re-run blindly.** Classify it as PRODUCT BUG (with the
  histogram and the log line that prove it), TEST BUG (the spec or the oracle is wrong; fix the test), or ENV
  (the runner, the cache, the network; show the step log). A re-run is allowed only to confirm an ENV
  diagnosis, once. A second failure is real.
- **Timing numbers come only from CI runs** on `main` or nightly. The median rule (at least 3 runs) applies to
  every timing published in the README. A timing with n < 3 is not published (§7, Documenso).
- **No number from a cloud VM** (AGENTS.md). The README tables cite run ids only.
- **Read-only probes stay read-only.** The build does not change Cal's or Documenso's data; it reads
  artefacts and `cal-web-log` only.
- **Commits: environment identity, no trailers.** No `Claude-Session`, no `Co-Authored-By`, no "Generated
  with". The `GIT_AUTHOR_*` and `GIT_COMMITTER_*` values come from the environment; they are not rewritten.
- **Do not create a PR** unless Jayami asks for one (§9 step 4).

## 12. Risks

1. **Total CI minutes (main-run cost).** `main`, nightly and manual runs go from about 12.6 to about 23.8 job-
   minutes (§4). The nightly alone adds about 336 job-minutes a month. Mitigation: none in this task; the
   cost is Jayami's call (Open question 8).
2. **Medusa 50-trial duration and spread.** Measured per-trial times are 10.4–16.5 s at 3 trials; the 50-trial
   run is unmeasured. Expected job 13.9 min, worst 15.7 min, against a 45-min timeout. The 50-trial spread is
   unknown (§5.1). If the job ever times out, root-cause it (ENV vs PRODUCT BUG) before raising the timeout.
3. **The nightly has never fired** (§2.6). The README must not cite a nightly run until one exists. Run B is
   a dispatch.
4. **Artefact retention is 14 days.** The README links the run pages (lasting) and the artefacts (expire).
   After 2026-11-03 the earliest histograms are gone. Decision D37 covers how to keep the JSON.
5. **R8 root cause unknown.** `Booking_uid_key` collisions in an overlapping pair suggest a shared `uid`
   source. Until Cal's code at `CAL_REF` is read, the finding is medium and proposed (§2.5, §5.2). The
   timestamp match is strong but not a proof.
6. **`P6-OBS-DOC-001` has no CI evidence** (Task 6 probe only). The README says so; the gap is Open question 5.
7. **Required checks change the merge flow.** Once the three checks are required, a PR waits for all three (§5.3).
   Documenso's PR job is about 2.2 min, so the cost is small.
8. **A `test.fail()` can flip.** If Cal or Documenso ships a fix before the closeout, the matching test turns
   red ("expected to fail but passed"). The rule is to remove that one line and update the README (§6). It is
   not a flake.
9. **The `gh` login warning.** A `GH_TOKEN` login warning appears in this container, but reads work. If a later
   read fails, it is an access problem, not a code problem: say so.

## 13. Decisions (continue from D31)

- **D32 Medusa trial count follows D2.** The Medusa race step is `'3'` on pull requests and `'50'` on `main`,
  nightly and `workflow_dispatch`. Extras stay capped at 3 in the spec (Task 2 D15). Only the one step changes,
  and its name and summary line change with it.
- **D33 Required checks are set by hand, in the `Main` ruleset.** The ruleset gets one rule, the three job
  names (`medusa-smoke`, `cal-smoke`, `documenso-smoke`). No code change, no classic branch protection.
  Strict up-to-date is off.
- **D34 R8 is a new finding, proposed as `P6-OBS-CAL-003`, severity medium, with no test.** Evidence: four
  refused legs in three full-count runs, each a `P2002` on `Booking_uid_key` at 0 ms. Not a sub-bullet of
  `-001`, because the constraint differs. No `test.fail()` until the cause is proven.
- **D35 The rerun-on-high-spread item is carried to the Phase 2 backlog, not built.** The measured maximum
  spread is 7.6 ms against a 20 ms limit, across all `main` runs. A spread retry would be a retry to make a
  test pass. The item reopens if the 50-trial Medusa spread exceeds about 10 ms.
- **D36 The second closeout run is a `workflow_dispatch`** on `main`, because the nightly has not fired. If the
  nightly fires first and is green at full count, it may be run B instead, and the README says so.
- **D37 Histogram evidence is linked by run page; the JSON is kept in the repo only if Jayami agrees.** The
  README cites the run page (lasting) and the artefact name (14-day retention). Recommended: commit the closeout
  runs' histogram JSON under `docs/evidence/<run-id>/` (about 60–70 KB per run, no tokens; scan before commit).
  This needs Jayami's yes (Open question 4).
- **D38 No timeout change for Medusa.** The expected 14–16 min fits the 45-min job timeout; a timeout is added
  only when a run proves it is needed (roadmap rule).
- **D39 Timing medians follow the README rule.** The Medusa per-trial median is taken over every `main` and
  nightly run (n = 7 after the closeout), because a 50-trial-only median would have n = 2. The README says that
  the 3-trial and 50-trial samples are the same kind of measurement.
- **D40 `P6-OBS-DOC-001` stays README-only with the probe as its evidence.** A CI assertion for it would be a
  new test, which Task 8 does not add (roadmap: "No new cases"). Open question 5 asks Jayami to confirm.

## 14. Open questions for Jayami

1. **Nightly never ran.** `perf.yml` has `schedule: 17 2 * * *` on `main` (since 2026-10-18), but the run list
   shows zero `schedule` runs. Can you check Actions → `perf` (is the schedule disabled, or has GitHub skipped
   it)? Should the build use `workflow_dispatch` as run B (D36)? _Recommendation: yes, and fix the nightly
   separately._
2. **R8 as `P6-OBS-CAL-003`, medium.** Do you approve the new ID and medium severity, or should it fold into
   `P6-OBS-CAL-001` as a second instance? And do you want an upstream draft for it (the Task 4 style, once Cal's
   `uid` code at `CAL_REF` is read)? _Recommendation: new ID, medium, and a draft after the code read._
3. **Severity of `P6-OBS-CAL-001`.** Task 4 recorded it as a product bug but never set a severity. It is a wrong
   status code and no double booking happens. _Recommendation: low._ Confirm?
4. **Artefacts expire after 14 days.** Keep run-page links only (D37 default), or commit the closeout runs'
   histogram JSON under `docs/evidence/` (recommended, after a token scan)? Your call.
5. **`P6-OBS-DOC-001` has no CI artefact.** Its evidence is the Task 6 probe (§2.11). Accept the probe as
   evidence with a README note (recommended; a CI check would be a new test, outside Task 8), or add a CI check
   in a later task?
6. **Required checks (§5.3).** Add the three checks to the `Main` ruleset by hand (recommended, D33)? I will not
   change the ruleset.
7. **Upstream drafts.** Three drafts exist (Tasks 4, 5, 7). Confirm they are filed, or tell me where they are if
   they are not. I cannot check the upstream repos from this session.
8. **CI minutes.** The change adds about 11 job-minutes per `main`, nightly or manual run (about 336 a month from
   the nightly alone). Accept the cost, or cut the nightly to the Cal and Documenso cases only? _Recommendation:
   accept; the closeout needs the full count._
9. **Medusa median (D39).** Accept a median over all 7 `main` and nightly runs for the Medusa timing, or require a
   third full-count Medusa run first (a third dispatch)? _Recommendation: accept the 7-run median._
10. **Rerun-on-high-spread (D35).** Close it as carried to the Phase 2 backlog, as proposed, or keep it open?

## Appendix A. Scripts (scratchpad only; never committed)

`summ.cjs` prints one line per histogram and the per-trial time. Save it as `$S/summ.cjs`:

```js
// usage: node summ.cjs <histogram.json>...
const fs = require("fs");
const path = require("path");
for (const f of process.argv.slice(2)) {
  const h = JSON.parse(fs.readFileSync(f, "utf8"));
  const secs = (Date.parse(h.finishedAt) - Date.parse(h.startedAt)) / 1000;
  const oracle = typeof h.oracle === "object" && h.oracle ? h.oracle : {};
  const doubles = oracle.trialsDoubleBooked ?? oracle.trialsDoubleSeal ?? "n/a";
  console.log(
    [
      path.basename(path.dirname(f)),
      h.caseId,
      `trials ${h.trials}`,
      `status ${JSON.stringify(h.statusCounts)}`,
      `verdict ${h.verdict}`,
      `viol ${(h.invariantViolations || []).length}`,
      `double ${doubles}`,
      `refused ${oracle["loser_refused-db-error"] ?? 0}`,
      `per-trial ${(secs / h.trials).toFixed(3)} s`,
    ].join(" | "),
  );
}
```

`refused.cjs` matches each refused trace to its Prisma constraint by timestamp. Save it as `$S/refused.cjs`:

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
  const near = p2002.filter((p) => Math.abs(p.t - t) <= 100).map((p) => `${p.c} (${p.t - t} ms)`);
  console.log(
    id,
    "at",
    new Date(t).toISOString(),
    "P2002 within 100 ms:",
    near.join(", ") || "none",
  );
}
```

Note on `refused.cjs`: the unique-constraint text in the log is escaped (`\\\"Booking_uid_key\\\"`), so the
regex matches the constraint name after the backslashes. If a run's log has a different escape, the
output says `?`, which is a stop, not a pass.
