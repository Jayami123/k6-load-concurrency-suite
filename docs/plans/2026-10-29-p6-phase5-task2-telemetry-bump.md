# P6 Phase 5 Task 2: harness pin bumps, telemetry code, A/A, flags on (build guide)

This is the build guide for **P6** (`Jayami123/k6-load-concurrency-suite`). It depends on the harness releases in
[Task 1](2026-10-29-p6-phase5-task1-harness-telemetry.md). Planning only: this file changes no code.

| Field                           | Value                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan date                       | 2026-10-29 (Asia/Colombo)                                                                                                                                                                                                                                                             |
| Plan branch                     | `plan/2026-10-29-p6-phase5-lane-a`                                                                                                                                                                                                                                                    |
| Build branches (DECIDED: split) | 2a `chore/2026-10-29-p6-harness-pin-bump` (pin `v0.2.16`); 2b-i `chore/2026-10-29-p6-telemetry-tier-code` (pin `v0.2.17`, code, chart, rows, A/A workflow, flags OFF everywhere); 2b-ii `chore/2026-10-29-p6-telemetry-tier-flags-on` (flag env lines on, only after the A/A verdict) |
| Mapped case IDs                 | `P6-X-LOAD-002` extension (no new ID; roadmap "Cases" line 277); accepted extra `P6-X-LOAD-009` (harness-tier overhead, roadmap D11 line 571)                                                                                                                                         |
| Roadmap section                 | [2026-10-22-p6-phase5-roadmap.md](2026-10-22-p6-phase5-roadmap.md) "Task 2: P6 pin bump + flags on + sampler rows", lines 273–311; task table line 154; D1 lines 538–543; D7 lines 558–560; Note 1 lines 187–198                                                                      |
| Base (P6 main)                  | `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29 09:18 Asia/Colombo)                                                                                                                                                                                                            |
| Unit count at base (B0)         | 1405 (`# tests 1405`, `# pass 1405`, `# fail 0`; measured in this session; the prompt's 1403 is stale)                                                                                                                                                                                |
| Harness tags this plan pins     | 2a: `v0.2.16` (H4 only). 2b-i and 2b-ii: `v0.2.17` (H1 + H2). Both are owner decisions (Task 1, Q1)                                                                                                                                                                                   |

Stale facts in the roadmap, corrected here (see the conflicts table): it asks to bump `h0.2.11`-style suffixes in
`perf.yml` only; the live state is 31 suffix lines in four workflows, and the pin test checks `perf.yml` only.

## 0. Owner decisions (DECIDED, from the review of PR #161)

PR #161 is closed by the owner; plan branches never get a PR (repo rules A.6 and B.10). These answers are binding:

- **Q-SPLIT, DECIDED:** 2a (pin to `v0.2.16`); 2b-i (code, chart, rows, A/A workflow, flags OFF everywhere; the owner
  dispatches the A/A); 2b-ii (flag env lines on, only after `P6-X-LOAD-009` passes or its breach is recorded).
- **Q-SCOPE, DECIDED:** (c) defer the Cal and Documenso LOAD flags now. Later, (b): a `ci(perf)` PR moves those LOAD steps
  into race-free jobs (not part of Lane A).
- **Q-AA-JOBS, DECIDED:** one job on one runner, in a new dispatch-only workflow `.github/workflows/tier-aa.yml`.
- **Q-AA-TRIGGER, DECIDED:** dispatch only. One normal-order run for `P6-X-LOAD-009`, plus one reversed-order run (EXTRA-AA-ORDER).
- **Q-C3, DECIDED:** a separate owner-tracked `ci(perf)` PR with the corrected numbers in section 8.3. It caps every uncapped
  step and splits `documenso-smoke` into races and load jobs. It never raises a timeout. It is not part of Lane A.
- **Q-OWN, DECIDED:** accept the five extra files and `.github/workflows/tier-aa.yml`. They are recorded in the ownership table (5.0).

## 1. What it proves

- **`P6-X-LOAD-002` extension (no new ID).** Question: does a VALID LOAD run ship two new telemetry rows, top queries (from
  `pg_stat_statements` deltas) and true event-loop delay (from the preload), and is the 1 Hz health-probe series labelled as
  the proxy?
  - **Oracle:** (a) top queries: the test recomputes each delta as `end.totalMs - start.totalMs` per `queryid` (a `queryid`
    missing from the start snapshot counts from 0); the stored rows must match, and their sum must not exceed the run's total
    delta. (b) event-loop rows: one row per second per server process inside the run window (`floor(duration_s) - 2` or more),
    every value finite and `>= 0`, `p99 >= p50`, `max >= p99`. (c) with the flags off, the telemetry JSON has no `topQueries`
    or `eventLoop` key, byte-equal to the Phase 3 output.
  - **Verdict words:** PASS (both row sets present and consistent in a VALID run, chart label present); FAIL (rows present but
    inconsistent: a product or telemetry bug, labelled by N4 with evidence); INCONCLUSIVE (the run is INVALID, the preload file
    is missing, the statement view was evicted during the run, or a delta was negative: never PASS); NOT RUN (flags off in a
    job that expects them on).
- **`P6-X-LOAD-009` (accepted extra).** Question: does turning the harness tier on (flags on versus off) move Medusa's steady
  metrics beyond the Phase 4 A/A tolerance?
  - **Oracle:** for each metric `m` in `p50Ms`, `p95Ms`, `requestsPerSec`: three OFF arms and three ON arms of
    `P6-MED-LOAD-002 --profile steady` (one job, one runner, section 5.4). `medOff` and `medOn` are the medians of each state;
    `pooled` is the median of all six values; `relDiff = |medOn - medOff| / pooled`. `T_m` is the stored tolerance in
    `k6/thresholds/tolerance.json` for `products.medusa.<m>.tolerance` (values in row 9).
  - **Verdict words:** PASS (all three `relDiff <= T_m`, every arm VALID); FAIL (any `relDiff > T_m`: the breach is recorded with
    the metric and both medians, and the tier stays off for that metric's evidence until explained); INCONCLUSIVE (fewer than 3
    VALID arms in a state, or any arm INVALID); NOT RUN (the dispatch was not run).
- **Transfer:** the check a payments or EHR team runs before turning a diagnostic on in production: the diagnostic must not move
  the numbers they report.

## 2. Live probe evidence (2026-10-29)

