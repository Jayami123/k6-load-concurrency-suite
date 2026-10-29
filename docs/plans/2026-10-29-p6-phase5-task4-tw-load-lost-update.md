# P6 Phase 5 Task 4: lost update under sustained edits (P6-TW-LOAD-004)

## Header

- **Title:** Task 4, lost update under sustained edits (`P6-TW-LOAD-004`, P0).
- **Date:** 2026-10-29 (Asia/Colombo, UTC+05:30). Plan written at 11:48 Asia/Colombo; review fixes applied in round 2 (same day).
- **Plan branch:** `plan/2026-10-29-p6-phase5-tasks4-6` (planning only; plan branches never get a PR and never merge, `docs/agent-rules.md` A.6 and B.10).
- **Build branch:** `feat/<YYYY-MM-DD>-p6-tw-load-lost-update`, with `<YYYY-MM-DD>` the build start date.
- **Mapped case:** `P6-TW-LOAD-004` (P0, in scope). Variant A = different fields of one record. Variant B = same field, read-modify-write.
- **Roadmap section:** `docs/plans/2026-10-22-p6-phase5-roadmap.md`, "Task 4" lines 367–396.
- **Base SHA of main at planning:** `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29 09:18 Asia/Colombo).
- **Task 3 plan planned against:** `7f9d7f3` on `plan/2026-10-29-p6-phase5-task3` (head after its review fixes; the fix commit `1a72aff` values are the same). Its §2 (interfaces, including §2.12 auth per case and §2.13 seeded API keys) and §6.3 (functional values) are used here.
- **Harness pin needed:** `qa-portfolio-harness` `v0.2.16` (H4) or later. The pin on main is `v0.2.15` and has no `API_RATE_LIMITING_*` passthrough.

## Review round 2: what changed

1. Auth switched from the user token to a seeded API key (Task 3 §2.12, §2.13). `Limiter fit`, the zero-429 VALID gate and probe row 8 now describe the API key, where the LONG window binds.
2. Variant B oracle replaced. A sequential last-write-wins write no longer counts as an overwrite. Variant B is now a read-modify-write increment: each attempt reads, increments and writes. The loss is the deficit between the acknowledged increments and the observed final value. The overwrite variant is dropped.
3. Variant A writers are serialized (`maxVUs: 1` per writer). A final value equal to a later ambiguous intent is ambiguous, never lost.
4. Load numbers recomputed. The background runs at its `pr` rate (1 iteration/s × 4 requests = 4 rps) during this case, and writer rates are lowered. Peak is 13 rps, below Task 3's 20 rps ceiling.
5. Dependency is now "Task 2 pin at `>= v0.2.16` (H4) plus Task 3b merged". The stale `results/tw-load-004/` path is replaced by `results/load/P6-TW-LOAD-004/<runId>/`.
6. Cross-plan: Task 3 head §2.11 (VALID means outcome PASS) and the owner's decision on VALID differ; see Decided answers and the Task 3 contradictions.

## What it proves

Two writers, or two clerks, editing one record must both keep their change or see a visible conflict. This case measures that under sustained load on the Twenty REST API, through an API key (Task 3 §2.12).

- **Variant A (different fields of one record):** writer A1 sets `employees`, writer A2 sets `name` on the same record, each writer serialized (one request in flight). **Oracle:** the final value of each field equals the value of the last acknowledged write to that field; a final value equal to a later ambiguous write is ambiguous, not lost. **PASS:** zero lost fields. **PRODUCT_BUG_SUSPECTED:** any lost field, with the intent ids and the DB row as evidence.
- **Variant B (same field, read-modify-write):** on each stage's two hot records, writers B1 and B2 each attempt: GET the record (value `v`), PATCH `employees = v + 1`. **Oracle:** for each record, `observed = final − initial` (initial is 0, set in setup). With `acked` the number of acknowledged increments and `amb` the number of ambiguous attempts, the lost-update lower bound is `lostLower = max(0, acked − observed)` and the upper bound is `lostUpper = max(0, acked + amb − observed)`. **Verdict words:**
  - `FINDING` (labelled "silent lost update", never "pass") when `lostLower > 0` at any stage. Roadmap "Rules that hold" calls a recorded silent overwrite a finding (lines 99–100).
  - `PASS` when `lostLower = 0` and `acked > 0`. The contention flag (`overlapWindows > 0`) is reported beside the verdict; a PASS without contention is labelled "no contention reached".
  - `INCONCLUSIVE` when `acked = 0` for the stage.
  - "The final value is one of the writes" is **not** a pass.
- **Verdict words for the whole case:** `PASS`, `FAIL` (TEST BUG or setup error), `INCONCLUSIVE`, `NOT RUN` (gate or job skipped). A run's VALID status is set by its validity, not by its verdict (Decided answers).

Transfer: two clinicians editing one patient record, or two clerks editing one account, must both keep their changes or see a conflict, never silently lose one (roadmap lines 371–372).

## Live probe evidence

Probe date and clock: 2026-10-29, Asia/Colombo. Stack: `npm run up:twenty` through the harness (image `twentycrm/twenty:v2.44.0`, harness `v0.2.15`), seeded with `npm run seed:twenty` (`twenty seed: created=true users=4`). Probe scripts ran from the session scratchpad (not committed). Each probe record had the run prefix `p6-qa-20261029T061257Z-…`. About 35 PATCH requests in total. Stack stopped with `npm run down:twenty`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`; containers and volumes 0.

