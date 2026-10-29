# P6 Phase 5 Task 5: one-time reset token under load (P6-TW-LOAD-005, gated -011)

## Header

- **Title:** Task 5, one-time token under load (`P6-TW-LOAD-005`, P1) and its gated extra `P6-TW-LOAD-011` (expiry boundary).
- **Date:** 2026-10-29 (Asia/Colombo, UTC+05:30). Plan written at 11:48 Asia/Colombo.
- **Plan branch:** `plan/2026-10-29-p6-phase5-tasks4-6` (planning only, no PR of its own).
- **Build branch:** `feat/<YYYY-MM-DD>-p6-tw-load-reset-token`. `<YYYY-MM-DD>` is the build start date.
- **Mapped cases:** `P6-TW-LOAD-005` (P1, in scope); `P6-TW-LOAD-011` (accepted extra, gated; gate status below).
- **Roadmap section:** `docs/plans/2026-10-22-p6-phase5-roadmap.md`, "Task 5" lines 397–431. Related: Cases table lines 135 and 140, task table line 157, D3 lines 547–551, D11 lines 570–575.
- **Base SHA of main at planning:** `5215127a038dbec6b6aef431cf20dcab08e41e11`.
- **Task 3 plan SHA planned against:** `d0879863b5d511786f0c0f3aa61674cf8ce71aa3` (short `d087986`, pushed 2026-10-29 06:21:50 UTC). Its §2 is frozen and is the interface source used here. Its §6 (functional values) and its Q list are not on the branch.
- **Harness pin at planning:** `qa-portfolio-harness` `v0.2.15` (no H4 yet).
- **Private findings (rule O5):** `P6-TW-RACE-004` matched by a probe (see the probe table, row 7). It is disclosed in the private security report. This plan names the ID only and describes no mechanism, rate, reproduction or endpoint detail for it.

## What it proves

While steady API load runs, each throwaway user requests one password-reset token. Each token is read from Mailpit and redeemed N = 3 times in parallel. The question: does the system accept exactly one redemption per token while it is busy?

- **Oracle, per token** (computed in `src/twenty/oracle-reset-token.ts`):
  - `successes` = number of redemption responses with HTTP 200, no `errors`, and `data.updatePasswordViaResetToken.success === true`. **Expected: exactly 1.**
  - `hashChanged` = boolean from SQL: the stored password hash differs from its in-memory digest taken before the request (the hash is never returned; see the probe row 8). **Expected: true.**
  - "the password hash changed exactly once" is checked as `successes == 1 AND hashChanged == true`. Each successful redemption writes the hash (source: `updatePassword` call in `auth.resolver.ts:1159`), and the case is not allowed to write to the DB, so a second write cannot be counted directly. The success count is the count of writes.
  - `unrevokedRows` = count of `core."appToken"` rows of type `PASSWORD_RESET_TOKEN` for the user with `revokedAt IS NULL`. **Expected: 0.**
  - Any response with status ≥ 500 → **PRODUCT BUG (SUSPECTED)**, per the roadmap ("any 5xx a PRODUCT BUG", line 408).
- **Verdict words:** `PASS` (every token: `successes == 1`, `hashChanged`, `unrevokedRows == 0`, no 5xx); `PRODUCT BUG (SUSPECTED)` (any token with `successes > 1`, any 5xx, or any hash or row rule broken; it becomes PRODUCT BUG after 3 VALID runs repeat it, rule C13); `FAIL` (setup error, TEST BUG, never retried); `INCONCLUSIVE` (run not VALID, or no token was issued); `NOT RUN` (job skipped; for `-011`, gate closed).
- **A multi-success result** is recorded as `P6-TW-RACE-004` (private security report), and the case counts it under that finding ID, as the roadmap asks (line 408–409). The rate vs load is **not** written to any public artefact until Q-DISCLOSE is decided (Open decision Q1).
- **`P6-TW-LOAD-011` (gated, expiry boundary):** under the same load, a redemption just before a token's expiry must succeed once, and one just after must be refused, and never both. Verdict words as above.

Transfer: a one-time approval code or a record-access link must not be redeemable twice when servers are busy (roadmap line 401–402).

## Live probe evidence

Probe date: 2026-10-29, Asia/Colombo. Stack: `npm run up:twenty` (image `twentycrm/twenty:v2.44.0`, harness v0.2.15, production-like limits: none set), `npm run seed:twenty`. Probe scripts were run from the session scratchpad (not committed); each run used its own prefix. Total probe reset requests: about 30 reset-related requests across the probes. Stack stopped with `npm run down:twenty`; containers 0; volumes removed with `TWENTY_DOWN_VOLUMES=1` (count 0).

