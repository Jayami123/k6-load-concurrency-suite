# P6 Phase 5 Task 4: lost update under sustained edits (P6-TW-LOAD-004)

## Header

- **Title:** Task 4, lost update under sustained edits (`P6-TW-LOAD-004`, P0).
- **Date:** 2026-10-29 (Asia/Colombo, UTC+05:30). Plan written at 11:48 Asia/Colombo.
- **Plan branch:** `plan/2026-10-29-p6-phase5-tasks4-6` (planning only, no PR of its own).
- **Build branch:** `feat/<YYYY-MM-DD>-p6-tw-load-lost-update`. `<YYYY-MM-DD>` is the date the build session starts (roadmap pattern, `docs/agent-rules.md` rule A1).
- **Mapped case:** `P6-TW-LOAD-004` (P0, in scope). Variant A = different fields of one record; variant B = same field.
- **Roadmap section:** `docs/plans/2026-10-22-p6-phase5-roadmap.md`, "Task 4" lines 367–396. Related: Cases table lines 125–147, task table lines 149–160, Notes on the order lines 180–215, D3 lines 547–551, D6 lines 555–557, D11 lines 570–575.
- **Base SHA of main at planning:** `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29 09:18 Asia/Colombo).
- **Task 3 plan SHA planned against:** `d0879863b5d511786f0c0f3aa61674cf8ce71aa3` (short `d087986`, commit `docs(plans): add the phase 5 task 3 plan`, pushed 2026-10-29 06:21:50 UTC). Its §2 is frozen and is the interface source used here. Its §6 (functional values) and its Q list are referenced but not on the branch (see the re-check table).
- **Harness pin at planning:** `qa-portfolio-harness` `v0.2.15` (`package.json`). It has **no** `API_RATE_LIMITING_*` passthrough (H4 is not released yet; see the probe table).

## What it proves

Two writers, or two clerks, editing one record must both keep their change or see a visible conflict. This case measures that under sustained PATCH load on the Twenty REST API.

Two variants run in the same job:

- **Variant A (different fields of one record):** writer A1 changes `employees` and writer A2 changes `name` on the same record, at the same time. **Question:** does each write survive? **Oracle:** the final value of each field equals the value of the last acknowledged write to that field (REST read-back plus a read-only DB oracle). **PASS:** zero lost fields. **PRODUCT BUG (SUSPECTED):** any lost field, with the intent ids and the DB row as evidence. It becomes PRODUCT BUG after the same failure repeats in 3 VALID CI runs (rule C13).
- **Variant B (same field):** two writers set `employees` on the same record at the same time. **Question:** does the system refuse one write visibly (a 4xx with a body), or does one write silently overwrite the other? **Oracle:** the join in `src/load/lost-update.ts` (see Design) counts every acknowledged write whose value is not the final value (`overwritten`) and every refused write with a conflict body (`conflicts`), and records the overwrite rate per load stage. **Verdict words:**
  - `FINDING` (labelled "silent overwrite", never "pass") when `overwritten > 0`. A recorded silent overwrite is a finding (roadmap "Rules that hold", line 99–100).
  - `PASS` only when `overwritten = 0` **and** `conflicts > 0` at the stage (the contention was visible).
  - `INCONCLUSIVE` when neither happened (no contention was reached at that stage).
  - "The final value is A or B" is **not** a pass (roadmap line 380).
- **Verdict words for the whole case:** `PASS`, `FAIL` (a harness or setup error, TEST BUG), `INCONCLUSIVE` (run not VALID, or a stage with no contention), `NOT RUN` (gate not met or job skipped). A VALID run never reports `PASS` for variant B when `overwritten > 0`.

Transfer: two clinicians editing one patient record, or two clerks editing one account, must both keep their changes or see a conflict, never silently lose one (roadmap line 371–372).

## Live probe evidence

Probe date and clock: 2026-10-29, Asia/Colombo. Stack: `npm run up:twenty` through the harness (image `twentycrm/twenty:v2.44.0`, `docker/twenty.compose.yml` from `qa-portfolio-harness` v0.2.15), seeded with `npm run seed:twenty` (`twenty seed: created=true users=4`). Probe scripts were run from the session scratchpad (not committed). Every probe record had a run prefix (`p6-qa-20261029T061257Z-…`). Writes were kept to about 35 PATCH requests in total. Stack stopped with `npm run down:twenty`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`; containers and volumes both 0.