| #   | fact                                                        | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | what it changes in the design                                                                                                                                 |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PATCH writes only the sent fields (variant A depends on it) | `probe-t4.ts`: create 201; 5 trials of `PATCH {employees}` then `PATCH {name}`, all 200; GET after the name write kept `employees` (100 to 104). **PROBED: YES.**                                                                                                                                                                                                                                                                                                                                                                                                  | Variant A can assert both fields survive.                                                                                                                     |
| 2   | No conflict status and no version check                     | `probe-t4.ts`: `PATCH` with `updatedAt: "2000-01-01…"` in the body → 200; `PATCH` with header `If-Match: "0"` → 200 (stale value accepted). Source: `common-update-one-query-runner.service.ts` (115 lines) delegates to update-many with `filter: {id}`; `grep If-Match or ifMatch` under `engine/api` finds nothing (fork `7cbdfec6`).                                                                                                                                                                                                                           | Variant B cannot rely on a 4xx conflict. Lost updates show up as a deficit in the final value.                                                                |
| 3   | ETag header on PATCH                                        | `probe-t4.ts`: the PATCH response to an `If-Match` request has an `etag` header (`ifMatchResponseHasEtag: true`); the stale `If-Match` is ignored.                                                                                                                                                                                                                                                                                                                                                                                                                 | No ETag-based conflict detection. Recorded as a README fact only.                                                                                             |
| 4   | Table, column and `updatedAt` resolution                    | `probe-t4.ts` read-only `information_schema`: `workspace_1wgvd1injqtife6y4rvfbu3h5.company."updatedAt"` is `timestamp with time zone`, `datetime_precision = 6`. The REST body has millisecond precision (`…06:12:58.564Z`) while the DB holds `06:12:58.631073`.                                                                                                                                                                                                                                                                                                  | Timestamps are not used to order the join (variant A uses the last acknowledged write per field; variant B uses values). Windows use k6 clock ms.             |
| 5   | Response keys carrying writer attribution                   | `probe-t4.ts` record keys: `createdAt, updatedAt, deletedAt, createdBy, updatedBy`. The shape of `updatedBy` values is NOT PROBED (not printed).                                                                                                                                                                                                                                                                                                                                                                                                                   | Attribution uses the value we write, not `updatedBy` (build-time re-check B3).                                                                                |
| 6   | Variant A concurrency                                       | `probe-t4b.ts`: 5 trials, 2 concurrent PATCHes on different fields: 10 of 10 statuses 200; both fields kept in 5 of 5 trials.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Variant A holds under two concurrent writers. The case still serializes each writer.                                                                          |
| 7   | Variant B concurrency under last-write-wins                 | `probe-t4b.ts`: 5 trials, 2 concurrent PATCHes on `employees` with different values: 10 of 10 statuses 200; exactly one value survived in 5 of 5 trials.                                                                                                                                                                                                                                                                                                                                                                                                           | The probe used overwrite writes and was not a lost-update test. It is why variant B moved to read-modify-write (review fix 2).                                |
| 8   | Limiter at image defaults, API key                          | Source (verified in round 2): `config-variables.ts:1713/1722` (SHORT 1000 ms / 100), `:1730/1739` (LONG 60000 ms / 100), `:1748/1757` (APPLICATION 60000 ms / 500). `build-default-speed-bucket.util.ts:37–41` sets `spenderId = null` unless the spender is an application with crossWorkspace scope, so every default apiKey bucket is `{workspaceId}:speed:API:API_REQUEST:apiKey:-:<windowSeconds>`: **one bucket per window shared by all API keys in a workspace.** Probe (Task 6, `probe-t6.ts`): 120 parallel requests with one key → 100 × 200, 20 × 429. | The LONG window binds: 100 per minute at image defaults. The case cannot run on defaults. Under the functional profile LONG is 3600 per minute (Task 3 §6.3). |
| 9   | Harness server and worker env                               | `docker inspect` env **names** only: no `API_RATE_LIMITING_*`, no `NODE_OPTIONS` (server 25 names, worker 24 names).                                                                                                                                                                                                                                                                                                                                                                                                                                               | Confirms the image defaults are in effect now.                                                                                                                |
| 10  | Peak request rate of this design                            | Derived (Design "Load shape"): 13 rps peak (writers 9 rps + background 4 rps).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Fits Task 3's 20 rps ceiling and the functional LONG window (60 per second).                                                                                  |

### Probe items the roadmap lists that stay open

- `updatedBy` value shape: NOT PROBED. Build-time re-check B3.
- Cross-workspace record id (EXTRA): NOT PROBED. The harness sets `IS_MULTIWORKSPACE_ENABLED: "false"`, so one workspace exists (Open decision Q9).
- Update vs delete race, stale read replay, malformed or unknown-field patch (EXTRA): NOT PROBED. Each has a build-time step.

## Depends on

| Dependency                                                                                                                                                                                                       | Status at planning                                                                                                                     | Blocks                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Task 3 (foundation and functional profile): `k6/lib/twenty-auth.js`, `k6/journeys/tw-background.js`, `src/load/reconcile/twenty.ts`, `src/twenty/limiter-profile.ts`, `src/twenty/api-key.ts`, `twenty-load.yml` | Pushed (`7f9d7f3`). §2 interfaces, §2.12 auth and §2.13 API-key helper are used. §6.3 functional values are on the branch (LONG 3600). | **Build start** for S2 onward (unit tests of the pure join need nothing from Task 3). |
| Task 2 (pin bump to the H4 tag)                                                                                                                                                                                  | Not merged. The pin must be at `>= v0.2.16` (H4), and Task 3b (the verified functional profile) must be merged.                        | **CI run** (functional profile). Unit tests do not need it.                           |
| Phase 2 Task 7 (`P6-TW-RACE-001`, `P6-TW-RACE-005`)                                                                                                                                                              | Merged on main (`docs/plans/2026-10-23-p6-phase2-task7-twenty-races.md`). Reused helpers only.                                         | None.                                                                                 |
| Owner action                                                                                                                                                                                                     | None for this task.                                                                                                                    | —                                                                                     |

### Interfaces from Task 3 (real names, §2 of `7f9d7f3`)