| #   | fact                                                                           | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | what it changes in the design                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Current pin and lock                                                           | `package.json:63` `"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.15"`; `package-lock.json:9` the same spec; `package-lock.json:270–272` `node_modules/qa-portfolio-harness`, `resolved` `git+ssh://git@github.com/Jayami123/qa-portfolio-harness.git#43dc0da7874a50d709b328bfb492e1e091a9fc64`                                                                                                                                                                                                                                                                                               | 2a changes the spec and refreshes the lock with `npm install`; 2b-i changes it again to `v0.2.17`                                                                                                                                       |
| 2   | Every pin and suffix location                                                  | `rg -n 'h0\.2\.15\|qa-portfolio-harness#' .` (excluding `node_modules`): `.github/workflows/perf.yml` 14 lines (138, 226, 322, 483, 700, 873, 1114, 1293, 1408, 1598, 1775, 2659, 2843, 3003); `knee.yml` 8 (198, 380, 580, 785, 963, 1186, 1364, 1557); `gate.yml` 6 (282, 392, 723, 806, 1178, 1392); `soak.yml` **3** (181, 350, 532). Total **31** (the prompt and roadmap say 30 and soak 2). Other hits are historical docs and `tests/unit/load-run-meta.test.ts` (a fixture spec naming `v0.2.14`, not a pin)                                                                                              | 2a and 2b-i each rewrite all 31 lines; the rg check proves zero old suffixes                                                                                                                                                            |
| 3   | The pin test checks one file                                                   | `tests/unit/harness-pin.test.ts:25–34`: reads `.github/workflows/perf.yml` only, requires `>= 9` suffixes and one distinct value; `:35–37` checks the second paragraph of `README.md` carries the tag                                                                                                                                                                                                                                                                                                                                                                                                              | 2a extends it to four files (perf, knee, gate, soak); per-file minimums equal today's counts (14, 8, 6, 3), which is stricter than `>= 9` and weakens nothing. The test reads the tag from `package.json`, so 2b-i needs no test change |
| 4   | README version line                                                            | `README.md:5` `` `v0.2.15` `` in the second paragraph; other README mentions (`:301`, `:700`) are history                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 2a edits line 5 to `v0.2.16`; 2b-i to `v0.2.17`                                                                                                                                                                                         |
| 5   | Which jobs contain race steps before LOAD                                      | `perf.yml` `cal-smoke` (job at `:987`, timeout 60): `Start Cal (harness up)` `:1126`, `Race self-test` `:1137`, `Race P6-CAL-RACE-001` `:1148`, `Race P6-CAL-RACE-003` `:1161`, LOAD `:1176–1200`. `documenso-smoke` (`:1507`, timeout 45): `Start Documenso (harness up)` `:1608`, `Documenso races` `:1618`, LOAD `:1646–1682`. `medusa-load` (`:391`, timeout 45): `Start Medusa` `:500`, LOAD `:520–557`; **no race step** in the job. `soak.yml`: `cal-soak` start `:193`, soak `:205`; `medusa-soak` start `:368`, soak `:378`; `documenso-soak` start `:542`, soak `:552`; **no race step** in any soak job | Flags set on a product start reach every step that uses that product in the same job. Safe now: `medusa-load` and the three soak jobs. Not safe without a new job: Cal and Documenso LOAD in `perf.yml` (Q-SCOPE, deferred)             |
| 6   | The flags act at product start, not in LOAD steps                              | `src/adapters/medusa.adapter.ts:274–281` (`backendProcessEnv`) and the `up()` calls read process env at start; `docker/*` overlays apply at `compose up` (Task 1 rows 5–9)                                                                                                                                                                                                                                                                                                                                                                                                                                         | The env lines go on the `Start <product> (harness up)` step as well as on the LOAD step. The LOAD step also needs them, because the sampler reads the variables at run time                                                             |
| 7   | Triggers of `perf.yml` (corrected from the first draft)                        | `perf.yml:4–16`: `pull_request` (no paths filter), `push` to `main`, `workflow_dispatch` (input `medusa_retry_repeats`), and `schedule` `cron: "17 2 * * *"` (02:17 UTC = 07:47 Asia/Colombo). The schedule was added by commit `411bfa1` (2026-10-20, "ci(cal): run cal races nightly with full trial counts"); verified with `git show 411bfa1 -- .github/workflows/perf.yml` (`+  schedule:`, `+    - cron: "17 2 * * *"`)                                                                                                                                                                                      | **The first draft wrongly said there is no schedule.** `medusa-load` runs nightly, so the nightly LOAD run the roadmap asks for exists. Q-AA-TRIGGER is re-argued in section 13.2                                                       |
| 8   | Budget facts, computed from the workflow (section 8.3 has the per-event paths) | `medusa-load`: timeout 45; LOAD path (push and schedule) sums to **28** (margin 17); VERIFY path (dispatch only) sums to **35** (margin 10); PR path **22**; **15 uncapped steps** (breaks C2). `documenso-smoke`: timeout 45; push **66** (margin **-21**), schedule **61** (margin **-16**), PR **42** (margin 3); **17 uncapped steps** (C2) and C3 breach on push and schedule. `cal-smoke`: timeout 60, 31 capped steps, sum 50, margin 10, 0 uncapped. Soak jobs: `cal-soak` 225 / 204 / 21; `medusa-soak` 225 / 196 / 29; `documenso-soak` 225 / 197 / 28                                                   | Task 2 adds no step and no cap to these jobs. Their breaches are reported as Q-C3, not fixed here                                                                                                                                       |
| 9   | A/A tolerance file                                                             | `k6/thresholds/tolerance.json`: `schema` 1, `release` `p6-phase4`, products `cal` and `medusa` only (no `documenso`), metrics `p50Ms`, `p95Ms`, `requestsPerSec`. Medusa: `p50Ms` spread `0.2119`, tolerance **`0.4238`**; `p95Ms` spread `0.0397`, tolerance **`0.1000`** (floor); `requestsPerSec` spread `0.0048`, tolerance **`0.1000`** (floor); each has 6 arm IDs from runs `40497029348` and `40605925118`                                                                                                                                                                                                 | X-LOAD-009 uses the Medusa entries only. Six arms in the calibration, so the test uses three per state                                                                                                                                  |
| 10  | The tolerance formula                                                          | `src/load/gate/tolerance.ts:2` `T = max(FLOOR, K x S)`; `:5` `K = 2`; `:6` `FLOOR = 0.1`; `:7` `MIN_ARMS = 3`; `:8` `MIN_RUNS = 2`; `:9` `TOLERANCE_METRICS`; `src/load/gate/aa-noise.ts:34–40` `spreadOf` = `(max - min) / median`, throws below 3 arms                                                                                                                                                                                                                                                                                                                                                           | The verdict uses the stored `T_m`, not a new one. Three arms per state is the smallest set the gate accepts                                                                                                                             |
| 11  | Steady profile                                                                 | `src/load/steady.ts:5` `STEADY_DURATION_SEC = { full: 120, pr: 30 }`; `scripts/load/run-load.ts:1` `--profile pr\|full\|steady\|soak`, `:33–37` profile checks, `:80` `--out` (default `results/load`); `package.json` script `load:medusa-steady` runs `P6-MED-LOAD-002 --profile steady`                                                                                                                                                                                                                                                                                                                         | An arm is 120 s plus setup; the arm cap is 4 min                                                                                                                                                                                        |
| 12  | Existing telemetry self-test                                                   | `k6/selftest/telemetry.js` and `src/load/cases.ts` reference `P6-X-LOAD-002`; `perf.yml:2467` `Telemetry self-test (P6-X-LOAD-002)` (timeout 3), in job `load-overhead` (`:2446`, timeout 25)                                                                                                                                                                                                                                                                                                                                                                                                                      | The self-test must stay green; it does not start a product                                                                                                                                                                              |
| 13  | Gate header: one stack                                                         | `.github/workflows/gate.yml:1–3`: the A/A noise sets run "on one stack, all at the steady rate of the product"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The A/A runs its OFF and ON arms on the same runner, one stack after the other (section 5.4)                                                                                                                                            |
| 14  | README chart text                                                              | `README.md:820` describes `chart-<label>.html` (requests per second, p95, sampler cost). **No heading called "How to read the chart" exists** (`rg -n -i 'chart' README.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2b-i edits the paragraph at `:820` and adds the proxy label text there (Q-README)                                                                                                                                                       |
| 15  | Node and checkout pattern                                                      | `perf.yml:86` and `:276` `node-version-file: ${{ env.P6_WORKING_DIRECTORY }}/.nvmrc`; the Medusa jobs check out the fork into `${{ github.workspace }}/p6/...` (the stub step at `:430`)                                                                                                                                                                                                                                                                                                                                                                                                                           | The new workflow copies the `medusa-load` setup block exactly (same action SHAs)                                                                                                                                                        |
| 16  | Pinned actions in use                                                          | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (used in every job); `actions/upload-artifact` with the `name: load-medusa` upload at `:586`                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The new workflow reuses the SHAs already in the file. `actions/download-artifact` is not used in P6 yet; not needed in the one-job design                                                                                               |
| 17  | Artefact retention                                                             | the roadmap says 14 days (`docs/releases/p6-phase1.md`, roadmap lines 86–87)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The A/A artefacts are evidence that expires; the verdict is also written into the job summary                                                                                                                                           |
| 18  | Preload path inside the P6 checkout                                            | the preload is a repo file, `src/load/telemetry/preload/el-delay.cjs` (NEW), so the path is `${{ github.workspace }}/p6/src/load/telemetry/preload/el-delay.cjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The env value is a fixed path; no secret                                                                                                                                                                                                |
| 19  | Harness flags and CI                                                           | the harness reads flags in `process.env` (Task 1 rows 5–8). For Medusa, `backendProcessEnv` uses only `.env` (Task 1 row 7); the H2 spawns go through `serverProcessEnv`                                                                                                                                                                                                                                                                                                                                                                                                                                           | Task 2 relies on Task 1 PR C (tag `v0.2.17`) for 2b-i's A/A ON arm                                                                                                                                                                      |
| 20  | `pg_stat_statements` on the harness Postgres                                   | `postgres:15` ships the extension (Task 1 row 20). Medusa and Documenso use `postgres:15`; Cal and Twenty use fork images                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Live snapshot cost, read permission and dealloc counter NOT PROBED**: needs a running product started by the harness, which is not in this session. Build-time re-check in the first `tier-aa` run                                    |
| 21  | Query text carries no secret                                                   | `pg_stat_statements` replaces constants with `$n` placeholders (PostgreSQL behaviour, documented; not probed live)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Still token-scanned (`perf.yml` step "Token scan of the LOAD results", `:575`)                                                                                                                                                          |
| 22  | Event-loop API on the product's Node                                           | `perf_hooks.monitorEventLoopDelay` exists in Node 24 (Task 1 row 14, the Twenty image). The P6 jobs use `.nvmrc` Node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **The preload is NOT live-run on Medusa's Node in this session** (no product). Build-time re-check: the idle baseline (section 4) and one `tier-aa` run                                                                                 |
| 23  | `pg_stat_statements_info`                                                      | the view with the `dealloc` counter exists from PostgreSQL 14 (documented; the harness uses `postgres:15`, Task 1 row 20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Eviction detection uses its `dealloc` delta (section 6). **NOT PROBED live**                                                                                                                                                            |

## 3. Depends on

| Item                                                                   | Blocks                                          | Status                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Task 1 PR A (H4) merged and the release `v0.2.16` tagged               | 2a (the pin must exist) and Lane B Task 3       | owner merges and tags                                           |
| Task 1 PR B (H1) and PR C (H2) merged and the release `v0.2.17` tagged | 2b-i (the A/A ON arm needs H1 and H2) and 2b-ii | owner merges and tags                                           |
| Phase 3 Task 5 (`src/load/telemetry/*`, chart)                         | 2b-i code paths                                 | merged: `sampler.ts`, `run.ts`, `render-chart.ts` exist (row 8) |
| Phase 4 Task 7 (`soak.yml`)                                            | 2b-ii soak env lines                            | merged: `soak.yml` exists, three product soak jobs (row 5)      |
| Phase 4 Task 11 (`k6/thresholds/tolerance.json`)                       | 2b-i verdict                                    | merged: file exists, release `p6-phase4` (row 9)                |
| Owner dispatches `tier-aa` (normal order, then reversed order)         | 2b-ii (the flags-on PR waits for the verdict)   | owner step owner-4                                              |
| Owner merges each PR with a merge commit                               | the next PR's CI                                | owner step                                                      |

## 4. Build-time re-check (run first)

| fact                                                 | how to re-check at build start                                                                                     | if it changed                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| main is at or after `5215127`                        | `git fetch origin main && git log --oneline 5215127..origin/main`                                                  | list the commits; if a workflow or tolerance file changed, re-count the 31 lines and the budgets             |
| harness tags exist                                   | `git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness v0.2.16^{} v0.2.17^{}`                     | no tag: stop; that Task 1 release is not done                                                                |
| suffix count                                         | `rg -c 'h0\.2\.16' .github/workflows` (expect 14, 8, 6, 3 for perf, knee, gate, soak)                              | a different count: the new total replaces 31 and the minimums in the test change to the new counts           |
| race steps before LOAD                               | `rg -n 'race\|Race' .github/workflows/perf.yml` between each job's start and LOAD steps                            | a race step added to `medusa-load` would make 2b-ii unsafe for that job                                      |
| tolerance values                                     | `node -e 'console.log(require("./k6/thresholds/tolerance.json").products.medusa)'`                                 | the verdict reads the file at run time; no copy in code                                                      |
| Medusa idle baseline of the event-loop delay (probe) | one `tier-aa` arm with the preload loaded and no load: `monitorEventLoopDelay` `p50` and `p99` of the idle process | the idle p99 becomes the floor the event-loop oracle uses; record it before setting any event-loop threshold |
| snapshot cost, read permission, dealloc              | the first `tier-aa` run: time both snapshots and read `pg_stat_statements_info`                                    | if a snapshot takes more than 1 s, report it; keep two snapshots per run (already the design)                |
| preload runs on Medusa's Node                        | the first `tier-aa` run: `el-<pid>.ndjson` has rows for the `server` role                                          | no rows: the preload did not load; check `NODE_OPTIONS` in `serverProcessEnv` first (Task 1 section 5.5)     |
| `actions/upload-artifact` retention                  | the existing `load-medusa` upload step (`perf.yml:586`)                                                            | copy its settings                                                                                            |

## 5. Design

### 5.0 File ownership (build), copied from the Phase 5 planning prompt

This plan keeps to the **Lane A, Task 2 (P6)** row; the other rows belong to the other build sessions. The extra files
accepted in Q-OWN are added to the Lane A, Task 2 "Owns" cell (marked `[Q-OWN]`).

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                      |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml (rewritten to the pinned tag: `-h0.2.16` in 2a, `-h0.2.17` in 2b-i); tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change; 2b-ii only); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step, which is `.github/workflows/tier-aa.yml` `[Q-OWN]` with `src/load/tier-aa/verdict.ts` `[Q-OWN]`, `scripts/load/aa-flags-verdict.ts` `[Q-OWN]` and `tests/unit/aa-verdict.test.ts` `[Q-OWN]`; `tests/unit/telemetry-el-preload.test.ts` `[Q-OWN]`; the one-test change in `tests/unit/render-chart.test.ts` `[Q-OWN]`; README "How to read the chart" (the paragraph at `README.md:820`) and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/_, src/dashboard/_, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                       |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                        |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-* releases; contents: read stays)                                                                                                                                                                      | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                               |

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (if the Task 3 plan splits it, 3a foundation may merge before Task 2 and 3b, the verified functional profile, after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 and 5 also need Task 2 merged for their CI; 6 does not); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