| #   | fact                                                   | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                     | what it changes in the design                                                                                                                                                                                        |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Request path and captcha                               | `emailPasswordResetLink` mutation: `src/twenty/api.ts:123–129` (`requestPasswordReset`). Twenty resolver `auth.resolver.ts:1118–1119` (`CaptchaGuard` on the mutation). Probe: 4 requests without a `captchaToken` all returned HTTP 200 (`probe-t5.ts` output); `captcha.guard.ts:32–33` returns true when the captcha validation succeeds.                                                           | No captcha token is needed in this stack. Keep the helper unchanged.                                                                                                                                                 |
| 2   | Token generation and expiry                            | `reset-password.service.ts:87` (`generatePasswordResetToken`), `:107` (`PASSWORD_RESET_TOKEN_EXPIRES_IN` read), `:117` (`expiresAt = now + ms(expiresIn)`). Default `config-variables.ts:143`: `PASSWORD_RESET_TOKEN_EXPIRES_IN = '5m'`. DB, read-only: `SELECT extract(epoch FROM ("expiresAt" - "createdAt")) FROM core."appToken" WHERE type='PASSWORD_RESET_TOKEN'` returned `300` for all 5 rows. | Expiry is 300 s of real time. Gate for `-011` checked below.                                                                                                                                                         |
| 3   | Token read latency through Mailpit                     | `probe-t5.ts`: one request → token readable in 270–276 ms (5 trials, token length 64). Helper: `src/twenty/member.ts:28` (`requestResetToken`), `src/twenty/mailpit.ts:24` (`resetTokenFrom`), `:44` (`waitForMessage`).                                                                                                                                                                               | A sequential token takes under half a second to read.                                                                                                                                                                |
| 4   | Mail throughput                                        | `probe-t5-mail.ts` (run after 5 real members were created): 5 parallel `emailPasswordResetLink` calls → statuses `[200,200,200,200,200]`, mails arrived `5 of 5`, last arrival `469 ms`.                                                                                                                                                                                                               | 5 concurrent mails arrive in under 0.5 s. A run of 40 tokens spread over 5 minutes is well inside this.                                                                                                              |
| 5   | Auth-mutation limiter (stricter than the API limiter?) | Source: `auth.resolver.ts:126–127` (`PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX = 3`, `WINDOW_MS = 15 * 60 * 1000`), `:1127` (`tokenBucketThrottleOrThrow` keyed `password-reset-email:<email>`). Probe (`probe-t5.ts`): four requests for one email → attempts 1–3 HTTP 200, attempt 4 `BAD_USER_INPUT`, message `Limit reached (3 tokens per 900000 ms)`.                                                   | **Yes, stricter:** 3 reset requests per email per 15 min, separate from the API limiter. Each throwaway user requests one token, so the run is inside the limit. The `-011` re-request (if run) must stay within it. |
| 6   | Consume path (lines only)                              | `auth.resolver.ts:1150` (`updatePasswordViaResetToken` mutation), `:1155` (`validatePasswordResetToken`), `:1159` (`authService.updatePassword`), `:1161` (`invalidatePasswordResetToken`). Helper: `src/twenty/api.ts:131–137` (`redeemResetToken`).                                                                                                                                                  | The oracle counts responses and checks rows. No mechanism is described here.                                                                                                                                         |
| 7   | Parallel redemption of one token                       | `probe-t5.ts` (the redemption part of the probe). **Matches P6-TW-RACE-004, see private security report.** No count, rate or reproduction is recorded in this plan.                                                                                                                                                                                                                                    | Build uses the oracle above. The result is recorded under the finding ID only (Q1).                                                                                                                                  |
| 8   | Hash digest helper                                     | `src/twenty/oracle.ts:60–65` (`passwordHashMd5`) returns `md5("passwordHash")`, a digest of the hash.                                                                                                                                                                                                                                                                                                  | The new oracle compares inside SQL and returns a boolean. The digest is kept in memory only and is never logged, printed or uploaded.                                                                                |
| 9   | Unrevoked live tokens at the end of the probe          | `probe-t5-expiry.ts`: `SELECT count(*) … WHERE "revokedAt" IS NULL AND "expiresAt" > now()` → `0`.                                                                                                                                                                                                                                                                                                     | Leak check after the run uses the same count query, scoped by user.                                                                                                                                                  |
| 10  | Throwaway-user cleanup                                 | NOT PROBED: no delete mutation for members was probed (the probe created members only).                                                                                                                                                                                                                                                                                                                | Leak check is count-based and run-scoped (see "Data isolation"). Build-time re-check row B5.                                                                                                                         |
| 11  | Captcha driver in the env                              | NOT PROBED: the env **names** were checked only for `API_RATE_LIMITING_*` and `NODE_OPTIONS` (probe of the Task 6 stack). The guard passed in this stack (row 1, HTTP 200 without a token).                                                                                                                                                                                                            | Requests pass the guard in this stack. Build-time re-check: `docker inspect` env names for `CAPTCHA_` on the job's stack.                                                                                            |

### Gate for P6-TW-LOAD-011 (expiry at most 15 min of real time, no clock tampering, no DB writes)

- Expiry: **300 s** (`config-variables.ts:143` default `5m`, and the DB interval in row 2). **Criterion met** (300 s ≤ 900 s).
- Clock: the case waits on the wall clock only. It reads `expiresAt` from the DB (read-only) and schedules the two redemptions relative to that value. No clock setting is changed.
- DB writes: none. Only the redemptions (HTTP) and read-only SELECTs.
- **Gate status: OPEN.** `-011` is built and run in the Task 5 job (see CI budget). If the build finds the expiry above 15 min, it moves to "Later" with this row as evidence.

### Probe items the roadmap lists that stay open

- Whether `P6-TW-LOAD-005` redemptions need an H4 limiter raise: the consume path is not the API limiter, so the case does not depend on the functional limits. The CI job still uses the functional profile (decision D3, line 547–551) so every Twenty LOAD run is on the same profile.

## Depends on