- **I1 (§2.1)** `k6/lib/twenty-auth.js`: `authorizationHeader()` returns `"Bearer <key>"` from `__ENV.TWENTY_API_KEY` when set (API-key cases), else `TWENTY_TOKEN`. This case always uses the API key (§2.12). The runner passes the key through `secretEnv` as `TWENTY_API_KEY`.
- **I1b (§2.13)** `src/twenty/api-key.ts`: `createRunApiKey({ baseUrl, authorizationHeader, name, expiresAt })` in setup (the user token from `signInWorkspace` is used only to create the key) and `revokeRunApiKey({ baseUrl, authorizationHeader, id })` in cleanup, before the leak check. The key is named with the run prefix.
- **I2 (§2.2)** `k6/journeys/tw-background.js`: `runTwBackground(cfg, opts)`, `cfg = { baseUrl, prefix }`. It returns `{ created, patched, serverErrors }` and feeds `p6_tw_created`, `p6_tw_updated`, `p6_tw_5xx`. This case calls it from `journey()` with its own rate (see Load shape).
- **I3 (§2.5)** `src/load/reconcile/twenty.ts`: `reconcileTwenty(pool, cfg, clientCount, counts?)`. This plan does not edit that file; its extra checks are composed in the case: `composeStages([reconcileStage, lostUpdateStage])`.
- **I4 (§2.6, §6.3)** `src/twenty/limiter-profile.ts`: `limiterProfileEnv("functional")` returns the six names with the §6.3 values (SHORT 1000 ms / 100, LONG 60000 ms / 3600, APPLICATION 60000 ms / 500). `limiterProfileEnv("productionLike")` returns `{}`.
- **I5 (§2.4)** `src/load/cases.ts`: a `LoadCase` entry in `CASES` with `profiles: { pr, full }`, `runs()` (`script`, `env`, `secretEnv`) and `stages`. Run command (§2.8 step 11): `node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile <pr|full>`.
- **I6 (§2.7, §2.8)** `.github/workflows/twenty-load.yml` with markers `# >>> task4 jobs`, `# >>> task5 jobs`, `# >>> task6 jobs`. The job copies the 15-step template (§2.8).
- **Stage hooks (§2.10)** `twentySetup` and `twentyCleanup` in `src/load/products/twenty.ts`. `twentyCleanup` sweeps companies by run prefix (live and soft-deleted) and revokes run keys before the leak check.
- **Results (§2.9)** `results/load/P6-TW-LOAD-004/<runId>/`.
- **VALID rule (§2.11)** currently reads "outcome PASS". The owner's decided rule is different (see Decided answers). This is a contradiction with Task 3 head; see Cross-plan contradictions.

### Cross-plan contradictions with Task 3 head `7f9d7f3` (Task 3 must change; not decided here)

1. **VALID rule (§2.11).** Head says VALID needs `outcome: "PASS"`. The owner's decided rule is validity-based. Task 3 must change §2.11.
2. **Dispatch input (§6.8).** Head has one `workflow_dispatch` input, `profile` (`full` or `pr`). It has no `case` input. Fix 16 of the review assumes a `case` input "being added there". This plan uses `profile`: a dispatch runs every Twenty load job of the workflow, and each job's `if:` guard decides whether it starts. A per-case input is requested from Task 3.
3. **Concurrency group (§6.8).** Head's group maps every `schedule` run to the key `nightly` with `cancel-in-progress: true`. A Saturday schedule (`23 3 * * 6`, Task 6) would cancel the nightly, and the reverse. Task 3 must key the schedule branch on `github.event.schedule`.

## Build-time re-check table

The build session runs every row first (step S1).

| fact                                      | how to re-check at build start                                                                                                                                                                                                      | if it changed                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| B1. Task 3 interfaces I1–I6, §2.12, §2.13 | Read the Task 3 plan and its code on main (`k6/lib/twenty-auth.js`, `k6/journeys/tw-background.js`, `src/load/reconcile/twenty.ts`, `src/twenty/limiter-profile.ts`, `src/twenty/api-key.ts`, `.github/workflows/twenty-load.yml`). | Use the real names. Record each difference below. If a difference changes an oracle or a threshold, stop and report it (H6).            |
| B2. Functional values                     | `limiterProfileEnv("functional")` on main equals §6.3.                                                                                                                                                                              | If LONG is below 3600 or the window values moved, recompute the Limiter fit below. If the peak no longer fits, stop.                    |
| B3. `updatedBy` value shape               | One read of `GET /rest/companies/<id>` on a fresh stack; print key names and value types only.                                                                                                                                      | If `updatedBy` is a stable member id, use it as a second attribution key; otherwise keep value-encoded attribution.                     |
| B4. Shared bucket across keys             | Verified in source (probe row 8). The build re-runs the API-key burst with two keys once, with its own budget of at most 150 requests.                                                                                              | Expected: shared. If the second key passes during the first key's flood, record it; the Limiter fit still holds (it is workspace-wide). |
| B5. Redis state between runs              | `docker exec <redis> redis-cli DBSIZE` after `npm run up:twenty` on a fresh stack. Redis has no volume.                                                                                                                             | If it carries keys across a `down`/`up`, add a Redis-empty check (key names only). Never write to Redis.                                |
| B6. Schema name                           | `resolveWorkspaceSchema` in `src/twenty/oracle.ts`.                                                                                                                                                                                 | Use the value it returns.                                                                                                               |
| B7. Helpers                               | `grep -n "export" src/twenty/api.ts src/twenty/oracle.ts src/twenty/invariants.ts src/twenty/run-case.ts src/races/prefix.ts src/twenty/api-key.ts`.                                                                                | Use the new names; a missing helper is a stop.                                                                                          |

### Re-check table (filled at S1, one row per difference)

| #   | difference found at S1                                                                       | change to this plan                                                                   | oracle or threshold changed? |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | Auth: the draft used the user token (I1). Task 3 §2.12 freezes API key for `P6-TW-LOAD-004`. | k6 uses `TWENTY_API_KEY` (I1). Setup creates the key (I1b) and cleanup revokes it.    | no                           |
| 2   | Task 3 §6.3 is on the branch (the draft said it was absent).                                 | Limiter fit uses LONG 3600 per minute (I4).                                           | no                           |
| 3   | Task 3 dispatch input is `profile` only; no `case` input (cross-plan contradiction 2).       | Dispatch runs the workflow's Twenty jobs; `profile` selects pr or full.               | no                           |
| 4   | Task 3 concurrency group has no schedule-aware key (cross-plan contradiction 3).             | Job guards use `github.event.schedule`; the concurrency fix is requested from Task 3. | no                           |
| 5   | Task 3 §2.11 VALID rule (cross-plan contradiction 1).                                        | The plan uses the owner's decided rule; Task 3 must match.                            | no (counting rule only)      |
| 6   | Task 3 cron is `43 3 * * *` (the draft had `41 3 * * *`).                                    | Nightly cron is `43 3 * * *`.                                                         | no                           |

## Design

### Build-time file ownership (copied verbatim)

The same table is in all four Phase 5 planning prompts. Planning sessions only add their own plan files, so the four plan PRs never conflict. This table is for the BUILD sessions. This task keeps to its own row (Lane B, Task 4).

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/\*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                        |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml; tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/\*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step; README "How to read the chart" and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/\*, src/dashboard/\*, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                          | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                         |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                        | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                          |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                            | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                          |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                          |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                 | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-\* releases; contents: read stays)                                                                                                                                                                     | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                                 |