### 5.1 2a: the pin to `v0.2.16`, the suffixes and the test (no behaviour change)

- `package.json:63` → `"github:Jayami123/qa-portfolio-harness#v0.2.16"`; `package-lock.json` refreshed by npm.
- 31 lines `-h0.2.15` → `-h0.2.16` in `perf.yml`, `knee.yml`, `gate.yml`, `soak.yml`.
- `tests/unit/harness-pin.test.ts` checks four files (skeleton 5.6). The test count does not change (the suffix test is rewritten in place).
- `README.md:5` → `` `v0.2.16` ``.

### 5.2 2b-i: pin to `v0.2.17`, code, chart, rows, A/A workflow; flags OFF everywhere

- **S7a re-pin (first commit of 2b-i):** `package.json:63` → `#v0.2.17` (npm), 31 suffixes `-h0.2.16` → `-h0.2.17`,
  `README.md:5` → `` `v0.2.17` ``. The pin test needs no change (it reads the tag from `package.json`).
- **Top queries:** `src/load/telemetry/pg-top-queries.ts` (NEW); section 6 and 5.6 give the rules. `run.ts` takes one snapshot
  when the run starts and one when it ends; each row is `{queryid, calls, totalMs, rows, query}`; the top 10 by `totalMs`
  delta go into the run's telemetry JSON under `topQueries`. `run.ts` only (`sampler.ts` unchanged).