| Dependency                                                                                                                                       | Status at planning                                                                                                                   | Blocks                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Task 3 (I1–I6, the background journey I2, the reconcile hook I3, the limiter profile I4, the workflow `twenty-load.yml` with `# >>> task5 jobs`) | Pushed on `plan/2026-10-29-p6-phase5-task3` (`d087986`). §2 interfaces used (real names below). Functional values not on the branch. | **Build start** for S3 onward.                            |
| Task 1 (H4) and Task 2 (pin bump)                                                                                                                | Not released / not merged.                                                                                                           | **CI run** (functional profile). Unit tests need neither. |
| Phase 2 Task 7 (`P6-TW-RACE-004`, `-006`)                                                                                                        | Merged. The race design is in `docs/plans/2026-10-23-p6-phase2-task7-twenty-races.md`; its finding details are not repeated here.    | None.                                                     |
| **Q-DISCLOSE (owner decision)**                                                                                                                  | Open (see Open decisions).                                                                                                           | **Task 5 merge** (not the build).                         |

### Interfaces from Task 3 (real names from its frozen §2)

- **I1 (real, §2.1)** `k6/lib/twenty-auth.js`: `authorizationHeader()` reads `__ENV.TWENTY_TOKEN` and returns `"Bearer <token>"`; `restHeaders(authorization)`. The runner passes the token with `secretEnv: ["TWENTY_TOKEN"]`.
- **I2 (real, §2.2)** `k6/journeys/tw-background.js`: `runTwBackground(cfg, opts)`, `cfg = { baseUrl, prefix }`, returns `{ created, patched, serverErrors }`. The case script `k6/cases/tw-load-005.js` calls it from `journey()` (§2.3), in the open-model scenario.
- **I3 (real, §2.5)** `src/load/reconcile/twenty.ts`: `reconcileTwenty(pool, cfg, clientCount)`, with `clientCount = p6_tw_created`. This plan does not edit that file. Its checks on **users** are a separate count in this plan (Task 3 audits companies only).
- **I4 (real, §2.6; the draft's name was wrong)** `src/twenty/limiter-profile.ts`: `limiterProfileEnv("functional")`. The functional values are not on the pushed branch, so they stay ASSUMED until Task 3 publishes them.
- **I5 (real, §2.4)** `src/load/cases.ts`: `LoadCase` entries for `P6-TW-LOAD-005` (and `-011`, with `gated: true`). Run command (§2.8 step 11): `node scripts/load/run-load.ts --case P6-TW-LOAD-005 --profile full`.
- **I6 (real, §2.7–§2.8)** `.github/workflows/twenty-load.yml` with `# >>> task5 jobs`. The job copies the 15-step template of §2.8.
- **Stage hooks (real, §2.10)** `twentySetup` and `twentyCleanup` (`src/load/products/twenty.ts`). `twentyCleanup` sweeps companies by prefix and runs the company leak check. This plan's user leak check is a separate stage in the case.
- **Results (real, §2.9)** `results/load/P6-TW-LOAD-005/<runId>/`. This case's counts sit under `stages.resetToken` of `verdict.json`, or in the private report under Q1 option (c).
- **VALID rule (real, §2.11)** VALID needs `outcome: "PASS"`. A multi-success result (a PRODUCT BUG run) is therefore not VALID; see Q-DISCLOSE and Open decision Q7.

## Build-time re-check table

| fact                        | how to re-check at build start                                                                                                    | if it changed                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| B1. Task 3 interfaces I1–I6 | Read the Task 3 plan and its code on main.                                                                                        | Use the real names; record each difference in the re-check table at the end of this plan. An oracle or threshold change stops the build (H6). |
| B2. Expiry                  | DB interval query (row 2) and `config-variables.ts:143` on main.                                                                  | If expiry is above 900 s, `-011` moves to "Later".                                                                                            |
| B3. Auth limiter            | `auth.resolver.ts:126–127` and the probe (row 5).                                                                                 | If the limit is lower than 3 per 15 min, the run's request count per email must be re-derived (it is 1 per user plus 1 for `-011`).           |
| B4. Mailpit                 | row 4 repeated at build start.                                                                                                    | If 5 parallel mails take more than 5 s, lower the run's concurrency of token issuance.                                                        |
| B5. Member cleanup          | Search the fork for a delete mutation for users (`grep -rn "deleteUser\|destroyUser" packages/twenty-server/src --include=*.ts`). | If a delete exists, add a per-run cleanup sweep. If not, the leak check stays count-based (Open decision Q5).                                 |
| B6. Helpers                 | `grep -n "export" src/twenty/api.ts src/twenty/member.ts src/twenty/mailpit.ts src/twenty/oracle.ts`.                             | Use the new names; a missing helper is a stop.                                                                                                |
| B7. Private finding         | Confirm `P6-TW-RACE-004` is still the only finding ID touched by this case (the private report).                                  | If another ID applies, add it by ID only.                                                                                                     |

### Re-check table (filled at S1, one row per difference)

| #   | difference found at S1                                                                                                                  | change to this plan                                                                                                 | oracle or threshold changed? |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | I1 draft `twentyAuth(env)` → real `authorizationHeader()` reading `__ENV.TWENTY_TOKEN` (§2.1)                                           | The k6 side uses `authorizationHeader()`; the token comes from the runner as `TWENTY_TOKEN`.                        | no                           |
| 2   | I2 draft `backgroundJourney({prefix, ratePerSec})` → real `runTwBackground(cfg, opts)` (§2.2)                                           | The case composes the open-model scenario (§2.3).                                                                   | no                           |
| 3   | I3 draft `reconcileTwenty(ctx, runPrefix)` → real `reconcileTwenty(pool, cfg, clientCount)` (§2.5)                                      | Company audit stays in Task 3. This plan's user leak check is its own stage (Task 3 audits companies only).         | no                           |
| 4   | I4 draft `resolveTwentyLimiterProfile("functional")` → real `limiterProfileEnv("functional")` in `src/twenty/limiter-profile.ts` (§2.6) | The up step takes `env:` from it.                                                                                   | no                           |
| 5   | Task 3 §6.3 (functional values) and its Q list are absent from `d087986`                                                                | Values stay ASSUMED; B2 re-checks.                                                                                  | no                           |
| 6   | Task 3 §2.11: VALID means `outcome: "PASS"`                                                                                             | A multi-success result is a FAIL run and is not VALID under §2.11. Open decision Q7.                                | the thresholds do not change |
| 7   | Task 3 §2.8 template (sum of caps 70, job timeout 80)                                                                                   | This job copies the template with the `-011` step added: caps sum 100, job timeout 110 (CI budget table rewritten). | no                           |
| 8   | Task 3 §2.9 result layout `results/load/<caseId>/<runId>/`                                                                              | Paths move to `results/load/P6-TW-LOAD-005/<runId>/`.                                                               | no                           |

## Design

### Build-time file ownership (copied verbatim)

This table is the same in all four Phase 5 planning prompts. Planning sessions only add their own plan files, so the four plan PRs never conflict. This table is for the BUILD sessions. This task keeps to its own row (Lane B, Task 5).

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
scripts/load/run-load.ts --case P6-TW-LOAD-005            (registration line)
  ├─ k6 run k6/cases/tw-load-005.js                       (background only: I2, steady load)
  ├─ node src/twenty/reset-token-load.ts (concurrently)   (issues tokens, redeems each N = 3 in parallel)
  │     └─ returns per-token counts and booleans only; never a token, a hash or a body
  ├─ src/twenty/oracle-reset-token.ts                     (read-only SQL: hashChanged boolean, unrevokedRows count)
  │     └─ joinTokens(...) pure verdict
  ├─ I3 reconcileTwenty (Task 3 company audit, composed in the case) + the user leak check of this plan
  └─ redactForArtefact + token scan on the job stdout and on results/ (before any upload)
```

### Exact file list

| status                                | path                                             | purpose                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NEW                                   | `k6/cases/tw-load-005.js`                        | k6 case: background journey (I2) at the functional rate; no token logic in k6.                                                                                                                                                                                     |
| NEW                                   | `src/twenty/reset-token-load.ts`                 | Issues one fresh member per token (`createInvitedMember`), requests one reset (`requestResetToken`), redeems 3 times in parallel (`redeemResetToken`), returns counts. Its name is new Twenty load code under the "new reset-token oracle code in a NEW file" row. |
| NEW                                   | `src/twenty/oracle-reset-token.ts`               | Pure `joinTokens`, `redactForArtefact`, `tokenStateSql`, `hashChangedSql`, and the DB reads (`hashChangedSince`, `unrevokedRows`).                                                                                                                                 |
| NEW                                   | `src/twenty/window-oracle.ts`                    | `-011` only: pure `expiryBoundaryVerdict` plus the schedule computed from the DB `expiresAt`.                                                                                                                                                                      |
| CHANGED (append only, only if needed) | `src/twenty/mailpit.ts`                          | no append is planned: `latestMessageFor`, `resetTokenFrom` and `waitForMessage` cover the need. A helper is appended only if the build finds a gap.                                                                                                                |
| NEW                                   | `tests/unit/oracle-reset-token.test.ts`          | fixtures for `joinTokens` and `redactForArtefact`.                                                                                                                                                                                                                 |
| NEW                                   | `tests/unit/window-oracle.test.ts`               | fixtures for `expiryBoundaryVerdict`.                                                                                                                                                                                                                              |
| CHANGED (registration line)           | `scripts/load/run-load.ts` and the case registry | one entry: `P6-TW-LOAD-005` (and `P6-TW-LOAD-011`).                                                                                                                                                                                                                |
| CHANGED (registration line)           | `src/load/reconcile/twenty.ts`                   | one per-case hook call.                                                                                                                                                                                                                                            |
| CHANGED (job and README)              | `.github/workflows/twenty-load.yml`              | one job under `# >>> task5 jobs`.                                                                                                                                                                                                                                  |
| CHANGED (README sub-marker)           | `README.md`                                      | text under the Task 5 sub-marker of the "Twenty load" section.                                                                                                                                                                                                     |

### Skeletons

```ts
// src/twenty/oracle-reset-token.ts (NEW)
export interface TokenResult {
  trial: number; // 0-based token index in the run
  successes: number; // 200 responses with success === true
  statuses: number[]; // one per redemption (no bodies)
  fiveHundreds: number; // statuses >= 500
  hashChanged: boolean; // from hashChangedSince(), boolean only
  unrevokedRows: number; // live (not revoked) reset-token rows for the user
}

export interface TokenJoin {
  tokens: number;
  exactlyOne: number; // tokens with successes === 1
  multiSuccess: number; // tokens with successes > 1  -> P6-TW-RACE-004 (private)
  fiveHundreds: number; // total 5xx responses
  unchangedHash: number; // tokens with hashChanged false
  unrevoked: number; // tokens with unrevokedRows > 0
  verdict: "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";
  verdictReason: string; // generic wording; names the finding ID only when multiSuccess > 0
}

/** Pure. Throws TEST BUG when results is empty and tokens were expected. */
export function joinTokens(results: TokenResult[], expectedTokens: number): TokenJoin;

/** Pure. Replaces 64-hex strings, bcrypt hash strings, JWT-shaped strings and "Bearer <token>" with "<redacted>". */
export function redactForArtefact(text: string): string;

/** SQL text only. Returns one boolean: the stored hash differs from the digest passed in. */
export function hashChangedSql(schema: string): string;
// SELECT md5("passwordHash") <> $2 AS changed FROM ${schema}."user" WHERE id = $1   (schema guarded, as in Task 4)

/** Read-only. Returns the boolean, never the hash. */
export async function hashChangedSince(
  pool: pg.Pool,
  schema: string,
  userId: string,
  snapshotDigest: string,
): Promise<boolean>;

/** Read-only. The digest is returned to the caller's memory only; the caller must not log it. */
export async function snapshotDigest(
  pool: pg.Pool,
  schema: string,
  userId: string,
): Promise<string | null>;

/** Read-only. Live reset-token rows for one user (revokedAt IS NULL). */
export async function unrevokedRows(pool: pg.Pool, userId: string): Promise<number>;
```

```ts
// src/twenty/reset-token-load.ts (NEW)
export interface ResetTokenRunOpts {
  ctx: CaseContext; // from setupTwentyContext()
  tokens: number; // 40 by default (Open decision Q3)
  redeemsPerToken: number; // 3 (roadmap "redeemed N times in parallel")
  spreadMs: number; // time between token starts: 300000 / tokens
  schema: string;
  pool: pg.Pool;
}

/** Runs one trial: fresh member, one reset request, one token read, N parallel redemptions, then the booleans. */
export async function runOneToken(opts: ResetTokenRunOpts, trial: number): Promise<TokenResult>;

/** Runs all trials spread over spreadMs. Prints one line per trial with counts only (no token, no hash). */
export async function runResetTokenLoad(opts: ResetTokenRunOpts): Promise<TokenResult[]>;
```

- `runOneToken` steps, in order: `createInvitedMember(ctx, address)` → `snapshotDigest` → `requestResetToken(ctx, address)` (the token stays in memory) → `Promise.all` of `redeemResetToken(ctx.base, token, freshPassword())` × N → count successes and 5xx → `hashChangedSince` → `unrevokedRows`. The token variable is dropped after the call (never logged).
- Address: `throwawayAddress(ctx.prefix, trial)` (`src/twenty/payloads.ts`). Password: `freshPassword()`.
- Every thrown error is `TEST BUG: <step> failed for trial <n>` (setup error, no retry).

```ts
// src/twenty/window-oracle.ts (NEW, -011 only)
/** Pure. before: one success expected; after: none expected; both in one token => PRODUCT_BUG_SUSPECTED. */
export function expiryBoundaryVerdict(
  before: { successes: number },
  after: { successes: number },
): "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";
/** Pure. Schedules the two redemptions from the DB expiresAt: beforeMs = expiresAt - 15 s, afterMs = expiresAt + 15 s. */
export function boundarySchedule(expiresAtMs: number): { beforeMs: number; afterMs: number };
```

### Oracles and verdict rules

- Formulas: as in "What it proves". `successes` counts only HTTP 200 with `success === true`. `hashChanged` is the SQL boolean. `unrevokedRows` is a count.
- **Thresholds:** `exactlyOne == tokens` and `fiveHundreds == 0` and `unchangedHash == 0` and `unrevoked == 0` for `PASS`. No threshold is weakened. The VALID rules are the Phase 3 validity rules plus: zero 429 on the token path (the reset request limiter allows 3 per email per 15 min, and each token uses 1), and the background journey's own VALID rules (Task 3).
- **`-011` verdict:** the table below. The `before` redemption is 15 s before the DB `expiresAt`, the `after` redemption 15 s after it, both on separate tokens so the two outcomes cannot mix.

| case                    | before (token A, redeemed at expiresAt − 15 s) | after (token B, redeemed at expiresAt + 15 s) | verdict                                                            |
| ----------------------- | ---------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| normal                  | 1 success                                      | 0 successes (refused)                         | PASS                                                               |
| a refusal before expiry | 0 successes                                    | —                                             | INCONCLUSIVE (no success is a finding about the setup, not a pass) |
| both accepted           | 1                                              | 1                                             | PRODUCT_BUG_SUSPECTED                                              |

- **Fixtures for `joinTokens` and `redactForArtefact`** (`tests/unit/oracle-reset-token.test.ts`):
  1. all tokens exactly one success, hash changed, no rows left → `PASS`.
  2. one token with two successes → `PRODUCT_BUG_SUSPECTED`, reason names `P6-TW-RACE-004` only.
  3. one 5xx → `PRODUCT_BUG_SUSPECTED`.
  4. one token with `hashChanged: false` and one success → `PRODUCT_BUG_SUSPECTED`.
  5. one token with `unrevokedRows: 1` → `PRODUCT_BUG_SUSPECTED`.
  6. zero results with expected 5 → throws `TEST BUG`.
  7. redaction: a 64-hex string, a `$2b$12$…` bcrypt string, a JWT-shaped string, and `Bearer abc…` each become `<redacted>`; plain text is unchanged.
  8. redaction of a line that contains both a token and a count keeps the count.
- **`-011` fixtures** (`tests/unit/window-oracle.test.ts`): normal → `PASS`; both accepted → `PRODUCT_BUG_SUSPECTED`; no success before → `INCONCLUSIVE`; `boundarySchedule(1000000)` → `{ beforeMs: 985000, afterMs: 1015000 }`.

## Data isolation, cleanup and leak check

- Every member address uses the run prefix (`throwawayAddress(ctx.prefix, trial)`), so the leak check can find them.
- The job runs on a fresh stack (`TWENTY_DOWN_VOLUMES: "1"`, as perf.yml does). The stack is removed at the end, so members from one run cannot remain for the next.
- **Companies:** Task 3's `twentyCleanup` (§2.10) sweeps company rows with the run prefix. This case creates no companies, so the sweep finds none; it still runs as the template requires.
- **Members (users):** no delete mutation was probed (B5), so the members are run-scoped: they exist only inside this job's stack, and the stack is removed at the end.
- **User leak check** (its own stage, fails the job): `SELECT count(*) FROM core."user" WHERE email LIKE '<prefix>%'` must equal the number of tokens issued (plus `-011` members, if run). Any other count fails the job. `unrevokedRows` summed over the run's users must be 0.
- **Redaction and scan:** the job's stdout and `results/load/P6-TW-LOAD-005/` are scanned with the same patterns as `redactForArtefact`; a match fails the job before any upload.

## CI budget

Job: `task5-reset-token` in `.github/workflows/twenty-load.yml` under `# >>> task5 jobs` (I6). Triggers: nightly `schedule` (the Task 3 cron `41 3 * * *` UTC = 09:11 Asia/Colombo, shared with Task 4; the registration line is in the `on:` block) and `workflow_dispatch`. **No PR run** (roadmap "Nightly + dispatch").

Job timeout: **100 minutes** (sum of step caps 90 + 10-minute margin). Functional profile (decision D3). Runner: `ubuntu-24.04`. The job copies the Task 3 §2.8 template (15 steps) and adds one gated step for `-011`.

| job               | job timeout | each step and its cap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | sum of step caps | worst case                                                                   | margin (>= 10 min) |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------- | ------------------ |
| task5-reset-token | 100         | Task 3 §2.8 template: checkout 3; setup-node 3; `npm ci` 5; k6 setup 3; `bootstrap.sh twenty` 3; verify `TWENTY_REF` and the functional names (names only) 1; `scripts/ci/compose-pull.sh` 6; `npm run up:twenty` with `limiterProfileEnv("functional")` 12; `npm run seed:twenty` 10; `npm run smoke:twenty` 2; `run-load.ts --case P6-TW-LOAD-005 --profile full` (background k6 with the token loop concurrently, 40 tokens over 300 s, the oracle, the user leak check, `twentyCleanup`) 15; `run-load.ts --case P6-TW-LOAD-011` (gated: the expiry boundary, about 6 minutes of wait) 15 (`if: gate open`); token scan 2; upload `results/load/` 3; container logs 2; `npm run down:twenty` with `TWENTY_DOWN_VOLUMES=1` 5 (`if: always()`) | 90               | 90 (the `-011` step runs only when its gate is open; a closed gate skips it) | 90                 | **10** |

- The `-011` step: its gate is decided by the runner from the DB `expiresAt` (the gate table above), and the job's `if:` reads the gate result of the previous step; a closed gate skips the step, and the summary says `NOT RUN`.
- Down step: `if: ${{ always() }}` (C5).

## Expected output

Under `results/load/P6-TW-LOAD-005/<runId>/` (the Task 3 layout, §2.9, on the runner; see the artefact decision below). This case's counts go under `stages.resetToken` of `verdict.json`:

- `run-meta.json`: `{ "case": "P6-TW-LOAD-005", "profile": "functional", "limiter": {…from I4}, "harnessTag": "v0.2.x", "twentyImage": "twentycrm/twenty:v2.44.0", "twentyRef": "7cbdfec6f346b43715bc2056932f4fad5886f733", "tokens": 40, "redeemsPerToken": 3, "expiryS": 300, "valid": true }`.
- `token-results.json`: an array of `TokenResult` (counts and booleans only; no token value, no hash, no body).
- `verdict.json`: `TokenJoin` plus the `-011` verdict if run.
- Job summary lines: `P6-TW-LOAD-005 verdict=<PASS|PRODUCT BUG (SUSPECTED)|INCONCLUSIVE>`; `P6-TW-LOAD-011 verdict=<PASS|PRODUCT BUG (SUSPECTED)|INCONCLUSIVE|NOT RUN>`.
- Under **Q-DISCLOSE option (c)** (recommended): the public summary shows the verdict word and, for a multi-success result, "matches P6-TW-RACE-004, see private security report". The counts stay in the private report. **No artefact is uploaded.** This needs the token scan to pass on stdout only.
- Under option (a) or (b): see Open decision Q1. The artefact name would be `tw-load-005-<run_id>`, retention 14 days (Actions default); the token scan runs before the upload.

## Environment changes

No environment change. The stack, k6, the harness and the helper scripts come from the existing setup (`npm ci`, `scripts/bootstrap.sh twenty`, `scripts/install-k6.sh`, Docker). The pin bump is Task 2's `package.json` change. Nothing in `.cursor/` or `.claude/hooks/` changes.

## Build order

Each step runs `npm run check` before every push, and the unit count is printed.

- **S1. Re-check against the merged Task 3 (its plan and its code on main) and adjust this plan before coding. List every difference and the change it causes in the plan's re-check table. If a difference changes an oracle or a threshold, stop and report it.**
  - Files: this plan only. Commands: `git fetch origin main`, `git show origin/main:docs/plans/…task3…md`, `grep -n "export" k6/lib/twenty-auth.js k6/journeys/tw-background.js src/load/reconcile/twenty.ts`, the limiter-profile module, `.github/workflows/twenty-load.yml`, and build-time rows B1–B7.
  - Expected: the re-check table lists each I1–I6 with the real name.
- **S2. Pure oracle and redaction (no I/O).** Files: `src/twenty/oracle-reset-token.ts` (only the pure parts), `tests/unit/oracle-reset-token.test.ts`. Command: `node --test tests/unit/oracle-reset-token.test.ts`. Expected: 8 tests pass. Commit: `feat(load): add the one-time token join and the artefact redaction`.
- **S3. Expiry boundary (pure).** Files: `src/twenty/window-oracle.ts`, `tests/unit/window-oracle.test.ts`. Expected: 4 tests pass. Commit: `feat(load): add the reset token expiry boundary verdict`.
- **S4. DB reads (SQL text checked, no database).** Files: `src/twenty/oracle-reset-token.ts` (SQL functions). Expected: a unit test asserts `hashChangedSql` returns a boolean expression and never selects `"passwordHash"` as a value. Commit: `feat(load): read the hash change as a boolean only`.
- **S5. Token loop.** Files: `src/twenty/reset-token-load.ts` (NEW), a unit test for its pure mapping (no network). Expected: the test checks that one trial's result has no token-shaped string. Commit: `feat(load): add the reset token loop with counts-only output`.
- **S6. k6 background.** Files: `k6/cases/tw-load-005.js` (NEW). Command: `npm run k6:inspect`. Commit: `feat(load): add the tw-load-005 background case`.
- **S7. Registration lines.** Files: the registry (`CASES` in `src/load/cases.ts`, with `gated: true` on `-011`). `src/load/reconcile/twenty.ts` is not edited. Commit: `feat(load): register P6-TW-LOAD-005 and -011 in the twenty load runner`.
- **S8. Job and README.** Files: `.github/workflows/twenty-load.yml` (`# >>> task5 jobs`), `README.md` (Task 5 sub-marker). Command: `npm run lint:actions`. Commit: `ci(load): add the task 5 reset token job`.
- **S9. Local run (only with Tasks 1–2 merged).** Commands: `npm run up:twenty`, `npm run seed:twenty`, `node scripts/load/run-load.ts --case P6-TW-LOAD-005`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. If Tasks 1–2 are not merged: "NOT RUN: functional profile not released".
- **S10. Full check and push.** `npm run check`. Then `git push -u origin <build branch>`.
- **S11. Owner decision and merge.** Q-DISCLOSE must be decided before this task merges (Open decision Q1). Then the owner merges with "Create a merge commit". **As soon as this task merges to main, dispatch 3 runs of the Twenty load workflow on main** (the GitHub web UI, Actions tab, the workflow, "Run workflow", branch `main`; or the REST dispatch endpoint with `ref: main` and the case input `P6-TW-LOAD-005`; the input name is ASSUMED from Task 3). Record the 3 run URLs in the build PR description and in the Task 8 closeout input list. Under option (c), the run URLs are the only public record. If the dispatch returns 403, write it as an owner step with the exact web UI clicks and carry on.

**Build-session parallelism note:** Tasks 4, 5 and 6 build in parallel. Each merges separately. The second and third PR run `git merge origin/main` and keep the other tasks' jobs under their markers.

## Extra risky cases

Each is labelled **EXTRA**, has no P6 id, and enters the build only if the budget still fits.

| case                                                              | question                                                                    | oracle                                                                                                                                                               | cost                 | status                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------- |
| EXTRA-T5-1 sequential replay after a success                      | after one success, does a later redemption of the same token still succeed? | every later redemption is refused (status 4xx, no 200 with success)                                                                                                  | 2 requests per token | NOT PROBED; build-time                        |
| EXTRA-T5-2 redeem racing a second reset request for the same user | after a second reset request, does the older token stop working?            | the older token is refused and the newer one is accepted, once                                                                                                       | 2 tokens per user    | NOT PROBED; build-time                        |
| EXTRA-T5-3 token of user A, identity of user B                    | can a token for user A change user B's password?                            | the redemption request has no identity field (`redeemResetToken` takes the token and the new password only, `api.ts:131–137`); check that user B's hash is unchanged | 1 extra user         | NOT PROBED; the API shape is read from source |
| EXTRA-T5-4 malformed token                                        | is the error code stable and is there no stack trace in the body?           | a 4xx or GraphQL error with a code; no `stack` key in the body                                                                                                       | 3 requests           | NOT PROBED; build-time                        |

## Risks, roadmap conflicts and open decisions

### Roadmap conflicts

| roadmap says                                                                                                    | probe shows                                                                | decision or open question                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Task 5 "Files likely touched": `src/twenty/oracle.ts` (hash-change and token queries)                           | the ownership table gives Task 5 a NEW file and append-only `mailpit.ts`   | New file `src/twenty/oracle-reset-token.ts`; `oracle.ts` only as an appended export if a new file is impossible (it is not). |
| Task 5 probe "how to detect hash changed once without reading the hash value"                                   | the existing helper `passwordHashMd5` returns a digest (`oracle.ts:60–65`) | Boolean-only SQL with an in-memory digest (row 8, `hashChangedSql`).                                                         |
| Task 5 probe "whether auth mutations have a stricter limit"                                                     | yes: 3 per 15 min per email (row 5, `auth.resolver.ts:126–127`)            | Per-user token requests stay at 1; `-011` adds 1.                                                                            |
| Task 5 probe "throwaway-user cleanup"                                                                           | not probed (row 10)                                                        | Run-scoped stack and count-based leak check; build-time re-check B5.                                                         |
| Task 5 probe "token expiry at image defaults (gate for -011)"                                                   | 300 s (row 2)                                                              | Gate **open**; `-011` built.                                                                                                 |
| roadmap line 408–409: a multi-winner result is counted under the same finding ID and "records the rate vs load" | the probe matched `P6-TW-RACE-004` (row 7)                                 | Counted under the ID only; the rate vs load is withheld from public artefacts until Q-DISCLOSE is decided.                   |
| roadmap "CI change: nightly + dispatch"                                                                         | no Twenty LOAD job exists                                                  | Job in `twenty-load.yml`; no PR run.                                                                                         |
| roadmap "Done when: ≥ 3 VALID nightly runs"                                                                     | under option (c) the public record is verdict-only                         | The three run URLs are the public record; the counts stay in the private report.                                             |
| Phase 5 D3 functional profile                                                                                   | harness `v0.2.15` has no H4                                                | Blocks the CI run only.                                                                                                      |

### Open decisions

- **Q1. Q-DISCLOSE (required; blocks the Task 5 merge, not the build).** Task 5's CI artefacts and dashboard rows are public. This case counts behaviour covered by `P6-TW-RACE-004`, so public counts could reveal more than the private disclosure allows. Options:
  - (a) publish counts under the finding ID only, with no request detail in public artefacts;
  - (b) keep the Task 5 artefacts out of public releases until the owner clears it;
  - (c) a verdict-only public job (the verdict word and the finding ID), with the raw counts kept in the private report, and **no artefact upload**.

  **Recommendation: (c).** Option (a) still publishes a rate vs load, which is the reproduction detail O5 forbids. Option (b) does not stop the artefact being visible to anyone who can read the repository's Actions. Option (c) keeps every count out of the repo and the Actions storage.

- **Q2. Redemptions per token.** Options: N = 3 (roadmap "N times in parallel"), or 2. **Recommendation: 3** (keeps the roadmap's spec).
- **Q3. Tokens per run.** Options: 40 tokens over 300 s, or 20 over 150 s. **Recommendation: 40 over 300 s** (about 5 minutes of steady background), well inside the mail throughput in row 4.
- **Q4. `-011` placement.** Options: same job (recommended; the job cap includes its 15-minute step), or a separate job with its own stack (adds about 35 minutes of stack time). **Recommendation: same job.**
- **Q5. Member cleanup.** Options: a delete mutation (not found in the probe), or the run-scoped stack with a count-based leak check. **Recommendation: run-scoped stack** (the stack is removed at the end).
- **Q6. "Hash changed exactly once" derivation.** Options: count successes and check a boolean change (recommended), or add a DB trigger (forbidden: no DB writes). **Recommendation: the success count plus the boolean change.**

- **Q7. Product-bug runs and the VALID count.** Task 3 §2.11 counts only `outcome: "PASS"` runs as VALID. A multi-success or 5xx result gives outcome FAIL, so it is not VALID under §2.11, yet the Done-when wants repeated evidence. Options: (a) keep §2.11 and record repeated FAIL runs as product-bug evidence in the closeout; (b) the owner changes §2.11 to count any `validity.verdict: "VALID"` run. **Recommendation: (a)**, because Task 3's rule stays as frozen. Under Q-DISCLOSE option (c), the public record is the three run URLs either way.

### Risks

- The Q1 choice leaves the public job with a verdict only. A reader cannot see the counts in public. This is intended.
- Token mail latency under load: row 4 says mails arrive in under 0.5 s, but the functional load could slow the worker. The 15-minute spread and the 60 s slack cover that; B4 re-checks it.
- A token could expire mid-run (roadmap line 430): each token is redeemed within seconds of its request, far inside 300 s.

## Done when

Roadmap "Done when" (lines 425–428), adjusted only by the agreed decisions and Q1:

- ≥ 3 VALID nightly runs with one success per token and one hash change per user, or a recorded PRODUCT BUG (SUSPECTED) that matches `P6-TW-RACE-004` (private security report). Under option (c), the three run URLs are the public record.
- `-011` lands (≥ 3 VALID runs on the gate-open job) or is in "Later" with its gate evidence (row 2 and the gate status above).
- No token, hash or redemption body in any artefact or log (the scan and the unit test for `redactForArtefact`).
- `npm run check` green on the build PR.

### Rule self-check (section 0 of the planning prompt)

- N1–N5: met (every step ran without a pause; the log is outside the repo).
- R1–R8: met (GitHub MCP tools; plain git; explicit paths; no force push; no merge; no PR comments; no GitHub CLI mention in owner steps).
- O1–O8: met for this plan file. **O5:** `P6-TW-RACE-004` is named by ID only, with "private security report"; no mechanism, rate, reproduction or endpoint detail of it appears in this plan. Counts from the probe are withheld.
- P1–P5: met (probes before design; products started only through `npm run up:twenty` and stopped with `npm run down:twenty`; no process killed; timings not published).
- C1–C5: met (no timeout raised; every step capped; margin 10; down step with `if: always()`).
- E1: met ("No environment change" with the reason).
- H1–H8: no hard stop hit at planning time. The O5 finding is recorded, not a stop.