"Registration line" means a one-line or one-entry edit in a shared file. The PR that merges second runs `git merge origin/main` and keeps both entries (a merge commit, never a rebase).

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (if the Task 3 plan splits it, 3a foundation may merge before Task 2 and 3b, the verified functional profile, after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 needs Task 2 and 3b for its CI; 5 needs Task 3a only; 6 needs Task 3a only); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

### Modules and data flow

```
.github/workflows/twenty-load.yml  job task4-lost-update (guarded, §CI)
  └─ run-load.ts --case P6-TW-LOAD-004 --profile $P6_PROFILE
       ├─ setup:   createRunApiKey (I1b), create 5 A records and 6 B records (initial employees 0 on B)
       ├─ k6 run k6/cases/tw-load-004.js  (TWENTY_API_KEY via secretEnv)
       │     ├─ writers A1, A2 (variant A), B1, B2 (variant B, read-modify-write)
       │     ├─ background: runTwBackground at the pr rate (I2)
       │     └─ console.log("TW004 " + intent json) → k6-main.log
       ├─ oracle:  src/twenty/oracle-lost-update.ts (read-only finals) + src/load/lost-update.ts (pure join)
       ├─ reconcile: composeStages([reconcileStage (I3, clientCount = p6_tw_created + 11), lostUpdateStage])
       └─ cleanup: twentyCleanup (I1b revoke, companies, leak check)
```

### Exact file list

| status                                                  | path                                    | purpose                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NEW                                                     | `k6/cases/tw-load-004.js`               | k6 case: variant A writers (serialized), variant B read-modify-write writers, background at the pr rate; writes one `TW004` line per intent to stdout. |
| NEW                                                     | `src/load/lost-update.ts`               | Pure functions: dedupe, variant A join, variant B lower and upper bounds, verdicts. No I/O.                                                            |
| NEW                                                     | `tests/unit/lost-update.test.ts`        | Unit tests for the join (fixtures under "Oracles").                                                                                                    |
| NEW                                                     | `src/twenty/oracle-lost-update.ts`      | Read-only final values (µs) and the stage that writes `stages.lostUpdate` into `verdict.json`.                                                         |
| NEW                                                     | `tests/unit/oracle-lost-update.test.ts` | Unit tests for the SQL text and the schema-name guard (no DB).                                                                                         |
| CHANGED (registration line)                             | the case registry (`src/load/cases.ts`) | one `LoadCase` entry for `P6-TW-LOAD-004`.                                                                                                             |
| NOT EDITED                                              | `src/load/reconcile/twenty.ts`          | The Task 4 stage is composed in the case (I3).                                                                                                         |
| CHANGED (append only, only if a new file is impossible) | `src/twenty/oracle.ts`                  | not expected.                                                                                                                                          |
| CHANGED (job and README)                                | `.github/workflows/twenty-load.yml`     | one job under `# >>> task4 jobs`.                                                                                                                      |
| CHANGED (README sub-marker)                             | `README.md`                             | text under the Task 4 sub-marker of the "Twenty load" section.                                                                                         |

### Load shape (writers, records, rates)

- **Records (11 per run, all prefixed `prefix-t4-…`).**
  - Variant A: 5 records `prefix-t4-a-<n>` (n = 0 to 4). Writer A1 owns `employees`, writer A2 owns `name`.
  - Variant B: 6 hot records, 2 per stage: `prefix-t4-b-s<stage>-<n>` (stage 1, 2, 3; n = 0, 1). Initial `employees` = 0, set in setup by a write that is not an intent. Writers B1 and B2 both hit both records of their stage.
