# P6 Phase 5 Task 6: rate-limit contract on the production-like profile (P6-TW-LOAD-006, gated -009)

## Header

- **Title:** Task 6, rate-limit contract (`P6-TW-LOAD-006`, P1) and its gated extra `P6-TW-LOAD-009` (limiter fairness).
- **Date:** 2026-10-29 (Asia/Colombo, UTC+05:30). Plan written at 11:48 Asia/Colombo.
- **Plan branch:** `plan/2026-10-29-p6-phase5-tasks4-6` (planning only, no PR of its own).
- **Build branch:** `feat/<YYYY-MM-DD>-p6-tw-load-rate-limit`. `<YYYY-MM-DD>` is the build start date.
- **Mapped cases:** `P6-TW-LOAD-006` (P1, in scope); `P6-TW-LOAD-009` (accepted extra, gated; gate status in this plan).
- **Roadmap section:** `docs/plans/2026-10-22-p6-phase5-roadmap.md`, "Task 6" lines 432–464. Related: Cases table lines 136 and 138, task table line 158, D3 lines 547–551, Phase 4 D12 (the production-like profile pattern) at `docs/plans/2026-10-22-p6-phase4-roadmap.md` lines 271–275, Phase 4 D16 (weekly Saturday pattern) at lines 357 and 386.
- **Base SHA of main at planning:** `5215127a038dbec6b6aef431cf20dcab08e41e11`.
- **Task 3 plan SHA planned against:** `d0879863b5d511786f0c0f3aa61674cf8ce71aa3` (short `d087986`, pushed 2026-10-29 06:21:50 UTC). Its §2 is frozen and is the interface source used here. Its §6 (functional values) and its Q list are not on the branch.
- **Harness pin at planning:** `qa-portfolio-harness` `v0.2.15`.
- **Private findings:** none touched by this task. No `P6-TW-RACE-004` or `OBS-TW-001` detail appears here.

## What it proves

Twenty refuses overload with a clear 429 (never 500), refuses nothing below the limit, and serves again after the bucket refills. The case runs on the **production-like profile**: image defaults, nothing set, no H4 (roadmap line 439).

### `P6-TW-LOAD-006`

- **Arrival phases** (one API key, `GET /rest/companies?limit=1`, the same request each time):
  - **below:** 1 request per second for 120 s (60 per minute, under the 100 per minute sustained limit).
  - **at:** 100 per minute (about 1.67 per second) for 120 s. The sustained limit itself.
  - **above:** 200 per minute (about 3.33 per second) for 120 s.
  - **idle:** 60 s with no requests between the phases, so the long bucket refills to full before the next phase.
  - **recovery probe:** after the above phase stops, one request per second until the first 200. The time from the stop to that first 200 is the **recovery time**.
- **Oracle (per phase, computed in `src/twenty/rate-limit-oracle.ts`):** counts of 200, 429 and 5xx responses, and the contract check for each 429.
- **Verdict rules:**
  - **below:** `429 count = 0`. Any 429 in `below` → PRODUCT BUG (SUSPECTED): the limiter refused under its limit.
  - **at:** the 429 count is reported and does not decide the verdict. `5xx = 0` is required.
  - **above:** `429 count ≥ 1` (the limiter must refuse above its limit) **and** every 429 satisfies the contract: `Retry-After` present, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` present, body `error == "RATE_LIMITED"`.
  - **everywhere:** `5xx = 0`. Any 5xx → PRODUCT BUG (SUSPECTED) ("never 500" in the roadmap, line 442).
  - **recovery:** the first 200 arrives within 60 s of the stop. The recovery time is recorded (no threshold in the roadmap; the 60 s bound only ends the probe).
  - **case verdict:** `PASS` when every rule above holds; `PRODUCT BUG (SUSPECTED)` when a rule is broken (after 3 VALID runs repeat it, rule C13); `INCONCLUSIVE` when the run is not VALID; `FAIL` for a setup error (TEST BUG); `NOT RUN` when skipped.
- **Short vs long window** (roadmap line 454–455, both windows at the fork pin): the short bucket is 100 per 1 s (`config-variables.ts:1713/1722`), the long bucket is 100 per 60 s (`:1730/1739`). The `above` phase is the test of the long bucket (sustained), and the first burst of the probe is the test of the short bucket. Both are recorded by `limitKind`/`exhaustedKind` in the 429 body (see the probe table, row 4).

### `P6-TW-LOAD-009` (gated extra)

- One client (F, the flood) sends above the limit (the `above` rate, 120 s). A second client (L) sends a low rate (12 per minute, one every 5 s) for the same 120 s, with its own API key.
- **Verdict:** `PASS` when L gets zero 429 while F is refused (fair). `FINDING` ("starvation: L was refused while F was refused") when L gets a 429 during F's refusals: the keying is per workspace, so the README records it as a finding (roadmap line 448). `INCONCLUSIVE` when F never gets a 429 (no contention).
- The `FINDING` label is the expected result **if** the probe's single observation (below) is confirmed.

Transfer: a banking or patient-record API client must get a clear 429 above the limit, none below it, and service back after the window (roadmap line 436–437).

## Live probe evidence

Probe date: 2026-10-29, Asia/Colombo. Stack: `npm run up:twenty` (image `twentycrm/twenty:v2.44.0`, nothing `API_RATE_LIMITING_*`, production-like), `npm run seed:twenty`. Probe scripts were run from the session scratchpad (not committed). Total requests across the probes: about 250 (budget 300 for the burst probes). Stack stopped with `npm run down:twenty`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`; containers 0, volumes 0.

