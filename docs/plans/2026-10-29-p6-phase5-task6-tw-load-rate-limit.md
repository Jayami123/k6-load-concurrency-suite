# P6 Phase 5 Task 6: rate-limit contract on the production-like profile (P6-TW-LOAD-006, gated -009)

## Header

- **Title:** Task 6, rate-limit contract (`P6-TW-LOAD-006`, P1) and its gated extra `P6-TW-LOAD-009` (limiter fairness).
- **Date:** 2026-10-29 (Asia/Colombo, UTC+05:30). Plan written at 11:48 Asia/Colombo; review fixes applied in round 2 (same day).
- **Plan branch:** `plan/2026-10-29-p6-phase5-tasks4-6` (planning only; plan branches never get a PR and never merge, `docs/agent-rules.md` A.6 and B.10).
- **Build branch:** `feat/<YYYY-MM-DD>-p6-tw-load-rate-limit`, with `<YYYY-MM-DD>` the build start date.
- **Mapped cases:** `P6-TW-LOAD-006` (P1, in scope); `P6-TW-LOAD-009` (accepted extra, gated; the gate is met, see the gate section).
- **Roadmap section:** `docs/plans/2026-10-22-p6-phase5-roadmap.md`, "Task 6" lines 432–464. Phase 4 D12 (the production-like profile pattern) at `docs/plans/2026-10-22-p6-phase4-roadmap.md` lines 271–275; Phase 4 D16 (weekly Saturday) at lines 357 and 386.
- **Base SHA of main at planning:** `5215127a038dbec6b6aef431cf20dcab08e41e11`.
- **Task 3 plan planned against:** `7f9d7f3` on `plan/2026-10-29-p6-phase5-task3` (its §2 interfaces, §2.12 auth table, §2.13 API-key helper and §6.3 values).
- **Harness pin:** `qa-portfolio-harness` `v0.2.15` on main. This task needs no H4.
- **Private findings:** none touched by this task. No `P6-TW-RACE-004` or `OBS-TW-001` detail appears here.

## Review round 2: what changed