- **Writers (4).** A1, A2 (variant A, one request per attempt). B1, B2 (variant B, two requests per attempt: GET then PATCH). Each writer is one k6 scenario with `constant-arrival-rate` and `preAllocatedVUs: 1, maxVUs: 1`, so a writer never has two requests in flight (review fix 3). Dropped iterations count against the validity rule.
- **Stages (120 s each, 20 s ramp).** Attempt rate per writer: stage 1 = 0.5/s, stage 2 = 1/s, stage 3 = 1.5/s. Total attempts: 4 writers × 120 s × (0.5 + 1 + 1.5) ≈ 960 attempts across the run.
- **Background (I2, `runTwBackground`).** Runs at the Task 3 `pr` rate, 1 iteration/s × 4 requests = 4 rps, for the whole case (both profiles). The case builds its own open-model scenario with rate 1 (Task 3 §2.3) so the background does not add to the writers' peak.
- **Peak request rate.** Writers: A = 2 × 1.5 = 3 rps; B = 2 × 1.5 × 2 = 6 rps; background 4 rps. **Total 13 rps**, below Task 3's 20 rps design ceiling (§6.3).
- **Limiter fit (API key, workspace-wide bucket).** The LONG window binds. Required at peak: 13 rps × 60 = 780 per minute. Functional LONG = 3600 per minute (Task 3 §6.3): headroom 4.6×. SHORT = 100 per second against 13 rps: headroom 7.7×. At image defaults LONG = 100 per minute, which the peak exceeds 7.8×, so the case cannot run on the `productionLike` profile.
- **Profiles.** `--profile pr` runs stage 1 only (the PR shape, roadmap line 392); `--profile full` runs stages 1 to 3 (push to main, nightly, dispatch).
- **VALID rule for this case (in addition to Task 3's validity):** zero 429 and zero 5xx on any request of the API key; achieved attempt rate within 10% of plan per writer per stage; no dropped iterations on variant A writers. A run that breaks a rule is `INVALID` (validity, not a verdict).

### Intent record (one per attempt)

```ts
// k6/cases/tw-load-004.js (inside each writer's iteration)
// variant A: one PATCH.  variant B: GET (read), then PATCH (write value = read + 1).
// intentId = `${writer}-${stage}-${seq}`; sentMs/ackMs = k6 clock ms; status 0 = timed out.
// ambiguous = status 0 or 5xx (the write may or may not have applied).
console.log(
  "TW004 " +
    JSON.stringify({
      intentId,
      variant, // "A" | "B"
      recordId,
      field, // "employees" | "name"
      writer, // "A1" | "A2" | "B1" | "B2"
      stage, // 1 | 2 | 3
      readValue, // variant B only: the value read before the increment, else null
      value, // what the PATCH wrote (B: readValue + 1; A: the field value)
      readMs, // variant B only: when the GET was sent, else null
      sentMs, // PATCH sent
      ackMs, // response received (or the timeout)
      status,
      ambiguous,
    }),
);
```

- Variant A values: `employees` = `writerCode * 1_000_000 + seq` (writerCode A1 = 1); `name` = `${prefix}-a2-${seq}`.
- A timed-out or 5xx write is recorded once with `ambiguous: true`. The VU does not retry a write. A retry, if ever added, reuses `intentId` and is deduplicated.

### Module skeletons

```ts
// src/load/lost-update.ts (NEW, pure)
export type Variant = "A" | "B";

export interface WriteIntent {
  intentId: string;
  variant: Variant;
  recordId: string;
  field: "employees" | "name";
  writer: string;
  stage: number;
  readValue: string | null; // variant B only
  value: string;
  readMs: number | null; // variant B only
  sentMs: number;
  ackMs: number;
  status: number; // 0 = timed out
  ambiguous: boolean;
}

export interface FinalRow {
  recordId: string;
  employees: string | null;
  name: string | null;
  initialEmployees: string | null; // from setup (variant B initial is 0)
}

export interface RecordLoss {
  recordId: string;
  stage: number;
  acked: number; // acknowledged increments on this record
  ambiguous: number; // timed-out or 5xx attempts
  observed: number; // final − initial
  lostLower: number; // max(0, acked − observed)
  lostUpper: number; // max(0, acked + ambiguous − observed)
}

export interface JoinResult {
  variant: Variant;
  duplicates: number; // intents with an intentId already seen
  lostA: number; // variant A: fields with a lost write (final ≠ last acked, not ambiguous)
  ambiguousA: number; // variant A: finals that equal a later ambiguous write
  records: RecordLoss[]; // variant B
  stageLoss: Array<{ stage: number; acked: number; lostLower: number; lossRate: number }>;
  overlapWindows: number; // variant B: pairs of attempts whose [readMs, ackMs] windows overlap (contention reached)
  verdict: "PASS" | "FINDING" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";
  verdictReason: string;
}

/** Keep the first copy of each intentId. Pure. */
export function dedupeIntents(intents: WriteIntent[]): { kept: WriteIntent[]; duplicates: number };

/** Variant A. Serialized writers: last acked per (record, field) by sentMs. A final equal to a later ambiguous write is ambiguous, not lost. Pure. */
export function joinVariantA(intents: WriteIntent[], finals: FinalRow[]): JoinResult;

/** Variant B. Per record: acked, ambiguous, observed = final − initial; lostLower and lostUpper. Throws TEST BUG when observed > acked + ambiguous or observed < 0. Pure. */
export function joinVariantB(intents: WriteIntent[], finals: FinalRow[]): JoinResult;

/** Pairs of variant B attempts on one record from different writers whose [readMs, ackMs] windows overlap. Pure. */
export function countOverlapWindows(intents: WriteIntent[]): number;

/** lossRate = lostLower / acked, 0 when acked is 0. Pure. */
export function lossRate(lostLower: number, acked: number): number;
```

```ts
// src/twenty/oracle-lost-update.ts (NEW, read-only)
export async function readFinals(
  pool: pg.Pool,
  schema: string,
  recordIds: string[],
): Promise<FinalRow[]>;
export function finalsSql(schema: string): string; // SQL text only, for the unit test
export async function runOracle(opts: {
  runDir: string;
  schema: string;
  pool: pg.Pool;
}): Promise<void>;
// Stage: reads the TW004 lines from results/load/P6-TW-LOAD-004/<runId>/k6-main.log, writes intents.jsonl and finals.json (case extras) and stages.lostUpdate in verdict.json. Throws only on TEST BUG.
```

- `finalsSql(schema)`: `SELECT id AS "recordId", employees::text AS employees, name FROM ${schema}.company WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL`. The initial values come from the setup stage (not the DB).
- The schema is interpolated only after `/^workspace_[a-z0-9]+$/` passes; otherwise throw `TEST BUG: schema name not valid`.

### Oracles and verdict rules

- **Variant A.** `lostA = count of (record, field) where the final ≠ the value of the last acked write to that field (by sentMs) AND no later ambiguous write has that value`. A final equal to a later ambiguous write counts in `ambiguousA`, not `lostA`. Verdict: `lostA = 0` → `PASS`; `lostA > 0` → `PRODUCT_BUG_SUSPECTED` (evidence: intent ids, DB value).
- **Variant B.** Per record: `observed = final − initial`; `lostLower = max(0, acked − observed)`; `lostUpper = max(0, acked + amb − observed)`. Per stage: `lossRate = Σ lostLower / Σ acked`. Verdict over the run: any `lostLower > 0` → `FINDING` ("silent lost update, read-modify-write"); else `acked > 0` → `PASS` (with `overlapWindows` reported: 0 means "no contention reached", stated beside the verdict); else `INCONCLUSIVE`.
- **Infeasible values.** `observed > acked + amb` or `observed < 0` is impossible under the model → `TEST BUG` (the write path or the oracle is wrong). No verdict is recorded.
- **Thresholds.** The only thresholds are the VALID rules above (zero 429 and 5xx, rate within 10%, no dropped iterations on variant A). They live in `k6/thresholds/` as the existing files do. Nothing is loosened.

Fixtures for `tests/unit/lost-update.test.ts` (each one `it(...)`):

1. **no loss (variant A):** two fields, finals equal the last acked values → `lostA 0`, `PASS`.
2. **one loss (variant A):** the final `name` is the first acked value, not the last → `lostA 1`, `PRODUCT_BUG_SUSPECTED`, the reason names the record and the intent ids.
3. **variant A, ambiguous later write:** the final equals a later ambiguous write → `lostA 0`, `ambiguousA 1`, `PASS`.
4. **two sequential increments (variant B):** `read 0, write 1`, then `read 1, write 2` with non-overlapping windows, final 2 → `lostLower 0`, `overlapWindows 0`, `PASS` (no loss; no contention reached). This replaces the old last-write-wins fixture.
5. **an interleaved loss (variant B):** two writers both read 5 and both write 6, their windows overlap, both acked, final 6 → `acked 2`, `observed 1`, `lostLower 1`, `overlapWindows 1`, `FINDING`.
6. **an ambiguous applied write (variant B):** one acked increment, one timed-out attempt that applied (final 2 from initial 0): `lostLower 0`, `lostUpper 0`, `PASS`.
7. **a timed-out attempt that did not apply (variant B):** one acked increment, one timed-out attempt not applied (final 1): `lostLower 0`, `lostUpper 1`, `PASS`.
8. **a duplicate intent:** the same `intentId` twice → `duplicates 1`, the first copy is used.
9. **equal timestamps:** two acked attempts with the same `ackMs` (µs-equal) → verdict unchanged; reported only.
10. **infeasible value:** `observed 4` with `acked 2` and `ambiguous 0` → throws `TEST BUG`.
11. **zero acked in a stage:** `INCONCLUSIVE` for that stage; `lossRate` = `0` (never a division by zero).
12. **lossRate edge:** `lostLower 1, acked 4` → `0.25`.

## Data isolation, cleanup and leak check

- Every record name and intent carries the run prefix `p6RunPrefix()` (`src/races/prefix.ts`).
- The job runs on a fresh stack: `TWENTY_DOWN_VOLUMES: "1"` in the job env (as `perf.yml` does at lines 1792, 1986 and 2166).
- **Setup records:** 11 records (5 variant A, 6 variant B) created with `createCompany` (`src/twenty/api.ts`), named `prefix-t4-…`. Setup writes the variant B initial values with `patchCompany` (not intents).
- **Key:** one run API key from `createRunApiKey` (I1b). It is revoked in `twentyCleanup` before the leak check.
- **Cleanup** (Task 3 §2.10, `twentyCleanup`): sweeps the companies with the run prefix (live and soft-deleted) and revokes the run key. This plan adds no per-record sweep.
- **Leak check** (fails the job): `reconcileTwenty(pool, cfg, clientCount)` (I3) with `clientCount = p6_tw_created + 11` (the 11 setup records are not counted by the background counter). Also `SELECT count(*) FROM core."apiKey" WHERE name LIKE '<prefix>%' AND "revokedAt" IS NULL` must be 0 (Task 3 §2.13).
- The writers never create records outside the run prefix.

## CI budget

The job lives in `.github/workflows/twenty-load.yml` under `# >>> task4 jobs` (I6).

- **Triggers and guard.** The workflow triggers are Task 3's (`pull_request` with paths, `push` to main, `schedule` `43 3 * * *`, `workflow_dispatch` with the `profile` input). The job guard is: `if: ${{ github.event_name != 'schedule' || github.event.schedule == '43 3 * * *' }}`. So PR, push and dispatch run it, and the nightly cron runs it, but the Saturday cron (Task 6) does not. The profile is `P6_PROFILE` from Task 3 (`pr` on PR, `full` otherwise).
- **Concurrency.** The job inherits Task 3's concurrency group. The schedule-aware key that keeps Saturday and nightly runs apart is a required change in Task 3 (cross-plan contradiction 3); this plan does not set its own group.

Job: `task4-lost-update`, `runs-on: ubuntu-24.04`, `timeout-minutes: 85` (caps sum 75 plus the 10-minute margin). It copies the Task 3 template (§2.8).

| job               | job timeout | each step and its cap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | sum of step caps | worst case                                                                                                                    | margin (>= 10 min) |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| task4-lost-update | 85          | Task 3 §2.8 template: checkout 3; setup-node 3; `npm ci` 5; k6 setup 3; `bootstrap.sh twenty` with `BOOTSTRAP_SKIP_INSTALL=1` 3; verify `TWENTY_REF` 1; `scripts/ci/compose-pull.sh` 6; `npm run up:twenty` with `limiterProfileEnv("functional")` as `env:` 12; `npm run seed:twenty` 10; `npm run smoke:twenty` 2; `node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile $P6_PROFILE` (setup, k6 writers and background, the lost-update oracle, `reconcileTwenty` leak check, `twentyCleanup`) 15; token scan of `results/` 2; upload `results/load/` 3; container logs 2; `npm run down:twenty` with `TWENTY_DOWN_VOLUMES=1` 5 (`if: always()`) | 75               | 75 (the pull retries are inside their 6-minute cap; the run step is 15: full = 7 min of k6 time plus setup, oracle and audit) | 75                 | **10** |

- No existing timeout changes (C1). Every step has `timeout-minutes` (C2). The down step has `if: ${{ always() }}` (C5).

## Expected output

Under `results/load/P6-TW-LOAD-004/<runId>/` (Task 3 §2.9; the runner creates it):

- `run-meta.json`: `{ "case": "P6-TW-LOAD-004", "profile": "full", "limiterProfile": "functional", "limiterValues": { "API_RATE_LIMITING_SHORT_TTL_IN_MS": 1000, "API_RATE_LIMITING_SHORT_LIMIT": 100, "API_RATE_LIMITING_LONG_TTL_IN_MS": 60000, "API_RATE_LIMITING_LONG_LIMIT": 3600, "APPLICATION_API_RATE_LIMITING_TTL_IN_MS": 60000, "APPLICATION_API_RATE_LIMITING_LIMIT": 500 }, "authMode": "apiKey", "backgroundRatePerSec": 1, "stageAttemptRates": [0.5, 1, 1.5], "twentyRef": "7cbdfec6f346b43715bc2056932f4fad5886f733", "harnessTag": "v0.2.16" }`. The field names follow Task 3 §2.9 (`limiterProfile`). No key value appears.
- `intents.jsonl`: one object per intent (the `TW004` lines without the tag). Case-specific extra, declared so the token scan covers it.
- `finals.json`: `[{ "recordId": "…", "employees": "…", "name": "…", "initialEmployees": "…" }]`. Case-specific extra.
- `verdict.json`: the runner's fields (`caseId`, `runId`, `profile`, `label`, `outcome`, `reasons[]`, `invalid[]`, `validity`, `k6[]`, `runMeta`, `stages`). This case's results go under `stages.lostUpdate`: `{ "variantA": JoinResult, "variantB": JoinResult, "verdict": "PASS" | "FINDING" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE" }`. Example variant B fragment: `{ "stageLoss": [{ "stage": 1, "acked": 240, "lostLower": 0, "lossRate": 0 }, …], "overlapWindows": 37, "verdict": "FINDING" }`.
- Job summary lines (`$GITHUB_STEP_SUMMARY`): `TW-LOAD-004 A: lostA=<n> ambiguousA=<n> verdict=<v>`; `TW-LOAD-004 B: stage <s> acked=<n> lostLower=<n> lossRate=<r>`; `TW-LOAD-004 B verdict=<v> contention=<yes|no> (a FINDING is a silent lost update, not a pass)`; `duplicates=<n> leak=<n>`.
- Artefact: the `results/load/` folder (Task 3 step 13, 14-day retention). The token scan (step 12) runs before the upload and fails the job on a token value.

**Outcome and validity (decided, Decided answers).** `validity.verdict` (VALID or INVALID, from the validity rules) decides whether a run is VALID. A VALID run on github-actions counts toward the 3 closeout medians whatever its outcome. The verdict (`PASS`, `FINDING`, `PRODUCT_BUG_SUSPECTED`) is reported separately in `stages.lostUpdate.verdict` and in the summary. `FAIL` (TEST BUG) makes the run not VALID.

## Environment changes

No environment change. The Twenty stack, k6, the harness and the seeded-key helper come from the existing setup (`npm ci`, `scripts/bootstrap.sh twenty`, `scripts/install-k6.sh`, Docker). The pin bump to the H4 tag (`>= v0.2.16`) is Task 2's change in `package.json` and is picked up by `npm ci`. Nothing in `.cursor/` or `.claude/hooks/` changes.

## Build order

Each step runs `npm run check` before every push and prints the unit count. The count grows by the number of new `it(...)` blocks.

- **S1. Re-check against the merged Task 3 (its plan and its code on main) and adjust this plan before coding. List every difference and the change it causes in the plan's re-check table. If a difference changes an oracle or a threshold, stop and report it.**
  - Files: this plan only. Commands: `git fetch origin main`, `git show origin/main:docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md`, `grep -n "export" k6/lib/twenty-auth.js k6/journeys/tw-background.js src/load/reconcile/twenty.ts src/twenty/api-key.ts src/twenty/limiter-profile.ts`, `cat .github/workflows/twenty-load.yml`, and rows B1–B7.
  - Expected: the re-check table lists each interface with its real name and the three cross-plan contradictions resolved or still open.
- **S2. Pure join (no I/O).** Files: `src/load/lost-update.ts` (NEW), `tests/unit/lost-update.test.ts` (NEW). Command: `node --test tests/unit/lost-update.test.ts`. Expected: 12 tests pass. Commit: `feat(load): add the lost update join for variants A and B`.
- **S3. Read-only finals and the schema guard.** Files: `src/twenty/oracle-lost-update.ts` (NEW), `tests/unit/oracle-lost-update.test.ts` (NEW). Expected: the test checks `finalsSql` and the guard (`workspace_1wgvd1injqtife6y4rvfbu3h5` passes; `workspace_x;drop` throws `TEST BUG`). Commit: `feat(load): add the read-only final-value oracle for the lost update case`.
- **S4. k6 case.** Files: `k6/cases/tw-load-004.js` (NEW). Command: `npm run k6:inspect`. Commit: `feat(load): add the tw-load-004 k6 writer case`.
- **S5. Registration line.** Files: the case registry (one `LoadCase` entry in `CASES`, `src/load/cases.ts`, `profiles: { pr, full }`). Command: `node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile pr --dry-run` (if the Task 3 runner has no `--dry-run`, record the gap and use `--list`). Commit: `feat(load): register P6-TW-LOAD-004 in the twenty load runner`.
- **S6. Job and README.** Files: `.github/workflows/twenty-load.yml` (one job under `# >>> task4 jobs`, with the guard above), `README.md` (the Task 4 sub-marker). Command: `npm run lint:actions`. Commit: `ci(load): add the task 4 lost update job`.
- **S7. Local run (only with Task 2 at `>= v0.2.16` and Task 3b merged).** Commands: `npm run up:twenty`, `npm run seed:twenty`, `node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile pr`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. Expected: `results/load/P6-TW-LOAD-004/<runId>/verdict.json` exists with `validity.verdict` set. If the pin or 3b is missing, record "NOT RUN: functional profile not released" and go to S8. Never print a key: the token scan runs on `results/`.
- **S8. Full check and push.** `npm run check` (format, actionlint, typecheck, k6 inspect, unit tests; the count printed). Then `git push -u origin <build branch>`.
- **S9. Merge (owner).** The owner merges with "Create a merge commit". Then **as soon as this task merges to main, dispatch 3 runs of the Twenty load workflow on main** (the GitHub web UI, Actions tab, the workflow, "Run workflow", branch `main`, input `profile` = `full`; or the REST dispatch endpoint `POST /repos/<owner>/<repo>/actions/workflows/twenty-load.yml/dispatches` with `ref: main` and `inputs.profile` = `full`). Each dispatch runs every Twenty load job of the workflow (no per-case input exists on Task 3 head; cross-plan contradiction 2). Record the run URLs for the Task 8 closeout. If the dispatch returns 403, write it as an owner step with the exact web UI clicks and carry on.

**Build-session parallelism note:** Tasks 4, 5 and 6 build in parallel. Each merges separately. The second and third PR run `git merge origin/main` and keep the other tasks' jobs under their markers.

## Extra risky cases

Each is labelled **EXTRA**, has no new P6 id, and enters the build only if the CI budget still fits. None is in the roadmap case list (rule O6).

| case                                         | question                                                              | oracle                                                                     | cost                     | status                                                     |
| -------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| EXTRA-T4-1 update vs delete race             | does an update that lands after a delete resurrect the record?        | after the run, a deleted record keeps `deletedAt` and no later `updatedAt` | 2 writers, 2 records     | NOT PROBED; build-time                                     |
| EXTRA-T4-2 stale read replayed after a delay | does a stale GET response overwrite a newer value in the client flow? | a replayed read must not change the stored value                           | read-only                | NOT PROBED                                                 |
| EXTRA-T4-3 cross-workspace record id         | is a record in another workspace refused (403 or 404)?                | expect 403 or 404 and record which                                         | needs a second workspace | NOT PROBED: one workspace in the harness; Open decision Q9 |
| EXTRA-T4-4 malformed or unknown-field patch  | is the error code stable and is there no partial write?               | a 4xx with a code, and the record unchanged                                | 4 requests               | NOT PROBED; build-time                                     |

## Risks, roadmap conflicts and open decisions

### Roadmap conflicts

| roadmap says                                                 | probe shows                                                                          | decision or open question                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Task 4 "Files likely touched": `src/twenty/oracle.ts`        | the ownership table keeps Task 4 out of Task 3's and Task 5's files                  | New file `src/twenty/oracle-lost-update.ts`.                                        |
| Task 4 "Files likely touched": `perf.yml`                    | CI home is the new workflow `twenty-load.yml`                                        | Job under `# >>> task4 jobs`.                                                       |
| Task 4 "CI change: nightly + dispatch, short on PRs"         | Task 3 head triggers include PR (paths), push, nightly `43 3 * * *`, dispatch        | This job runs on PR (stage 1 via `pr`), push, nightly and dispatch.                 |
| variant B "conflict or silent overwrite" (roadmap line 378)  | no version check (probe 2); last-write-wins writes both return 200 (probe 7)         | Variant B is read-modify-write, so the loss is a deficit; a deficit is a `FINDING`. |
| Task 4 probe item "PATCH writes only the sent fields"        | YES, 5 of 5 (probe 1)                                                                | Variant A design holds.                                                             |
| Task 4 probe item "column and `updatedAt` resolution"        | DB µs, REST body ms (probe 4)                                                        | Timestamps do not order the join; windows use k6 clock ms.                          |
| Task 4 probe item "writer and record counts keep runs VALID" | the image defaults allow 100 per minute at LONG; this design peaks at 780 per minute | Functional profile required (LONG 3600); not runnable at defaults.                  |
| roadmap Task 4 "Depends on Task 3"                           | Task 3 head `7f9d7f3` has the frozen §2 interfaces, §2.12, §2.13, §6.3               | Real names used; cross-plan contradictions 1 to 3 remain for Task 3.                |
| Phase 5 D3 "functional profile"                              | harness `v0.2.15` has no H4                                                          | Blocks the CI run only, not the unit build.                                         |

### Decided answers (owner, 2026-10-29)

- **Q-DISCLOSE (Task 5 only):** see the Task 5 plan.
- **VALID (Task 4 Q10, Task 5 Q7, Task 6 Q7): option (b).** A run is VALID when its validity is VALID on github-actions, whatever the outcome. Closeout medians come from at least 3 VALID runs per case. The outcome (`PASS`, `FINDING`, `PRODUCT_BUG_SUSPECTED`) is reported separately. A reproducing bug therefore still yields VALID runs. **This contradicts Task 3 head §2.11 (contradiction 1).**
- **Auth (frozen in Task 3):** 004 uses a seeded API key; this plan follows that.

### Open decisions (not yet decided)

- **Q1. Variant B label.** Options: (a) label `FINDING (silent lost update)` and keep `PRODUCT_BUG_SUSPECTED` until repeated VALID runs reproduce; (b) label `PRODUCT_BUG_SUSPECTED` from the first run. **Recommendation: (a)**, because rule C13 asks for repeated full-count runs, and the roadmap calls the variant B result a finding (lines 99–100).
- **Q2. Ordering evidence.** Superseded: variant B no longer orders by time (it uses values and the read-modify-write chain), and variant A uses sentMs per writer. The µs column is still read for the stage report.
- **Q3. Functional limits.** Decided by Task 3 §6.3 (LONG 3600). This plan's peak (13 rps) fits.
- **Q4. Stage rates.** Options: keep three stages (0.5, 1, 1.5 attempts/s per writer) or two. **Recommendation: keep three**, because the loss rate versus load needs three points.
- **Q5. PR runs.** Stage 1 only on PR (roadmap line 392, `--profile pr`). Decided by this plan; the owner may override.
- **Q9. Cross-workspace probe.** Skip for P6 (EXTRA-T4-3 stays NOT PROBED); record as Later with the single-workspace evidence.

### Cross-plan contradictions (Task 3 must change; this plan cannot decide them)

1. Task 3 §2.11: change VALID to validity-based (owner decided option b).
2. Task 3 §6.8: add a per-case `case` dispatch input, or accept that dispatch runs every job of the workflow.
3. Task 3 §6.8: the concurrency group must key the schedule branch on `github.event.schedule` so the nightly and the Saturday run do not cancel each other.

4. Task 3 §2.13: `createRunApiKey` has no `roleId`, but the mutation requires one (probe of 2026-10-29: `Field "roleId" of required type "UUID!" was not provided.`). Task 3 must add the role lookup or a `roleId` input before this case can create its key.

### Risks

- The functional profile is not released (Task 2 `>= v0.2.16` and Task 3b). Build the pure join and the SQL guard first; the CI run waits.
- A run's LONG window at defaults is 100 per minute: the case must never start on `productionLike`. The job's profile is `P6_PROFILE` from Task 3, with the functional values on the up step.
- An attempt with a timeout may have applied: it is `ambiguous` and bounds the loss (`lostLower` and `lostUpper`), never adds to the loss.

## Done when

Roadmap "Done when" (lines 393–394), adjusted only by the decided answers:

- ≥ 3 VALID runs (validity VALID on github-actions, any outcome) on `main`: variant A with its lost count (zero, or a PRODUCT_BUG_SUSPECTED with the intent ids), variant B with its lost lower and upper bounds and the loss rate vs load per stage, labelled FINDING when `lostLower > 0`.
- `npm run check` green on the build PR.
- The 3 run URLs are recorded for Task 8 (S9).

### Rule self-check (section 0 of the planning prompt; rule F.20)

- N1–N5: met (every step ran without a pause; the progress log is outside the repo).
- R1–R8: met (GitHub MCP tools; plain git; explicit paths; no force push; no merge; owner steps use web UI wording only). Owner names are not written in repo text: the S9 endpoint uses `<owner>/<repo>`.
- O1–O8: met for this plan file (only this file changes; private findings are named by ID only; no mechanism written).
- P1–P5: met (probes before design; products started and stopped through `npm run up:twenty` and `npm run down:twenty`; no process killed; timings not published).
- C1–C5: met (no timeout raised; every step capped; margin 10; down step with `if: always()`).
- E1: met ("No environment change" with the reason).
- H1–H8: no hard stop hit by this plan. The cross-plan contradictions are reported, not decided here.
