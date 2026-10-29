# P6 Phase 5 Task 2: harness pin bump, flags on, sampler rows (build guide)

This is the build guide for **P6** (`Jayami123/k6-load-concurrency-suite`). It depends on the harness
release in [Task 1](2026-10-29-p6-phase5-task1-harness-telemetry.md). Planning only: this file changes no code.

| Field                                  | Value                                                                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan date                              | 2026-10-29 (Asia/Colombo)                                                                                                                                                                                        |
| Plan branch                            | `plan/2026-10-29-p6-phase5-lane-a`                                                                                                                                                                               |
| Build branch (default, one PR)         | `chore/2026-10-29-p6-harness-telemetry-bump`                                                                                                                                                                     |
| Build branches (if Q-SPLIT is "split") | 2a `chore/2026-10-29-p6-harness-pin-bump`; 2b `chore/2026-10-29-p6-harness-telemetry-bump` (2b is cut from `main` after 2a merges)                                                                               |
| Mapped case IDs                        | `P6-X-LOAD-002` extension (no new ID; roadmap "Cases" line 277); accepted extra `P6-X-LOAD-009` (harness-tier overhead, roadmap D11 line 571)                                                                    |
| Roadmap section                        | [2026-10-22-p6-phase5-roadmap.md](2026-10-22-p6-phase5-roadmap.md) "Task 2: P6 pin bump + flags on + sampler rows", lines 273–311; task table line 154; D1 lines 538–543; D7 lines 558–560; Note 1 lines 187–198 |
| Base (P6 main)                         | `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29 09:18 Asia/Colombo)                                                                                                                                       |
| Unit count at base (B0)                | 1405 (`# tests 1405`, `# pass 1405`, `# fail 0`; measured in this session; the prompt's 1403 is stale)                                                                                                           |
| Harness tag this plan pins             | `v0.2.16` for 2a; `v0.2.17` for 2b under Option B (Task 1 Q-TAG), or `v0.2.16` if one tag ships everything                                                                                                       |

Stale facts in the roadmap, corrected here (see the conflicts table): it asks to bump `h0.2.11`-style suffixes
in `perf.yml` only; the live state is 31 suffix lines in four workflows, and the pin test checks `perf.yml` only.

## 1. What it proves

- **`P6-X-LOAD-002` extension (no new ID).** Question: does a VALID LOAD run ship two new telemetry rows,
  top queries (from `pg_stat_statements` deltas) and true event-loop delay (from the preload), and is the 1 Hz
  health-probe series labelled as the proxy?
  - **Oracle:** (a) top queries: the test recomputes each delta as `end.totalMs - start.totalMs` per `queryid`
    from the two snapshot rows; the stored rows must match and their sum must not exceed the run's total delta;
    (b) event-loop rows: one row per second inside the run window (`floor(duration_s) - 2` or more), every value
    finite and `>= 0`, `p99 >= p50`, `max >= p99`; (c) with the flags off, the telemetry JSON has no
    `topQueries` or `eventLoop` key, byte-equal to the Phase 3 output.
  - **Verdict words:** PASS (both row sets present and consistent in a VALID run, chart label present);
    FAIL (rows present but inconsistent: a product or telemetry bug, labelled by N4 with evidence);
    INCONCLUSIVE (the run is INVALID, or the flags were on and the preload file is missing: never PASS);
    NOT RUN (flags off in a job that expects them on).