- **Event-loop rows:** `src/load/telemetry/event-loop.ts` (NEW) reads `HARNESS_EL_OUT/el-<pid>.ndjson`, keeps the `server` role
  lines inside the run window `[startMs, endMs]`, applies the count rule per process, and writes them under `eventLoop`. The
  preload is `src/load/telemetry/preload/el-delay.cjs` (NEW, Node built-ins only; section 5.5).
- **Chart:** `src/load/chart/render-chart.ts` (CHANGED): adds the `eventLoop p99 (preload)` series and renames the health-probe
  series to `event-loop proxy (health probe)`. The README paragraph at `:820` gets one sentence on the two series (Q-README).
- **A/A:** `src/load/tier-aa/verdict.ts` (NEW, section 5.6) and `scripts/load/aa-flags-verdict.ts` (NEW CLI) run inside the new
  dispatch-only workflow `.github/workflows/tier-aa.yml` (section 5.4). `perf.yml` and `soak.yml` are NOT changed in 2b-i.
- **Flags OFF everywhere in 2b-i.** The product starts in `perf.yml` and `soak.yml` get no flag env. The only flags on in
  2b-i are the A/A workflow's ON arm, set in `tier-aa.yml`'s own step env (section 5.4).
- `.env.example` placeholder lines (section 5.7).

### 5.3 2b-ii: flag env lines on (only after the A/A verdict)

Env lines only, no cap changes. Owner rule: no flag reaches nightly or weekly-soak evidence before the A/A verdict.

- `perf.yml` `medusa-load` (the only race-free perf job): env on `Start Medusa (harness up)` (`:500`) and on the three LOAD steps
  (`:520`, `:531`, `:542`), with the VERIFY step (`:557`) too.
- `soak.yml`: env on `Start Cal` (`:193`), `Start Medusa` (`:368`), `Start Documenso` (`:542`) and on the three soak steps
  (`:205`, `:378`, `:552`).
- **PR gate (DECIDED in review fix 11):** on pull requests the flags stay off (roadmap line 285). The env block is:

```yaml
env:
  HARNESS_PG_STATS: ${{ github.event_name != 'pull_request' && '1' || '' }}
  HARNESS_EL_PRELOAD: ${{ github.event_name != 'pull_request' && format('{0}/p6/src/load/telemetry/preload/el-delay.cjs', github.workspace) || '' }}
  HARNESS_EL_OUT: ${{ github.event_name != 'pull_request' && format('{0}/p6/results/load/el', github.workspace) || '' }}
```

An empty value is OFF in the harness (Task 1 tests: `pgStatsEnabled("")` is false, `elPreloadFromEnv` with an empty value is
undefined). The job-level `env:` is not used.

- Not in 2b-ii: `cal-smoke` and `documenso-smoke` (races, row 5). Q-SCOPE (deferred to the `ci(perf)` PR, section 13.2).

### 5.4 The A/A workflow `tier-aa.yml` (one job, one runner)

A NEW workflow file `.github/workflows/tier-aa.yml` (Q-OWN accepted), `on: workflow_dispatch` only, with inputs:

- `order`: `off-first` (default; the normal order) or `on-first` (EXTRA-AA-ORDER, the reversed run).

Job `flags-aa`, `timeout-minutes: 115` (a new job: rule C1 does not apply). Steps, in order (caps in minutes):

| step                                    | cap         | content                                                                                                                                                                 |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| checkout P6                             | 2           | the `medusa-load` setup block (same action SHAs, row 15)                                                                                                                |
| checkout Medusa fork                    | 6           | pinned fork ref, as `medusa-load`                                                                                                                                       |
| verify fork HEAD                        | 1           | as `medusa-load`                                                                                                                                                        |
| stub harness product roots              | 1           | as `medusa-load`                                                                                                                                                        |
| install P6 dependencies                 | 5           | `npm ci` in `${{ env.P6_WORKING_DIRECTORY }}`                                                                                                                           |
| install k6                              | 2           | `scripts/install-k6.sh` (`.k6-version`)                                                                                                                                 |
| enable pnpm                             | 2           | corepack                                                                                                                                                                |
| restore pnpm store cache                | 2           | as `medusa-load`                                                                                                                                                        |
| install Medusa dependencies             | 10          | as `medusa-load`                                                                                                                                                        |
| restore Medusa build cache              | 2           | as `medusa-load`                                                                                                                                                        |
| generate CI admin password              | 1           | as `medusa-load`                                                                                                                                                        |
| pull Medusa images                      | 6           | `compose-pull.sh` with the existing retries                                                                                                                             |
| start Medusa, state 1                   | 10          | `npm run up:medusa`; env = OFF (no flags) if `order` is `off-first`, else ON (the flag env of 5.3 with literal values `1` and the absolute paths)                       |
| arms 1-1, 1-2, 1-3                      | 4 each (12) | `npm run load:medusa-steady -- --out results/load/aa-flags/<state1>-<n>`                                                                                                |
| stop Medusa, state 1                    | 5           | `npm run down:medusa`, `if: always()`                                                                                                                                   |
| start Medusa, state 2                   | 10          | as above, the other state                                                                                                                                               |
| arms 2-1, 2-2, 2-3                      | 4 each (12) | `--out results/load/aa-flags/<state2>-<n>`                                                                                                                              |
| stop Medusa, state 2                    | 5           | `npm run down:medusa`, `if: always()`                                                                                                                                   |
| verdict, token scan and job summary     | 5           | `node scripts/load/aa-flags-verdict.ts results/load/aa-flags`, then `node scripts/evidence-token-scan.mjs results/load/aa-flags`; writes `verdict.json` and the summary |
| upload artefact `load-aa-flags-<order>` | 5           | `results/load/aa-flags`                                                                                                                                                 |

Sum of caps: **104** (40 setup + 10 + 12 + 5 + 10 + 12 + 5 + 5 + 5). Margin: 115 − 104 = **11** (rule C3 holds). The owner's
review figure was 103 (margin 12); the list above is the one the build will follow, and the difference is that the verdict and
the token scan are one step here with cap 5.

Why one job, one runner (Q-AA-JOBS, DECIDED): the tolerance came from arms on one stack (`gate.yml:1–3`, row 13). Two runners
would add runner-to-runner variance on top of the flag difference, and Medusa's `p95Ms` tolerance is only the 0.1 floor. The
in-between `down` and `up` is the only change between states, so the arms are otherwise comparable. A `flags_aa` input in
`perf.yml` was rejected: it would also run all 18 other perf jobs at full counts.