| #   | fact                                                        | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                      | what it changes in the design                                                                                                               |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PATCH writes only the sent fields (variant A depends on it) | `probe-t4.ts`: create 201; 5 trials of `PATCH {employees}` then `PATCH {name}`, all 200; GET after the name write kept `employees` (100, 101, 102, 103, 104). **PROBED: YES**                                                                                                                                           | Variant A can assert both fields survive.                                                                                                   |
| 2   | No conflict status and no version check                     | `probe-t4.ts`: `PATCH` with `updatedAt: "2000-01-01…"` in the body → 200; `PATCH` with header `If-Match: "0"` → 200 (stale value accepted). Source: `common-update-one-query-runner.service.ts` (115 lines) delegates to update-many with `filter: {id}`, no version check; `grep If-Match                              | ifMatch`under`engine/api`returns nothing (fork`7cbdfec6`).                                                                                  | Variant B is expected to be a silent overwrite. The oracle must accept that and label it a finding. |
| 3   | ETag header on PATCH                                        | `probe-t4.ts`: the PATCH response with `If-Match` has an `etag` header (`ifMatchResponseHasEtag: true`) but the stale `If-Match` is ignored.                                                                                                                                                                            | No ETag-based conflict detection. Recorded as a README fact only.                                                                           |
| 4   | Table, column and `updatedAt` resolution                    | `probe-t4.ts` DB oracle (read-only, `information_schema`): `workspace_1wgvd1injqtife6y4rvfbu3h5.company."updatedAt"` is `timestamp with time zone`, `datetime_precision = 6` (microseconds). The REST body shows millisecond precision: `"updatedAt": "2026-10-29T06:12:58.564Z"` while the DB shows `06:12:58.631073`. | The join orders by the DB value (µs), never by the REST body (ms). Equal µs values are counted as `ties`.                                   |
| 5   | Response keys carrying writer attribution                   | `probe-t4.ts` record keys: `createdAt, updatedAt, deletedAt, createdBy, updatedBy`. Shape of `updatedBy` values: NOT PROBED (not printed).                                                                                                                                                                              | Intent attribution uses the value we write (see Design), not `updatedBy`. Build-time re-check (Build-time table row B3).                    |
| 6   | Variant A concurrency                                       | `probe-t4b.ts`: 5 trials, 2 concurrent PATCHes on different fields each: 10/10 statuses 200; both fields kept in 5/5 trials.                                                                                                                                                                                            | Variant A passes at this concurrency; the case must still run at load.                                                                      |
| 7   | Variant B concurrency                                       | `probe-t4b.ts`: 5 trials, 2 concurrent PATCHes on `employees` each: 10/10 statuses 200; exactly one value survived in 5/5 trials (each trial's surviving value is one of the two sent).                                                                                                                                 | Every trial is a silent overwrite candidate. Variant B will record a finding, not a pass.                                                   |
| 8   | Harness limits at image defaults                            | Source `config-variables.ts:1713/1722` (SHORT 1000 ms / 100), `:1730/1739` (LONG 60000 ms / 100), `:1748/1757` (APPLICATION 60000 ms / 500). Probed in Task 6 (see the Task 6 plan in this PR): 120-request burst → 100 × 200, 20 × 429.                                                                                | Writers must run on the functional profile (Task 3, H4). At defaults the case is limited at about 100 requests per minute and must not run. |
| 9   | Harness server and worker env                               | `docker inspect` env **names** only: no `API_RATE_LIMITING_*`, no `NODE_OPTIONS` (server 25 names, worker 24 names).                                                                                                                                                                                                    | Confirms the image defaults are in effect now.                                                                                              |
| 10  | Writer and record counts that keep runs VALID               | Derived, not probed: see Design "Load shape". Limits in Task 6's probe apply to the default profile only.                                                                                                                                                                                                               | Functional profile must allow the peak in Design.                                                                                           |

### Probe items the roadmap lists that stay open

- `updatedBy` value shape: NOT PROBED (B4). Build-time re-check row B3.
- Cross-workspace record id (EXTRA): NOT PROBED. The harness sets `IS_MULTIWORKSPACE_ENABLED: "false"` (`node_modules/qa-portfolio-harness/docker/twenty.compose.yml`), so a second workspace does not exist in this stack. See Open decision Q9.
- Update vs delete race, stale read replay, malformed or unknown-field patch (EXTRA): NOT PROBED. Each has a build-time step (see Extra risky cases).

## Depends on

| Dependency                                                                                                                                                                                    | Status at planning                                                                                                                                                             | Blocks                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Task 3 (Twenty load foundation: `k6/lib/twenty-auth.js`, `k6/journeys/tw-background.js`, limiter profile module, `src/load/reconcile/twenty.ts`, the workflow `twenty-load.yml` with markers) | Task 3 plan pushed on `plan/2026-10-29-p6-phase5-task3` (commit `d087986`). Its frozen §2 interfaces are used (real names below). Its functional values are not on the branch. | **Build start** for steps S2 onward.                        |
| Task 1 (harness H4, `API_RATE_LIMITING_*` passthrough)                                                                                                                                        | Not released. Pin `v0.2.15` has no H4 (probe 8 and `grep` of `node_modules/qa-portfolio-harness/src`: no passthrough).                                                         | **CI run** (functional profile). Unit tests do not need it. |
| Task 2 (pin bump to the H4 tag, `package.json`)                                                                                                                                               | Not merged.                                                                                                                                                                    | **CI run**.                                                 |
| Phase 2 Task 7 (`P6-TW-RACE-001`, `P6-TW-RACE-005`)                                                                                                                                           | Merged on main (plan file `docs/plans/2026-10-23-p6-phase2-task7-twenty-races.md`). Reused helpers only.                                                                       | None.                                                       |
| Owner action: none for this task                                                                                                                                                              | —                                                                                                                                                                              | —                                                           |

### Interfaces from Task 3 (real names from its frozen §2)

The Task 3 plan (`plan/2026-10-29-p6-phase5-task3`, commit `d087986`) freezes these names in its §2. This plan uses them. Differences from the first draft are listed in the re-check table.

- **I1 (real, §2.1)** `k6/lib/twenty-auth.js`: `authorizationHeader()` returns `"Bearer <token>"` from `__ENV.TWENTY_TOKEN` (throws `TEST BUG` when unset); `restHeaders(authorization)`. The runner mints the workspace token with the existing `signInWorkspace()` and passes it as `secretEnv: ["TWENTY_TOKEN"]`.
- **I2 (real, §2.2)** `k6/journeys/tw-background.js`: `runTwBackground(cfg, opts)`, `cfg = { baseUrl, prefix }`. One iteration creates a company, reads it, patches its name and reads it again. It returns `{ created, patched, serverErrors }` and feeds the counters `p6_tw_created`, `p6_tw_updated` and `p6_tw_5xx`. The case script calls it from its `journey()` export (§2.3).
- **I3 (real, §2.5)** `src/load/reconcile/twenty.ts`: `reconcileTwenty(pool, cfg, clientCount)`, `cfg = { product: "twenty", prefixLike, schema }`, `clientCount` = the k6 counter `p6_tw_created`. **This plan does not edit that file.** Its extra checks are a stage composed in the case: `composeStages([reconcileStage, lostUpdateStage])`.
- **I4 (real, §2.6; the draft's name was wrong)** `src/twenty/limiter-profile.ts`: `limiterProfileEnv("functional")` returns the H4 names and values; `limiterProfileEnv("productionLike")` returns `{}`. **The functional values are not on the pushed branch** (its §6.3 is referenced and absent). They stay ASSUMED until Task 3 publishes them. The "Limiter fit" rule below is this plan's own requirement, and B2 re-checks it.
- **I5 (real, §2.4)** `src/load/cases.ts`: a `LoadCase` entry in `CASES` (type at `src/load/types.ts:88`) with `id`, `title`, `product`, `label`, `telemetry`, `profiles: { pr, full }`, `runs()` (`script`, `env`, `secretEnv`) and `stages`. `gated: true` is the Task 3 field for gated cases. Run command (§2.8 step 11): `node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile <pr|full>`.
- **I6 (real, §2.7–§2.8)** `.github/workflows/twenty-load.yml` with the markers `# >>> task4 jobs`, `# >>> task5 jobs`, `# >>> task6 jobs`. Every job copies the 15-step template of §2.8.
- **Stage hooks (real, §2.10)** `twentySetup` and `twentyCleanup` in `src/load/products/twenty.ts`. `twentyCleanup` sweeps every company whose name starts with the run prefix (live and soft-deleted) and runs the leak check. This plan uses it and drops its own per-case cleanup.
- **Results (real, §2.9)** `results/load/P6-TW-LOAD-004/<runId>/` with the runner's files (`verdict.json`, `run-meta.json`, `audit.json`, `telemetry-main.json`, …). `run-meta.json` gains `limiterProfile`.
- **VALID rule (real, §2.11)** VALID needs `verdict.json` `outcome: "PASS"`, `validity.verdict: "VALID"` and `environment.kind: "github-actions"`. Open decision Q10 covers product-bug runs.

## Build-time re-check table

The build session runs every row first (step S1). A row that changed changes the plan (see the S1 rule below).

| fact                                                  | how to re-check at build start                                                                                                                                                                                                             | if it changed                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1. Task 3 interfaces I1–I6                           | Read `docs/plans/2026-10-29-p6-phase5-task3-*.md` on main and the code on main (`k6/lib/twenty-auth.js`, `k6/journeys/tw-background.js`, `src/load/reconcile/twenty.ts`, the limiter-profile module, `.github/workflows/twenty-load.yml`). | Use the real names. Record each difference in the re-check table below. If a difference changes an oracle or a threshold, stop and report it.                             |
| B2. Functional profile values                         | Read the Task 3 probe table (its functional values).                                                                                                                                                                                       | Recompute the load-shape check in Design. If the functional limits are below 16 req/s or 1200 per minute, stop: the writer peak does not fit (see Design, "Limiter fit"). |
| B3. `updatedBy` value shape and `updatedAt` precision | `curl` through the harness is not needed: run `probe-t4.ts`-style read once against the harness stack (`GET /rest/companies/<id>`), print key names and value types only.                                                                  | If `updatedBy` is a member id, use it as a second attribution key; otherwise keep value-encoded attribution.                                                              |
| B4. Limiter bucket sharing across API keys            | Build-time gate probe for `P6-TW-LOAD-006`/`-009` (its own plan). The result decides whether writers may use one key or must share a bucket.                                                                                               | If buckets are shared across keys, the functional limit must cover the total writer peak (already required by "Limiter fit"). No change to the oracle.                    |
| B5. Redis state between runs                          | Run `docker exec <redis> redis-cli DBSIZE` after `npm run up:twenty` on a fresh stack. Redis has no volume mount (`docker inspect` `.Mounts` empty on 2026-10-29).                                                                         | If Redis carries keys across a `down` and `up`, add a Redis-empty assertion to the job (names of keys only). Never write to Redis.                                        |
| B6. Schema name of the workspace                      | `resolveWorkspaceSchema` in `src/twenty/oracle.ts:19`.                                                                                                                                                                                     | Use the value it returns.                                                                                                                                                 |
| B7. Helpers still exist                               | `grep -n "export" src/twenty/api.ts src/twenty/oracle.ts src/twenty/invariants.ts src/twenty/run-case.ts src/races/prefix.ts`.                                                                                                             | Use the new names; a missing helper is a stop.                                                                                                                            |

### Re-check table (filled at S1, one row per difference)

| #   | difference found at S1                                                                                                                                                                                                         | change to this plan                                                                                                                                                                | oracle or threshold changed?                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | I1 draft `twentyAuth(env)` → real `authorizationHeader()` (reads `__ENV.TWENTY_TOKEN`) and `restHeaders()` (§2.1)                                                                                                              | The case reads `authorizationHeader()`. The runner mints the token with `signInWorkspace()` and passes it through `secretEnv: ["TWENTY_TOKEN"]`.                                   | no                                                                         |
| 2   | I2 draft `backgroundJourney({prefix, ratePerSec})` → real `runTwBackground(cfg, opts)`, `cfg = {baseUrl, prefix}`, counters `p6_tw_*` (§2.2)                                                                                   | The rate comes from the open-model scenario of §2.3, not from an argument.                                                                                                         | no                                                                         |
| 3   | I3 draft `reconcileTwenty(ctx, runPrefix)` → real `reconcileTwenty(pool, cfg, clientCount)` (§2.5)                                                                                                                             | The leak check passes `clientCount = p6_tw_created + 10`. `src/load/reconcile/twenty.ts` is not edited; the Task 4 stage is composed in the case.                                  | no (the rule "must equal the created count" stays)                         |
| 4   | I4 draft `resolveTwentyLimiterProfile("production-like")` in `src/load/twenty/limiter-profile.ts` → real `limiterProfileEnv("functional")` and `limiterProfileEnv("productionLike")` in `src/twenty/limiter-profile.ts` (§2.6) | The up step gets `env:` from `limiterProfileEnv("functional")`; `run-meta.json` gains `limiterProfile`.                                                                            | no                                                                         |
| 5   | Task 3 §6.3 (functional values) and its Q1–Q10 list are referenced in the plan but absent from `d087986`                                                                                                                       | The functional values stay ASSUMED. The Limiter fit rule (at least 17 req/s and 1200 per minute) is this plan's own requirement, which Task 3's values must meet; B2 re-checks it. | no                                                                         |
| 6   | Task 3 §2.11: VALID means `outcome: "PASS"`                                                                                                                                                                                    | A reproduced PRODUCT BUG run has outcome FAIL, so it is not VALID under §2.11. Open decision Q10.                                                                                  | the thresholds do not change; the counting rule needs the owner's decision |
| 7   | Task 3 §2.8 job template (15 steps, caps sum 70, job timeout 80)                                                                                                                                                               | This job copies the template: caps sum 75, job timeout 85 (CI budget table rewritten). The cleanup is `twentyCleanup`, not a per-case sweep.                                       | no                                                                         |
| 8   | Task 3 §2.4 `profiles: { pr, full }` and `--profile`                                                                                                                                                                           | PR runs use `--profile pr` (stage 1 only); main, nightly and dispatch use `--profile full` (stages 1–3).                                                                           | no                                                                         |
| 9   | Task 3 §2.9 result layout `results/load/<caseId>/<runId>/`                                                                                                                                                                     | Results move from `results/tw-load-004/` to `results/load/P6-TW-LOAD-004/<runId>/`. The variant results go under `stages.lostUpdate` of `verdict.json`.                            | no                                                                         |

## Design

### Build-time file ownership (copied verbatim)

This table is the same in all four Phase 5 planning prompts. Planning sessions only add their own plan files, so the four plan PRs never conflict. This table is for the BUILD sessions. This task keeps to its own row (Lane B, Task 4).

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                      |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml; tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step; README "How to read the chart" and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/_, src/dashboard/_, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                         | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                       |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                       | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                        |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-* releases; contents: read stays)                                                                                                                                                                      | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                               |

"Registration line" means a one-line or one-entry edit in a shared file. The PR that merges second runs `git merge origin/main` and keeps both entries (a merge commit, never a rebase).

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (if the Task 3 plan splits it, 3a foundation may merge before Task 2 and 3b, the verified functional profile, after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 and 5 also need Task 2 merged for their CI; 6 does not); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

### Modules and data flow

```
scripts/load/run-load.ts --case P6-TW-LOAD-004
  └─ k6 run k6/cases/tw-load-004.js          (writers: PATCH at a fixed arrival rate; background via I2)
       └─ console.log("TW004 " + intent json)  → k6 stdout captured by src/load/k6-process.ts
  └─ src/twenty/oracle-lost-update.ts        (read-only: final rows from Postgres, µs updatedAt)
       └─ src/load/lost-update.ts            (pure join: intents + finals → verdict)
  └─ I3 reconcileTwenty (post-load audit, called from the case's composed reconcile stage; the file src/load/reconcile/twenty.ts is not edited)
```

### Exact file list

| status                                                  | path                                             | purpose                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NEW                                                     | `k6/cases/tw-load-004.js`                        | k6 case: two writer groups (variant A, variant B) at a constant arrival rate in three stages; writes one `TW004 {json}` line per intent to stdout.     |
| NEW                                                     | `src/load/lost-update.ts`                        | Pure functions: intent join, verdict, overwrite rate. No I/O.                                                                                          |
| NEW                                                     | `tests/unit/lost-update.test.ts`                 | Unit tests for the join (fixtures listed in "Oracles").                                                                                                |
| NEW                                                     | `src/twenty/oracle-lost-update.ts`               | Read-only DB reads (final rows, µs timestamps) and the stage that writes `stages.lostUpdate` into `results/load/P6-TW-LOAD-004/<runId>/verdict.json`.  |
| NEW                                                     | `tests/unit/oracle-lost-update.test.ts`          | Unit tests for the SQL builder and the schema-name guard (no DB).                                                                                      |
| CHANGED (registration line)                             | `scripts/load/run-load.ts` and the case registry | one entry: `P6-TW-LOAD-004` → `k6/cases/tw-load-004.js`.                                                                                               |
| NOT EDITED                                              | `src/load/reconcile/twenty.ts`                   | Task 3's file stays unchanged. The Task 4 stage is composed in the case: `stages.reconcile = composeStages([reconcileStage, lostUpdateStage])` (§2.5). |
| CHANGED (append only, only if a new file is impossible) | `src/twenty/oracle.ts`                           | not expected; the oracle goes in the new file.                                                                                                         |
| CHANGED (job and README)                                | `.github/workflows/twenty-load.yml`              | one job under `# >>> task4 jobs`.                                                                                                                      |
| CHANGED (README sub-marker)                             | `README.md`                                      | text under the Task 4 README sub-marker of the "Twenty load" section.                                                                                  |

### Load shape (writers and records)

- Records: 10 per run, prefixed `prefix-t4-<variant>-<n>`. Variant A uses records 0–4 (`employees` by writer A1, `name` by writer A2). Variant B uses records 5–9 (`employees` by writers B1 and B2).
- Writers: 4 (A1, A2, B1, B2). Each writer is one k6 VU group with a `constant-arrival-rate` executor.
- Stages (same for every writer): stage 1 1 req/s, stage 2 2 req/s, stage 3 3 req/s. Each stage 120 s, ramp 20 s. Peak total writer rate: 4 × 3 = 12 req/s. Writers total: 4 × (1 + 2 + 3) × 120 = 2880 writes.
- Background journey (I2, `runTwBackground`): the rate comes from the case's open-model scenario (Task 3 §2.3), ASSUMED 2 req/s until Task 3 publishes its functional values.
- Profiles (Task 3 §2.4): `--profile pr` runs stage 1 only (the PR shape, roadmap line 392); `--profile full` runs stages 1–3 (nightly, main and dispatch).
- **Limiter fit (the functional profile must hold this):** peak 12 writer req/s + 2 background = 14 req/s, with 20% headroom = 16.8. Required functional values: short window ≥ 17 per second, long window ≥ 1200 per minute, **for the whole workspace**, because B4 (bucket sharing) is not decided. At image defaults (100 per second, 100 per minute) the peak cannot run: the case must not start on the production-like profile. Task 3's probe must show zero 429 at this peak before this task builds the CI step.
- **VALID rule for this case (in addition to the Phase 3 validity rules):** zero 429 and zero 5xx on writer and background requests; achieved writer rate within 10% of the planned rate per stage. A run that breaks either rule is INVALID and its verdict is `INCONCLUSIVE`, never `PASS`.

### Intent record (one per attempted write)

```ts
// k6/cases/tw-load-004.js (inside the writer VU function)
// intentId  = `${writer}-${stage}-${seq}`        unique per attempt (duplicate detection)
// value     = for variant A: name `${prefix}-a2-${seq}` or employees `${writerCode}${seq}` (integer, see below)
//             for variant B: employees = writerCode * 1_000_000 + seq   (unique, integer, fits the field)
// sentMs    = Date.now() before the request (k6 clock, ms)
// status    = res.status, or 0 when the request timed out
// ambiguous = true when status is 0 or 5xx (the write may or may not have applied)
console.log(
  "TW004 " +
    JSON.stringify({
      intentId,
      variant,
      recordId,
      field,
      value,
      writer,
      sentMs,
      status,
      ambiguous,
    }),
);
```

- `writerCode`: A1 = 1, A2 = 2 (not used for A's name field), B1 = 1, B2 = 2. Integer `value` = `writerCode * 1_000_000 + seq`, so a B value names its writer and sequence.
- A k6 request that times out is recorded once with `status: 0` and `ambiguous: true`. The VU does not retry a write (a retry would create a second intent for the same value). If a retry is needed later, it uses the same `intentId` and is deduplicated (see the join).

### Module skeletons

```ts
// src/load/lost-update.ts  (NEW, pure)
export type Variant = "A" | "B";

export interface WriteIntent {
  intentId: string; // unique per attempt; duplicates are counted and dropped
  variant: Variant;
  recordId: string;
  field: "employees" | "name";
  value: string; // compared as a string with the final value
  writer: string; // "A1" | "A2" | "B1" | "B2"
  sentMs: number; // k6 clock, ms
  status: number; // 0 = timed out
  ambiguous: boolean; // true when status is 0 or 5xx
  stage: number; // 1, 2 or 3 (for the rate table)
}

export interface FinalRow {
  recordId: string;
  employees: string | null;
  name: string | null;
  updatedAtUs: string; // "YYYY-MM-DDTHH:MM:SS.ffffff" from Postgres (µs)
}

export interface StageResult {
  stage: number;
  acked: number; // 2xx and not ambiguous
  overwritten: number; // acked and value ≠ final value (variant B)
  conflicts: number; // 4xx with a body, refused (variant B)
  ambiguousApplied: number; // ambiguous and value = final value (applied, not acked)
  overwriteRate: number; // overwritten / acked, 0 when acked = 0
}

export interface JoinResult {
  variant: Variant;
  lost: number; // variant A: fields whose final value ≠ last acked value
  duplicates: number; // intents with an intentId already seen
  ties: number; // records with two acked intents at the same updatedAt µs
  stages: StageResult[];
  verdict: "PASS" | "FINDING" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";
  verdictReason: string;
}

/** Drop repeated intentIds, keep the first. Pure. */
export function dedupeIntents(intents: WriteIntent[]): { kept: WriteIntent[]; duplicates: number };

/** Variant A: for each (record, field) the final value must equal the last acked value. Throws TEST BUG on an unknown recordId. */
export function joinVariantA(intents: WriteIntent[], finals: FinalRow[]): JoinResult;

/** Variant B: per stage count acked-overwritten, conflicts, applied-unacked. Throws TEST BUG when a final value matches no intent of the record. */
export function joinVariantB(intents: WriteIntent[], finals: FinalRow[]): JoinResult;

/** Overwrite rate: overwritten / acked, 0 when acked is 0. Pure. */
export function overwriteRate(overwritten: number, acked: number): number;

/** Count records whose acked intents share one updatedAt µs. Pure. */
export function countTies(finals: FinalRow[], intents: WriteIntent[]): number;
```

```ts
// src/twenty/oracle-lost-update.ts  (NEW, read-only)
/** Final rows of the given record ids. The schema name is validated first (TEST BUG if it does not match). */
export async function readFinals(
  pool: pg.Pool,
  schema: string,
  recordIds: string[],
): Promise<FinalRow[]>;
/** SQL text only, so the unit test can check the parameter list without a database. */
export function finalsSql(schema: string): string;
/** Stage: reads the TW004 lines from results/load/P6-TW-LOAD-004/<runId>/k6-main.log, writes intents.jsonl and finals.json (case extras) and stages.lostUpdate in verdict.json. Throws only on TEST BUG. */
export async function runOracle(opts: {
  runDir: string;
  schema: string;
  pool: pg.Pool;
}): Promise<void>;
```

- `finalsSql(schema)` returns:
  `SELECT id AS "recordId", employees::text AS employees, name, to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.US') AS "updatedAtUs" FROM ${schema}.company WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL`.
- The schema is inserted with `${schema}` only after `/^workspace_[a-z0-9]+$/` passes; otherwise throw `TEST BUG: schema name not valid`.

### Oracles and verdict rules

Formulas (all units are counts unless stated):

- `acked(i) = status ∈ [200, 299] and !ambiguous(i)`.
- `conflict(i) = status ∈ {400, 409, 412, 422} and the body has an errors array`.
- **Variant A.** For each `(recordId, field)`: `last(r,f)` = the acked intent for `(r,f)` with the greatest `sentMs` (one writer per field, so there is no tie to break). `lost = count of (r,f) where String(final) ≠ value(last(r,f))`. Verdict: `lost = 0` → `PASS`; `lost > 0` → `PRODUCT_BUG_SUSPECTED` with the intent ids and the DB values in `verdictReason`.
- **Variant B.** For each stage s: `acked_s`, `overwritten_s = count of acked intents of stage s whose value ≠ final value of their record`, `conflicts_s`, `ambiguousApplied_s = count of ambiguous intents whose value = final value`. `overwriteRate_s = overwritten_s / acked_s` (0 when `acked_s = 0`). Verdict over the whole run: any `overwritten > 0` → `FINDING` ("silent overwrite; last-write-wins is the observed design, not an error the README hides"); else `conflicts > 0` → `PASS`; else `INCONCLUSIVE` (no contention reached).
- **Every verdict:** a final value that matches **no** intent of its record → `TEST BUG` (the write path or the oracle is wrong). Stop the case; do not record a verdict.
- **Ordering:** variant A does not need order (one writer per field). Variant B does not use time to choose a winner (it uses value equality). The join uses `updatedAtUs` only to report `ties` (records where two acked intents share one µs value). A tie does not change the verdict, but it is printed in the job summary so a reader knows the µs resolution was not enough to order those writes.
- **Thresholds:** the only thresholds are the VALID rules in "Load shape" (zero 429, zero 5xx, rate within 10%). They live in `k6/thresholds/` as the existing Phase 4 files do; this task adds no new threshold file. Never loosened.

Fixtures for `tests/unit/lost-update.test.ts` (each is one `it(...)` block):

1. **no loss** (variant A): two fields, final = last acked for both → `lost 0`, `PASS`.
2. **one loss** (variant A): final `name` is the first acked value, not the last → `lost 1`, `PRODUCT_BUG_SUSPECTED`, reason names the record and the intent ids.
3. **B with conflicts**: one acked, one 409 with an errors body, final = acked value → `overwritten 0`, `conflicts 1`, `PASS`.
4. **B with silent overwrites**: two acked, final = the second → `overwritten 1`, `FINDING`, `overwriteRate = 1/2`.
5. **a retried write** (intent with `ambiguous: true`, same value applied): counted in `ambiguousApplied`, not in `acked`, not in `overwritten`.
6. **a duplicate intent** (same `intentId` twice): `duplicates 1`, the join uses the first copy only.
7. **equal timestamps** (two acked intents, same `updatedAtUs`): `ties 1`, verdict unchanged.
8. **an unknown final value** (final matches no intent): throws `TEST BUG`.
9. **zero intents**: `INCONCLUSIVE`, `verdictReason` = "no acknowledged writes".
10. **overwriteRate** edge: `acked = 0` → `0`; `acked = 4, overwritten = 1` → `0.25`.

## Data isolation, cleanup and leak check

- Every record name and every intent carries the run prefix from `p6RunPrefix()` (`src/races/prefix.ts`). The prefix is also in the stdout tag, so the oracle can filter.
- The job runs on a fresh stack: `TWENTY_DOWN_VOLUMES: "1"` in the job env (as `perf.yml` does at lines 1792, 1986 and 2166), so no record from an earlier run remains.
- **Setup records:** the setup stage creates the 10 records with `createCompany` (`src/twenty/api.ts`), named `prefix-t4-<variant>-<n>`. They are created outside the background counter.
- **Cleanup** (Task 3 §2.10, `twentyCleanup`): sweeps every company whose name starts with the run prefix (live and soft-deleted) and runs the leak check. This plan adds no per-record sweep of its own.
- **Leak check** (fails the job): `reconcileTwenty(pool, cfg, clientCount)` (I3, Task 3 §2.5) with `cfg = { product: "twenty", prefixLike: "<prefix>%", schema }` and `clientCount = p6_tw_created + 10`, where 10 is the number of setup records. Any mismatch is a TEST BUG or a leak and fails the job, as in Task 3's audit.
- The writers never create records outside the run prefix.

## CI budget

The new job lives in `.github/workflows/twenty-load.yml` under `# >>> task4 jobs` (I6). Triggers: nightly `schedule` (cron `41 3 * * *` UTC = 09:11 Asia/Colombo, a registration line owned by Task 3's `on:` block) and `workflow_dispatch`. On `pull_request` the job runs stage 1 only (`LOST_UPDATE_STAGES=1`), as the roadmap asks (line 392).

Job: `task4-lost-update`, `runs-on: ubuntu-24.04`, `timeout-minutes: 85`. It copies the Task 3 job template (§2.8, 15 steps, sum of caps 70, job timeout 80 for the foundation job). The run step (cap 15) is the only step that differs in length: the full profile needs about 7 minutes of k6 time plus the oracle and the audit.

| job               | job timeout | each step and its cap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | sum of step caps | worst case                                                                                                          | margin (>= 10 min) |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| task4-lost-update | 85          | Task 3 §2.8 template: checkout 3; setup-node 3; `npm ci` 5; k6 setup 3; `bootstrap.sh twenty` with `BOOTSTRAP_SKIP_INSTALL=1` 3; verify `TWENTY_REF` 1; `scripts/ci/compose-pull.sh` 6; `npm run up:twenty` with `limiterProfileEnv("functional")` as `env:` 12; `npm run seed:twenty` 10; `npm run smoke:twenty` 2; `node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile <pr\|full>` (k6 writers and background, the lost-update oracle, `reconcileTwenty` leak check and `twentyCleanup`) 15; token scan of `results/` 2; upload `results/load/` 3; container logs 2; `npm run down:twenty` with `TWENTY_DOWN_VOLUMES=1` 5 (`if: always()`) | 75               | 75 (the pull retries are inside its 6-minute cap; the run step is capped at 15: full = 7 min plus oracle and audit) | 75                 | **10** |

- The job timeout is the sum of caps plus the 10-minute margin (rule C3). No existing timeout changes (C1).
- The down step has `if: ${{ always() }}` (rule C5).
- Every step has `timeout-minutes` (rule C2).

## Expected output

Under `results/load/P6-TW-LOAD-004/<runId>/` (the Task 3 layout, §2.9; the runner creates it). The variant results go under `stages.lostUpdate` of `verdict.json`; the runner's own fields (`caseId`, `runId`, `profile`, `label`, `outcome`, `reasons[]`, `invalid[]`, `validity`, `k6[]`, `runMeta`) keep their meaning:

- `run-meta.json`: `{ "case": "P6-TW-LOAD-004", "profile": "functional", "limiter": { "name": "...", "values": { "API_RATE_LIMITING_SHORT_LIMIT": n, … } }, "harnessTag": "v0.2.x", "twentyImage": "twentycrm/twenty:v2.44.0", "twentyRef": "7cbdfec6f346b43715bc2056932f4fad5886f733", "k6Version": "…", "stagesRate": [1,2,3], "stageSeconds": 120, "valid": true, "validReasons": [] }`. Limiter values are copied from I4; no secret appears.
- `intents.jsonl`: one JSON object per intent (the `TW004` lines without the tag). Case-specific extra file, not in Task 3's list; declared here so the token scan covers it.
- `finals.json`: `[{ "recordId": "…", "employees": "…", "name": "…", "updatedAtUs": "…" }]`.
- `verdict.json`: `{ "variantA": JoinResult, "variantB": JoinResult, "verdict": "PASS" | "FINDING" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE", "valid": true }`. Example variant B fragment: `{ "stages": [{ "stage": 1, "acked": 240, "overwritten": 0, "conflicts": 0, "overwriteRate": 0 }, …], "verdict": "FINDING" }`.
- Job summary lines (one line each, `$GITHUB_STEP_SUMMARY`): `TW-LOAD-004 A: lost=<n> verdict=<v>`; `TW-LOAD-004 B: stage <s> overwritten=<n> acked=<n> rate=<r> conflicts=<n>`; `TW-LOAD-004 B verdict=<FINDING|PASS|INCONCLUSIVE> (silent overwrite is a finding, not a pass)`; `ties=<n> duplicates=<n> leak=<n>`.
- Artefact: the `results/load/` folder as one artefact (Task 3 step 13, 14-day retention). The token scan (step 12) runs before the upload and fails the job on a token value.
- **Outcome mapping (decision, see Q10):** the runner's `outcome` is `PASS` when variant A has no lost field and variant B is `PASS` or `FINDING` (the finding is written into `reasons[]`); `FAIL` when variant A has a lost field (PRODUCT BUG SUSPECTED) or a TEST BUG occurred; `INVALID` or `ENV` as the runner decides.

## Environment changes

No environment change. The Twenty stack, k6 and the harness are already installed by the existing setup (`npm ci`, `scripts/bootstrap.sh twenty`, `scripts/install-k6.sh`, and the Docker start). The pin bump to the H4 tag is Task 2's change in `package.json` (Cursor cloud and Claude Code cloud both pick it up from `npm ci`). Nothing in `.cursor/` or `.claude/hooks/` changes for this task.

## Build order

Each step runs `npm run check` before every push, and the unit count is printed. The count grows by the number of new `it(...)` blocks.

- **S1. Re-check against the merged Task 3 (its plan and its code on main) and adjust this plan before coding. List every difference and the change it causes in the plan's re-check table. If a difference changes an oracle or a threshold, stop and report it.**
  - Files: this plan only. Commands: `git fetch origin main`, `git show origin/main:docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md` (or the name the Task 3 plan has), `grep -n "export" k6/lib/twenty-auth.js k6/journeys/tw-background.js src/load/reconcile/twenty.ts`, the Task 3 limiter-profile module, `cat .github/workflows/twenty-load.yml`.
  - Expected: the re-check table lists each I1–I6 with the real name. Commit message: `docs(plans): record the task 4 re-check against task 3`. Stop only for an oracle or threshold change (H6).
- **S2. Fixture test for the join (no I/O).**
  - Files: `src/load/lost-update.ts` (NEW), `tests/unit/lost-update.test.ts` (NEW).
  - Command: `node --test tests/unit/lost-update.test.ts`. Expected: 10 tests pass.
  - Commit: `feat(load): add the intent join for the lost update case`.
- **S3. DB reads and the schema guard.**
  - Files: `src/twenty/oracle-lost-update.ts` (NEW), `tests/unit/oracle-lost-update.test.ts` (NEW).
  - Expected: the test checks `finalsSql` text and the guard (`workspace_1wgvd1injqtife6y4rvfbu3h5` passes; `workspace_x;drop` throws `TEST BUG`).
  - Commit: `feat(load): add the read-only final-value oracle for the lost update case`.
- **S4. k6 case (no stack yet).**
  - Files: `k6/cases/tw-load-004.js` (NEW). Command: `npm run k6:inspect` (checks the k6 script parses). Expected: `k6:inspect` passes.
  - Commit: `feat(load): add the tw-load-004 k6 writer case`.
- **S5. Registration lines.**
  - Files: the case registry (one `LoadCase` entry in `CASES`, `src/load/cases.ts`, with `profiles: { pr, full }`). `src/load/reconcile/twenty.ts` is not edited. The `CASES` entry is the registration line (Task 3 §2.4).
  - Command: `node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile pr --dry-run` (if `--dry-run` is not in the Task 3 runner, record the gap and use `--list`).
  - Commit: `feat(load): register P6-TW-LOAD-004 in the twenty load runner`.
- **S6. Job and README.**
  - Files: `.github/workflows/twenty-load.yml` (one job under `# >>> task4 jobs`), `README.md` (the Task 4 sub-marker). Command: `npm run lint:actions`. Expected: actionlint passes.
  - Commit: `ci(load): add the task 4 lost update job`.
- **S7. Local run on the harness (only if the functional profile is available: Tasks 1 and 2 merged).**
  - Commands: `npm run up:twenty`, `npm run seed:twenty`, `node scripts/load/run-load.ts --case P6-TW-LOAD-004`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. Expected: `results/tw-load-004/verdict.json` exists, `valid: true`. If Tasks 1–2 are not merged, record "NOT RUN: functional profile not released" and go to S8.
  - Never print a token: the token scan runs on `results/`.
- **S8. Full check and push.** `npm run check` (format, actionlint, typecheck, k6 inspect, unit tests; the count printed). Then `git push -u origin <build branch>`.
- **S9. Merge (owner).** The owner merges with "Create a merge commit". Then **as soon as this task merges to main, dispatch 3 runs of the Twenty load workflow on main** (the GitHub web UI, Actions tab, the workflow, "Run workflow", branch `main`; or the REST dispatch endpoint `POST /repos/Jayami123/k6-load-concurrency-suite/actions/workflows/twenty-load.yml/dispatches` with `ref: main` and the workflow's case input set to `P6-TW-LOAD-004`; the input name is ASSUMED from Task 3). Record the 3 run URLs in the build PR description and in the Task 8 closeout input list. If the dispatch returns 403, write it as an owner step with the exact web UI clicks and carry on.

**Build-session parallelism note:** Tasks 4, 5 and 6 build in parallel. Each merges separately. The second and third PR run `git merge origin/main` and keep the other tasks' jobs under their markers.

## Extra risky cases

Each is labelled **EXTRA**, has no new P6 id, and enters the build only if the CI budget still fits (it adds at most one stage). None is in the roadmap case list (rule O6).

| case                                         | question                                                              | oracle                                                                                             | cost                     | status                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| EXTRA-T4-1 update vs delete race             | does an update that lands after a delete resurrect the record?        | after the run, a deleted record must have `deletedAt` set and no later `updatedAt` than the delete | 2 writers, 20 records    | NOT PROBED; build-time                                                                 |
| EXTRA-T4-2 stale read replayed after a delay | does a stale GET response overwrite a newer value in the client flow? | client-side: a replayed read must not change the stored value                                      | read-only                | NOT PROBED                                                                             |
| EXTRA-T4-3 cross-workspace record id         | is a record in another workspace refused (403 or 404)?                | expect 403 or 404 and record which                                                                 | needs a second workspace | NOT PROBED: `IS_MULTIWORKSPACE_ENABLED: "false"` gives one workspace; Open decision Q9 |
| EXTRA-T4-4 malformed or unknown-field patch  | is the error code stable and is there no partial write?               | a 4xx with a code, and the record unchanged                                                        | 4 requests               | NOT PROBED; build-time                                                                 |

## Risks, roadmap conflicts and open decisions

### Roadmap conflicts

| roadmap says                                                 | probe shows                                                                                                                         | decision or open question                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Task 4 "Files likely touched": `src/twenty/oracle.ts`        | the ownership table keeps Task 4 out of Task 3's and Task 5's files                                                                 | New file `src/twenty/oracle-lost-update.ts`; `oracle.ts` only if a new file is impossible (it is not). |
| Task 4 "Files likely touched": `perf.yml`                    | CI home is the new workflow `twenty-load.yml` (Q-PLACE default)                                                                     | Job goes under `# >>> task4 jobs` in `twenty-load.yml` (I6).                                           |
| Task 4 "CI change: nightly + dispatch, short on PRs"         | `perf.yml` already runs Twenty jobs on PR and on schedule; no Twenty LOAD job exists                                                | Nightly cron in `twenty-load.yml`; PR runs stage 1 only.                                               |
| variant B "conflict or silent overwrite" (roadmap line 378)  | 5/5 trials: both writes 200, one value survives (probe 7); no If-Match, no version check (probe 2)                                  | Silent overwrite is the expected result: recorded as `FINDING`, not `PASS`.                            |
| Task 4 probe item "PATCH writes only the sent fields"        | YES, 5/5 (probe 1)                                                                                                                  | Variant A design holds.                                                                                |
| Task 4 probe item "column and `updatedAt` resolution"        | DB µs (`datetime_precision 6`), REST body ms (probe 4)                                                                              | Order by DB µs; report ties.                                                                           |
| Task 4 probe item "writer and record counts keep runs VALID" | the production-like defaults allow about 100 per minute; the case needs about 1200 per minute (Design "Limiter fit")                | Functional profile required; the case cannot start before Tasks 1–3 merge.                             |
| roadmap Task 4 "Depends on Task 3"                           | Task 3 plan pushed (`d087986`); §2 interfaces are frozen and real; §6 (functional values) and the Q list are absent from the branch | ASSUMED interfaces; S1 re-check.                                                                       |
| Phase 5 D3 "functional profile"                              | harness `v0.2.15` has no H4 passthrough                                                                                             | Blocks the CI run only, not the unit build.                                                            |

### Open decisions

- **Q1. Variant B label.** Options: (a) label `FINDING (silent overwrite)` and keep `PRODUCT BUG` out until 3 VALID runs reproduce; (b) label `PRODUCT BUG` from the first run. **Recommendation: (a)**, because rule C13 says a product-bug label needs repeated full-count runs, and the roadmap calls it a finding (line 99–100).
- **Q2. Ordering evidence.** Options: (a) order by DB µs, print ties; (b) order by the REST body (ms). **Recommendation: (a)**: µs is the stored value; ms in the API body can hide order.
- **Q3. Functional limits.** The writer peak needs about 1200 per minute and 17 per second for the whole workspace (Limiter fit). Options: (a) Task 3 sets those values through H4; (b) lower the writer rate to 1 req/s per writer. **Recommendation: (a)**, because (b) gives no contention, and variant B needs contention.
- **Q4. Stage rates.** Options: keep 1, 2, 3 req/s per writer, or 1, 2 only. **Recommendation: keep three stages**, because the overwrite rate vs load (roadmap line 380–381) needs three points.
- **Q5. PR runs.** Options: stage 1 only on PR (recommended, roadmap line 392) or no Twenty LOAD on PR at all. **Recommendation: stage 1 only.**
- **Q10. Product-bug runs and the VALID count.** Task 3 §2.11 counts only `outcome: "PASS"` runs as VALID. A reproduced variant A loss gives outcome FAIL, so under §2.11 it is not a VALID run, yet the roadmap wants PRODUCT BUG evidence from repeated runs (line 393–394 and rule C13). Options: (a) keep §2.11 and count FAIL runs separately as product-bug evidence in the closeout; (b) change §2.11 to count any run with `validity.verdict: "VALID"` (the owner decides, since it is Task 3's rule). **Recommendation: (a)**, because it leaves Task 3's rule as frozen and still gives the closeout the repeated evidence it needs.
- **Q9. Cross-workspace probe.** Options: skip (EXTRA-T4-3 stays NOT PROBED), or ask the harness owner for a second-workspace option. **Recommendation: skip for P6; record as Later with the evidence (single workspace in the harness).** This needs no owner action.

### Risks

- The functional profile is not released (Task 1 and Task 2). Build the unit tests first (S2, S3, S4); the CI run waits.
- Timestamp resolution hides order (roadmap line 395): handled by Q2 and the ties count.
- Limiter interference: handled by the Limiter fit rule and the VALID rule (zero 429).
- An intent with a timeout (status 0) might have applied: it is `ambiguous` and never counted as acked.

## Done when

Roadmap "Done when" (line 393–394), adjusted only by the agreed decisions:

- ≥ 3 VALID nightly runs (dispatch or schedule on `main`): variant A with zero lost fields (or a recorded PRODUCT BUG SUSPECTED with the intent ids), variant B with its overwritten and conflict counts and the overwrite rate vs load per stage (labelled FINDING).
- `npm run check` green on the build PR.
- The 3 run URLs are recorded for Task 8 (last build step, S9).

### Rule self-check (section 0 of the planning prompt)

- N1–N5: met (the planning session ran every step; the log is outside the repo).
- R1–R8: met (GitHub MCP tools; plain git; explicit paths; no force push; no merge; no PR comments; no GitHub CLI mention in owner steps).
- O1–O8: met for this plan file (only this file is added; no code, no workflow change; private findings are named by ID only).
- P1–P5: met (probes before design; products started only through `npm run up:twenty` and stopped with `npm run down:twenty`; no process killed; timings not published).
- C1–C5: met (no timeout raised; every step capped; margin 10; down step with `if: always()`).
- E1: met ("No environment change" with the reason).
- H1–H8: no hard stop hit at planning time.