1. **Keying (verified in the fork this round).** `build-default-speed-bucket.util.ts` sets `spenderId = null` unless the spender is an application with crossWorkspace scope. Every default apiKey bucket is therefore `{workspaceId}:speed:API:API_REQUEST:apiKey:-:<windowSeconds>`: **one bucket per window shared by all API keys of a workspace.** The `-009` probe result is not inconclusive. Key B was refused because it shares key A's bucket; key C passed later because the bucket had refilled. The gate still opens (it asks for per token or workspace, and per workspace satisfies it). B4 is now a confirmation of this, not a decision.
2. **429 fields.** `usage-limit-speed.service.ts:81` always sets `periodUnit: 'second'`. The two windows are told apart by `periodCount` (1 for the short window, 60 for the long one). The `Sample` comment and `run-meta.json` use `periodCount`.
3. **`scope.spenderId`** is the exhausted bucket's spenderId, which is `null` for default buckets. Q4's premise (that the body leaks the caller's key id) is false. The plan records the field's presence only and asserts nothing about its value.
4. **Helpers.** The plan's own `createLoadApiKey` and `src/twenty/rate-limit-setup.ts` are removed. This task uses Task 3's seeded API-key helper (§2.13; two keys for `-009`) and its revocation. `src/twenty/rate-limit-oracle.ts` stays, and is added to this task's ownership row (owner accepted this one file).
5. **Key count.** One key for `-006` plus two for `-009` is three keys per job, not two and four. The leak check uses three.
6. **`assertNoLimiterEnv`** checks the six names explicitly (listed below), not a prefix. It lives in `rate-limit-oracle.ts`.
7. **Workflow.** The job guard is `github.event.schedule == '23 3 * * 6'` (Saturday only) or dispatch, so the nightly cron (`43 3 * * *`, Task 3) does not start it, and the nightly does not start the Saturday job. Task 3's concurrency group needs the same schedule key (cross-plan contradiction 3).
8. **Cross-plan gap found while applying fix 4.** Task 3 §2.13 `createRunApiKey` has no `roleId` parameter. The probe showed that `createApiKey` requires one (`Field "roleId" of required type "UUID!" was not provided.`). Task 3 must add the role lookup or a `roleId` input (cross-plan contradiction 4).

## What it proves

Twenty refuses overload with a clear 429 (never 500), refuses nothing below the limit, and serves again after the bucket refills. The case runs on the **production-like profile**: image defaults, nothing set, no H4 (roadmap line 439).

### `P6-TW-LOAD-006`

- **Arrival phases** (one API key, `GET /rest/companies?limit=1`):
  - **below:** 1 request per second for 120 s (60 per minute, under the 100 per minute sustained limit).
  - **at:** 100 per minute (about 1.67 per second) for 120 s: the sustained limit.
  - **above:** 200 per minute (about 3.33 per second) for 120 s.
  - **idle:** 60 s with no requests between phases, so the long bucket refills before the next phase.
  - **recovery probe:** after the above phase stops, one request per second until the first 200. The time from the stop to that first 200 is the **recovery time**.
- **Oracle (per phase, `src/twenty/rate-limit-oracle.ts`):** counts of 200, 429 and 5xx, and the contract check for each 429.
- **Verdict rules:**
  - **below:** `429 count = 0`. Any 429 in `below` → PRODUCT_BUG_SUSPECTED (refused under the limit).
  - **at:** the 429 count is reported and does not decide the verdict; `5xx = 0` is required.
  - **above:** `429 count ≥ 1` **and** every 429 satisfies the contract: `Retry-After` present, the three rate headers present, body `error == "RATE_LIMITED"`.
  - **everywhere:** `5xx = 0`. Any 5xx → PRODUCT_BUG_SUSPECTED (roadmap line 442: "never 500").
  - **recovery:** the first 200 arrives within 60 s of the stop. The recovery time is recorded; the 60 s bound only ends the probe.
  - **case verdict:** `PASS` when every rule holds; `PRODUCT_BUG_SUSPECTED` when a rule is broken (it becomes a PRODUCT BUG after 3 VALID runs repeat it, rule C13); `INCONCLUSIVE` when a phase is under 90% of its planned requests; `FAIL` for a setup error (TEST BUG); `NOT RUN` when skipped.
- **Which window refused** is read from `periodCount` in the 429 body: 1 (short window, 100 per second) or 60 (long window, 100 per minute). `periodUnit` is always `"second"` in this build (review fix 2).

### `P6-TW-LOAD-009` (gated extra, limiter fairness)

- Two API keys, both created in this case's setup with `createRunApiKey` (§2.13): key **F** (the flood, the `above` rate for 120 s) and key **L** (the low rate, 12 per minute, one every 5 s, for the same 120 s).
- **Expected at image defaults:** key F and key L share one bucket per window (source, row 2). F's flood exhausts it, so L is refused while F is refused. The verdict is **`FINDING` (cross-key starvation)**, recorded in the README. This is the expected outcome, not a gate failure.
- **Verdict:** `PASS` when L gets zero 429 while F is refused (fair; this would mean per-key buckets). `FINDING` when L gets a 429 during F's refusals (starvation). `INCONCLUSIVE` when F never gets a 429 (no contention).

Transfer: a banking or patient-record API client must get a clear 429 above the limit, none below it, and service back after the window (roadmap lines 436–437). Fairness across clients matters the same way (`-009`).

## Live probe evidence

Probe date: 2026-10-29, Asia/Colombo. Stack: `npm run up:twenty` (image `twentycrm/twenty:v2.44.0`, nothing `API_RATE_LIMITING_*` set, production-like), `npm run seed:twenty`. Probe scripts ran from the session scratchpad (not committed). About 250 requests in total across the probes (the probe budget was 300). Stack stopped with `npm run down:twenty`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`; containers 0, volumes 0.

| #   | fact                                           | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | what it changes in the design                                                                                                                                    |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Image defaults in effect                       | Source `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts`: `API_RATE_LIMITING_SHORT_TTL_IN_MS = 1000` (1713), `API_RATE_LIMITING_SHORT_LIMIT = 100` (1722), `API_RATE_LIMITING_LONG_TTL_IN_MS = 60_000` (1730), `API_RATE_LIMITING_LONG_LIMIT = 100` (1739), `APPLICATION_API_RATE_LIMITING_TTL_IN_MS = 60_000` (1748), `APPLICATION_API_RATE_LIMITING_LIMIT = 500` (1757). Probe: `docker inspect` env **names** on server (25) and worker (24): no `API_RATE_LIMITING_*`, no `NODE_OPTIONS`.                                                                                                                                                        | The job proves the same in its own log, by names only (step 6).                                                                                                  |
| 2   | Which bucket is limited, and how it is keyed   | `usage-limit-definitions.constant.ts:6–50`: API speed defaults for `apiKey` (SHORT 1 s, LONG 60 s, `counterScope: 'perWorkspace'`) and `application` (`crossWorkspace`); `allowedSpenderTypes: ['apiKey', 'application']` (lines 8–9). **Verified this round:** `build-default-speed-bucket.util.ts:37–41` sets `spenderId = isCrossWorkspace && isIdentifiedAcrossWorkspaces ? universalIdentifier : null`, so a default apiKey bucket has `spenderId = null`. `build-speed-bucket-key.util.ts` (29 lines) writes the absent id as `-`: the key is `{workspaceId}:speed:API:API_REQUEST:apiKey:-:<windowSeconds>`. **One bucket per window, shared by all API keys of a workspace.** | Keying is per workspace, not per key. Row 8 and the gate use this. Session tokens have no default speed bucket (from source, not probed).                        |
| 3   | Token bucket in Redis                          | `usage-limit/constants/try-consume-token-buckets-script.constant.ts`: a Lua script using `redis.call('TIME')`; refill `elapsed × refill / windowMs`, capped at `burst`. The state lives in cache storage (Redis). Redis container `qa-harness-twenty-redis-1`: `docker inspect … .Mounts` printed nothing (no volume). `DBSIZE` after seed: `507`.                                                                                                                                                                                                                                                                                                                                    | The limiter is continuous. "Window reset" means refill. Redis has no volume: `compose down` removes the container and its state.                                 |
| 4   | 429 response shape                             | Probe (`probe-t6.ts`, 120 parallel requests, one API key): status histogram `200: 100, 429: 20`, `5xx: 0`. 429 headers: `retry-after: 1`, `x-ratelimit-limit: 100`, `x-ratelimit-remaining: 0`, `x-ratelimit-reset: <epoch s>`. Body keys: `statusCode, error, messages, limitKind, exhaustedKind, scope, limit, remaining, periodCount, periodUnit, retryAfterSeconds`; `error: "RATE_LIMITED"`; `scope` keys: `spenderType, spenderId, operationType`. Source: `build-rate-limit-response-headers.util.ts`, `usage-limit-to-rest-api-exception-handler.util.ts:28–60`.                                                                                                              | The contract check uses these names. Values are never asserted except the error code. `scope.spenderId` presence is recorded; its value is not asserted (fix 3). |
| 5   | Recovery after a burst                         | Probe: first 200 `2017 ms` after the 429s (one 2 s poll; `recovery.polls: 0`, `lastStatusWas429: false`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The long bucket refills one token per 600 ms (100 per 60 s); the short bucket refills in 10 ms. The probe records recovery per run.                              |
| 6   | Which window binds, and how to tell them apart | Probe row 4: 100 accepted of 120 parallel, so the short burst of 100 is the first limit reached. Source row 2: the long bucket refills at 100 per minute, so **sustained** traffic above about 1.67 per second is refused by the long window. **`usage-limit-speed.service.ts:81` always sets `periodUnit: 'second'`**; `periodCount` is `Math.ceil(windowMs / 1000)` (1 or 60) (verified this round).                                                                                                                                                                                                                                                                                | The `above` phase tests the long window. The window is identified by `periodCount` (1 or 60), not by `periodUnit` (fix 2).                                       |
| 7   | API key creation                               | `engine/core-modules/api-key/api-key.resolver.ts:79–93` (`createApiKey`). Probe: `createApiKey(input: {name, expiresAt})` → `Field "roleId" of required type "UUID!" was not provided.` With `roleId` from `getRoles` (`engine/metadata-modules/role/role.resolver.ts:99`; labels `Admin`, `Guest`, `Object-restricted`, `Impersonate-only`, `Member`) → `createApiKey` 200; `generateApiKeyToken(apiKeyId, expiresAt)` (`engine/core-modules/auth/auth.resolver.ts:1089–1097`) 200; token length 444 (length only).                                                                                                                                                                  | Keys come from Task 3's helper (§2.13). **Gap:** that helper has no `roleId` parameter (cross-plan contradiction 4).                                             |
| 8   | Keying for `-009`                              | `probe-t6b.ts`: flood on key A (110 parallel) → `200: 100, 429: 10`; then 3 requests with a new key B → `429: 3`. A fresh key C later (`probe-t6c.ts`) → `200`. **Reading (fix 1):** key B shares key A's bucket by construction (row 2); key C passed later because the bucket had refilled. This is not a random result; the refusal of B is the shared-bucket behaviour.                                                                                                                                                                                                                                                                                                           | `-009` expects a deterministic FINDING (cross-key starvation) at image defaults. B4 confirms it with its own budget.                                             |
| 9   | Second credential                              | Row 7 created keys B and C with no error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `-009` uses two keys from §2.13. They share one bucket (row 8), so the FINDING is expected.                                                                      |
| 10  | Limiter state across runs                      | Redis: no volume (row 3). Harness down path: `TWENTY_DOWN_VOLUMES=1` removes the Postgres and server volumes; `compose down` removes the Redis container. After this probe's down, `docker volume ls` for the project: 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | No Redis write is needed. A fresh start is a fresh Redis (B5 checks the count before the seed).                                                                  |
| 11  | Auth-mutation limiter (not this case)          | `auth.resolver.ts:126–127`: 3 password-reset requests per 15 min per email. Probe: the 4th was refused (`BAD_USER_INPUT`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Not the API limiter. Recorded for Task 5.                                                                                                                        |
| 12  | Phase 4 D16 (weekly Saturday)                  | `.github/workflows/knee.yml`: no `schedule:` key. `perf.yml:16` `17 2 * * *`; `soak.yml:19–20` `11 21 * * 1-6` and `29 19 * * 0`. No Saturday-only cron on `main`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | D16 is not implemented in `knee.yml` (roadmap conflict). This task adds a Saturday cron line to Task 3's `on:` block.                                            |
| 13  | Harness pin has no H4                          | `node_modules/qa-portfolio-harness` `v0.2.15`: no `API_RATE_LIMITING_*` passthrough.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The production-like profile is the only profile possible today, and it is what this task needs.                                                                  |

### The six limiter names checked by `assertNoLimiterEnv`

`API_RATE_LIMITING_SHORT_TTL_IN_MS`, `API_RATE_LIMITING_SHORT_LIMIT`, `API_RATE_LIMITING_LONG_TTL_IN_MS`, `API_RATE_LIMITING_LONG_LIMIT`, `APPLICATION_API_RATE_LIMITING_TTL_IN_MS`, `APPLICATION_API_RATE_LIMITING_LIMIT`. Each name is checked exactly; no prefix match (review fix 15). `NODE_OPTIONS` is checked too.

### Gate for P6-TW-LOAD-009 (roadmap line 448: keys per token or workspace; per IP or global → Later)

- Source (row 2): the bucket is keyed by workspace (all API keys share it). The gate's words are "per token or workspace"; per workspace **satisfies** the gate. Per IP or global would be Later. Nothing in the source or the probe shows per IP or global keying.
- **Gate status: OPEN.** `-009` is built and runs. Expected verdict at image defaults: **FINDING (cross-key starvation)**, recorded in the README as the keying finding the roadmap asks for (line 448). B4 confirms it with its own budget before the build's first run.

## Depends on

| Dependency                                                                                                                                                                                              | Status at planning                                                                                                                       | Blocks                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Task 3a (foundation: `k6/lib/twenty-auth.js`, `k6/journeys/tw-background.js` (not used here), `src/load/reconcile/twenty.ts`, `twenty-load.yml` with `# >>> task6 jobs`, `twentySetup`/`twentyCleanup`) | Pushed (`7f9d7f3`). §2 interfaces used.                                                                                                  | **Build start** for S3 onward.                                                        |
| Task 3 §2.13 (seeded API-key helper, `createRunApiKey` / `revokeRunApiKey`)                                                                                                                             | Pushed. **Gap: no `roleId` parameter** (cross-plan contradiction 4). The build cannot create a key until Task 3 adds the role lookup.    | **Build start** for the key steps (S4). Unit tests of the pure oracle do not need it. |
| Phase 4 Task 6 (production-like profile pattern, Phase 4 D12)                                                                                                                                           | Pattern at roadmap lines 271–275; `src/load/recovery.ts` exists on main (`WINDOW_SEC`, `windowsFromBins`, `recoverySeconds`, `isStorm`). | None.                                                                                 |
| Task 1 (H4) and Task 2 (pin bump)                                                                                                                                                                       | **Not needed** (roadmap line 439: the production-like profile sets nothing).                                                             | Nothing.                                                                              |

### Interfaces from Task 3 (real names, §2 of `7f9d7f3`)

- **I1 (§2.1, §2.12, §2.13)** `k6/lib/twenty-auth.js`: `authorizationHeader()` returns `"Bearer <key>"` from `__ENV.TWENTY_API_KEY` (the setup's key, for `-006` and key F of `-009`). `-009`'s second key is `__ENV.TWENTY_API_KEY_B`; this case builds its header with `restHeaders()` (the helper is not edited).
- **I1b (§2.13)** `src/twenty/api-key.ts`: `createRunApiKey({ baseUrl, authorizationHeader, name, expiresAt })` and `revokeRunApiKey({ baseUrl, authorizationHeader, id })`. `expiresAt` = now + 2 h. The `-009` stage creates the second key with the same helper and revokes it in its own cleanup (Task 3's `twentyCleanup` revokes only `ctx.handles.apiKey`).
- **I3 (§2.5)** `src/load/reconcile/twenty.ts`: `reconcileTwenty(pool, cfg, clientCount)`. `clientCount = 0` (no background run; no companies created).
- **I4 (§2.6)** `src/twenty/limiter-profile.ts`: `limiterProfileEnv("productionLike")` returns `{}`. The job's proof uses this map and the six-name check.
- **I5 (§2.4)** `src/load/cases.ts`: `LoadCase` entries for `P6-TW-LOAD-006` and `-009` (`gated: true`). Run command (§2.8 step 11): `node scripts/load/run-load.ts --case P6-TW-LOAD-006 --profile full`.
- **I6 (§2.7, §2.8)** `.github/workflows/twenty-load.yml` with `# >>> task6 jobs`. The job copies the 15-step template, with the extra steps in the CI budget.
- **Results (§2.9)** `results/load/P6-TW-LOAD-006/<runId>/`. Verdicts go under `stages.rateLimit` and `stages.fairness` of `verdict.json`.
- **VALID rule (§2.11)** currently reads "outcome PASS". The decided rule is validity-based (Decided answers). This is cross-plan contradiction 1.

### Cross-plan contradictions with Task 3 head `7f9d7f3` (Task 3 must change; not decided here)

1. §2.11: VALID must be validity-based (owner decided option b).
2. §6.8: add a per-case `case` dispatch input, or accept that dispatch runs every job of the workflow.
3. §6.8: the concurrency group must key the schedule branch on `github.event.schedule`, so Saturday (`23 3 * * 6`, this task) and nightly (`43 3 * * *`) runs do not cancel each other.
4. §2.13: `createRunApiKey` has no `roleId`, but the mutation requires one. Add a role lookup (the `Admin` role, found by label or by its id) or a `roleId` input.

## Build-time re-check table

| fact                             | how to re-check at build start                                                                                                                                                          | if it changed                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1. Task 3 interfaces            | Read the Task 3 plan and its code on main (I1, I1b, I3, I4, I5, I6, the dispatch input, the concurrency group, `createRunApiKey`'s parameters).                                         | Use the real names. Record each difference in the re-check table. An oracle or threshold change stops the build (H6).                                                               |
| B2. Production-like profile      | `docker inspect` env **names** on the job's stack: none of the six names and no `NODE_OPTIONS`. Read one 429 body once.                                                                 | If a limiter variable is set in the image or the pin, the production-like profile is not valid: stop (H6).                                                                          |
| B3. Limiter constants            | `config-variables.ts:1713–1757` on the pin (fork `7cbdfec6`).                                                                                                                           | Recompute the phase rates (0.6×, 1.0×, 2.0× of the sustained limit) from the constants and record both in `run-meta.json`.                                                          |
| B4. Shared bucket (confirmation) | A standalone check with its own budget (at most 150 requests): flood key A with 110 parallel requests, then 3 requests with key B at once and 1 s later; repeat once after a 60 s idle. | Expected: B is refused during A's flood (shared bucket). If B passes, the bucket is per key: `-009` expects PASS. Either outcome is recorded in the README. `-009` runs either way. |
| B5. Redis empty on a fresh start | After `npm run up:twenty` and before `npm run seed:twenty`: `docker exec <redis> redis-cli DBSIZE`. Record it as `redisDbsizeBeforeSeed`.                                               | If not 0 on a fresh stack, the limiter state carries over: the run is INVALID (P6 never writes to Redis).                                                                           |
| B6. Admin role                   | `getRoles` returns a role labelled `Admin`.                                                                                                                                             | Pick the role by its id, not its label.                                                                                                                                             |
| B7. Helpers                      | `grep -n "export" src/twenty/api-key.ts src/twenty/api.ts src/twenty/oracle.ts src/load/recovery.ts`.                                                                                   | Use the new names; a missing helper or the missing `roleId` (contradiction 4) is a stop.                                                                                            |

### Re-check table (filled at S1, one row per difference)

| #   | difference found at S1                                                                                                           | change to this plan                                                                    | oracle or threshold changed? |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | I1 draft (raw tokens in `TWENTY_TOKEN`) → real: API key in `TWENTY_API_KEY` (§2.1, §2.12).                                       | k6 reads `TWENTY_API_KEY`; the second key is `TWENTY_API_KEY_B`, with `restHeaders()`. | no                           |
| 2   | I1b draft `createLoadApiKey` → real `createRunApiKey` / `revokeRunApiKey` (§2.13), with no `roleId` parameter (contradiction 4). | The plan's helper is removed. The build waits for Task 3's role fix.                   | no                           |
| 3   | I3 draft → real `reconcileTwenty(pool, cfg, clientCount)` (§2.5).                                                                | `clientCount = 0`.                                                                     | no                           |
| 4   | I4 draft → real `limiterProfileEnv("productionLike")` (§2.6).                                                                    | The profile proof uses the empty map and the six-name check.                           | no                           |
| 5   | Task 3 §6.3 is on the branch.                                                                                                    | Not used by this profile.                                                              | no                           |
| 6   | Task 3 §2.11 VALID rule (contradiction 1).                                                                                       | The decided option (b) is used.                                                        | no (counting only)           |
| 7   | Task 3 §2.9 result layout.                                                                                                       | Paths are `results/load/P6-TW-LOAD-006/<runId>/`.                                      | no                           |

## Design

### Build-time file ownership (copied verbatim, plus one owner-accepted addition)

The same table is in all four Phase 5 planning prompts. Planning sessions only add their own plan files, so the four plan PRs never conflict. This table is for the BUILD sessions. This task keeps to its own row (Lane B, Task 6). **Owner decision (2026-10-29):** `src/twenty/rate-limit-oracle.ts` is added to the Task 6 row (the "Owns" cell of the last Lane B row below ends with it). It is the only addition.

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/\*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                        |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml; tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/\*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step; README "How to read the chart" and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/\*, src/dashboard/\*, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                          | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                         |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                        | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                          |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                            | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                          |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker; **owner-accepted addition: src/twenty/rate-limit-oracle.ts** (the only addition)                                                                                                                                                                                                                                                                                                                                                                                                          | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                          |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                 | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-\* releases; contents: read stays)                                                                                                                                                                     | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                                 |

"Registration line" means a one-line or one-entry edit in a shared file. The PR that merges second runs `git merge origin/main` and keeps both entries (a merge commit, never a rebase).

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (3a foundation, then 3b the verified functional profile after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 needs Task 2 at `>= v0.2.16` and 3b for its CI; 5 needs Task 3a only; 6 needs Task 3a only, plus Task 3's §2.13 role fix); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

### Modules and data flow

```
.github/workflows/twenty-load.yml  job task6-rate-limit (guarded: schedule '23 3 * * 6' or dispatch)
  └─ run-load.ts --case P6-TW-LOAD-006 --profile full          (registration line)
       ├─ setup:  createRunApiKey (I1b) → TWENTY_API_KEY (one key)
       ├─ k6 run k6/cases/tw-load-006.js   (phases below / at / above / recovery; one request per line)
       │     └─ console.log("TW006 " + json) → k6-main.log
       ├─ oracle: src/twenty/rate-limit-oracle.ts (pure verdict, contract check, six-name check)
       ├─ src/load/recovery.ts firstOkAfter (APPENDED export: recovery time from the stop)
       └─ reconcileTwenty (I3, clientCount 0)
  └─ run-load.ts --case P6-TW-LOAD-009 (gated, same stack)
       ├─ setup:  createRunApiKey again → TWENTY_API_KEY_B (key L); key F stays TWENTY_API_KEY
       ├─ k6 run k6/cases/tw-load-009.js   (F at the above rate; L at 12 per minute)
       ├─ oracle: fairnessVerdict
       └─ cleanup: revokeRunApiKey for key L (its own; twentyCleanup revokes the setup key)
```

### Exact file list

| status                      | path                                    | purpose                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEW                         | `k6/cases/tw-load-006.js`               | k6 case: the four phases as scenarios with `startTime` offsets; one `TW006` line per request (phase, time, status, `Retry-After`, rate-header presence, error code, `periodCount`). Reads `TWENTY_API_KEY` through `authorizationHeader()`. |
| NEW                         | `k6/cases/tw-load-009.js`               | k6 case (gated): flood scenario with key F and low-rate scenario with key L (`TWENTY_API_KEY_B`, header built with `restHeaders()`); prints `TW009` lines.                                                                                  |
| NEW                         | `src/twenty/rate-limit-oracle.ts`       | Pure: `contractOk`, `phaseCounts`, `verdictForRateLimit`, `fairnessVerdict`, `assertNoLimiterEnv` (six names, exact); CLI stage `runRateLimitOracle`. Owner-accepted addition to the Task 6 row.                                            |
| CHANGED (append only)       | `src/load/recovery.ts`                  | append `firstOkAfter(samples, stopMs)`. Existing exports unchanged.                                                                                                                                                                         |
| NEW                         | `tests/unit/rate-limit-oracle.test.ts`  | fixtures for the verdict rules, the fairness verdict and the six-name check.                                                                                                                                                                |
| NEW                         | `tests/unit/recovery-first-ok.test.ts`  | `firstOkAfter` fixtures.                                                                                                                                                                                                                    |
| CHANGED (registration line) | the case registry (`src/load/cases.ts`) | two entries: `P6-TW-LOAD-006`, `P6-TW-LOAD-009` (`gated: true`).                                                                                                                                                                            |
| CHANGED (job and README)    | `.github/workflows/twenty-load.yml`     | one job under `# >>> task6 jobs`; the Saturday cron line `23 3 * * 6` in the `on:` block (registration line).                                                                                                                               |
| CHANGED (README sub-marker) | `README.md`                             | text under the Task 6 sub-marker of the "Twenty load" section.                                                                                                                                                                              |
| NOT CREATED                 | `src/twenty/rate-limit-setup.ts`        | removed (review fix 4): keys come from Task 3's §2.13 helper.                                                                                                                                                                               |

### Skeletons

```ts
// src/twenty/rate-limit-oracle.ts (NEW)
export type Phase = "below" | "at" | "above" | "recovery";

export interface Sample {
  phase: Phase;
  tMs: number;
  status: number;
  retryAfter: string | null; // Retry-After header value (seconds)
  hasRateHeaders: boolean; // X-RateLimit-Limit, -Remaining and -Reset all present
  errorCode: string | null; // body error, e.g. "RATE_LIMITED"; null for non-JSON
  periodCount: number | null; // body periodCount: 1 = short window, 60 = long window (periodUnit is always "second" in this build)
  scopeKeys: string[]; // presence only: the names of the body's scope keys (values are never read)
}

/** Pure. True when a 429 has Retry-After, the three rate headers and error RATE_LIMITED. A non-429 returns true. */
export function contractOk(s: Sample): boolean;

/** Pure. Counts per phase: { n, s200, s429, s5xx, other }. */
export function phaseCounts(
  samples: Sample[],
  phase: Phase,
): { n: number; s200: number; s429: number; s5xx: number; other: number };

/** Pure. Roadmap rules: below 429 = 0; above 429 >= 1; every 429 has the contract; 5xx = 0 everywhere; recovery found. INCONCLUSIVE below 90% of a phase's planned requests. Throws TEST BUG when samples is empty. */
export function verdictForRateLimit(
  samples: Sample[],
  recoveryMs: number | null,
  plannedPerPhase: Record<Phase, number>,
): { verdict: "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE"; reasons: string[] };

/** Pure. -009 fairness. PASS: L has no 429 while F is refused. FINDING: L has a 429 while F is refused (cross-key starvation). INCONCLUSIVE: F never refused. */
export function fairnessVerdict(
  flood: Sample[],
  low: Sample[],
): { verdict: "PASS" | "FINDING" | "INCONCLUSIVE"; reason: string };

/** Pure. Throws TEST BUG if any of the six names is present (exact match) or NODE_OPTIONS is present. Names only; never a value. */
export function assertNoLimiterEnv(envNames: string[]): void;
```

```ts
// src/load/recovery.ts (APPENDED export; existing exports unchanged)
export interface Sample {
  tMs: number;
  status: number;
}
/** Ms from stopMs to the first 200 at or after stopMs, or null when none. Pure. */
export function firstOkAfter(samples: Sample[], stopMs: number): number | null;
```

- **Key setup for `-009`:** the stage calls `createRunApiKey` a second time for key L and stores it as `ctx.secrets.TWENTY_API_KEY_B`. Key F is the setup key. Both expire in 2 h.

### Phase schedule and arrival rates

| phase    | start (s)                   | duration (s) | arrival rate                | planned requests | reason                                        |
| -------- | --------------------------- | ------------ | --------------------------- | ---------------- | --------------------------------------------- |
| below    | 0                           | 120          | 1 per s (60 per min)        | 120              | 0.6× the sustained limit (100 per min)        |
| idle     | 120                         | 60           | 0                           | 0                | the long bucket refills to full (100 in 60 s) |
| at       | 180                         | 120          | 100 per min (1.67 per s)    | 200              | 1.0× the sustained limit                      |
| idle     | 300                         | 60           | 0                           | 0                | refill                                        |
| above    | 360                         | 120          | 200 per min (3.33 per s)    | 400              | 2.0× the sustained limit                      |
| recovery | 480 (after the above stops) | up to 60     | 1 per s until the first 200 | ≤ 60             | recovery probe                                |

- Rates derive from B3. If B3 changes the limit, the rates change with it, and `run-meta.json` records both.
- Total planned requests ≈ 780. `-009` (gated) adds 120 seconds of flood and 24 low-rate requests.

### Oracles and verdict rules

- Stated in "What it proves". Recovery time = `firstOkAfter(recovery samples, stopMs)`; `stopMs` is the time of the last above request. Recorded in `recovery.json`; the verdict needs only a non-null value.
- Thresholds: the VALID rules (90% of planned per phase; zero 5xx) and the verdict rules above. No threshold file changes. The phase rates derive from the limit constants, never from a tuned number.
- **Fixtures** (`tests/unit/rate-limit-oracle.test.ts`):
  1. all phases as expected (below 0 × 429, above 150 × 429 with the contract, 0 × 5xx, recovery 600 ms) → `PASS`.
  2. one 429 in `below` → `PRODUCT_BUG_SUSPECTED`, reason names the phase.
  3. `above` with zero 429 → `PRODUCT_BUG_SUSPECTED`.
  4. a 429 without `Retry-After` → `PRODUCT_BUG_SUSPECTED`; `contractOk` is false.
  5. a 500 in `at` → `PRODUCT_BUG_SUSPECTED`.
  6. recovery `null` → `PRODUCT_BUG_SUSPECTED` ("no 200 within 60 s").
  7. `at` with 40 × 429 → still `PASS` (informational).
  8. a phase with 80 of 120 planned requests → `INCONCLUSIVE`.
  9. empty samples → throws `TEST BUG`.
  10. `fairnessVerdict`: L with no 429 while F is refused → `PASS`; L with a 429 while F is refused → `FINDING`; F never refused → `INCONCLUSIVE`.
  11. `assertNoLimiterEnv(["PATH", "API_RATE_LIMITING_LONG_LIMIT"])` throws `TEST BUG`; each of the other five names throws; `assertNoLimiterEnv(["PATH", "NODE_ENV", "API_RATE_LIMITING_LONG_LIMIT_X"])` passes (no prefix match); the error names the variable, never a value.
- `tests/unit/recovery-first-ok.test.ts`: `firstOkAfter` returns the ms to the first 200 at or after `stopMs`; `null` when none; ignores 200s before `stopMs`.

## Data isolation, cleanup and leak check

- Keys are named with the run prefix (`${prefix}-t6-A` for the setup key, `${prefix}-t6-L` for key L). This task creates no records (no companies, no users).
- The job's stack is fresh: `TWENTY_DOWN_VOLUMES: "1"` (as perf.yml does), and `down` removes the containers, Redis included. B5 checks the Redis count before the seed.
- **Keys created by the job: 3** (one for `-006`, two for `-009`). Cleanup revokes the setup key through `twentyCleanup` (Task 3) and key L through this case's own stage (`revokeRunApiKey`). Key F is the setup key.
- **Leak check** (fails the job): `reconcileTwenty` (I3, clientCount 0) finds no prefixed companies; and `SELECT count(*) FROM core."apiKey" WHERE name LIKE '<prefix>%' AND "revokedAt" IS NULL` must be **0**, with **3** keys created when `-009` ran (1 when it did not). A count mismatch is a TEST BUG.

## CI budget

Job: `task6-rate-limit` in `.github/workflows/twenty-load.yml` under `# >>> task6 jobs` (I6).

- **Triggers and guard.** `workflow_dispatch` and the weekly Saturday schedule `23 3 * * 6` (UTC; **= Saturday 08:53 Asia/Colombo**). The cron is a registration line in Task 3's `on:` block. The guard: `if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'schedule' && github.event.schedule == '23 3 * * 6') }}`. The nightly cron (`43 3 * * *`) does not start this job, and this job does not start on the nightly. **No PR run** (roadmap line 459).
- **Concurrency.** Inherits Task 3's group; the schedule-aware key is cross-plan contradiction 3.
- **Profile.** `productionLike` (nothing set). Task 3's workflow env `P6_TWENTY_LIMITER_PROFILE: productionLike` already applies it. Runner `ubuntu-24.04`. This job starts and downs its own Twenty (C5) and shares nothing with the Task 4 and 5 jobs.

Job timeout: **91 minutes** (caps sum 81 plus the 10-minute margin). The job copies the Task 3 §2.8 template and adds four steps: the production-like names check, the Redis count before the seed, the `-006` run and the gated `-009` run.

| job              | job timeout | each step and its cap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | sum of step caps | worst case                                              | margin (>= 10 min) |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------- | ------------------ |
| task6-rate-limit | 91          | Task 3 §2.8 template: checkout 3; setup-node 3; `npm ci` 5; k6 setup 3; `bootstrap.sh twenty` 3; verify `TWENTY_REF` and the six limiter names and `NODE_OPTIONS` absent (`assertNoLimiterEnv`, names only) 1; `scripts/ci/compose-pull.sh` 6; `npm run up:twenty` with nothing set 12; record Redis `DBSIZE` before the seed (read-only) 1; `npm run seed:twenty` 10; `npm run smoke:twenty` 2; `run-load.ts --case P6-TW-LOAD-006 --profile full` (setup key, phases, recovery, oracle) 14; `run-load.ts --case P6-TW-LOAD-009` (gated: keys F and L, 120 s flood and low rate, plus startup) 6 (`if: gate open`); token scan 2; upload `results/load/` 3; container logs 2; `npm run down:twenty` with `TWENTY_DOWN_VOLUMES=1` 5 (`if: always()`) | 81               | 81 (the `-009` step is skipped when its gate is closed) | 81                 | **10** |

- No existing timeout changes (C1). Every step has `timeout-minutes` (C2). The down step has `if: always()` (C5).

## Expected output

Under `results/load/P6-TW-LOAD-006/<runId>/` (Task 3 §2.9):

- `run-meta.json`:
  ```json
  {
    "case": "P6-TW-LOAD-006",
    "profile": "full",
    "limiterProfile": "productionLike",
    "limiterEnvNames": [],
    "defaults": {
      "SHORT_TTL_IN_MS": 1000,
      "SHORT_LIMIT": 100,
      "LONG_TTL_IN_MS": 60000,
      "LONG_LIMIT": 100,
      "APPLICATION_TTL_IN_MS": 60000,
      "APPLICATION_LIMIT": 500
    },
    "observed429": { "limit": 100, "periodUnit": "second", "periodCount": [1, 60] },
    "scopeKeysPresent": true,
    "redisDbsizeBeforeSeed": 0,
    "keysCreated": 1,
    "twentyImage": "twentycrm/twenty:v2.44.0",
    "twentyRef": "7cbdfec6f346b43715bc2056932f4fad5886f733",
    "harnessTag": "v0.2.15",
    "k6Version": "2.3.0",
    "validity": { "verdict": "VALID" },
    "environment": { "kind": "github-actions" }
  }
  ```
  `defaults` are the B3 source values, checked against the 429 body at run time. `observed429.periodUnit` is `"second"` (fix 2); the two windows are identified by `periodCount` (1 and 60). `scopeKeysPresent` records presence only (fix 3).
- `phases.json`: `[{ "phase": "below", "n": 120, "s200": 120, "s429": 0, "s5xx": 0, "other": 0 }, …]`, with the `above` row showing its 429 count and "contract ok: true".
- `recovery.json`: `{ "recoveryMs": 600, "probes": 1 }` (example values).
- `verdict.json`: the runner's fields plus `stages.rateLimit` (the `006` verdict and reasons) and `stages.fairness` (the `009` verdict, or `NOT RUN`).
- Job summary (public): `P6-TW-LOAD-006 verdict=<v> profile=production-like`; `P6-TW-LOAD-009 verdict=<v>` (`FINDING` is the expected value at image defaults: cross-key starvation, README); or `NOT RUN: gate closed`.
- Artefact `results/load/` (14-day retention). The token scan runs before the upload and fails the job on a bearer token value or a JWT-shaped string.

**Outcome and validity (decided, option b).** Validity decides VALID; a VALID run counts toward the closeout medians whatever its outcome. A `FINDING` or a PRODUCT_BUG_SUSPECTED verdict is reported separately.

## Environment changes

No environment change. The production-like profile needs no env var, no `.env` value and no tool beyond the existing setup (`npm ci`, `scripts/bootstrap.sh twenty`, `scripts/install-k6.sh`, Docker). `NODE_OPTIONS` is not set. Nothing in `.cursor/` or `.claude/hooks/` changes.

## Build order

Each step runs `npm run check` before every push and prints the unit count.

- **S1. Re-check against the merged Task 3 (its plan and its code on main) and adjust this plan before coding. List every difference and the change it causes in the plan's re-check table. If a difference changes an oracle or a threshold, stop and report it.**
  - Files: this plan only. Commands: `git fetch origin main`, `git show origin/main:docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md`, `grep -n "export" src/twenty/api-key.ts src/load/recovery.ts src/twenty/api.ts`, `cat .github/workflows/twenty-load.yml`, rows B1–B7.
  - Expected: the re-check table lists each interface with its real name, and cross-plan contradictions 1 to 4 are resolved or still open.
- **S2. Pure oracle (no I/O).** Files: `src/twenty/rate-limit-oracle.ts` (pure part), `tests/unit/rate-limit-oracle.test.ts`. Command: `node --test tests/unit/rate-limit-oracle.test.ts`. Expected: 11 tests pass. Commit: `feat(load): add the rate-limit contract verdict and the limiter env check`.
- **S3. Appended recovery export.** Files: `src/load/recovery.ts` (append `firstOkAfter`), `tests/unit/recovery-first-ok.test.ts`. Expected: the existing recovery tests still pass and the 3 new tests pass. Commit: `feat(load): add the first-ok recovery time to the recovery module`.
- **S4. Keys (needs Task 3's role fix).** Uses Task 3's `createRunApiKey` / `revokeRunApiKey` (§2.13) with no new file. Expected: a key is created and revoked on the job's stack (names only in the log). Blocked until contradiction 4 is fixed on main. Commit (if the build adds glue code): `feat(load): wire the run api keys into the rate-limit case`.
- **S5. k6 cases.** Files: `k6/cases/tw-load-006.js`, `k6/cases/tw-load-009.js`. Command: `npm run k6:inspect`. Commit: `feat(load): add the tw-load-006 and -009 k6 cases`.
- **S6. Registration lines.** Files: the case registry (two entries, `-006` and `-009` with `gated: true`). Commit: `feat(load): register P6-TW-LOAD-006 and -009 in the twenty load runner`.
- **S7. Job, cron and README.** Files: `.github/workflows/twenty-load.yml` (`# >>> task6 jobs`, the Saturday cron line, the guard above), `README.md` (Task 6 sub-marker). Command: `npm run lint:actions`. Commit: `ci(load): add the task 6 rate-limit job`.
- **S8. Confirmation probe for `-009` (B4).** A scratchpad script (not committed), at most 150 requests, on a local stack started with `npm run up:twenty`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. Expected: the shared-bucket result (B refused during A's flood). Record the result in the README sub-marker text (no key id, no token).
- **S9. Local run (no pin needed).** Commands: `npm run up:twenty`, `npm run seed:twenty`, `node scripts/load/run-load.ts --case P6-TW-LOAD-006 --profile full`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. Expected: `results/load/P6-TW-LOAD-006/<runId>/` with `validity` set and the count checks passing.
- **S10. Full check and push.** `npm run check`. Then `git push -u origin <build branch>`.
- **S11. Owner merge and dispatch.** The owner merges with "Create a merge commit". **As soon as this task merges to main, dispatch 3 runs of the Twenty load workflow on main** (the GitHub web UI, Actions tab, the workflow, "Run workflow", branch `main`, input `profile` = `full`; or the REST dispatch endpoint `POST /repos/<owner>/<repo>/actions/workflows/twenty-load.yml/dispatches` with `ref: main` and `inputs.profile` = `full`). A dispatch runs every Twenty load job of the workflow; a per-case input is requested from Task 3 (contradiction 2). Record the 3 run URLs for the Task 8 closeout input list. If the dispatch returns 403, write it as an owner step with the exact web UI clicks and carry on.

**Build-session parallelism note:** Tasks 4, 5 and 6 build in parallel. Each merges separately. The second and third PR run `git merge origin/main` and keep the other tasks' jobs under their markers.

## Extra risky cases

Each is labelled **EXTRA**, has no P6 id, and enters the build only if the budget still fits (the job cap is fixed).

| case                                                  | question                                                                        | oracle                                                                                                                       | cost                                            | status                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| EXTRA-T6-1 exactly N and N+1 in one window            | is the request at N accepted and the one at N+1 refused?                        | a parallel burst of N+1: N accepted, the last refused (probe row 4 showed 100 of 120 accepted; the exact N+1 was not probed) | one burst                                       | NOT PROBED exactly                                                      |
| EXTRA-T6-2 burst straddling the short-window reset    | does a burst that starts just before the 1 s reset refuse exactly the overflow? | count accepted in each second                                                                                                | 2 bursts                                        | NOT PROBED                                                              |
| EXTRA-T6-3 429 on a write leaves the record unchanged | does a refused PATCH change nothing?                                            | GET after the 429: the field keeps its value                                                                                 | 2 requests                                      | NOT PROBED                                                              |
| EXTRA-T6-4 Retry-After honoured vs ignored            | does a client that waits `Retry-After` get a 200 on the next try?               | the next request after `Retry-After` seconds is 200                                                                          | 2 requests                                      | NOT PROBED                                                              |
| EXTRA-T6-5 the 429 body leaks no internal detail      | does the body carry internal names or values?                                   | the body has no stack, SQL, Redis key or Redis name; `scope` keys are present but their values are not asserted (fix 3)      | 0 extra requests (the body is read in the case) | PROBED in part (row 4): the scope keys are present; values not asserted |

## Risks, roadmap conflicts and open decisions

### Roadmap conflicts

| roadmap says                                                                                | probe shows                                                                                             | decision or open question                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Task 6 "Dispatch + weekly Saturday (Phase 4 D16 pattern)" (line 459)                        | `knee.yml` has no `schedule:`; no Saturday cron exists on `main` (row 12)                               | The Saturday cron line goes in Task 3's `on:` block with this task. D16 for the knee workflow stays an owner backlog item. |
| Task 6 gate for `-009`: "the limiter keys per token or workspace" (line 447)                | keyed per workspace, since `spenderId` is null for default buckets (row 2, verified this round)         | The gate is met (per workspace satisfies it). The expected verdict is FINDING (cross-key starvation).                      |
| Task 6 probe "short vs long window interaction (100/1 s and 100/60 s)" (line 454)           | short burst 100 (row 4); sustained limit is the long window (row 6); recovery 2 s after a burst (row 5) | Both are separate buckets (windowSeconds 1 and 60). The window is identified by `periodCount`.                             |
| Task 6 probe "whether the limiter state lives in Redis and must be flushed" (lines 455–456) | Redis-backed (row 3); no volume (row 3)                                                                 | A fresh stack is a fresh Redis. B5 records the count before the seed. No Redis write.                                      |
| Task 6 probe "the 429 body and headers (Retry-After, rate-limit headers)"                   | confirmed (row 4)                                                                                       | The contract uses the probe's names. `periodUnit` is always "second"; `periodCount` identifies the window (fix 2).         |
| Phase 5 D3: "production-like profile: image defaults, nothing set"                          | confirmed (row 1)                                                                                       | No H4; no dependency on Tasks 1–2.                                                                                         |
| Phase 5 Cases table: `P6-TW-LOAD-009` "gated on the limiter keying per token/workspace"     | keyed per workspace (row 2); the gate is met                                                            | Build it; the expected result is FINDING.                                                                                  |
| `P6-TW-LOAD-006` "Above: 429 with a body and the headers the probe finds"                   | 429 body and four headers confirmed (row 4)                                                             | The contract is the probe's list.                                                                                          |

### Decided answers (owner, 2026-10-29)

- **VALID (Q7): DECIDED as option (b).** Validity decides VALID; a FINDING or a PRODUCT_BUG_SUSPECTED run stays VALID. This contradicts Task 3 §2.11.
- **Auth: DECIDED (Task 3 §2.12).** `-006` and `-009` use API keys; `-009` uses two.
- **Q4 (`scope.spenderId`): DECIDED by the review.** The body's `scope` keys are recorded for presence only; no value is asserted. The premise that the body carries the caller's key id is false (the field is the exhausted bucket's spenderId, `null` for default buckets).
- **Ownership: DECIDED (owner).** `src/twenty/rate-limit-oracle.ts` is the one owner-accepted addition to the Task 6 row. `src/twenty/rate-limit-setup.ts` is not created.

### Open decisions (not yet decided)

- **Q1. Build `-009` now.** Options: (a) build it; the expected verdict is FINDING at image defaults; (b) Later now. **Recommendation: (a)**: the gate is met (per workspace satisfies "per token or workspace"), and the FINDING is what the roadmap asks for (line 448).
- **Q2. Session tokens.** The limiter counts API keys and applications only (row 2). Options: (a) keep the API key as the load credential (decided by §2.12); (b) an EXTRA session-token case. **Recommendation: (a).**
- **Q3. Weekly schedule time.** Saturday 03:23 UTC (08:53 Asia/Colombo). Options: keep, or another slot clear of perf (02:17 UTC daily) and soak (19:29 and 21:11 UTC). **Recommendation: keep.**
- **Q5. Recovery definition.** Time from the stop of the flood to the first 200. **Recommendation: keep** (matches roadmap line 443).
- **Q6. Burst probe counts.** Keep the EXTRA exact N+1 test (EXTRA-T6-1), or skip. **Recommendation: keep as EXTRA (adds one burst).**

### Cross-plan contradictions (Task 3 must change; this plan cannot decide them)

1. §2.11: VALID must be validity-based (owner decided option b).
2. §6.8: a per-case `case` dispatch input, or accept that dispatch runs every job.
3. §6.8: the concurrency group keys the schedule branch on `github.event.schedule` (Saturday and nightly must not cancel each other).
4. §2.13: `createRunApiKey` has no `roleId`; `createApiKey` requires one (probe). Add the Admin role lookup or a `roleId` input.

### Risks

- Shared bucket across keys (row 2): a flood by any key in the workspace starves every other key. This is the `-009` finding, and it also means the Task 4 writers and this task must not run at the same time on the same stack (they never do: each job has its own stack).
- The `at` phase sits at the sustained limit, so a few 429s are normal; the verdict ignores the `at` count.
- Limiter state carried between runs: handled by the fresh stack (B5). A failed B5 makes the run INVALID.

## Done when

Roadmap "Done when" (lines 460–462), adjusted only by the decided answers:

- ≥ 3 VALID runs (validity VALID on github-actions, any outcome) with the below, at and above verdicts, the 429 contract and the recovery time, with the profile values in `run-meta.json`.
- `-009` lands (≥ 3 VALID runs, verdict PASS or FINDING) or is in "Later" with its gate evidence (row 8 and B4). The expected verdict is FINDING.
- `npm run check` green on the build PR.
- The 3 run URLs are recorded for Task 8 (S11).

### Rule self-check (section 0 of the planning prompt; rule F.20)

- N1–N5: met (every step ran without a pause; the progress log is outside the repo).
- R1–R8: met (GitHub MCP tools; plain git; explicit paths; no force push; no merge; no PR comments; owner steps use web UI wording only). Owner names are not written in repo text: the S11 endpoint uses `<owner>/<repo>`.
- O1–O8: met for this plan file. No private finding detail appears here.
- P1–P5: met (probes before design; products started and stopped through `npm run up:twenty` and `npm run down:twenty`; no process killed; timings not published).
- C1–C5: met (no timeout raised; every step capped; margin 10; down step with `if: always()`).
- E1: met ("No environment change" with the reason).
- H1–H8: no hard stop hit by this plan. The cross-plan contradictions (1 to 4) are reported, not decided here.