- **`P6-X-LOAD-009` (accepted extra, gated on nothing).** Question: does turning the harness tier on (flags on
  versus off) move Medusa's steady metrics beyond the Phase 4 A/A tolerance?
  - **Oracle:** for each metric `m` in `p50Ms`, `p95Ms`, `requestsPerSec`: three OFF arms and three ON arms of
    `P6-MED-LOAD-002 --profile steady`. `medOff` and `medOn` are the medians of each state; `pooled` is the median
    of all six values; `relDiff = |medOn - medOff| / pooled`. `T_m` is the stored tolerance in
    `k6/thresholds/tolerance.json` for `products.medusa.<m>.tolerance` (values in row 9 below).
  - **Verdict words:** PASS (all three `relDiff <= T_m`, every arm VALID); FAIL (any `relDiff > T_m`: the breach is
    recorded with the metric and both medians, and the tier stays off for that metric's evidence until explained);
    INCONCLUSIVE (fewer than 3 VALID arms in a state, or any arm INVALID); NOT RUN (dispatch input not set).
- **Transfer:** the same check a payments or EHR team runs before turning a diagnostic on in production: the
  diagnostic must not move the numbers they report.

## 2. Live probe evidence (2026-10-29)

| #   | fact                                                                                                                                    | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | what it changes in the design                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Current pin and lock                                                                                                                    | `package.json:63` `"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.15"`; `package-lock.json:9` the same spec; `package-lock.json:270–272` `node_modules/qa-portfolio-harness`, `resolved` `git+ssh://git@github.com/Jayami123/qa-portfolio-harness.git#43dc0da7874a50d709b328bfb492e1e091a9fc64`                                                                                                                                                                                                                                                                                               | 2a changes the spec and refreshes the lock with `npm install`                                                                                                                                                            |
| 2   | Every pin and suffix location                                                                                                           | `rg -n 'h0\.2\.15\|qa-portfolio-harness#' .` (excluding `node_modules`): `.github/workflows/perf.yml` 14 lines (138, 226, 322, 483, 700, 873, 1114, 1293, 1408, 1598, 1775, 2659, 2843, 3003); `knee.yml` 8 (198, 380, 580, 785, 963, 1186, 1364, 1557); `gate.yml` 6 (282, 392, 723, 806, 1178, 1392); `soak.yml` **3** (181, 350, 532). Total **31** (the prompt and roadmap say 30 and soak 2). Other hits are historical docs and `tests/unit/load-run-meta.test.ts` (a fixture spec naming `v0.2.14`, not a pin)                                                                                              | 2a rewrites all 31 lines; the rg check in step S3 proves zero old suffixes                                                                                                                                               |
| 3   | The pin test checks one file                                                                                                            | `tests/unit/harness-pin.test.ts:25–34`: reads `.github/workflows/perf.yml` only, requires `>= 9` suffixes and one distinct value; `:35–37` checks the second paragraph of `README.md` carries the tag                                                                                                                                                                                                                                                                                                                                                                                                              | Extend to four files; per-file minimums equal today's counts (14, 8, 6, 3), which is stricter than `>= 9` and weakens nothing                                                                                            |
| 4   | README version line                                                                                                                     | `README.md:5` `` `v0.2.15` `` in the second paragraph; other README mentions (`:301`, `:700`) are history                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 2a edits line 5 only                                                                                                                                                                                                     |
| 5   | Which jobs contain race steps before LOAD                                                                                               | `perf.yml` `cal-smoke` (job at `:987`, timeout 60): `Start Cal (harness up)` `:1126`, `Race self-test` `:1137`, `Race P6-CAL-RACE-001` `:1148`, `Race P6-CAL-RACE-003` `:1161`, LOAD `:1176–1200`. `documenso-smoke` (`:1507`, timeout 45): `Start Documenso (harness up)` `:1608`, `Documenso races` `:1618`, LOAD `:1646–1682`. `medusa-load` (`:391`, timeout 45): `Start Medusa` `:500`, LOAD `:520–557`; **no race step** in the job. `soak.yml`: `cal-soak` start `:193`, soak `:205`; `medusa-soak` start `:368`, soak `:378`; `documenso-soak` start `:542`, soak `:552`; **no race step** in any soak job | Flags set on a product start reach every step that uses that product in the same job. Safe now: `medusa-load` and the three soak jobs. Not safe without a new job: Cal and Documenso LOAD in `perf.yml` (Q-SCOPE)        |
| 6   | The flags act at product start, not in LOAD steps                                                                                       | `src/adapters/medusa.adapter.ts:274–281` (`backendProcessEnv`) and the `up()` calls read process env at start; `docker/*` overlays apply at `compose up` (Task 1 rows 5–9)                                                                                                                                                                                                                                                                                                                                                                                                                                         | The env lines go on the `Start <product> (harness up)` step as well as on the LOAD step. The LOAD step also needs them, because the sampler reads the variables at run time                                              |
| 7   | Budget facts, computed by parsing the workflow YAML (python3 with PyYAML 6.0.3; worst case = largest literal branch of each expression) | `medusa-load`: timeout 45, 7 capped steps, sum **53**, margin **−8**, 15 uncapped steps (checkout, install, `Start Medusa`, job summary, stop and others). `documenso-smoke`: timeout 45, 10 capped, sum **51**, margin **−6**, 17 uncapped. `cal-smoke`: timeout 60, 31 capped, sum **50**, margin **10**, 0 uncapped. `cal-soak`: 225, sum 204, margin 21. `medusa-soak`: 225, sum 196, margin 29. `documenso-soak`: 225, sum 197, margin 28                                                                                                                                                                     | `medusa-load` and `documenso-smoke` already break rule C3 (and C2 for uncapped steps). Task 2 adds no step and no cap there, so it cannot make them worse; it records them as Q-C3. A new job is needed for any new step |
| 8   | Telemetry code paths                                                                                                                    | `src/load/telemetry/sampler.ts:87` `startSampler`, `:94` error counters, `:167` `readPgSample(pool)`; `src/load/telemetry/pg-stats.ts:4–12` the SQL, `:29` `readPgSample`; `src/load/telemetry/run.ts:49` `startSampler({...})`, `:121` `renderChartHtml({...})`; `src/load/chart/render-chart.ts:54` `renderChartHtml(input)`; `src/load/chart/k6-points.ts`                                                                                                                                                                                                                                                      | Top queries are two snapshots per run in `run.ts`. Event-loop rows are read after the run from the preload file. `sampler.ts` is NOT changed (Lane B's Task 3 needs one hook there, so Task 2 keeps out of it)           |
| 9   | A/A tolerance file                                                                                                                      | `k6/thresholds/tolerance.json`: `schema` 1, `release` `p6-phase4`, products `cal` and `medusa` only (no `documenso`), metrics `p50Ms`, `p95Ms`, `requestsPerSec`. Medusa: `p50Ms` spread `0.2119`, tolerance **`0.4238`**; `p95Ms` spread `0.0397`, tolerance **`0.1000`** (floor); `requestsPerSec` spread `0.0048`, tolerance **`0.1000`** (floor); each has 6 arm IDs from runs `40497029348` and `40605925118`                                                                                                                                                                                                 | X-LOAD-009 uses the Medusa entries only. Six arms in the calibration, so the test uses three per state                                                                                                                   |
| 10  | The tolerance formula                                                                                                                   | `src/load/gate/tolerance.ts:2` `T = max(FLOOR, K x S)`; `:5` `K = 2`; `:6` `FLOOR = 0.1`; `:7` `MIN_ARMS = 3`; `:8` `MIN_RUNS = 2`; `:9` `TOLERANCE_METRICS`; `src/load/gate/aa-noise.ts:34–40` `spreadOf` = `(max - min) / median`, throws below 3 arms                                                                                                                                                                                                                                                                                                                                                           | The verdict uses the stored `T_m`, not a new one. Three arms per state is the smallest set the gate accepts                                                                                                              |
| 11  | Steady profile                                                                                                                          | `src/load/steady.ts:5` `STEADY_DURATION_SEC = { full: 120, pr: 30 }`; `scripts/load/run-load.ts:1` `--profile pr\|full\|steady\|soak`, `:33–37` profile checks, `:80` `--out` (default `results/load`); `package.json` script `load:medusa-steady` runs `P6-MED-LOAD-002 --profile steady`                                                                                                                                                                                                                                                                                                                         | An arm is 120 s plus setup; the arm cap is 4 min                                                                                                                                                                         |
| 12  | Existing telemetry self-test                                                                                                            | `k6/selftest/telemetry.js` and `src/load/cases.ts` reference `P6-X-LOAD-002`; `perf.yml:2467` `Telemetry self-test (P6-X-LOAD-002)` (timeout 3), in job `load-overhead` (`:2446`, timeout 25)                                                                                                                                                                                                                                                                                                                                                                                                                      | The self-test must stay green; it does not start a product                                                                                                                                                               |
| 13  | Triggers of `perf.yml`                                                                                                                  | `perf.yml:1–8`: `on:` has `pull_request`, `push` to `main`, `workflow_dispatch` (inputs at `:10`). **No `schedule`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The roadmap's "nightly LOAD run" does not exist in `perf.yml`; the nightly evidence is `soak.yml` (schedule `29 19 * * 0` weekly, nightly 30 min). Q-AA-TRIGGER                                                          |
| 14  | README chart text                                                                                                                       | `README.md:820` describes `chart-<label>.html` (requests per second, p95, sampler cost). **No heading called "How to read the chart" exists** (`rg -n -i 'chart' README.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2b edits the paragraph at `:820` and adds the proxy label text there. Q-README                                                                                                                                           |
| 15  | Node and checkout pattern                                                                                                               | `perf.yml:86` and `:276` `node-version-file: ${{ env.P6_WORKING_DIRECTORY }}/.nvmrc`; the Medusa jobs check out the fork into `${{ github.workspace }}/p6/...` (the stub step at `:430`)                                                                                                                                                                                                                                                                                                                                                                                                                           | The new jobs copy the `medusa-load` setup block exactly (same action SHAs)                                                                                                                                               |
| 16  | Pinned actions in use                                                                                                                   | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (used in every job); `actions/upload-artifact` with the `name: load-medusa` upload at `:586`                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The new jobs reuse the SHAs already in the file. `actions/download-artifact` is not used in P6 yet: the build pins the SHA from the harness CI or from GitHub's release page at build time (NOT PROBED here)             |
| 17  | Artefact retention                                                                                                                      | the roadmap says 14 days (`docs/releases/p6-phase1.md`, roadmap lines 86–87)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The A/A artefacts are evidence that expires; the verdict is also written into the job summary                                                                                                                            |
| 18  | Preload path inside the P6 checkout                                                                                                     | the preload is a repo file, `src/load/telemetry/preload/el-delay.cjs` (NEW), so the path is `${{ github.workspace }}/p6/src/load/telemetry/preload/el-delay.cjs` (`github.workspace` plus the `p6` folder used by every job's `P6_WORKING_DIRECTORY`)                                                                                                                                                                                                                                                                                                                                                              | The env value is a fixed path; no secret                                                                                                                                                                                 |
| 19  | Harness flags and CI                                                                                                                    | the harness reads flags in `process.env` (Task 1 rows 5–8). For Medusa, `backendProcessEnv` uses only `.env` (Task 1 row 7): the flag must be re-added there                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Task 2 relies on Task 1 PR C; if PR C is not merged, 2b cannot turn H2 on                                                                                                                                                |
| 20  | `pg_stat_statements` on the harness Postgres                                                                                            | `postgres:15` ships the extension (Task 1 row 20). Medusa and Documenso use `postgres:15`; Cal and Twenty use fork images                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Live snapshot cost and read permission NOT PROBED**: needs a running product started by the harness, which is not in this session. Build-time re-check in the medusa-load run (see section 4)                          |
| 21  | Query text carries no secret                                                                                                            | `pg_stat_statements` replaces constants with `$n` placeholders (PostgreSQL behaviour, documented; not probed live)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Still token-scanned (`perf.yml` step "Token scan of the LOAD results", `:575`)                                                                                                                                           |
| 22  | Event-loop API on the product's Node                                                                                                    | `perf_hooks.monitorEventLoopDelay` exists in Node 24 (Task 1 row 14, the Twenty image). The P6 jobs use `.nvmrc` Node (Cursor PATH Node 22.23 per `AGENTS.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **The preload is NOT live-run on Medusa's Node in this session** (no product). Build-time re-check: one LOAD run in medusa-load                                                                                          |

## 3. Depends on

| Item                                                                                | Blocks                                | Status                                                          |
| ----------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| Task 1 PR A (H4) and the harness tag `v0.2.16`                                      | 2a (pin must exist) and Lane B Task 3 | owner merges the release and creates the tag                    |
| Task 1 PR B (H1) and PR C (H2) and tag `v0.2.17` (Option B) or `v0.2.16` (Option A) | 2b (flags need them)                  | owner tags                                                      |
| Phase 3 Task 5 (`src/load/telemetry/*`, chart)                                      | 2b code paths                         | merged: `sampler.ts`, `run.ts`, `render-chart.ts` exist (row 8) |
| Phase 4 Task 7 (`soak.yml`)                                                         | 2b soak env lines                     | merged: `soak.yml` exists, three product soak jobs (row 7)      |
| Phase 4 Task 11 (`k6/thresholds/tolerance.json`)                                    | 2b verdict                            | merged: file exists, release `p6-phase4` (row 9)                |
| Owner merges each PR with a merge commit (P6 repo)                                  | the next PR's CI                      | owner step                                                      |

## 4. Build-time re-check (run first)

| fact                                | how to re-check at build start                                                                    | if it changed                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| main is at or after `5215127`       | `git fetch origin main && git log --oneline 5215127..origin/main`                                 | list the commits; if a workflow or tolerance file changed, re-count the 31 lines and the budgets   |
| harness tag exists                  | `git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness v0.2.16^{}`               | no tag: stop; Task 1 is not done                                                                   |
| harness commit of the tag           | same command, the hex                                                                             | put it in the lock check (step S2)                                                                 |
| suffix count                        | `rg -c 'h0\.2\.15' .github/workflows` (expect 14, 8, 6, 3)                                        | a different count: the new total replaces 31 and the minimums in the test change to the new counts |
| race steps before LOAD              | `rg -n 'race\|Race' .github/workflows/perf.yml` between each job's start and LOAD steps           | a race step added to medusa-load would make 2b unsafe for that job                                 |
| tolerance values                    | `node -e 'console.log(require("./k6/thresholds/tolerance.json").products.medusa)'`                | the verdict reads the file at run time; no copy in code                                            |
| snapshot cost and role              | run the medusa-load job once with the flags on; read `pg_stat_statements` timing in the telemetry | if a snapshot takes more than 1 s, keep two snapshots per run (already the design) and report it   |
| preload runs on Medusa's Node       | the medusa-load run (row 22); its `el-<pid>.ndjson` has rows                                      | no rows: the preload did not load; check `NODE_OPTIONS` in the backend env first (Task 1 row 7)    |
| download-artifact SHA               | `rg -n 'download-artifact' .github/workflows` and the GitHub release page                         | use the SHA the repo already pins, else the SHA of the latest release at build time                |
| `actions/upload-artifact` retention | the existing `load-medusa` upload step (`perf.yml:586`)                                           | copy its settings                                                                                  |

## 5. Design

### 5.0 File ownership (build), copied from the Phase 5 planning prompt

This plan keeps to the **Lane A, Task 2 (P6)** row; the other rows belong to the other build sessions.
The extra test files and the verdict code named in Q-OWN are not in the table: see that decision.

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                      |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml; tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step; README "How to read the chart" and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/_, src/dashboard/_, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                         | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                       |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                       | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                        |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-* releases; contents: read stays)                                                                                                                                                                      | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                               |

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (if the Task 3 plan splits it, 3a foundation may merge before Task 2 and 3b, the verified functional profile, after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 and 5 also need Task 2 merged for their CI; 6 does not); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

### 5.1 2a: the pin, the suffixes and the test (no behaviour change)

- `package.json:63` → `"github:Jayami123/qa-portfolio-harness#v0.2.16"`; `package-lock.json` refreshed by npm.
- 31 lines `-h0.2.15` → `-h0.2.16` in `perf.yml`, `knee.yml`, `gate.yml`, `soak.yml`.
- `tests/unit/harness-pin.test.ts` checks four files (skeleton 5.5). The test count does not change (the suffix
  test is rewritten in place).
- `README.md:5` → `` `v0.2.16` ``.

### 5.2 2b: flags on, sampler rows, chart, A/A (after the H1/H2 tag)

- **Flag env lines (env only, no cap change):**
  - `perf.yml` `medusa-load`: env on `Start Medusa (harness up)` (`:500`) and on the three LOAD steps (`:520`, `:531`, `:542`).
    The VERIFY step (`:557`, dispatch only) gets the same env because it runs the same LOAD case.
  - `soak.yml`: env on `Start Cal` (`:193`), `Start Medusa` (`:368`), `Start Documenso` (`:542`) and on the three soak steps (`:205`, `:378`, `:552`).
  - Not in 2b: `cal-smoke` and `documenso-smoke` (races, row 5). Q-SCOPE.
  - Block (add to a step; if the step already has an `env:` block, merge the keys):

```yaml
env:
  HARNESS_PG_STATS: "1"
  HARNESS_EL_PRELOAD: ${{ github.workspace }}/p6/src/load/telemetry/preload/el-delay.cjs
  HARNESS_EL_OUT: ${{ github.workspace }}/p6/results/load/el
```

- **Top queries:** `src/load/telemetry/pg-top-queries.ts` (NEW). `run.ts` takes one snapshot when the run starts and one
  when it ends; each row is `{queryid, calls, totalMs, rows, query}`; the top 10 by `totalMs` delta go into the run's
  telemetry JSON under `topQueries`. `run.ts` only (`sampler.ts` unchanged).
- **Event-loop rows:** `src/load/telemetry/event-loop.ts` (NEW) reads `HARNESS_EL_OUT/el-<pid>.ndjson`, keeps the lines
  inside the run window `[startMs, endMs]`, and writes them under `eventLoop`. The preload is
  `src/load/telemetry/preload/el-delay.cjs` (NEW, Node built-ins only).
- **Chart:** `src/load/chart/render-chart.ts` (CHANGED): adds the `eventLoop p99 (preload)` series and renames the
  health-probe series to `event-loop proxy (health probe)`. README paragraph at `:820` gets one sentence on the two
  series (Q-README).
- **A/A:** `src/load/tier-aa/verdict.ts` (NEW, the formula in section 6) and `scripts/load/aa-flags-verdict.ts` (NEW CLI);
  `perf.yml` gets three NEW jobs (section 5.4) behind a `workflow_dispatch` input `flags_aa` (default false).

### 5.3 File list

| file                                       | status                                                                            | 2a / 2b |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ------- |
| `package.json`                             | CHANGED (line 63)                                                                 | 2a      |
| `package-lock.json`                        | CHANGED (npm refresh)                                                             | 2a      |
| `.github/workflows/perf.yml`               | CHANGED (suffixes 14; env lines in medusa-load; 3 NEW jobs; the `flags_aa` input) | 2a, 2b  |
| `.github/workflows/knee.yml`               | CHANGED (suffixes 8)                                                              | 2a      |
| `.github/workflows/gate.yml`               | CHANGED (suffixes 6)                                                              | 2a      |
| `.github/workflows/soak.yml`               | CHANGED (suffixes 3; env lines in 3 jobs)                                         | 2a, 2b  |
| `tests/unit/harness-pin.test.ts`           | CHANGED (four files)                                                              | 2a      |
| `README.md`                                | CHANGED (line 5; paragraph at `:820`)                                             | 2a, 2b  |
| `src/load/telemetry/pg-top-queries.ts`     | NEW                                                                               | 2b      |
| `src/load/telemetry/event-loop.ts`         | NEW                                                                               | 2b      |
| `src/load/telemetry/preload/el-delay.cjs`  | NEW                                                                               | 2b      |
| `src/load/telemetry/run.ts`                | CHANGED (two snapshots; the two keys)                                             | 2b      |
| `src/load/chart/render-chart.ts`           | CHANGED (two series, the label)                                                   | 2b      |
| `src/load/tier-aa/verdict.ts`              | NEW                                                                               | 2b      |
| `scripts/load/aa-flags-verdict.ts`         | NEW                                                                               | 2b      |
| `tests/unit/telemetry-top-queries.test.ts` | NEW (4 tests)                                                                     | 2b      |
| `tests/unit/telemetry-event-loop.test.ts`  | NEW (4 tests)                                                                     | 2b      |
| `tests/unit/telemetry-el-preload.test.ts`  | NEW (2 tests)                                                                     | 2b      |
| `tests/unit/aa-verdict.test.ts`            | NEW (6 tests)                                                                     | 2b      |
| `tests/unit/render-chart.test.ts`          | CHANGED (+1 test)                                                                 | 2b      |

NOT changed: `src/load/telemetry/sampler.ts` (Lane B hook), `src/load/telemetry/pg-stats.ts`, `scripts/load/run-load.ts`,
`k6/thresholds/*`, `pages.yml`, `evidence-release.yml`, every Twenty file, `scripts/dashboard/*`, `src/dashboard/*`,
`.env.example` (only harness-flag placeholder lines are added in 2b; see section 5.6).

### 5.4 The three NEW A/A jobs (perf.yml)

Each job is a copy of the `medusa-load` setup block (checkout, P6 install, k6, pnpm, Medusa install, caches, CI admin
password, image pull), then one `Start Medusa (harness up)` with flags ON or OFF, three `steady` arms, and a
`harness down` with `if: always()`.

| job                | needs                         | if                | purpose                                                                                                          |
| ------------------ | ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `flags-aa-off`     | none                          | `inputs.flags_aa` | Medusa with flags unset; three arms `--profile steady --out results/load/aa-flags/off-<n>`                       |
| `flags-aa-on`      | `flags-aa-off`                | `inputs.flags_aa` | Medusa with the Task 2 env block; three arms `--out results/load/aa-flags/on-<n>`                                |
| `flags-aa-verdict` | `flags-aa-off`, `flags-aa-on` | `inputs.flags_aa` | downloads both artefacts, runs `node scripts/load/aa-flags-verdict.ts results/load/aa-flags`, writes the verdict |

Sequential by `needs`: the two states never run at the same time on the same runner (Q-AA-JOBS). Each state is its own
runner, the same way the Phase 4 calibration used runs `40497029348` and `40605925118` (tolerance file, row 9).

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

```ts
// src/load/telemetry/pg-top-queries.ts (NEW, 2b)
export interface StatementRow {
  queryid: string;
  calls: number;
  totalMs: number;
  rows: number;
  query: string;
}
/** One SELECT on pg_stat_statements for the current database; query text cut at 200 characters.
 *  Throws `pg_stat_statements is not loaded: start the product with HARNESS_PG_STATS=1` when the view is missing (SQLSTATE 42P01). */
export function readStatementSnapshot(pool: pg.Pool): Promise<Map<string, StatementRow>>;
/** Top-N rows by totalMs delta. A negative delta (eviction or a reset) drops the row and sets droppedNegative. */
export function topQueryDeltas(
  start: Map<string, StatementRow>,
  end: Map<string, StatementRow>,
  topN?: number, // default 10
): { rows: StatementRow[]; droppedNegative: number };
```

```ts
// src/load/telemetry/event-loop.ts (NEW, 2b)
export interface ElRow {
  t: number;
  p50: number;
  p99: number;
  max: number;
}
/** Reads every <dir>/el-*.ndjson line, parses numbers only, and keeps rows with startMs <= t <= endMs.
 *  Missing directory: returns { rows: [], present: false } (never throws; the run becomes INCONCLUSIVE). */
export function readElWindow(
  dir: string,
  startMs: number,
  endMs: number,
): { rows: ElRow[]; present: boolean };
```

```js
// src/load/telemetry/preload/el-delay.cjs (NEW, 2b): loaded with --require; Node built-ins only; writes numbers only
const { monitorEventLoopDelay } = require("node:perf_hooks");
const fs = require("node:fs");
const path = require("node:path");
const out = process.env.HARNESS_EL_OUT;
if (out) {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const file = path.join(out, `el-${process.pid}.ndjson`);
  const tick = setInterval(() => {
    const line = {
      t: Date.now(),
      p50: h.percentile(50) / 1e6,
      p99: h.percentile(99) / 1e6,
      max: h.max / 1e6,
    };
    fs.appendFileSync(file, JSON.stringify(line) + "\n");
    h.reset();
  }, 1000);
  tick.unref();
}
```

```ts
// src/load/tier-aa/verdict.ts (NEW, 2b)
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

Test skeleton names (exact): `telemetry-top-queries.test.ts`: `parses a snapshot into rows keyed by queryid`, `keeps the top 10 deltas by total time`, `drops a negative delta and counts it`, `names HARNESS_PG_STATS=1 when the view is missing`. `telemetry-event-loop.test.ts`: `reads ndjson lines and keeps the run window`, `returns present false for a missing directory`, `rejects a row whose max is below p99`, `ignores a non-numeric field`. `telemetry-el-preload.test.ts`: `writes numeric keys only`, `does nothing without HARNESS_EL_OUT`. `aa-verdict.test.ts`: `takes the median of each state and the pooled median`, `PASSes when every relDiff is within its tolerance`, `FAILs and names the metric that breaches`, `is INCONCLUSIVE below three valid arms per state`, `uses the 0.1 floor for p95Ms and requestsPerSec`, `reads the medusa entries only`. `render-chart.test.ts` +1: `adds the event-loop series and the proxy label`.

### 5.6 `.env.example`

2b adds placeholder lines only (no secret): `HARNESS_PG_STATS=` (blank), `HARNESS_EL_PRELOAD=` (blank), `HARNESS_EL_OUT=` (blank), with a comment that blank means off. The file already exists (`.env.example`).

## 6. Oracles and verdict rules

- **Top queries:** `delta_i = end_i.totalMs - start_i.totalMs` for `queryid` present in both snapshots with `calls` delta `> 0`.
  Negative `delta_i` is dropped and counted; if any row was dropped, the telemetry block gets `status: "INCONCLUSIVE"` (no
  PASS). Rows are sorted by `delta_i` descending; the top 10 are kept.
- **Event-loop rows:** count in the run window must be `>= floor(durationSec) - 2`; every number finite and `>= 0`;
  `p99 >= p50`; `max >= p99`. Any failure: `status: "FAIL"` with the first bad line number, labelled by N4.
- **A/A (X-LOAD-009):** formulas in section 1. Tolerances: `p50Ms` `0.4238`, `p95Ms` `0.1000`, `requestsPerSec` `0.1000`
  (row 9), read from the file. Three arms per state are required (`MIN_ARMS = 3`, row 10). A breach is recorded in
  `results/load/aa-flags/verdict.json` and in the job summary, and the tier stays off for that metric's evidence.
- No threshold is changed. No verdict is weakened: a missing arm is INCONCLUSIVE, not PASS.

## 7. Data isolation, cleanup and leak check

- The preload writes to `results/load/el/` (inside `results/load`, which the existing token scan covers), so the
  scan runs without any change to the scan step. The top-query text lives in the run's telemetry JSON, also scanned.
- Each run window filters the preload lines, so two LOAD steps sharing one product do not mix their rows.
- `results/` is not committed; the existing cleanup and the artefact upload are unchanged.
- A leak check: the existing `Token scan of the LOAD results` step (`perf.yml:575`) fails the job on a hit. The new A/A
  jobs run the same scan (`evidence-token-scan.mjs` pattern used by `soak.yml:212`).

## 8. CI budget

Tables are computed by parsing the YAML (section 2, row 7). Worst case = largest literal branch of each expression.

### 8.1 Changed jobs (env lines only; no cap changes)

| job                                           | job timeout       | steps with caps (existing)                                                                 | sum of step caps | worst case | margin (>= 10)                                                      |
| --------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ | ---------------- | ---------- | ------------------------------------------------------------------- |
| `medusa-load` (perf.yml `:391`)               | 45                | install k6 2; pull Medusa images 6; LOAD x3 6+6+6; VERIFY (dispatch only) 25; token scan 2 | 53               | 53         | **-8 (pre-existing, Q-C3)**; 15 uncapped steps (pre-existing, Q-C3) |
| `cal-soak` (soak.yml `:39`)                   | 225 (120-min run) | 22 capped steps, 1 soak step 165                                                           | 204              | 204        | 21                                                                  |
| `medusa-soak` (soak.yml, timeout line 244)    | 225               | 21 capped steps, soak 165                                                                  | 196              | 196        | 29                                                                  |
| `documenso-soak` (soak.yml, timeout line 421) | 225               | 19 capped steps, soak 165                                                                  | 197              | 197        | 28                                                                  |

Env lines add no time. Every step keeps its cap.

### 8.2 NEW jobs (2b)

| job                | job timeout | each step and its cap                                                                                                                                                                                                                                                                                                                                                             | sum of step caps | worst case | margin (>= 10) |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | -------------- |
| `flags-aa-off`     | 90          | checkout P6 2; checkout Medusa fork 6; verify fork HEAD 1; stub harness roots 1; install P6 deps 5; install k6 2; enable pnpm 2; restore pnpm cache 2; install Medusa deps 10; restore build cache 2; admin password 1; pull images 6; start Medusa (flags OFF) 10; arm OFF-1 4; arm OFF-2 4; arm OFF-3 4; token scan 2; stop Medusa (always) 5; upload artefact 5; job summary 2 | 76               | 76         | **14**         |
| `flags-aa-on`      | 90          | identical to `flags-aa-off`, step 13 with flags ON, arms ON-1..3                                                                                                                                                                                                                                                                                                                  | 76               | 76         | **14**         |
| `flags-aa-verdict` | 20          | checkout P6 2; download both artefacts 2; run verdict 3; job summary 2                                                                                                                                                                                                                                                                                                            | 9                | 9          | **11**         |

Chain worst case: 90 + 90 + 20 = 200 min wall (sequential by `needs`). Each arm cap is 4 min for a 120 s arm
(row 11). No existing timeout is raised (rule C1).

## 9. Expected output

- **Unit count (`npm run check`, the P6 gate):** 2a `# tests 1405` (the suffix test is rewritten in place, no new test).
  2b `# tests 1422` = 1405 + 4 (top queries) + 4 (event loop) + 2 (preload) + 6 (A/A verdict) + 1 (chart).
- **Results folder (2b, a VALID medusa-load run):**
  - `results/load/<case>/…` (unchanged), plus its telemetry JSON with two new keys:

```json
{
  "topQueries": {
    "schema": 1,
    "status": "PASS",
    "topN": 10,
    "droppedNegative": 0,
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
    "rows": [{ "t": 1788000000123, "p50": 0.42, "p99": 3.1, "max": 7.9 }]
  }
}
```

- `results/load/el/el-<pid>.ndjson` (one JSON object per second; numbers only).
- `chart-<label>.html` with the `eventLoop p99 (preload)` series and the `event-loop proxy (health probe)` label.
- **A/A (dispatch with `flags_aa: true`):** `results/load/aa-flags/off-1..3/…`, `on-1..3/…`, and
  `results/load/aa-flags/verdict.json`:

```json
{
  "schema": 1,
  "case": "P6-X-LOAD-009",
  "product": "medusa",
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

(The numbers above are an illustration of the shape, not a measurement.)

- **Job summary lines:** `P6-X-LOAD-002 top queries: PASS (10 rows, 0 dropped)`; `P6-X-LOAD-002 event loop: PASS (N rows)`;
  `P6-X-LOAD-009 A/A flags: PASS|FAIL|INCONCLUSIVE (p50Ms rel x of tol y; p95Ms ...; requestsPerSec ...)`.
- **Artefacts:** `load-medusa` (existing), `load-aa-flags-off`, `load-aa-flags-on`, `load-aa-flags-verdict`. Retention as the existing upload steps (roadmap: 14 days).

## 10. Environment changes

**No environment change** in Cursor cloud or Claude Code cloud (E1). The preload uses Node built-ins only; the
harness provides `pg_stat_statements`; no tool, image, host entry or secret is added. The P6 Node comes from `.nvmrc`
as today. `.cursor/environment.json`, `.cursor/Dockerfile`, `.claude/hooks/session-start.sh` and the setup script are
not changed.

## 11. Build order (P6; one commit per step; `npm run check` before every push)

Commit messages are lowercase Conventional Commits. PR titles are checked the same way.

**2a (pin, suffixes, test):**

1. **S1.** `git fetch --tags origin && git switch -c chore/2026-10-29-p6-harness-pin-bump origin/main` (or the single
   branch name if Q-SPLIT is "one PR"). Run the build-time re-check (section 4).
2. **S2.** `npm install --save-exact=false "github:Jayami123/qa-portfolio-harness#v0.2.16"`; then
   `git diff --stat` must list exactly `package.json` and `package-lock.json`; then
   `node -e 'const l=require("./package-lock.json").packages["node_modules/qa-portfolio-harness"];console.log(l.version,l.resolved.split("#")[1])'`
   must print `0.2.16` and the commit hex of the tag. Commit: `chore(p6): pin the harness to v0.2.16`.
3. **S3.** `sed -i 's/-h0\.2\.15\b/-h0.2.16/g' .github/workflows/perf.yml .github/workflows/knee.yml .github/workflows/gate.yml .github/workflows/soak.yml`.
   Check: `rg -c 'h0\.2\.15' .github/workflows` prints nothing; `rg -c 'h0\.2\.16' .github/workflows` prints `perf.yml:14`, `knee.yml:8`,
   `gate.yml:6`, `soak.yml:3`. Commit: `ci(workflows): move the harness cache keys to h0.2.16`.
4. **S4.** Rewrite the suffix `it` in `tests/unit/harness-pin.test.ts` (skeleton 5.5). Commit: `test(harness-pin): check the cache-key suffix in all four workflows`.
5. **S5.** `README.md:5` `` `v0.2.15` `` → `` `v0.2.16` ``. Commit: `docs(readme): point the harness version line at v0.2.16`.
6. **S6.** `npm run check` → exit 0, `# tests 1405`. Push: `git push -u origin <branch>`. PR title: `chore(p6): pin the harness to v0.2.16`. Owner merges (merge commit).

**2b (flags, sampler, chart, A/A) — after the H1/H2 tag (or after 2a, under Option A):**

7. **S7.** `git fetch origin && git switch -c chore/2026-10-29-p6-harness-telemetry-bump origin/main`.
8. **S8.** `src/load/telemetry/pg-top-queries.ts` + `telemetry-top-queries.test.ts` (4). `npm run check` → `# tests 1409`.
   Commit: `feat(load): add the pg_stat_statements top-query deltas`.
9. **S9.** `src/load/telemetry/event-loop.ts` + `telemetry-event-loop.test.ts` (4) → `1413`.
   Commit: `feat(load): read the event-loop delay rows from the preload`.
10. **S10.** `src/load/telemetry/preload/el-delay.cjs` + `telemetry-el-preload.test.ts` (2) → `1415`.
    Commit: `feat(load): add the event-loop delay preload (numbers only)`.
11. **S11.** `src/load/telemetry/run.ts`: two snapshots and the two keys (no test change; the existing run tests stay green). Commit: `feat(load): write top queries and event-loop rows into the run telemetry`.
12. **S12.** `src/load/chart/render-chart.ts` + the `render-chart.test.ts` case (+1) → `1416`. README paragraph at `:820`.
    Commit: `feat(chart): add the event-loop series and the proxy label`.
13. **S13.** `src/load/tier-aa/verdict.ts` + `scripts/load/aa-flags-verdict.ts` + `aa-verdict.test.ts` (6) → `1422`.
    Commit: `feat(load): add the flags-on versus flags-off A/A verdict`.
14. **S14.** `perf.yml`: the three NEW jobs (section 5.4) and the `flags_aa` input. Check `actionlint` (`npm run lint:actions`).
    Commit: `ci(perf): add the flags on versus off A/A jobs (dispatch only)`.
15. **S15.** Env lines in `medusa-load` (`perf.yml`) and the three soak jobs (section 5.2). Check: every step keeps its cap.
    Commit: `ci(perf): turn the harness telemetry flags on for medusa load and the soak jobs`.
16. **S16.** `.env.example` placeholder lines (section 5.6). Commit: `docs(env): add the harness telemetry placeholders`.
17. **S17.** `npm run check` → exit 0, `# tests 1422`; push; PR title `chore(p6): turn the harness telemetry tier on for medusa load and soak`.
    Owner merges (merge commit). Owner dispatches `perf` with `flags_aa: true` once (step owner-4).

Owner step owner-1: merge each PR with **Create a merge commit**.
Owner step owner-4: in the GitHub web UI, Actions, `perf`, Run workflow, set `flags_aa` to true, run on `main`.

## 12. Extra risky cases (EXTRA, not in the roadmap IDs)

| EXTRA          | question                                                                                                          | oracle                                                                                                  | cost                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------- |
| EXTRA-TQ-RESET | After a `pg_stat_statements_reset()` made by someone else (not by P6), does the run go INCONCLUSIVE and not PASS? | the test feeds a snapshot where a `totalMs` drops; expect `droppedNegative > 0` and status INCONCLUSIVE | ~10 min, no product               |
| EXTRA-EL-GAP   | A one-second gap in the preload (the event loop blocked) shows as a missing row, not a zero                       | window count test; a gap of 3 seconds must still PASS only if the count rule holds, else INCONCLUSIVE   | ~10 min, no product               |
| EXTRA-AA-ORDER | Does the verdict change if the ON state runs first (order effect)?                                                | run the chain in reverse once (dispatch with `flags_aa_first: on`, a second input)                      | one extra dispatch, ~200 min wall |

## 13. Risks, roadmap conflicts and open decisions

### 13.1 Conflicts with the roadmap and the probe

| roadmap says                                                                            | probe shows                                                                                                     | decision or open question                                                                           |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| "every `h0.2.11`-style cache-key suffix in `perf.yml`" (lines 283–284)                  | 31 suffix lines in four workflows: perf 14, knee 8, gate 6, soak 3 (row 2)                                      | 2a rewrites all 31 and the pin test checks all four                                                 |
| soak has 2 suffix lines (prompt)                                                        | soak has 3: lines 181, 350, 532 (row 2)                                                                         | the test minimum for soak is 3                                                                      |
| "flags on only in the LOAD steps of `perf.yml` and `soak.yml`" (line 285)               | flags act at product start; Cal and Documenso smoke jobs run race steps on the same product before LOAD (row 5) | Q-SCOPE                                                                                             |
| "README 'How to read the chart'" (line 292)                                             | no such heading; the chart text is at `README.md:820` (row 14)                                                  | Q-README                                                                                            |
| "a nightly LOAD run ... ships top-query and event-loop rows" (line 306)                 | `perf.yml` has no schedule (row 13); nightly evidence is `soak.yml`                                             | Q-AA-TRIGGER; the rows are verified in medusa-load (on main push and dispatch) and in the soak jobs |
| `sampler.ts` is in Task 2's scope (line 297 and the ownership table)                    | Task 3 needs one hook in `sampler.ts`; Task 2 does not need to change it (row 8)                                | Task 2 leaves `sampler.ts` alone                                                                    |
| tolerance "in `k6/thresholds/`" (line 294)                                              | the file has cal and medusa only (row 9)                                                                        | X-LOAD-009 uses medusa; no documenso entry is needed                                                |
| "Done when: flags on in LOAD steps, all jobs green" (line 306)                          | cal-smoke and documenso-smoke LOAD stay flags-off under Q-SCOPE                                                 | recorded as a partial Done when (section 14)                                                        |
| `h0.2.15` pin test expects the suffix in `perf.yml` (not in the roadmap; the test file) | the test requires `>= 9` in `perf.yml` only (row 3)                                                             | the test is extended; minimums equal today's counts                                                 |

Pre-existing budget breaches (not created by Task 2): `medusa-load` margin -8 with 15 uncapped steps; `documenso-smoke`
margin -6 with 17 uncapped steps (row 7). See Q-C3.

### 13.2 Open decisions

- **Q-OWN.** Files this plan adds or changes that the ownership table does not name: `src/load/tier-aa/verdict.ts` and
  `scripts/load/aa-flags-verdict.ts` (the A/A step's code), `tests/unit/aa-verdict.test.ts`,
  `tests/unit/telemetry-el-preload.test.ts`, and the one-test change in `tests/unit/render-chart.test.ts`. They sit inside
  the owned areas (the A/A step, `src/load/chart/*`, the telemetry test family) and no other lane touches them.
  **Recommendation: accept them as Task 2 files** and let the owner add them to the table; if the owner says no, the
  A/A verdict moves to a file name the table allows.
- **Q-SPLIT.** One PR (2a + 2b) or two. **Recommendation: split.** 2a is a pin, 31 one-token edits and a test rewrite,
  so it merges fast and unblocks Lane B's CI sooner. 2b changes workflows that run in the nightly soak. Under Task 1
  Option B the split is natural: 2a pins `v0.2.16`, 2b pins `v0.2.17`.
- **Q-SCOPE.** Flags on Cal and Documenso LOAD. The products are started in jobs that also run races (row 5).
  Options: (a) flags on the start step anyway (races run flagged; breaks D1 "race steps off"); (b) new jobs
  `cal-load-tier` and `documenso-load-tier` with their own start, and the LOAD steps moved out of the smoke jobs (their
  budgets change, must be checked again); (c) defer to a later 2c. **Recommendation: (c) now, (b) in 2c.** The
  race-free jobs (`medusa-load` and the three soaks) cover the done-when now.
- **Q-AA-JOBS.** One A/A job or three chained jobs. One job: 6 arms and 2 starts needs 103 min of caps, so the
  budget needs timeout 115 (margin 12). **Recommendation: three chained jobs** (section 8.2): each state has its own
  90-min job, the verdict has its own 20-min job, and the states run one after the other.
- **Q-AA-TRIGGER.** `workflow_dispatch` only (input `flags_aa`, default false) or a weekly schedule. **Recommendation:
  dispatch only** for now; a schedule is not in the roadmap and would add runner cost every week.
- **Q-ARMS.** Three arms per state, six in total. **Recommendation: three** (`MIN_ARMS = 3`, and the calibration used
  six arm IDs, row 9). Fewer arms are INCONCLUSIVE by rule.
- **Q-ROLE.** The sampler reads `pg_stat_statements` through the same pool that `pg-stats.ts` already uses (the harness
  container superuser for Medusa, row 23 of Task 1). **Recommendation:** keep that pool; the query is a read-only
  `SELECT` with no reset. The roadmap wants a read-only role; granting `pg_read_all_stats` to another role would be
  DDL and is not P6's job. Owner confirms.
- **Q-README.** The README heading "How to read the chart" does not exist (row 14). **Recommendation:** edit the
  paragraph at `:820` and add the proxy sentence there, no new heading. Owner may ask for a heading.
- **Q-C3 (pre-existing budget breaches).** `medusa-load` (margin -8, 15 uncapped steps, dispatch-only VERIFY inside a
  45-min job) and `documenso-smoke` (margin -6, 17 uncapped steps). Task 2 does not add a step, so it does not change them.
  **Recommendation:** a separate `ci(perf)` PR that moves the VERIFY step into its own dispatch-only job and gives every
  uncapped step a cap (rule C2 and C3). Not in Task 2.
- **Q-EL-DIR.** Who creates `results/load/el`. **Resolved in Task 1 (Q7):** the harness creates the directory with
  `mkdir -p`, so Task 2 changes no `run:` line.
- **Q-PRELOAD.** The preload path is in the P6 checkout (`${{ github.workspace }}/p6/...`). It must be readable by the
  runner user (it is a repo file, mode 644 in git). Fine for Medusa; for Twenty (Lane B) the path must also be readable
  by UID 1000 (Task 1 row 16).

### 13.3 Risks

- Overhead changes the numbers: X-LOAD-009 measures it; a FAIL is recorded, not hidden.
- `pg_stat_statements` text size: the top 10 rows at 200 characters each (about 2 KB per run).
- A preload that blocks the event loop adds its own cost: the preload reads `process.hrtime` only once per second.
- Results folder size: the NDJSON is one line per second (about 100 bytes), so a 120 s arm is under 15 KB.

## 14. Done when

Copied from the roadmap (lines 306–309), adjusted by the decisions above:

- The bump PR green (2a, then 2b). **Adjusted:** all jobs green on the PR and on `main` after merge.
- A VALID medusa-load run and a soak run ship top-query and event-loop rows in telemetry and chart. **Adjusted (Q-SCOPE):**
  medusa-load and the three soak jobs. Cal and Documenso LOAD follow in 2c.
- The proxy series is labelled (`event-loop proxy (health probe)`).
- `P6-X-LOAD-009` within tolerance on the dispatch run, or the breach recorded (verdict.json and the job summary).
- Token scan passes (`perf.yml` "Token scan of the LOAD results" and the A/A scan).
- `npm run check` green (`# tests 1405` for 2a, `# tests 1422` for 2b).

**Rule self-check (section 0 of the Phase 5 prompt):**

- N1–N5: met (no pause; no secret printed; every fact cites a path, command or output; the budget parser output is the source of the sums).
- R1–R3: met (GitHub tools used read-only; no harness push; only explicit paths staged in P6).
- R4–R8: met or not applicable (no force push; no merge by the planner; no comment posted; owner name not written).
- O1–O3: met (only this file and Task 1's file are added; no code change).
- O4: met (no `.env` value, no token, no `pk_` key; the Medusa and Twenty probes printed names and numbers only).
- O5: met (no private finding named or described).
- O6: met (`P6-X-LOAD-002` and `P6-X-LOAD-009` kept as written; no renumbering; no new ID; EXTRA labels only).
- O7–O8: met (no threshold changed; the tolerance values are read from the file; no GitHub client command in the plan).
- C1: met (no timeout raised; new jobs get their own timeouts).
- C2: met for every new step (each has a cap). Pre-existing uncapped steps are reported (Q-C3).
- C3: met for every new job (margins 14, 14, 11). Pre-existing breaches reported (Q-C3, row 7).
- C4: met (section 8 tables for changed and new jobs).
- C5: met (each new A/A job that starts Medusa has its own `harness down` with `if: always()`).
- E1: met (section 10: no environment change, with the reason).
- The repo's agent rule 6 (plan branches never get a PR) conflicts with the owner's request for one plan PR; the request is followed and the conflict is reported.

## Interface for Lane B

- **Env names H4 forwards (from Task 1, PR A):** `API_RATE_LIMITING_SHORT_TTL_IN_MS`, `API_RATE_LIMITING_SHORT_LIMIT`,
  `API_RATE_LIMITING_LONG_TTL_IN_MS`, `API_RATE_LIMITING_LONG_LIMIT`. Set only when wanted; blank or unset keeps the image default.
- **How a P6 job sets them:** in the `env:` of the step `Start Twenty (harness up)`, immediately before `npm run up:twenty`
  (step-level, so no other step sees them). Values are whole numbers of at least 1 (Task 1 rule). Never set a name to an
  empty string: the image reads `""` as 0, which makes every request a 429 (Task 1 row 18).
- **How to confirm inside a running container (value only):**
  `docker exec "$(docker compose -p qa-harness-twenty ps -q server)" printenv API_RATE_LIMITING_SHORT_LIMIT`; repeat with
  `worker`. Build session verifies the `-p` form works without the `-f` list; if not, add the list the harness uses.
- **Harness tag Lane B waits for:** `v0.2.16` (it carries H4 under both Task 1 options). H1 and H2 need `v0.2.17` under Option B.