### 5.5 Test skeletons

```ts
// tests/unit/harness-pin.test.ts (CHANGED, 2a): replaces the perf-only suffix test; the other three tests stay as they are
const WORKFLOWS = ["perf", "knee", "gate", "soak"] as const;
// today's counts (rg, step S3 of 2a); a lower count means a line was deleted
const MIN_SUFFIXES = { perf: 14, knee: 8, gate: 6, soak: 3 } as const;

it("is the suffix of every build cache key in all four workflows", () => {
  for (const name of WORKFLOWS) {
    const suffixes = [
      ...read(`.github/workflows/${name}.yml`).matchAll(/-h(\d+\.\d+\.\d+)\b/g),
    ].map((m) => m[1]);
    assert.ok(
      suffixes.length >= MIN_SUFFIXES[name],
      `${name}.yml: expected at least ${MIN_SUFFIXES[name]} cache-key suffixes, found ${suffixes.length}`,
    );
    assert.deepEqual(
      [...new Set(suffixes)],
      [tag?.slice(1)],
      `${name}.yml carries a suffix other than the pin`,
    );
  }
});
```

### 5.6 Module skeletons (NEW, 2b-i)

```ts
// src/load/telemetry/pg-top-queries.ts
export interface StatementRow {
  queryid: string;
  calls: number;
  totalMs: number;
  rows: number;
  query: string;
}

/** One SELECT for the current database only: WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
 *  AND query NOT LIKE '%pg_stat_%' (P6's own sampler statements are dropped). Also reads pg_stat_statements_info.dealloc.
 *  Query text cut at 200 characters. Throws `pg_stat_statements is not loaded: start the product with HARNESS_PG_STATS=1` on SQLSTATE 42P01. */
export function readStatementSnapshot(
  pool: pg.Pool,
): Promise<{ rows: Map<string, StatementRow>; dealloc: number }>;

/** Top-N by totalMs delta. A queryid missing from start counts from 0. A negative delta drops the row and sets droppedNegative.
 *  Any dealloc increase between the snapshots (PostgreSQL 14+ counter) means eviction: evicted = true. */
export function topQueryDeltas(
  start: { rows: Map<string, StatementRow>; dealloc: number },
  end: { rows: Map<string, StatementRow>; dealloc: number },
  topN?: number, // default 10
): { rows: StatementRow[]; droppedNegative: number; evicted: boolean };
```

```ts
// src/load/telemetry/event-loop.ts
export interface ElRow {
  t: number;
  p50: number;
  p99: number;
  max: number;
  pid: number;
  role: string;
}

/** Reads every <dir>/el-*.ndjson line, parses numbers only, keeps role === "server" rows with startMs <= t <= endMs,
 *  and applies the count rule per process: each pid must have >= floor(durationSec) - 2 rows.
 *  Missing directory or a short process: present false or rows dropped and counted (never throws). */
export function readElWindow(
  dir: string,
  startMs: number,
  endMs: number,
  durationSec: number,
): { rows: ElRow[]; present: boolean; shortPids: number[] };
```

```js
// src/load/telemetry/preload/el-delay.cjs: loaded with --require; Node built-ins only; writes numbers only.
// One line per second: t (epoch ms), p50, p99, max (ms), pid and role (HARNESS_EL_ROLE). An I/O error disables
// the timer after the first failure, so an unwritable directory never crashes the product process.
const { monitorEventLoopDelay } = require("node:perf_hooks");
const fs = require("node:fs");
const path = require("node:path");
const out = process.env.HARNESS_EL_OUT;
if (out) {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const file = path.join(out, `el-${process.pid}.ndjson`);
  const role = process.env.HARNESS_EL_ROLE ?? "unknown";
  const tick = setInterval(() => {
    try {
      const line = {
        t: Date.now(),
        p50: h.percentile(50) / 1e6,
        p99: h.percentile(99) / 1e6,
        max: h.max / 1e6,
        pid: process.pid,
        role,
      };
      fs.appendFileSync(file, JSON.stringify(line) + "\n");
      h.reset();
    } catch {
      clearInterval(tick);
      h.disable();
    }
  }, 1000);
  tick.unref();
}
```

```ts
// src/load/tier-aa/verdict.ts
export const AA_METRICS = ["p50Ms", "p95Ms", "requestsPerSec"] as const;
export interface AaArm {
  state: "off" | "on";
  valid: boolean;
  values: Record<(typeof AA_METRICS)[number], number>;
}
export interface AaMetricResult {
  medOff: number;
  medOn: number;
  pooled: number;
  relDiff: number;
  tolerance: number;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
}
/** relDiff = |medOn - medOff| / pooled; tolerance from tolerance.json products.medusa[metric].tolerance.
 *  Throws `aa-flags: tolerance file has no medusa entry for ${metric}` when the entry is missing. */
export function aaFlagsVerdict(
  arms: AaArm[],
  tolerances: Record<string, number>,
): {
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  metrics: Record<(typeof AA_METRICS)[number], AaMetricResult>;
};
```

Test names (exact):

- `telemetry-top-queries.test.ts` (8): `parses a snapshot into rows keyed by queryid`; `keeps the top 10 deltas by total time`; `counts a queryid missing from the start snapshot from zero`; `drops a negative delta and counts it`; `filters the snapshot to the current database by dbid`; `drops P6's own pg_stat_ sampler statements`; `marks the run evicted when the dealloc counter rises`; `names HARNESS_PG_STATS=1 when the view is missing`.
- `telemetry-event-loop.test.ts` (6): `reads ndjson lines and keeps the run window`; `returns present false for a missing directory`; `rejects a row whose max is below p99`; `ignores a non-numeric field`; `keeps only the server role from a three-file fixture (wrapper, server, build)`; `applies the count rule per process and lists the short pids`.
- `telemetry-el-preload.test.ts` (3): `writes numeric keys only`; `does nothing without HARNESS_EL_OUT`; `disables the timer after the first write error`.
- `aa-verdict.test.ts` (6): `takes the median of each state and the pooled median`; `PASSes when every relDiff is within its tolerance`; `FAILs and names the metric that breaches`; `is INCONCLUSIVE below three valid arms per state`; `uses the 0.1 floor for p95Ms and requestsPerSec`; `reads the medusa entries only`.
- `render-chart.test.ts` +1: `adds the event-loop series and the proxy label`.

### 5.7 `.env.example`

2b-i adds placeholder lines only (no secret): `HARNESS_PG_STATS=` (blank), `HARNESS_EL_PRELOAD=` (blank), `HARNESS_EL_OUT=` (blank),
with a comment that blank or empty means off. The file already exists (`.env.example`).

## 6. Oracles and verdict rules

- **Top queries:** `delta_i = end_i.totalMs - start_i.totalMs`, where `start_i` is 0 when the `queryid` is missing from the start
  snapshot. The rows are the top 10 by `delta_i`. A negative `delta_i` drops the row and counts it; `dealloc` rising between the
  snapshots sets `evicted`. Either `droppedNegative > 0` or `evicted` makes the telemetry block `status: "INCONCLUSIVE"`.
- **Event-loop rows:** per server process, the count in the run window must be `>= floor(durationSec) - 2`; every number finite
  and `>= 0`; `p99 >= p50`; `max >= p99`. Any failure: `status: "FAIL"` with the first bad line number, labelled by N4.