| #   | fact                                                       | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | what it changes in the design                                                                                                                                                                                           |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Image defaults in effect                                   | Source: `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts`: `API_RATE_LIMITING_SHORT_TTL_IN_MS = 1000` (1713), `API_RATE_LIMITING_SHORT_LIMIT = 100` (1722), `API_RATE_LIMITING_LONG_TTL_IN_MS = 60_000` (1730), `API_RATE_LIMITING_LONG_LIMIT = 100` (1739), `APPLICATION_API_RATE_LIMITING_TTL_IN_MS = 60_000` (1748), `APPLICATION_API_RATE_LIMITING_LIMIT = 500` (1757). Probe: `docker inspect` env **names** on server (25 names) and worker (24 names): no `API_RATE_LIMITING_*`, no `NODE_OPTIONS`.                                                                           | The job proves the same in its own log by names only (step 4).                                                                                                                                                          |
| 2   | Which bucket is limited and how it is keyed                | `engine/core-modules/usage-limit/constants/usage-limit-definitions.constant.ts:6–50`: API speed defaults for `apiKey` (SHORT 1 s and LONG 60 s, `counterScope: 'perWorkspace'`) and `application` (`crossWorkspace`); `allowedSpenderTypes: ['apiKey', 'application']` (lines 8–9). Key format: `engine/core-modules/usage-limit/utils/build-speed-bucket-key.util.ts` (29 lines, whole file): `{<workspaceId or server>}:speed:<resource>:<operation>:<spenderType>:<spenderId>:<windowSeconds>`.                                                                                                                    | The API key is the rate-limited credential. Session tokens have no default speed bucket (from source; not probed). The short and long windows are different keys (windowSeconds 1 and 60).                              |
| 3   | Token bucket in Redis                                      | `engine/core-modules/usage-limit/constants/try-consume-token-buckets-script.constant.ts`: a Lua script with `redis.call('TIME')`; refill `elapsed × refill / windowMs`, capped at `burst`. Bucket state lives in cache storage (Redis). Redis container: `docker inspect qa-harness-twenty-redis-1 -f '{{range .Mounts}}…'` printed **no mounts**. `docker exec … redis-cli DBSIZE` after seed: `507`.                                                                                                                                                                                                                | The limiter is continuous, not a fixed window. "Window reset" means refill. Redis has no volume: `compose down` removes the container and its state.                                                                    |
| 4   | 429 response shape                                         | Probe (`probe-t6.ts`, 120 parallel requests with one API key): status histogram `200: 100, 429: 20`, `5xx: 0`. 429 headers: `retry-after: 1`, `x-ratelimit-limit: 100`, `x-ratelimit-remaining: 0`, `x-ratelimit-reset: <epoch s>`. Body keys: `statusCode, error, messages, limitKind, exhaustedKind, scope, limit, remaining, periodCount, periodUnit, retryAfterSeconds`; `error: "RATE_LIMITED"`; `scope` keys: `spenderType, spenderId, operationType`. Source: `engine/core-modules/usage-limit/utils/build-rate-limit-response-headers.util.ts` and `usage-limit-to-rest-api-exception-handler.util.ts:28–60`. | The oracle checks these names, never values except the code. `scope.spenderId` is an internal id: Open decision Q4.                                                                                                     |
| 5   | Recovery after a burst                                     | Probe: first 200 after the 429s at `2017 ms` (one 2 s poll; `recovery.polls: 0`, `lastStatusWas429: false`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Recovery is fast because the long bucket refills one token every 600 ms (100 per 60 s) and the short bucket refills in 10 ms. The probe records it per run.                                                             |
| 6   | Which window binds                                         | Probe row 4: 100 accepted out of 120 in one parallel burst, so the short bucket's burst of 100 is the first limit reached. Source (row 2): the long bucket refills at 100 per minute, so **sustained** traffic above about 1.67 per second is refused by the long window.                                                                                                                                                                                                                                                                                                                                             | The `above` phase tests the long window. The `429` body's `periodUnit` ("second" or "minute") tells which window refused; the phases record it.                                                                         |
| 7   | API key creation (needed to reach the limiter)             | `engine/core-modules/api-key/api-key.resolver.ts:79–93` (`createApiKey`). Probe: `createApiKey(input: {name, expiresAt})` → `Field "roleId" of required type "UUID!" was not provided.` Then with `roleId` from `getRoles` (`engine/metadata-modules/role/role.resolver.ts:99`; labels `Admin`, `Guest`, `Object-restricted`, `Impersonate-only`, `Member`): `createApiKey` → 200, `generateApiKeyToken(apiKeyId, expiresAt)` (`engine/core-modules/auth/auth.resolver.ts:1089–1097`) → 200, token length 444 (length only; never printed).                                                                           | The job creates its keys through these two mutations, with the `Admin` role id. The token stays in env only.                                                                                                            |
| 8   | Per-credential keying (gate for `-009`) — **INCONCLUSIVE** | `probe-t6b.ts`: flood on key A (110 parallel) → `200: 100, 429: 10`; then 3 sequential requests with a **new** key B → `429: 3`. A later fresh key C (`probe-t6c.ts`) → `200`. The refusal did not reproduce on demand; the probe budget (300) was reached, so it was not repeated. Source (row 2) keys the bucket by the API key id, which predicts per-key fairness.                                                                                                                                                                                                                                                | The gate (keying per token or workspace) is met by the source. The runtime result is one observation that suggests a bucket shared across keys (per workspace). Build-time re-check B4 decides it, with its own budget. |
| 9   | Second credential                                          | Probe row 7 creates key B and key C without error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `-009` uses two API keys, each with its own `apiKeyId`.                                                                                                                                                                 |
| 10  | Limiter state across runs                                  | Redis: no volume (row 3). `scripts/harness.mjs` down path: `TWENTY_DOWN_VOLUMES=1` removes the Postgres and server volumes; Redis is removed by `compose down` (its container has no volume). After this probe's down, `docker volume ls` for the project: 0 volumes.                                                                                                                                                                                                                                                                                                                                                 | No Redis write is needed. A fresh start is a fresh Redis (to be re-checked: B5).                                                                                                                                        |
| 11  | Auth-mutation limiter (not this case)                      | `auth.resolver.ts:126–127`: 3 password-reset requests per 15 min per email. Probe: 4th request refused (`BAD_USER_INPUT`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Not the API limiter. Recorded for Task 5.                                                                                                                                                                               |
| 12  | Phase 4 D16 (weekly Saturday)                              | `.github/workflows/knee.yml`: no `schedule:` key. `perf.yml:16` `17 2 * * *`; `soak.yml:19–20` `11 21 * * 1-6` and `29 19 * * 0`. No Saturday-only cron on `main`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | D16 is not implemented in `knee.yml` (a roadmap conflict). This task adds a weekly Saturday cron in `twenty-load.yml`.                                                                                                  |
| 13  | Harness pin has no H4                                      | `node_modules/qa-portfolio-harness` `v0.2.15`: no `API_RATE_LIMITING_*` passthrough (`grep` of `src`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The production-like profile is the only profile possible today; it is what this task needs.                                                                                                                             |

### Gate for P6-TW-LOAD-009 (roadmap line 448: keys per token or workspace; per IP or global → Later)

- Source (row 2): the bucket key includes the spender id (the API key id), so keying is **per API key within a workspace**. This is "per token" (the gate's word), so the gate is **met** on the source.
- Runtime (row 8): **INCONCLUSIVE**. One observation of a refused second key after a flood on the first.
- **Gate status: OPEN, decided at build time (B4).** Two outcomes:
  - the re-check shows the second key passes during the flood → keying per key → `-009` runs and is expected to PASS;
  - the re-check shows the second key is refused during the flood → keying per workspace (or shared) → `-009` still runs, and its verdict is `FINDING` (starvation), recorded in the README. It is not "Later": the gate asks for per token or workspace, and both satisfy it.
- Per IP or global keying would move `-009` to "Later". Nothing in the source or the probe shows that.

## Depends on

| Dependency                                                                                                                                                         | Status at planning                                                                                                                                         | Blocks                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Task 3 (I1–I6: `twenty-auth.js`, the background journey I2 (not used by this case), the reconcile hook I3, the workflow `twenty-load.yml` with `# >>> task6 jobs`) | Pushed on `plan/2026-10-29-p6-phase5-task3` (`d087986`). §2 interfaces used (real names below).                                                            | **Build start** for S3 onward. |
| Phase 4 Task 6 (production-like profile pattern, Phase 4 D12)                                                                                                      | Phase 4 D12 is the pattern (roadmap lines 271–275); `src/load/recovery.ts` exists on main (`WINDOW_SEC`, `windowsFromBins`, `recoverySeconds`, `isStorm`). | None.                          |
| Task 1 (H4) and Task 2 (pin bump)                                                                                                                                  | **Not needed** (roadmap line 439: "No H4: the production-like profile sets nothing").                                                                      | Nothing.                       |
| Owner action                                                                                                                                                       | None.                                                                                                                                                      | —                              |

### Interfaces from Task 3 (real names from its frozen §2)

- **I1 (real, §2.1)** `k6/lib/twenty-auth.js`: `authorizationHeader()` reads `__ENV.TWENTY_TOKEN` and returns `"Bearer <token>"`; `restHeaders(authorization)`. This task sets the raw API-key token in `TWENTY_TOKEN` (key A) and `TWENTY_TOKEN_B` (key B, `-009` only). `-009` reads `__ENV.TWENTY_TOKEN_B` itself and builds its header with `restHeaders()`. `twenty-auth.js` is not edited.
- **I3 (real, §2.5)** `src/load/reconcile/twenty.ts`: `reconcileTwenty(pool, cfg, clientCount)`. This task creates no companies, so `clientCount = 0` (no background run).
- **I4 (real, §2.6)** `src/twenty/limiter-profile.ts`: `limiterProfileEnv("productionLike")` returns `{}` (nothing set). The job's proof of the profile uses this map.
- **I5 (real, §2.4)** `src/load/cases.ts`: `LoadCase` entries for `P6-TW-LOAD-006` and `-009` (`gated: true`). Run command (§2.8 step 11): `node scripts/load/run-load.ts --case P6-TW-LOAD-006 --profile full`.
- **I6 (real, §2.7–§2.8)** `.github/workflows/twenty-load.yml` with `# >>> task6 jobs`. The job copies the 15-step template of §2.8, with the extra steps listed in the CI budget.
- **Results (real, §2.9)** `results/load/P6-TW-LOAD-006/<runId>/`. The case's verdicts go under `stages.rateLimit` of `verdict.json`.
- **VALID rule (real, §2.11)** VALID needs `outcome: "PASS"`. See Open decision Q7.
- The case runner's `workflow_dispatch` input name is ASSUMED from Task 3 until its workflow is on main.

## Build-time re-check table

| fact                             | how to re-check at build start                                                                                                                                                                    | if it changed                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1. Task 3 interfaces I3, I5, I6 | Read the Task 3 plan and its code on main.                                                                                                                                                        | Use the real names. Record each difference in the re-check table. An oracle or threshold change stops the build (H6).                                                |
| B2. Production-like profile      | `docker inspect` env **names** on the job's stack: no `API_RATE_LIMITING_*`, no `NODE_OPTIONS`. Read the 429 body once.                                                                           | If a limiter variable is set in the image or the pin, the production-like profile is not valid: stop (H6).                                                           |
| B3. Limiter constants            | `config-variables.ts:1713–1757` on the pin (fork `7cbdfec6`).                                                                                                                                     | Use the new values in `run-meta.json` and recompute the phase rates (rates are 0.6×, 1.0× and 2.0× of the sustained limit, derived from the constants).              |
| B4. Keying for `-009`            | A standalone gate probe with its own budget (at most 150 requests): flood key A with 110 parallel requests, then send 3 requests with key B at once and 1 s later; repeat once after a 60 s idle. | Both pass → keying per key; `-009` expects PASS. A refusal of B → shared bucket; `-009` expects FINDING. Either way it runs. Record the result in the README.        |
| B5. Redis empty on a fresh start | After `npm run up:twenty` and before `npm run seed:twenty`: `docker exec <redis> redis-cli DBSIZE`. Record the number in `run-meta.json` as `redisDbsizeBeforeSeed`.                              | If it is not 0 on a fresh stack, the limiter state carries over: add `FLUSH` only if the harness offers it (P6 never writes to Redis); otherwise the run is INVALID. |
| B6. Admin role                   | `getRoles` returns a role labelled `Admin` (row 7).                                                                                                                                               | Pick the role by its id, not its label.                                                                                                                              |
| B7. Helpers                      | `grep -n "export" src/twenty/api.ts src/twenty/oracle.ts src/load/recovery.ts`.                                                                                                                   | Use the new names; a missing helper is a stop.                                                                                                                       |

### Re-check table (filled at S1, one row per difference)

| #   | difference found at S1                                                                                                                           | change to this plan                                                                                                      | oracle or threshold changed? |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 1   | I1 draft `twentyAuth(env)` → real `authorizationHeader()` plus raw tokens in `TWENTY_TOKEN` and `TWENTY_TOKEN_B` (§2.1)                          | `createLoadApiKey` returns the **raw** token (not `Bearer <token>`); `-009` reads `TWENTY_TOKEN_B` with `restHeaders()`. | no                           |
| 2   | I3 draft `reconcileTwenty(ctx, runPrefix)` → real `reconcileTwenty(pool, cfg, clientCount)` (§2.5)                                               | `clientCount = 0`; the case creates no companies.                                                                        | no                           |
| 3   | I4 draft `resolveTwentyLimiterProfile("production-like")` → real `limiterProfileEnv("productionLike")` in `src/twenty/limiter-profile.ts` (§2.6) | The profile proof uses the empty map plus the name check.                                                                | no                           |
| 4   | I5/I6 draft names → real `LoadCase` in `CASES`, `--profile full`, job template §2.8                                                              | CI budget rewritten to the template (17 steps, caps sum 81, job timeout 91).                                             | no                           |
| 5   | Task 3 §6.3 (functional values) and its Q list are absent from `d087986`                                                                         | Not needed by this profile.                                                                                              | no                           |
| 6   | Task 3 §2.11: VALID means `outcome: "PASS"`                                                                                                      | A PRODUCT BUG run is not VALID under §2.11. Open decision Q7.                                                            | no                           |
| 7   | Task 3 §2.9 result layout `results/load/<caseId>/<runId>/`                                                                                       | Paths move to `results/load/P6-TW-LOAD-006/<runId>/`.                                                                    | no                           |

## Design

### Build-time file ownership (copied verbatim)

This table is the same in all four Phase 5 planning prompts. Planning sessions only add their own plan files, so the four plan PRs never conflict. This table is for the BUILD sessions. This task keeps to its own row (Lane B, Task 6).

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
scripts/load/run-load.ts --case P6-TW-LOAD-006              (registration line)
  ├─ src/twenty/rate-limit-setup.ts   createLoadApiKey(ctx, roleId, name) → the raw token, kept in memory and passed to k6 as TWENTY_TOKEN (secretEnv)
  ├─ k6 run k6/cases/tw-load-006.js                          (phases below / at / above / recovery, one request per line)
  │     └─ console.log("TW006 " + json)  → k6 stdout captured by src/load/k6-process.ts
  ├─ src/twenty/rate-limit-oracle.ts                         (pure verdict + contract check; CLI reads the TW006 lines)
  ├─ src/load/recovery.ts  firstOkAfter(...)                 (APPENDED export: recovery time from the stop)
  └─ I3 reconcileTwenty (post-load audit)

scripts/load/run-load.ts --case P6-TW-LOAD-009   (gated; same stack, same profile)
  └─ k6 run k6/cases/tw-load-009.js   (flood key F at the above rate; low-rate key L at 12 per minute)
```

### Exact file list

| status                      | path                                             | purpose                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEW                         | `k6/cases/tw-load-006.js`                        | k6 case: the four phases as scenarios with `startTime` offsets; prints one `TW006` line per request (phase, time, status, retry-after, the rate-limit header presence, error code). |
| NEW                         | `k6/cases/tw-load-009.js`                        | k6 case (gated): flood client F and low-rate client L as two scenarios; prints `TW009` lines.                                                                                       |
| NEW                         | `src/twenty/rate-limit-setup.ts`                 | `pickAdminRoleId`, `createLoadApiKey` (createApiKey + generateApiKeyToken), `assertNoLimiterEnv` (names only).                                                                      |
| NEW                         | `src/twenty/rate-limit-oracle.ts`                | Pure: `contractOk`, `phaseCounts`, `verdictForRateLimit`, `fairnessVerdict`; CLI `runRateLimitOracle`.                                                                              |
| CHANGED (append only)       | `src/load/recovery.ts`                           | append `firstOkAfter(samples, stopMs)`. Existing exports unchanged.                                                                                                                 |
| NEW                         | `tests/unit/rate-limit-oracle.test.ts`           | fixtures for the verdict rules and the fairness verdict.                                                                                                                            |
| NEW                         | `tests/unit/rate-limit-setup.test.ts`            | `assertNoLimiterEnv` fixtures (names only).                                                                                                                                         |
| NEW                         | `tests/unit/recovery-first-ok.test.ts`           | `firstOkAfter` fixtures.                                                                                                                                                            |
| CHANGED (registration line) | `scripts/load/run-load.ts` and the case registry | two entries: `P6-TW-LOAD-006`, `P6-TW-LOAD-009`.                                                                                                                                    |
| CHANGED (job and README)    | `.github/workflows/twenty-load.yml`              | one job under `# >>> task6 jobs`; the weekly Saturday cron line in the `on:` block (registration line).                                                                             |
| CHANGED (README sub-marker) | `README.md`                                      | text under the Task 6 sub-marker of the "Twenty load" section.                                                                                                                      |

### Skeletons

```ts
// src/twenty/rate-limit-setup.ts (NEW)
/** Reads the role list and returns the id of the role labelled "Admin". Throws TEST BUG when none is found. */
export async function pickAdminRoleId(ctx: CaseContext): Promise<string>;

/** Creates an API key and returns the raw token (no "Bearer" prefix; `authorizationHeader()` adds it in k6). The token is returned to the caller only; never logged. Throws TEST BUG on a missing id or token. */
export async function createLoadApiKey(
  ctx: CaseContext,
  roleId: string,
  name: string,
): Promise<string>;

/** Throws TEST BUG if any env name starts with API_RATE_LIMITING_ or equals NODE_OPTIONS. Names only; never a value. */
export function assertNoLimiterEnv(envNames: string[]): void;
```

```ts
// src/load/recovery.ts (APPENDED export; the existing exports are unchanged)
export interface Sample {
  tMs: number;
  status: number;
}
/** Returns ms from stopMs to the first 200 at or after stopMs, or null when none. Pure. */
export function firstOkAfter(samples: Sample[], stopMs: number): number | null;
```

```ts
// src/twenty/rate-limit-oracle.ts (NEW)
export type Phase = "below" | "at" | "above" | "recovery";

export interface Sample {
  phase: Phase;
  tMs: number;
  status: number;
  retryAfter: string | null; // header value, numbers only
  hasRateHeaders: boolean; // X-RateLimit-Limit, -Remaining and -Reset all present
  errorCode: string | null; // body error, e.g. "RATE_LIMITED"; null for non-JSON
  periodUnit: string | null; // body periodUnit: "second" or "minute" (which window refused)
}

/** Pure. True when a 429 has Retry-After, the three rate headers and error RATE_LIMITED. A non-429 returns true. */
export function contractOk(s: Sample): boolean;

/** Pure. Counts per phase: { n, s200, s429, s5xx, other }. */
export function phaseCounts(
  samples: Sample[],
  phase: Phase,
): { n: number; s200: number; s429: number; s5xx: number; other: number };

/** Pure. Applies the roadmap rules: below 429 = 0; above 429 >= 1; every 429 has the contract; 5xx = 0 everywhere; recovery found. Throws TEST BUG when samples is empty. */
export function verdictForRateLimit(
  samples: Sample[],
  recoveryMs: number | null,
  plannedPerPhase: Record<Phase, number>,
): { verdict: "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE"; reasons: string[] };

/** Pure. Fairness for -009: flood and low-rate samples. */
export function fairnessVerdict(
  flood: Sample[],
  low: Sample[],
): { verdict: "PASS" | "FINDING" | "INCONCLUSIVE"; reason: string };
```

- `INCONCLUSIVE` in `verdictForRateLimit` when a phase has fewer than 90% of its planned requests (the VALID rule), or when `above` has no samples.

### Phase schedule and arrival rates

| phase    | start (s)                   | duration (s) | arrival rate                | planned requests | reason                                        |
| -------- | --------------------------- | ------------ | --------------------------- | ---------------- | --------------------------------------------- |
| below    | 0                           | 120          | 1 per s (60 per min)        | 120              | 0.6× the sustained limit (100 per min)        |
| idle     | 120                         | 60           | 0                           | 0                | the long bucket refills to full (100 in 60 s) |
| at       | 180                         | 120          | 100 per min (1.67 per s)    | 200              | 1.0× the sustained limit                      |
| idle     | 300                         | 60           | 0                           | 0                | refill                                        |
| above    | 360                         | 120          | 200 per min (3.33 per s)    | 400              | 2.0× the sustained limit                      |
| recovery | 480 (after the above stops) | up to 60     | 1 per s until the first 200 | ≤ 60             | recovery probe                                |

- Rates are derived from B3 (the constants). If B3 changes the limit, the rates change with it, and `run-meta.json` records both.
- Total planned requests ≈ 780. Each request is one line `TW006 {…}`.

### Oracles and verdict rules

- Stated in "What it proves". Recovery time = `firstOkAfter(recovery samples, stopMs)`, where `stopMs` is the time of the last above request. Recorded in `recovery.json`; the verdict only needs a non-null value.
- Thresholds: the VALID rules (90% of planned per phase; zero 5xx) and the verdict rules above. No threshold file is changed. The phase rates derive from the limit constants, never from a tuned number.
- **Fixtures** (`tests/unit/rate-limit-oracle.test.ts`):
  1. all phases as expected (below 0 × 429, above 150 × 429 with the contract, 0 × 5xx, recovery 600 ms) → `PASS`.
  2. one 429 in `below` → `PRODUCT_BUG_SUSPECTED`, reason names the phase.
  3. `above` with zero 429 → `PRODUCT_BUG_SUSPECTED`.
  4. a 429 without `Retry-After` → `PRODUCT_BUG_SUSPECTED`; `contractOk` is false.
  5. a 500 in `at` → `PRODUCT_BUG_SUSPECTED`.
  6. recovery `null` → `PRODUCT_BUG_SUSPECTED` ("no 200 within 60 s").
  7. `at` with 40 × 429 → still `PASS` (the at phase is informational).
  8. a phase with 80 of 120 planned requests → `INCONCLUSIVE`.
  9. empty samples → throws `TEST BUG`.
  10. `fairnessVerdict`: low with zero 429 while flood has 429s → `PASS`; low with a 429 while flood has 429s → `FINDING`; no flood 429 → `INCONCLUSIVE`.
- `tests/unit/recovery-first-ok.test.ts`: `firstOkAfter` returns the ms to the first 200 at or after `stopMs`; returns `null` when none; ignores 200s before `stopMs`.
- `tests/unit/rate-limit-setup.test.ts`: `assertNoLimiterEnv(["PATH", "API_RATE_LIMITING_SHORT_LIMIT"])` throws `TEST BUG`; `assertNoLimiterEnv(["PATH", "NODE_ENV"])` passes; the error text contains the name, never a value.

## Data isolation, cleanup and leak check

- The API keys are named with the run prefix (`${prefix}-t6-<A|L|F>`). The records read by `GET /rest/companies?limit=1` are not created by this task.
- The job's stack is fresh: `TWENTY_DOWN_VOLUMES: "1"` (as perf.yml does), and `down` removes the containers (Redis included). B5 checks the Redis count before the seed.
- **Cleanup sweep:** none for keys: the stack is removed at the end, so the keys go with it. The job does not delete API keys through a mutation (not probed).
- **Leak check** (fails the job): `reconcileTwenty` (I3) finds no prefixed record created by this run (this task creates none), and the API-key count with the run prefix equals the number of keys the job created (2 for `-006`, 4 with `-009`).

## CI budget

Job: `task6-rate-limit` in `.github/workflows/twenty-load.yml` under `# >>> task6 jobs` (I6). Triggers: `workflow_dispatch` and a weekly Saturday schedule `23 3 * * 6` (UTC; **= Saturday 08:53 Asia/Colombo**). The cron is a registration line in the `on:` block. **No PR run** (roadmap line 459). Runner: `ubuntu-24.04`. Production-like profile: this job starts its own Twenty and downs it itself (C5), and shares nothing with the Task 4 and Task 5 jobs.

Job timeout: **91 minutes** (sum of step caps 81 + 10-minute margin). The job uses the Task 3 §2.8 template with four extra steps: the production-like names check, the Redis count before the seed, the `-006` run and the gated `-009` run.

| job              | job timeout | each step and its cap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | sum of step caps | worst case                                           | margin (>= 10 min) |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------- | ------------------ |
| task6-rate-limit | 91          | Task 3 §2.8 template: checkout 3; setup-node 3; `npm ci` 5; k6 setup 3; `bootstrap.sh twenty` 3; verify `TWENTY_REF` and the production-like names (`assertNoLimiterEnv` on names only, `limiterProfileEnv("productionLike")` is empty) 1; `scripts/ci/compose-pull.sh` 6; `npm run up:twenty` with nothing set 12; record Redis `DBSIZE` before the seed (read-only) 1; `npm run seed:twenty` 10; `npm run smoke:twenty` 2; `run-load.ts --case P6-TW-LOAD-006 --profile full` (phases, recovery, oracle) 14; `run-load.ts --case P6-TW-LOAD-009` (gated: flood and low-rate, 120 s plus startup) 6 (`if: gate open`); token scan 2; upload `results/load/` 3; container logs 2; `npm run down:twenty` with `TWENTY_DOWN_VOLUMES=1` 5 (`if: always()`) | 81               | 81 (the `-009` step runs only when its gate is open) | 81                 | **10** |

- No existing timeout changes (C1). Every step has `timeout-minutes` (C2). Down step `if: always()` (C5).

## Expected output

Under `results/load/P6-TW-LOAD-006/<runId>/` (the Task 3 layout, §2.9; the artefact is the `results/load/` folder, 14-day retention). The case's verdicts go under `stages.rateLimit` and `stages.fairness` of `verdict.json`. Outcome mapping: `PASS` when every `-006` rule holds (and `-009` is `PASS` or `FINDING`); `FAIL` on a PRODUCT BUG SUSPECTED result; `INVALID` or `ENV` as the runner decides.

- `run-meta.json`:
  ```json
  {
    "case": "P6-TW-LOAD-006",
    "profile": "production-like",
    "limiterEnvNames": [],
    "defaults": {
      "SHORT_TTL_IN_MS": 1000,
      "SHORT_LIMIT": 100,
      "LONG_TTL_IN_MS": 60000,
      "LONG_LIMIT": 100,
      "APPLICATION_TTL_IN_MS": 60000,
      "APPLICATION_LIMIT": 500
    },
    "observed429": { "limit": 100, "periodUnit": "minute" },
    "redisDbsizeBeforeSeed": 0,
    "twentyImage": "twentycrm/twenty:v2.44.0",
    "twentyRef": "7cbdfec6f346b43715bc2056932f4fad5886f733",
    "harnessTag": "v0.2.15",
    "k6Version": "2.3.0",
    "valid": true,
    "validReasons": []
  }
  ```
  (`defaults` are the source values from B3 and are checked against the 429 body at run time.)
- `phases.json`: `[{ "phase": "below", "n": 120, "s200": 120, "s429": 0, "s5xx": 0, "other": 0 }, …]` with the `above` row showing its 429 count and "contract ok: true".
- `recovery.json`: `{ "recoveryMs": 600, "probes": 1 }` (example values).
- `verdict.json`: `{ "006": { "verdict": "PASS", "reasons": [] }, "009": { "verdict": "NOT RUN" | "PASS" | "FINDING" | "INCONCLUSIVE", "reason": "…" } }`.
- Job summary lines: `P6-TW-LOAD-006 verdict=<v> below429=<n> at429=<n> above429=<n> recoveryMs=<n> profile=production-like`; `P6-TW-LOAD-009 verdict=<v>` (or `NOT RUN: gate closed`).
- Artefact name `tw-load-006-<run_id>`; the token scan runs before the upload and fails the job on a bearer token value (`Bearer` followed by 16+ token characters) or a JWT-shaped string.

## Environment changes

No environment change. The production-like profile needs no env var, no `.env` value and no tool beyond the existing setup (`npm ci`, `scripts/bootstrap.sh twenty`, `scripts/install-k6.sh`, Docker). `NODE_OPTIONS` is not set. Nothing in `.cursor/` or `.claude/hooks/` changes.

## Build order

Each step runs `npm run check` before every push, and the unit count is printed.

- **S1. Re-check against the merged Task 3 (its plan and its code on main) and adjust this plan before coding. List every difference and the change it causes in the plan's re-check table. If a difference changes an oracle or a threshold, stop and report it.**
  - Files: this plan only. Commands: `git fetch origin main`, `git show origin/main:docs/plans/…task3…md`, `grep -n "export" src/load/recovery.ts src/twenty/api.ts`, `cat .github/workflows/twenty-load.yml`, and rows B1–B7 above.
  - Expected: the re-check table lists each interface with the real name.
- **S2. Pure oracle (no I/O).** Files: `src/twenty/rate-limit-oracle.ts` (pure part), `tests/unit/rate-limit-oracle.test.ts`. Command: `node --test tests/unit/rate-limit-oracle.test.ts`. Expected: 10 tests pass. Commit: `feat(load): add the rate-limit contract verdict`.
- **S3. Appended recovery export.** Files: `src/load/recovery.ts` (append `firstOkAfter`), `tests/unit/recovery-first-ok.test.ts`. Expected: the existing recovery tests still pass, and the 3 new tests pass. Commit: `feat(load): add the first-ok recovery time to the recovery module`.
- **S4. Setup helpers and the env guard.** Files: `src/twenty/rate-limit-setup.ts`, `tests/unit/rate-limit-setup.test.ts`. Expected: 2 tests pass. Commit: `feat(load): add the api key setup and the limiter env guard`.
- **S5. k6 cases.** Files: `k6/cases/tw-load-006.js`, `k6/cases/tw-load-009.js`. Command: `npm run k6:inspect`. Commit: `feat(load): add the tw-load-006 and -009 k6 cases`.
- **S6. Registration lines.** Files: the registry, one entry each for `P6-TW-LOAD-006` and `-009`. Commit: `feat(load): register P6-TW-LOAD-006 and -009 in the twenty load runner`.
- **S7. Job, cron and README.** Files: `.github/workflows/twenty-load.yml` (`# >>> task6 jobs`, the Saturday cron line), `README.md` (Task 6 sub-marker). Command: `npm run lint:actions`. Commit: `ci(load): add the task 6 rate-limit job`.
- **S8. Gate probe for -009 (B4), with its own budget.** Command: a one-off script in the scratchpad (not committed), at most 150 requests, run on a local stack started with `npm run up:twenty`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. Expected: a recorded outcome (both pass, or B refused). Record the result in the README sub-marker text (no key id, no token).
- **S9. Local run (optional, the stack is production-like with or without Tasks 1–2).** Commands: `npm run up:twenty`, `npm run seed:twenty`, `node scripts/load/run-load.ts --case P6-TW-LOAD-006 --profile full`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. This task needs no H4, so it can run locally at build time.
- **S10. Full check and push.** `npm run check`. Then `git push -u origin <build branch>`.
- **S11. Merge (owner).** The owner merges with "Create a merge commit". **As soon as this task merges to main, dispatch 3 runs of the Twenty load workflow on main** (the GitHub web UI, Actions tab, the workflow, "Run workflow", branch `main`; or the REST dispatch endpoint with `ref: main` and the case input `P6-TW-LOAD-006`; the input name is ASSUMED from Task 3). Record the 3 run URLs in the build PR description and in the Task 8 closeout input list. If the dispatch returns 403, write it as an owner step with the exact web UI clicks and carry on.

**Build-session parallelism note:** Tasks 4, 5 and 6 build in parallel. Each merges separately. The second and third PR run `git merge origin/main` and keep the other tasks' jobs under their markers.

## Extra risky cases

Each is labelled **EXTRA**, has no P6 id, and enters the build only if the budget still fits (the job cap is already fixed).

| case                                                  | question                                                                        | oracle                                                                                                                        | cost                                            | status                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| EXTRA-T6-1 exactly N and N+1 in one window            | is the request at N accepted and the one at N+1 refused?                        | with a parallel burst: 100 accepted, the 101st refused (probe row 4 showed 100 of 120 accepted; the exact N+1 was not probed) | one burst                                       | NOT PROBED exactly; probe showed 100 accepted of 120                     |
| EXTRA-T6-2 burst straddling the short-window reset    | does a burst that starts just before the 1 s reset refuse exactly the overflow? | count accepted in each second                                                                                                 | 2 bursts                                        | NOT PROBED                                                               |
| EXTRA-T6-3 429 on a write leaves the record unchanged | does a refused PATCH change nothing?                                            | GET after the 429: the field keeps its value                                                                                  | 2 requests                                      | NOT PROBED                                                               |
| EXTRA-T6-4 Retry-After honoured vs ignored            | does a client that waits `Retry-After` get a 200 on the next try?               | the next request after `Retry-After` seconds is 200                                                                           | 2 requests                                      | NOT PROBED                                                               |
| EXTRA-T6-5 the 429 body leaks no internal detail      | does the body carry internal names or ids?                                      | the body has no stack, SQL, Redis key or `spenderId` other than the caller's own key                                          | 0 extra requests (the body is read in the case) | PROBED in part (row 4): the body has `scope.spenderId`; Open decision Q4 |

## Risks, roadmap conflicts and open decisions

### Roadmap conflicts

| roadmap says                                                                               | probe shows                                                                                                       | decision or open question                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 6 "Dispatch + weekly Saturday (Phase 4 D16 pattern)" (line 459)                       | `knee.yml` has no `schedule:`; no Saturday cron exists on `main` (row 12)                                         | The Saturday cron goes in `twenty-load.yml` with this task (a registration line). D16 for the knee workflow stays an owner backlog item (not in this task). |
| Task 6 gate for `-009`: "the limiter keys per token or workspace" (line 447)               | per API key id within a workspace (row 2); one runtime observation suggests a shared bucket (row 8, INCONCLUSIVE) | Gate met on the source; the verdict (PASS or FINDING) decides. B4 re-checks.                                                                                |
| Task 6 probe "short vs long window interaction (100/1 s and 100/60 s)" (line 454)          | short window burst 100 (row 4); sustained limit is the long window (row 6); recovery 2 s after a burst (row 5)    | Both windows are separate buckets (keys end `:1` and `:60`). The `above` phase tests the long window; the first burst tests the short one.                  |
| Task 6 probe "whether the limiter state lives in Redis and must be flushed" (line 455–456) | Redis-backed (row 3); no volume (row 3)                                                                           | A fresh stack is a fresh Redis (`compose down` removes it). B5 records the count before the seed. No Redis write.                                           |
| Task 6 probe "the 429 body and headers (Retry-After, rate-limit headers)"                  | confirmed (row 4)                                                                                                 | The contract check uses the names seen in the probe.                                                                                                        |
| Phase 5 D3: "production-like profile: image defaults, nothing set"                         | confirmed (row 1)                                                                                                 | No H4; no dependency on Tasks 1–2.                                                                                                                          |
| Phase 5 Cases table: `P6-TW-LOAD-009` "gated on the limiter keying per token/workspace"    | the gate is met on the source (row 2)                                                                             | Build it; a shared bucket gives a FINDING.                                                                                                                  |
| `P6-TW-LOAD-006` "Above: 429 with a body and the headers the probe finds"                  | 429 body and four headers confirmed (row 4)                                                                       | The contract is the probe's list.                                                                                                                           |

### Open decisions

- **Q1. Build `-009` now, or move it to "Later" on the probe result.** Options: (a) build it; the verdict is PASS (per key) or FINDING (shared bucket); (b) Later now. **Recommendation: (a)**: the gate is met on the source, and FINDING is a valid result the roadmap asks for (line 448).
- **Q2. Session tokens.** The limiter counts API keys and applications only (row 2). Options: (a) keep the API key as the load credential; (b) add a session-token case as an EXTRA. **Recommendation: (a).** A session-token limit is not in the defaults, so it is not a contract of this profile.
- **Q3. Weekly schedule time.** Options: Saturday 03:23 UTC (08:53 Asia/Colombo, recommended) or another time outside the perf (02:17 UTC daily) and soak (19:29 and 21:11 UTC) slots. **Recommendation: keep 03:23 UTC.**
- **Q4. `scope.spenderId` in the 429 body.** The body carries the caller's own API key id. Options: (a) keep and record it as a README finding for the owner (no product change; the product forks are not edited); (b) ask the product team to remove it (outside P6). **Recommendation: (a)**, and the owner decides whether to raise it upstream.
- **Q5. Recovery definition.** Options: time from the stop of the flood to the first 200 (recommended), or time from the last 429 to the first 200. **Recommendation: from the stop**, because it matches "recovery time after reset" in the roadmap (line 443).
- **Q7. Product-bug runs and the VALID count.** Task 3 §2.11 counts only `outcome: "PASS"` runs as VALID. A PRODUCT BUG SUSPECTED result gives outcome FAIL, so it is not VALID under §2.11, yet the Done-when wants repeated evidence. Options: (a) keep §2.11 and record repeated FAIL runs as product-bug evidence in the closeout; (b) the owner changes §2.11. **Recommendation: (a)**, because Task 3's rule stays as frozen.
- **Q6. Burst probe counts.** Options: keep the EXTRA exact N+1 test (recommended as EXTRA-T6-1), or skip. **Recommendation: keep as EXTRA (adds one burst).**

### Risks

- Shared-bucket behaviour (row 8) could also affect Tasks 4 and 5 if they share keys. Task 4 uses one key per writer and Task 5 uses the reset path, which is not the API limiter. The Task 4 "Limiter fit" assumes the worst case (shared), so it is safe either way.
- Phase timing at the window edge: the `at` phase is at the sustained limit, so a few 429s are normal. The verdict ignores the `at` count (rule above).
- Limiter state carried between runs: handled by the fresh stack (B5); a failed B5 makes the run INVALID.

## Done when

Roadmap "Done when" (lines 460–462), adjusted only by the agreed decisions and Q1–Q6:

- ≥ 3 VALID runs with the below, at and above verdicts, the 429 contract (rows 4) and the recovery time, with the profile values in `run-meta.json`.
- `-009` lands (≥ 3 VALID runs, verdict PASS or FINDING) or is in "Later" with its gate evidence (row 8 and B4).
- `npm run check` green on the build PR.
- The 3 run URLs are recorded for Task 8 (S11).

### Rule self-check (section 0 of the planning prompt)

- N1–N5: met (every step ran without a pause; the log is outside the repo).
- R1–R8: met (GitHub MCP tools; plain git; explicit paths; no force push; no merge; no PR comments; no GitHub CLI mention in owner steps).
- O1–O8: met for this plan file. O5: no private finding detail appears in this plan.
- P1–P5: met (probes before design; products started only through `npm run up:twenty` and stopped with `npm run down:twenty`; no process killed; timings not published).
- C1–C5: met (no timeout raised; every step capped; margin 10; down step with `if: always()`).
- E1: met ("No environment change" with the reason).
- H1–H8: no hard stop hit at planning time.