- **A/A (X-LOAD-009):** formulas in section 1. Tolerances: `p50Ms` `0.4238`, `p95Ms` `0.1000`, `requestsPerSec` `0.1000` (row 9),
  read from the file. Three arms per state are required (`MIN_ARMS = 3`, row 10). A breach is recorded in
  `results/load/aa-flags/verdict.json` and in the job summary, and the tier stays off for that metric's evidence.
- **Idle baseline:** the idle `monitorEventLoopDelay` p99 measured in section 4 is recorded before the event-loop oracle's
  thresholds are fixed; no threshold is invented in this plan.
- No threshold is changed. No verdict is weakened: a missing arm is INCONCLUSIVE, not PASS.

## 7. Data isolation, cleanup and leak check

- The preload writes to `results/load/el/`, inside `results/load`, which the existing token scan covers (`perf.yml:575`, and
  the A/A job's own scan). The top-query text lives in the run's telemetry JSON, also scanned.
- Each run window filters the preload lines and keeps the `server` role only, so two LOAD steps sharing one product do not
  mix their rows.
- `results/` is not committed; the existing cleanup and the artefact upload are unchanged.

## 8. CI budget

Tables are computed from the workflow YAML (section 2, row 8). Worst case = the largest literal branch of each expression.
Caps are per event, because several steps are `pull_request`-dependent; the path each event takes is named.

### 8.1 `medusa-load` (perf.yml, job timeout 45): changed by 2b-ii (env lines only)

| path (event)                                       | steps on the path with caps           | sum | margin (>= 10) |
| -------------------------------------------------- | ------------------------------------- | --- | -------------- |
| LOAD path (push and schedule)                      | k6 2; pull 6; LOAD x3 at 6 each       | 28  | 17             |
| VERIFY path (dispatch with `medusa_retry_repeats`) | k6 2; pull 6; VERIFY 25; token scan 2 | 35  | 10             |
| PR path (pull request)                             | k6 2; pull 6; LOAD x3 at 4 each       | 22  | 23             |

The job has **15 uncapped steps** (checkout, install, `Start Medusa`, job summary, stop and others). That breaks C2 (every step
needs a cap). The margin is computed on capped steps only. The breach is C2, not C3: each path sums to less than 45. Env lines
add no time. Owner-tracked under Q-C3.

### 8.2 Soak jobs (soak.yml): changed by 2b-ii (env lines only)

| job                                 | job timeout       | steps with caps     | sum | margin |
| ----------------------------------- | ----------------- | ------------------- | --- | ------ |
| `cal-soak` (`:39`)                  | 225 (120-min run) | 22 capped; soak 165 | 204 | 21     |
| `medusa-soak` (timeout line 244)    | 225               | 21 capped; soak 165 | 196 | 29     |
| `documenso-soak` (timeout line 421) | 225               | 19 capped; soak 165 | 197 | 28     |

### 8.3 Unchanged jobs with pre-existing breaches (Q-C3; flags stay off; for the owner-tracked `ci(perf)` PR)

| job                       | timeout | push            | schedule        | PR            | uncapped steps | breach                      |
| ------------------------- | ------- | --------------- | --------------- | ------------- | -------------- | --------------------------- |
| `documenso-smoke`         | 45      | 66 (margin -21) | 61 (margin -16) | 42 (margin 3) | 17             | C3 on push and schedule; C2 |
| `medusa-load` (LOAD path) | 45      | 28 (17)         | 28 (17)         | 22 (23)       | 15             | C2                          |
| `cal-smoke`               | 60      | 50 (10)         | 50 (10)         | 50 (10)       | 0              | none                        |

The `ci(perf)` PR (owner-tracked, not Lane A): cap every uncapped step; split `documenso-smoke` into a races job and a LOAD job;
move the dispatch-only VERIFY step of `medusa-load` into its own job; never raise a timeout.

### 8.4 NEW workflow `tier-aa.yml` (2b-i)

| job        | job timeout | each step and its cap                                                                                                                                                                                                                                                                    | sum of step caps | worst case | margin (>= 10) |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | -------------- |
| `flags-aa` | 115         | the 24 steps of section 5.4: setup 40 (checkout 2, Medusa fork 6, verify 1, stub 1, P6 deps 5, k6 2, pnpm 2, pnpm cache 2, Medusa deps 10, build cache 2, admin password 1, pull 6); state 1 start 10 and 3 arms 12 and stop 5; state 2 start 10, 3 arms 12, stop 5; verdict 5; upload 5 | 104              | 104        | **11**         |

Wall time: at most 115 min per run (one runner). Each arm cap is 4 min for a 120 s arm (row 11). The owner's figure of 103 is
noted in section 5.4.

## 9. Expected output

- **Unit count (`npm run check`, the P6 gate):**
  - 2a: `# tests 1405` (the suffix test is rewritten in place, no new test).
  - 2b-i: `# tests 1429` = 1405 + 8 (top queries) + 6 (event loop) + 3 (preload) + 6 (A/A verdict) + 1 (chart).
  - 2b-ii: `# tests 1429` (env lines only, no test change).
- **Results folder (2b-ii, a VALID medusa-load run):** `results/load/<case>/…` (unchanged), plus its telemetry JSON with two
  new keys:

```json
{
  "topQueries": {
    "schema": 1,
    "status": "PASS",
    "topN": 10,
    "droppedNegative": 0,
    "evicted": false,
    "rows": [
      {
        "queryid": "1234567890",
        "calls": 812,
        "totalMs": 412.7,
        "rows": 812,
        "query": "SELECT ... WHERE id = $1"
      }
    ]
  },
  "eventLoop": {
    "schema": 1,
    "status": "PASS",
    "unit": "ms",
    "rows": [
      { "t": 1788000000123, "p50": 0.42, "p99": 3.1, "max": 7.9, "pid": 4242, "role": "server" }
    ]
  }
}
```

- `results/load/el/el-<pid>.ndjson`: one JSON object per second; numbers and the role only.
- `chart-<label>.html` with the `eventLoop p99 (preload)` series and the `event-loop proxy (health probe)` label.
- **A/A (`tier-aa.yml`, dispatch):** `results/load/aa-flags/<state>-1..3/…` and `results/load/aa-flags/verdict.json`:

```json
{
  "schema": 1,
  "case": "P6-X-LOAD-009",
  "product": "medusa",
  "order": "off-first",
  "verdict": "PASS",
  "metrics": {
    "p50Ms": {
      "medOff": 40.1,
      "medOn": 40.9,
      "pooled": 40.5,
      "relDiff": 0.0198,
      "tolerance": 0.4238,
      "verdict": "PASS"
    }
  }
}
```

(The numbers above show the shape only; they are not a measurement.)

- **Job summary lines:** `P6-X-LOAD-002 top queries: PASS (10 rows, 0 dropped, not evicted)`; `P6-X-LOAD-002 event loop: PASS (N rows, server role)`;
  `P6-X-LOAD-009 A/A flags (<order>): PASS|FAIL|INCONCLUSIVE (p50Ms rel x of tol y; p95Ms ...; requestsPerSec ...)`.
- **Artefacts:** `load-medusa` (existing), `load-aa-flags-off-first` or `load-aa-flags-on-first`. Retention as the existing upload
  steps (roadmap: 14 days).

## 10. Environment changes

**No environment change** in Cursor cloud or Claude Code cloud (E1). The preload uses Node built-ins only; the harness provides
`pg_stat_statements`; no tool, image, host entry or secret is added. The P6 Node comes from `.nvmrc` as today.
`.cursor/environment.json`, `.cursor/Dockerfile`, `.claude/hooks/session-start.sh` and the setup script are not changed.

## 11. Build order (P6; one commit per step; `npm run check` before every push)

Commit messages are lowercase Conventional Commits. PR titles are checked the same way. Merge commits only.

**2a (pin to `v0.2.16`):**

1. **S1.** `git fetch --tags origin && git switch -c chore/2026-10-29-p6-harness-pin-bump origin/main`. Run the build-time re-check (section 4).
2. **S2.** `npm install --save-exact=false "github:Jayami123/qa-portfolio-harness#v0.2.16"`; `git diff --stat` must list exactly `package.json` and `package-lock.json`; then `node -e 'const l=require("./package-lock.json").packages["node_modules/qa-portfolio-harness"];console.log(l.version,l.resolved.split("#")[1])'` must print `0.2.16` and the commit hex of the tag. Commit: `chore(p6): pin the harness to v0.2.16`.
3. **S3.** `sed -i 's/-h0\.2\.15\b/-h0.2.16/g' .github/workflows/perf.yml .github/workflows/knee.yml .github/workflows/gate.yml .github/workflows/soak.yml`. Check: `rg -c 'h0\.2\.15' .github/workflows` prints nothing; `rg -c 'h0\.2\.16' .github/workflows` prints `perf.yml:14`, `knee.yml:8`, `gate.yml:6`, `soak.yml:3`. Commit: `ci(workflows): move the harness cache keys to h0.2.16`.
4. **S4.** Rewrite the suffix `it` in `tests/unit/harness-pin.test.ts` (skeleton 5.5). Commit: `test(harness-pin): check the cache-key suffix in all four workflows`.
5. **S5.** `README.md:5` → `` `v0.2.16` ``. Commit: `docs(readme): point the harness version line at v0.2.16`.
6. **S6.** `npm run check` → exit 0, `# tests 1405`. Push; PR title `chore(p6): pin the harness to v0.2.16`. Owner merges (merge commit).

**2b-i (pin to `v0.2.17`, code, chart, rows, A/A workflow; flags OFF):**

7. **S7a.** Branch `chore/2026-10-29-p6-telemetry-tier-code` from `origin/main` after 2a merges. Re-pin to `v0.2.17` (npm), 31 suffixes to `-h0.2.17`, `README.md:5`. `npm run check` → `# tests 1405`. Commit: `chore(p6): pin the harness to v0.2.17`.
8. **S8.** `src/load/telemetry/pg-top-queries.ts` + `telemetry-top-queries.test.ts` (8). `npm run check` → `# tests 1413`. Commit: `feat(load): add the pg_stat_statements top-query deltas`.
9. **S9.** `src/load/telemetry/event-loop.ts` + `telemetry-event-loop.test.ts` (6) → `1419`. Commit: `feat(load): read the event-loop delay rows per server process`.
10. **S10.** `src/load/telemetry/preload/el-delay.cjs` + `telemetry-el-preload.test.ts` (3) → `1422`. Commit: `feat(load): add the event-loop delay preload (numbers only)`.
11. **S11.** `src/load/telemetry/run.ts`: two snapshots and the two keys (existing run tests stay green). Commit: `feat(load): write top queries and event-loop rows into the run telemetry`.
12. **S12.** `src/load/chart/render-chart.ts` + the `render-chart.test.ts` case (+1) → `1423`. README paragraph at `:820`. Commit: `feat(chart): add the event-loop series and the proxy label`.
13. **S13.** `src/load/tier-aa/verdict.ts` + `scripts/load/aa-flags-verdict.ts` + `aa-verdict.test.ts` (6) → `1429`. Commit: `feat(load): add the flags-on versus flags-off A/A verdict`.
14. **S14.** `.github/workflows/tier-aa.yml` (section 5.4, dispatch only). Check with `npm run lint:actions`. Commit: `ci(tier-aa): add the dispatch-only flags on versus off A/A workflow`.
15. **S15.** `.env.example` placeholder lines (section 5.7). Commit: `docs(env): add the harness telemetry placeholders`.
16. **S16.** `npm run check` → exit 0, `# tests 1429`. Push; PR title `feat(load): add the telemetry rows and the flags on versus off A/A workflow`. Owner merges (merge commit).
17. **owner-4 (owner step, in the GitHub web UI).** Actions, `tier-aa`, Run workflow, `order` = `off-first`, on `main`. Then a second run with `order` = `on-first` (EXTRA-AA-ORDER). Read `verdict.json` from both runs.

**2b-ii (flag env lines on; only after the verdict):**

18. **S18.** Start only after owner-4 shows a PASS, or records a breach (the breach is written to the README; the tier then stays off for that metric). Branch `chore/2026-10-29-p6-telemetry-tier-flags-on`. Add the section 5.3 env lines to `medusa-load` and the three soak jobs. Check: every step keeps its cap; `npm run lint:actions`. `npm run check` → `# tests 1429`. Commit: `ci(perf): turn the harness telemetry flags on for medusa load and the soak jobs (not on pull requests)`. Push; PR title `ci(perf): turn the harness telemetry flags on for medusa load and soak`. Owner merges (merge commit).

Owner step owner-1: merge each PR with **Create a merge commit** (never squash).

## 12. Extra risky cases (EXTRA, not in the roadmap IDs)

| EXTRA          | question                                                                                                          | oracle                                                                                                  | cost                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------- |
| EXTRA-TQ-RESET | After a `pg_stat_statements_reset()` made by someone else (not by P6), does the run go INCONCLUSIVE and not PASS? | the test feeds a snapshot where a `totalMs` drops; expect `droppedNegative > 0` and status INCONCLUSIVE | ~10 min, no product               |
| EXTRA-EL-GAP   | A one-second gap in the preload (the event loop blocked) shows as a missing row, not a zero                       | window count test: a short process is listed, never counted as zeros                                    | ~10 min, no product               |
| EXTRA-AA-ORDER | Does the verdict change if the ON state runs first (order effect)?                                                | the `on-first` run of `tier-aa.yml` (owner-4); compare the two verdicts                                 | one extra dispatch, up to 115 min |

## 13. Risks, roadmap conflicts and open decisions

### 13.1 Conflicts with the roadmap and the probe

| roadmap says                                                              | probe shows                                                                                                                       | decision or open question                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| "every `h0.2.11`-style cache-key suffix in `perf.yml`" (lines 283–284)    | 31 suffix lines in four workflows: perf 14, knee 8, gate 6, soak 3 (row 2)                                                        | 2a and 2b-i rewrite all 31; the pin test checks all four  |
| soak has 2 suffix lines (prompt)                                          | soak has 3: lines 181, 350, 532 (row 2)                                                                                           | the test minimum for soak is 3                            |
| "flags on only in the LOAD steps of `perf.yml` and `soak.yml`" (line 285) | flags act at product start; Cal and Documenso smoke jobs run race steps on the same product before LOAD (row 5)                   | Q-SCOPE: deferred (c)                                     |
| "README 'How to read the chart'" (line 292)                               | no such heading; the chart text is at `README.md:820` (row 14)                                                                    | Q-README                                                  |
| "a nightly LOAD run ... ships top-query and event-loop rows" (line 306)   | the first draft of this plan said `perf.yml` has no schedule; it does (`17 2 * * *`, row 7). The nightly `medusa-load` run exists | satisfied by the nightly `medusa-load` run after 2b-ii    |
| `sampler.ts` is in Task 2's scope (line 297 and the ownership table)      | Task 3 needs one hook in `sampler.ts`; Task 2 does not need to change it (row 8)                                                  | Task 2 leaves `sampler.ts` alone                          |
| tolerance "in `k6/thresholds/`" (line 294)                                | the file has cal and medusa only (row 9)                                                                                          | X-LOAD-009 uses medusa; no documenso entry is needed      |
| "Done when: flags on in LOAD steps, all jobs green" (line 306)            | Cal and Documenso LOAD stay flags-off (Q-SCOPE)                                                                                   | recorded as a partial Done when (section 14)              |
| the pin test expects the suffix in `perf.yml` (the test file)             | the test requires `>= 9` in `perf.yml` only (row 3)                                                                               | the test is extended in 2a; minimums equal today's counts |

### 13.2 Open decisions (DECIDED unless marked)

- **Q-SPLIT. DECIDED: split into 2a, 2b-i, 2b-ii** (section 0).
- **Q-SCOPE. DECIDED: (c) defer now.** Cal and Documenso LOAD flags wait for a `ci(perf)` PR that moves those LOAD steps into
  race-free jobs (owner-tracked, option (b), not Lane A).
- **Q-AA-JOBS. DECIDED: one job on one runner** in `tier-aa.yml` (section 5.4). Sum 104, margin 11 (the owner's review said 103,
  margin 12; the difference is stated in section 5.4).
- **Q-AA-TRIGGER. DECIDED: dispatch only,** one normal-order run and one reversed-order run. Re-argued with the corrected schedule
  fact (row 7): the nightly `medusa-load` run exists, so the flags-on evidence for the nightly and the soak comes only after the
  A/A verdict (2b-ii), and the A/A itself does not need a schedule. A schedule would also run the A/A at full cost every night;
  it is not added.
- **Q-C3. DECIDED: a separate owner-tracked `ci(perf)` PR** with the corrected numbers in section 8.3 (`documenso-smoke` margin -21
  on push, `medusa-load` 15 uncapped steps). Not part of Lane A.
- **Q-OWN. DECIDED: accepted** (section 5.0). Six files: `tier-aa.yml`, `src/load/tier-aa/verdict.ts`,
  `scripts/load/aa-flags-verdict.ts`, `tests/unit/aa-verdict.test.ts`, `tests/unit/telemetry-el-preload.test.ts`, and the
  one-test change to `tests/unit/render-chart.test.ts`.
- **Q-ARMS.** Three arms per state, six in total (`MIN_ARMS = 3`; the calibration used six arm IDs, row 9). Fewer arms are
  INCONCLUSIVE by rule. Kept.
- **Q-ROLE.** The sampler reads `pg_stat_statements` through the same pool that `pg-stats.ts` already uses (the harness container
  superuser for Medusa, Task 1 row 23). Kept: a read-only `SELECT` with no reset. The read-only role is a recorded deviation
  (Task 1, section 13.1); a follow-up adds a `pg_read_all_stats` role.
- **Q-README.** The README heading "How to read the chart" does not exist (row 14). Kept: edit the paragraph at `:820`.
- **Q-EL-DIR.** Resolved in Task 1 (Q7): the harness creates the out directory with `mkdir -p` and sets `0777` for Twenty; Task 2
  changes no `run:` line.
- **Q-PRELOAD.** The preload path is in the P6 checkout (`${{ github.workspace }}/p6/...`), mode 644 in git. Fine for Medusa. For
  Twenty (Lane B) the path must be readable by UID 1000 (Task 1 row 16).

### 13.3 Risks

- Overhead changes the numbers: X-LOAD-009 measures it; a FAIL is recorded, not hidden.
- `pg_stat_statements` text size: the top 10 rows at 200 characters each (about 2 KB per run).
- The preload does synchronous `appendFileSync` I/O once a second. Its own cost is measured by the A/A run; the idle baseline (section 4)
  fixes what "idle" means before any oracle threshold is set. A write error disables the timer (no crash).
- Results folder size: one NDJSON line per second per server process (about 100 bytes), so a 120 s arm is under 30 KB per process.

## 14. Done when

Copied from the roadmap (lines 306–309), adjusted by the decisions above:

- The bump PRs green: 2a on the PR and on `main`; 2b-i; 2b-ii.
- A VALID `medusa-load` run (nightly or dispatch) and a soak run ship top-query and event-loop rows in telemetry and chart, after
  2b-ii. **Adjusted (Q-SCOPE):** Cal and Documenso LOAD are in the owner-tracked `ci(perf)` PR, not here.
- The proxy series is labelled `event-loop proxy (health probe)`.
- `P6-X-LOAD-009` within tolerance on the normal-order run and the reversed-order run, or the breach recorded (verdict.json and the
  job summary).
- Token scan passes (`perf.yml` "Token scan of the LOAD results" and the A/A job's scan).
- `npm run check` green (`# tests 1405` for 2a, `# tests 1429` for 2b-i and 2b-ii).

**Rule self-check (section 0 of the Phase 5 prompt, and the repo rule F.20):**

- N1–N5: met (no pause; no secret printed; every fact cites a path, command or output; the budget numbers come from the workflow).
- R1–R3: met (no harness push; only explicit paths staged in P6).
- R4–R8: met or not applicable (no force push; no merge; no comment; owner name not written in repo text).
- O1–O3: met (only the two plan files change in this review).
- O4: met (no `.env` value, no token, no `pk_` key).
- O5: met (no private finding named or described).
- O6: met (`P6-X-LOAD-002` and `P6-X-LOAD-009` kept as written; no renumbering; EXTRA labels only).
- O7–O8: met (no threshold changed; tolerance values read from the file; no GitHub client command).
- C1: met (no existing timeout raised; the new `tier-aa.yml` job has its own 115).
- C2: met for every new step (each has a cap). Pre-existing uncapped steps are reported (section 8.3, Q-C3).
- C3: met for every new job (`flags-aa` margin 11). Pre-existing breaches reported (section 8.3).
- C4: met (section 8 tables for changed and new jobs, per event).
- C5: met (`flags-aa` starts Medusa twice; each start has its own `down` with `if: always()`).
- E1: met (section 10).
- F.20 (self-check): (a) every "Done when" item is met or listed in section 14; (b) every named file exists or is marked NEW; (c) the CI time includes setup (section 8.4: 104 of 115); (d) every new function has a skeleton (5.5, 5.6); (e) no owner answer is invented: each DECIDED item cites the review.
- Repo rule A.6 and B.10 (plan branches get no PR): followed; the plan PR is closed by the owner.

## Interface for Lane B

- **Env names H4 forwards (Task 1, PR A, released `v0.2.16`):** `API_RATE_LIMITING_SHORT_TTL_IN_MS`, `API_RATE_LIMITING_SHORT_LIMIT`,
  `API_RATE_LIMITING_LONG_TTL_IN_MS`, `API_RATE_LIMITING_LONG_LIMIT`. Set only when wanted; blank or unset keeps the image default.
- **How a P6 job sets them:** in the step-level `env:` of `Start Twenty (harness up)`, right before `npm run up:twenty`. Whole
  numbers of at least 1. Never set a name to an empty string: the image reads `""` as 0, which makes every request a 429 (Task 1 row 18).
- **How to confirm inside a running container (value only):**
  `docker exec "$(docker compose -p qa-harness-twenty ps -q server)" printenv API_RATE_LIMITING_SHORT_LIMIT`; repeat with `worker`.
  The build session verifies the `-p` form works without the `-f` list.
- **Harness tag Lane B waits for:** `v0.2.16` (H4 only, decided). Lane B Task 3 starts from this tag. H1 and H2 come in `v0.2.17`,
  which Lane B does not need.
