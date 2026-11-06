# P6 Phase 5 Task 5: one-time reset token under load (P6-TW-LOAD-005, gated -011)

## Header

- **Title:** Task 5, one-time token under load (`P6-TW-LOAD-005`, P1) and its gated extra `P6-TW-LOAD-011` (expiry boundary).
- **Date:** 2026-10-29 (Asia/Colombo, UTC+05:30). Plan written at 11:48 Asia/Colombo; review fixes applied in round 2 (same day).
- **Plan branch:** `plan/2026-10-29-p6-phase5-tasks4-6` (planning only; plan branches never get a PR and never merge, `docs/agent-rules.md` A.6 and B.10).
- **Build branch:** `feat/<YYYY-MM-DD>-p6-tw-load-reset-token`, with `<YYYY-MM-DD>` the build start date.
- **Mapped cases:** `P6-TW-LOAD-005` (P1, in scope); `P6-TW-LOAD-011` (accepted extra, gated; the gate is open on the expiry criterion, see the gate section).
- **Roadmap section:** `docs/plans/2026-10-22-p6-phase5-roadmap.md`, "Task 5" lines 397–431.
- **Base SHA of main at planning:** `5215127a038dbec6b6aef431cf20dcab08e41e11`.
- **Task 3 plan planned against:** `7f9d7f3` on `plan/2026-10-29-p6-phase5-task3` (its §2 interfaces and §2.12 auth table are used; §6 is on the branch).
- **Harness pin:** `qa-portfolio-harness` `v0.2.15` on main. This case needs no H4 (see Depends on).
- **Private findings (rule O5):** `P6-TW-RACE-004` matched by a probe. It is disclosed in the private security report. This plan names the ID only and describes no mechanism, count, rate or reproduction.

## Review round 2: decided answers and changes

- **Q-DISCLOSE (decided by the owner):** until the vendor replies, public evidence shows the verdict word and the finding ID only. No per-run count (multi-success and similar) appears in public summaries, job summaries, release notes or the dashboard. The counts stay in the private report. The CI artefact is uploaded **redacted**: validity and environment fields (`validity`, environment kind, SHAs) and the verdict word are kept; `stages.resetToken` and every count are dropped.
- **VALID (option b, decided):** a run is VALID when its validity is VALID on github-actions, whatever the outcome. Closeout medians come from at least 3 VALID runs. This contradicts Task 3 head §2.11 (cross-plan contradiction 1 in the Task 4 plan).
- **Auth (frozen in Task 3 §2.12):** 005 and 011 use a user session. The API speed limiter does not apply to user sessions (Task 3 §2.12, P8 and P9 there), so this case does not need the functional profile and does not depend on Task 2 or H4. It needs Task 3a only.
- Mechanism leak removed: row 6 and the line that cited the consume path's lines are gone. The only public statement is "matches P6-TW-RACE-004, see private security report".
- 011 oracle rebuilt: any success on the after-expiry token is a product bug regardless of the before token; before=1 and after=0 is PASS; before=0 and after=0 is INCONCLUSIVE.
- The reconcile hook is one registration line in `src/load/reconcile/twenty.ts` (file list and S7 agree).
- Re-check row for the CI budget corrected (90 and 100).

## What it proves

While steady load runs, each throwaway user requests one password-reset token. Each token is read from Mailpit and redeemed N = 3 times in parallel. The question: does the system accept exactly one redemption per token while it is busy?

- **Oracle, per token** (`src/twenty/oracle-reset-token.ts`):
  - `successes` = redemption responses with HTTP 200, no `errors`, and `data.updatePasswordViaResetToken.success === true`. **Expected: exactly 1.**
  - `hashChanged` = a boolean from SQL: the stored password hash differs from an in-memory digest taken before the request. The hash is never returned. **Expected: true.**
  - "The password hash changed exactly once" is checked as `successes == 1 AND hashChanged == true`. Each successful redemption writes the hash, and this case writes nothing to the DB itself, so the success count stands for the write count (Open decision Q6).
  - `unrevokedRows` = count of live (not revoked) reset-token rows of the user. **Expected: 0.**
  - Any response with status ≥ 500 → **PRODUCT_BUG_SUSPECTED** (roadmap line 408).
- **Verdict words:** `PASS` (every token: `successes == 1`, `hashChanged`, `unrevokedRows == 0`, no 5xx); `PRODUCT BUG (SUSPECTED)` (any token with `successes > 1`, any 5xx, or a broken hash or row rule; it becomes a PRODUCT BUG after the same result repeats in 3 VALID runs, rule C13); `FAIL` (setup error, TEST BUG); `INCONCLUSIVE` (no token was issued); `NOT RUN` (gate closed or job skipped).
- **Public wording of a multi-success result:** "PRODUCT BUG (SUSPECTED), matches P6-TW-RACE-004, see private security report". No count goes with it (Q-DISCLOSE).
- **`P6-TW-LOAD-011` (gated, expiry boundary):** under the same load, token A is redeemed 15 s before its expiry and token B 15 s after it. The verdict table is in the oracle section.

Transfer: a one-time approval code or a record-access link must not be redeemable twice when servers are busy (roadmap lines 401–402).

## Live probe evidence

Probe date: 2026-10-29, Asia/Colombo. Stack: `npm run up:twenty` (image `twentycrm/twenty:v2.44.0`, harness v0.2.15, nothing `API_RATE_LIMITING_*` set), `npm run seed:twenty`. Probe scripts ran from the session scratchpad (not committed); each run had its own prefix. About 30 reset-related requests across the probes. Stack stopped with `npm run down:twenty`; containers and volumes 0 (`TWENTY_DOWN_VOLUMES=1`).

| #   | fact                                                   | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                             | what it changes in the design                                                                                                                                                                                  |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Request path and captcha                               | `emailPasswordResetLink` mutation: `src/twenty/api.ts:123–129` (`requestPasswordReset`). Resolver `auth.resolver.ts:1118–1119` (`CaptchaGuard`). Probe: 4 requests without a `captchaToken` all returned HTTP 200 (`probe-t5.ts` output); `captcha.guard.ts:32–33` returns true when the validation succeeds.                                                                                  | No captcha token is needed in this stack. The helper is unchanged.                                                                                                                                             |
| 2   | Token generation and expiry                            | `reset-password.service.ts:87` (`generatePasswordResetToken`), `:107` (`PASSWORD_RESET_TOKEN_EXPIRES_IN` read), `:117` (`expiresAt = now + ms(expiresIn)`). Default `config-variables.ts:143`: `PASSWORD_RESET_TOKEN_EXPIRES_IN = '5m'`. DB read-only: `SELECT extract(epoch FROM ("expiresAt" - "createdAt")) FROM core."appToken" WHERE type='PASSWORD_RESET_TOKEN'` → `300` for all 5 rows. | Expiry is 300 s of real time. The `-011` gate is checked below.                                                                                                                                                |
| 3   | Token read latency through Mailpit                     | `probe-t5.ts`: one request → token readable in 270–276 ms (5 trials, token length 64). Helpers: `src/twenty/member.ts:28` (`requestResetToken`), `src/twenty/mailpit.ts:24` (`resetTokenFrom`), `:44` (`waitForMessage`).                                                                                                                                                                      | A sequential token takes under half a second to read.                                                                                                                                                          |
| 4   | Mail throughput                                        | `probe-t5-mail.ts` (after 5 real members were created): 5 parallel `emailPasswordResetLink` calls → statuses `[200,200,200,200,200]`, mails arrived `5 of 5`, last arrival `469 ms`.                                                                                                                                                                                                           | Five concurrent mails arrive in under 0.5 s. A run of 40 tokens spread over 5 minutes is well inside this.                                                                                                     |
| 5   | Auth-mutation limiter (stricter than the API limiter?) | Source: `auth.resolver.ts:126–127` (`PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX = 3`, `WINDOW_MS = 15 * 60 * 1000`), keyed `password-reset-email:<email>` at `:1127`. Probe: four requests for one email → attempts 1 to 3 HTTP 200, attempt 4 `BAD_USER_INPUT`, message `Limit reached (3 tokens per 900000 ms)`.                                                                                    | **Yes, stricter:** 3 reset requests per email per 15 min, separate from the API limiter. Each throwaway user requests one token, so the run stays inside the limit. The `-011` re-request must stay within it. |
| 6   | Redemption call                                        | `redeemResetToken` (`src/twenty/api.ts:131–137`) is the request the oracle sends. No mechanism is recorded in this plan.                                                                                                                                                                                                                                                                       | The oracle uses only the response status and body fields it names (`success`, `errors`), plus the boolean and count checks.                                                                                    |
| 7   | Parallel redemption of one token                       | **Matches P6-TW-RACE-004, see private security report.** No count, rate, timing or reproduction is recorded in this plan or in any public artefact.                                                                                                                                                                                                                                            | The result is recorded under the finding ID only (Q-DISCLOSE, decided).                                                                                                                                        |
| 8   | Hash digest helper                                     | `src/twenty/oracle.ts:60–65` (`passwordHashMd5`) returns `md5("passwordHash")`, a digest of the stored hash.                                                                                                                                                                                                                                                                                   | The new oracle compares inside SQL and returns a boolean. The digest stays in memory and is never logged or uploaded.                                                                                          |
| 9   | Unrevoked live tokens at the end of the probe          | `probe-t5-expiry.ts`: `SELECT count(*) … WHERE "revokedAt" IS NULL AND "expiresAt" > now()` → `0`.                                                                                                                                                                                                                                                                                             | The leak check uses the same count query, scoped by user.                                                                                                                                                      |
| 10  | Throwaway-user cleanup                                 | NOT PROBED: no delete mutation for members was probed (the probe created members only).                                                                                                                                                                                                                                                                                                        | Run-scoped stack and a count-based user leak check (Open decision Q5).                                                                                                                                         |
| 11  | Captcha driver in the env                              | NOT PROBED: env names were checked only for `API_RATE_LIMITING_*` and `NODE_OPTIONS`. The guard passed in this stack (row 1).                                                                                                                                                                                                                                                                  | Build-time re-check: env names for `CAPTCHA_` on the job's stack.                                                                                                                                              |

### Gate for P6-TW-LOAD-011 (expiry at most 15 min of real time, no clock tampering, no DB writes)

- Expiry: **300 s** (`config-variables.ts:143` and the DB interval in row 2). **Criterion met** (300 s ≤ 900 s).
- Clock: the case waits on the wall clock only. It reads `expiresAt` from the DB (read-only) and schedules the two redemptions from it. No clock setting changes.
- DB writes: none. Only the HTTP redemptions and read-only SELECTs.
- **Gate status: OPEN.** `-011` is built and runs in the Task 5 job. If the build finds the expiry above 15 min, it moves to "Later" with this row as evidence.

## Depends on

| Dependency                                                                                                                                                                              | Status at planning                                                                                                                | Blocks                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Task 3a (foundation: `k6/lib/twenty-auth.js`, `k6/journeys/tw-background.js`, `src/load/reconcile/twenty.ts`, `twenty-load.yml` with `# >>> task5 jobs`, `twentySetup`/`twentyCleanup`) | Pushed (`7f9d7f3`). §2 interfaces used; §2.12 says this case uses a user session.                                                 | **Build start** for S3 onward. |
| Task 3b (functional profile)                                                                                                                                                            | Not needed by this case (user sessions are not limited; §2.12).                                                                   | Nothing.                       |
| Task 2 (pin bump to H4) and Task 1 (H4)                                                                                                                                                 | **Not needed** for this case. Its CI runs on the `productionLike` profile (nothing set). The review's fix 8 applies.              | Nothing.                       |
| Phase 2 Task 7 (`P6-TW-RACE-004`, `-006`)                                                                                                                                               | Merged. The race design is in `docs/plans/2026-10-23-p6-phase2-task7-twenty-races.md`. Its finding details are not repeated here. | None.                          |
| Owner decision (Q-DISCLOSE)                                                                                                                                                             | Decided (see above).                                                                                                              | Nothing.                       |

### Interfaces from Task 3 (real names, §2 of `7f9d7f3`)

- **I1 (§2.1, §2.12)** `k6/lib/twenty-auth.js`: `authorizationHeader()` returns `"Bearer <token>"` from `__ENV.TWENTY_TOKEN` (this case has no API key, so the user-token branch is used). The runner passes it through `secretEnv: ["TWENTY_TOKEN"]`.
- **I2 (§2.2)** `k6/journeys/tw-background.js`: `runTwBackground(cfg, opts)`, `cfg = { baseUrl, prefix }`. The case script `k6/cases/tw-load-005.js` calls it from `journey()` (§2.3).
- **I3 (§2.5)** `src/load/reconcile/twenty.ts`: `reconcileTwenty(pool, cfg, clientCount, counts?)`. `clientCount = p6_tw_created`. This case adds one registration line (a per-case hook) for its user leak check; the company audit stays Task 3's.
- **I4 (§2.6)** `src/twenty/limiter-profile.ts`: this job uses `limiterProfileEnv("productionLike")` (an empty map). It does not use the functional values.
- **I5 (§2.4)** `src/load/cases.ts`: `LoadCase` entries for `P6-TW-LOAD-005` and `-011` (`gated: true`). Run command (§2.8 step 11): `node scripts/load/run-load.ts --case P6-TW-LOAD-005 --profile <pr|full>`.
- **I6 (§2.7, §2.8)** `.github/workflows/twenty-load.yml` with `# >>> task5 jobs`. The job copies the 15-step template (§2.8).
- **Stage hooks (§2.10)** `twentySetup` and `twentyCleanup` (`src/load/products/twenty.ts`). `twentyCleanup` sweeps company rows of the run prefix; this case creates none. Its user count check is a separate stage.
- **Results (§2.9)** `results/load/P6-TW-LOAD-005/<runId>/`. The redacted artefact is the public part (see Expected output).
- **VALID rule:** decided as option (b). This differs from Task 3 head §2.11 (contradiction 1).

## Build-time re-check table

| fact                        | how to re-check at build start                                                                                                                                                           | if it changed                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| B1. Task 3 interfaces I1–I6 | Read the Task 3 plan and its code on main (`k6/lib/twenty-auth.js`, `k6/journeys/tw-background.js`, `src/load/reconcile/twenty.ts`, `src/twenty/limiter-profile.ts`, `twenty-load.yml`). | Use the real names; record each difference in the re-check table. An oracle or threshold change stops the build (H6). |
| B2. Expiry                  | DB interval query (row 2) and `config-variables.ts:143` on main.                                                                                                                         | If the expiry is above 900 s, `-011` moves to "Later".                                                                |
| B3. Auth limiter            | `auth.resolver.ts:126–127` and the probe (row 5).                                                                                                                                        | If the limit is lower than 3 per 15 min, re-derive the request count per email (1 per user, plus 1 for `-011`).       |
| B4. Mailpit                 | Row 4 repeated at build start.                                                                                                                                                           | If five parallel mails take more than 5 s, lower the token issuance concurrency.                                      |
| B5. Member cleanup          | Search the fork for a user delete mutation (`grep -rn "deleteUser\|destroyUser" packages/twenty-server/src --include=*.ts`).                                                             | If a delete exists, add a per-run cleanup sweep. Otherwise the count-based leak check stays (Q5).                     |
| B6. Helpers                 | `grep -n "export" src/twenty/api.ts src/twenty/member.ts src/twenty/mailpit.ts src/twenty/oracle.ts`.                                                                                    | Use the new names; a missing helper is a stop.                                                                        |
| B7. Private finding         | Confirm `P6-TW-RACE-004` is still the only finding ID touched by this case.                                                                                                              | If another ID applies, add it by ID only.                                                                             |

### Re-check table (filled at S1, one row per difference)

| #   | difference found at S1                                                                                                                                 | change to this plan                                                                | oracle or threshold changed? |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------- |
| 1   | I1 draft `twentyAuth(env)` → real `authorizationHeader()` (§2.1); this case uses the user-token branch (§2.12).                                        | k6 reads `TWENTY_TOKEN`; the runner mints the user token with `signInWorkspace()`. | no                           |
| 2   | I2 draft `backgroundJourney({prefix, ratePerSec})` → real `runTwBackground(cfg, opts)` (§2.2).                                                         | The case composes the open-model scenario (§2.3).                                  | no                           |
| 3   | I3 draft `reconcileTwenty(ctx, runPrefix)` → real `reconcileTwenty(pool, cfg, clientCount, counts?)` (§2.5).                                           | One registration line for the user leak check; the company audit stays Task 3's.   | no                           |
| 4   | I4 draft `resolveTwentyLimiterProfile("functional")` → real `limiterProfileEnv("productionLike")` (§2.6). The case needs no functional values (§2.12). | The job uses the empty `productionLike` map.                                       | no                           |
| 5   | Task 3 §6.3 is on the branch (the draft said it was absent).                                                                                           | Not used by this case.                                                             | no                           |
| 6   | Task 3 §2.11 VALID rule (contradiction 1).                                                                                                             | The decided option (b) is used; Task 3 must match.                                 | no (counting rule only)      |
| 7   | Task 3 §2.8 template: caps sum 70 for the foundation job. This job copies the template with the gated `-011` step: caps sum 90, job timeout 100.       | CI budget table below uses 90 and 100 (corrected from 100/110).                    | no                           |
| 8   | Task 3 §2.9 result layout `results/load/<caseId>/<runId>/`.                                                                                            | Paths are `results/load/P6-TW-LOAD-005/<runId>/`.                                  | no                           |

## Design

### Build-time file ownership (copied verbatim)

The same table is in all four Phase 5 planning prompts. Planning sessions only add their own plan files, so the four plan PRs never conflict. This table is for the BUILD sessions. This task keeps to its own row (Lane B, Task 5).

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

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (3a foundation, then 3b the verified functional profile after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 needs Task 2 at `>= v0.2.16` and 3b for its CI; 5 needs Task 3a only; 6 needs Task 3a only); Task 7 any time (it depends on no other Phase 5 task). Task 8 (closeout) comes last and is not planned now.

### Modules and data flow

```
.github/workflows/twenty-load.yml  job task5-reset-token (guarded: schedule 43 3 * * * or dispatch)
  └─ run-load.ts --case P6-TW-LOAD-005 --profile $P6_PROFILE
       ├─ setup:   twentySetup (user token via signInWorkspace; no API key for this case)
       ├─ k6 run k6/cases/tw-load-005.js   (background via I2, TWENTY_TOKEN via secretEnv)
       ├─ reset-token loop (concurrent, src/twenty/reset-token-load.ts): one member per token,
       │     one reset, N = 3 parallel redemptions; returns counts and booleans only
       ├─ oracle: src/twenty/oracle-reset-token.ts (joinTokens, hashChangedSql, unrevokedRows)
       ├─ user leak check (own stage) + reconcileTwenty (Task 3 company audit, unchanged)
       ├─ redaction: publicArtefact() keeps verdict word, finding ID, validity and environment only
       └─ cleanup: twentyCleanup (companies; this case creates none)
  └─ run-load.ts --case P6-TW-LOAD-011 (gated: expiry boundary; separate stage, same stack)
```

### Exact file list

| status                                | path                                    | purpose                                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEW                                   | `k6/cases/tw-load-005.js`               | k6 case: background journey (I2) at the pr-equivalent rate Task 3 sets for user sessions; no token logic in k6.                                                                          |
| NEW                                   | `src/twenty/reset-token-load.ts`        | Creates one member per token (`createInvitedMember`), requests one reset (`requestResetToken`), redeems N times in parallel (`redeemResetToken`), returns counts and booleans.           |
| NEW                                   | `src/twenty/oracle-reset-token.ts`      | Pure `joinTokens`, `publicArtefact`, `redactForArtefact`; SQL text `hashChangedSql`; DB reads `hashChangedSince`, `snapshotDigest`, `unrevokedRows`.                                     |
| NEW                                   | `src/twenty/window-oracle.ts`           | `-011` only: pure `expiryBoundaryVerdict` and `boundarySchedule` (from the DB `expiresAt`).                                                                                              |
| CHANGED (append only, only if needed) | `src/twenty/mailpit.ts`                 | no append is planned: `latestMessageFor`, `resetTokenFrom`, `waitForMessage` cover the need.                                                                                             |
| NEW                                   | `tests/unit/oracle-reset-token.test.ts` | fixtures for `joinTokens`, `redactForArtefact` and `publicArtefact`.                                                                                                                     |
| NEW                                   | `tests/unit/window-oracle.test.ts`      | fixtures for `expiryBoundaryVerdict`.                                                                                                                                                    |
| CHANGED (registration line)           | the case registry (`src/load/cases.ts`) | entries for `P6-TW-LOAD-005` and `P6-TW-LOAD-011` (`gated: true`).                                                                                                                       |
| CHANGED (registration line)           | `src/load/reconcile/twenty.ts`          | one per-case hook line for `P6-TW-LOAD-005` (the user leak check). Task 3's functions are unchanged. (Decided: a registration line, not a composed stage, to match the ownership table.) |
| CHANGED (job and README)              | `.github/workflows/twenty-load.yml`     | one job under `# >>> task5 jobs`.                                                                                                                                                        |
| CHANGED (README sub-marker)           | `README.md`                             | text under the Task 5 sub-marker of the "Twenty load" section.                                                                                                                           |

### Skeletons

```ts
// src/twenty/oracle-reset-token.ts (NEW)
export interface TokenResult {
  trial: number; // 0-based token index
  successes: number; // 200 responses with success === true
  statuses: number[]; // one per redemption (no bodies)
  fiveHundreds: number; // statuses >= 500
  hashChanged: boolean; // from hashChangedSince(), boolean only
  unrevokedRows: number; // live reset-token rows for the user
}

export interface TokenJoin {
  tokens: number;
  exactlyOne: number;
  multiSuccess: number; // internal only: tokens with successes > 1 (never public)
  fiveHundreds: number;
  unchangedHash: number;
  unrevoked: number;
  verdict: "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";
  verdictReason: string; // generic; the finding ID only when multiSuccess > 0
}

/** Pure. Throws TEST BUG when results is empty and tokens were expected. */
export function joinTokens(results: TokenResult[], expectedTokens: number): TokenJoin;

/** Pure. The only artefact content that may be uploaded. Keeps: caseId, runId, outcome (verdict word), finding ID (when present), validity, environment kind, SHAs. Drops every count and stages.resetToken. */
export function publicArtefact(verdict: unknown, runMeta: unknown): object;

/** Pure. Replaces 64-hex strings, bcrypt hash strings, JWT-shaped strings and "Bearer <token>" with "<redacted>". */
export function redactForArtefact(text: string): string;

/** SQL text only. One boolean: the stored hash differs from the digest passed in. */
export function hashChangedSql(schema: string): string;
// SELECT md5("passwordHash") <> $2 AS changed FROM ${schema}."user" WHERE id = $1   (schema guarded)

/** Read-only. Returns the boolean, never the hash. */
export async function hashChangedSince(
  pool: pg.Pool,
  schema: string,
  userId: string,
  snapshotDigest: string,
): Promise<boolean>;
/** Read-only. The digest stays in the caller's memory; it is never logged. */
export async function snapshotDigest(
  pool: pg.Pool,
  schema: string,
  userId: string,
): Promise<string | null>;
/** Read-only. Live reset-token rows for one user. */
export async function unrevokedRows(pool: pg.Pool, userId: string): Promise<number>;
```

```ts
// src/twenty/reset-token-load.ts (NEW)
export interface ResetTokenRunOpts {
  ctx: CaseContext;
  tokens: number; // 40 (Q3)
  redeemsPerToken: number; // 3
  spreadMs: number; // 300000 / tokens
  schema: string;
  pool: pg.Pool;
}
/** One trial: fresh member, one reset request, one token read, N parallel redemptions, then booleans. The token is dropped after the call. */
export async function runOneToken(opts: ResetTokenRunOpts, trial: number): Promise<TokenResult>;
/** All trials over spreadMs. Prints one line per trial with counts only (no token, no hash). */
export async function runResetTokenLoad(opts: ResetTokenRunOpts): Promise<TokenResult[]>;
```

- `runOneToken` steps: `createInvitedMember(ctx, address)` → `snapshotDigest` → `requestResetToken(ctx, address)` → `Promise.all` of `redeemResetToken(ctx.base, token, freshPassword())` × N → count successes and 5xx → `hashChangedSince` → `unrevokedRows`.
- Address: `throwawayAddress(ctx.prefix, trial)` (`src/twenty/payloads.ts`). Every thrown error is `TEST BUG: <step> failed for trial <n>` (no retry).

```ts
// src/twenty/window-oracle.ts (NEW, -011 only)
/** Pure. before = token redeemed at expiresAt - 15 s; after = token redeemed at expiresAt + 15 s. See the table in the oracle section. */
export function expiryBoundaryVerdict(
  before: { successes: number },
  after: { successes: number },
): "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";
/** Pure. beforeMs = expiresAtMs - 15000, afterMs = expiresAtMs + 15000. */
export function boundarySchedule(expiresAtMs: number): { beforeMs: number; afterMs: number };
```

### Oracles and verdict rules

- **Per-token formulas:** as in "What it proves". `successes` counts only HTTP 200 with `success === true`. `hashChanged` is the SQL boolean. `unrevokedRows` is a count.
- **Thresholds (005):** `exactlyOne == tokens`, `fiveHundreds == 0`, `unchangedHash == 0`, `unrevoked == 0` for `PASS`. No threshold is weakened. VALID also requires zero 429 on the token path (3 reset requests per email per 15 min; each token uses 1) and Task 3's background VALID rules.
- **`-011` verdict (revised).** Token A is redeemed at `expiresAt − 15 s` (the _before_), token B at `expiresAt + 15 s` (the _after_). Separate tokens, so the outcomes cannot mix.

| before (token A) successes | after (token B) successes | verdict               | why                                                              |
| -------------------------- | ------------------------- | --------------------- | ---------------------------------------------------------------- |
| 1                          | 0                         | PASS                  | expected: accepted before expiry, refused after                  |
| 0                          | 0                         | INCONCLUSIVE          | nothing accepted; no evidence either way                         |
| any                        | ≥ 1                       | PRODUCT_BUG_SUSPECTED | a token accepted after expiry, whatever happened before it       |
| 0                          | 1                         | PRODUCT_BUG_SUSPECTED | the fixture of the review: accepted after expiry, refused before |

- **Fixtures for `joinTokens`, `redactForArtefact`, `publicArtefact`** (`tests/unit/oracle-reset-token.test.ts`):
  1. all tokens exactly one success, hash changed, no rows left → `PASS`.
  2. one token with two successes → `PRODUCT_BUG_SUSPECTED`; the public wording names `P6-TW-RACE-004` only, with no count.
  3. one 5xx → `PRODUCT_BUG_SUSPECTED`.
  4. one token with `hashChanged: false` and one success → `PRODUCT_BUG_SUSPECTED`.
  5. one token with `unrevokedRows: 1` → `PRODUCT_BUG_SUSPECTED`.
  6. zero results with expected 5 → throws `TEST BUG`.
  7. redaction: a 64-hex string, a `$2b$12$…` bcrypt string, a JWT-shaped string and `Bearer abc…` each become `<redacted>`; plain text is unchanged.
  8. `publicArtefact` on a result with counts: the output has no count key, no `stages`, no `tokens`, no `redeemsPerToken`; it keeps `validity` and environment fields and the verdict word.
- **`-011` fixtures** (`tests/unit/window-oracle.test.ts`): before 1 / after 0 → `PASS`; before 0 / after 0 → `INCONCLUSIVE`; before 1 / after 1 → `PRODUCT_BUG_SUSPECTED`; **before 0 / after 1 → `PRODUCT_BUG_SUSPECTED`**; `boundarySchedule(1000000)` → `{ beforeMs: 985000, afterMs: 1015000 }`.

## Data isolation, cleanup and leak check

- Every member address uses the run prefix (`throwawayAddress(ctx.prefix, trial)`).
- The job runs on a fresh stack (`TWENTY_DOWN_VOLUMES: "1"`, as perf.yml does). The stack is removed at the end.
- **Companies:** `twentyCleanup` (Task 3 §2.10) sweeps the run prefix's companies. This case creates none, so the sweep finds none; it still runs as the template requires.
- **Members (users):** no delete mutation was probed (B5), so members are run-scoped and exist only inside this job's stack.
- **User leak check** (its own stage, fails the job): `SELECT count(*) FROM core."user" WHERE email LIKE '<prefix>%'` must equal the tokens issued (plus `-011` members). `unrevokedRows` summed over the run's users must be 0.
- **Redaction and scan:** the job's stdout and `results/load/P6-TW-LOAD-005/` are scanned with `redactForArtefact`'s patterns; a match fails the job before the upload. Only `publicArtefact` output is uploaded.

## CI budget

Job: `task5-reset-token` in `.github/workflows/twenty-load.yml` under `# >>> task5 jobs` (I6).

- **Triggers and guard.** Nightly (`43 3 * * *`, Task 3's cron) and dispatch, never PR (roadmap "Nightly + dispatch"). The guard: `if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'schedule' && github.event.schedule == '43 3 * * *') }}`. The Saturday cron (Task 6) does not start it.
- **Concurrency.** Inherits Task 3's group; the schedule-aware key is requested from Task 3 (cross-plan contradiction 3 in the Task 4 plan).
- **Profile.** `productionLike` (nothing set; §2.12 says user sessions are not limited). This job does not use the functional profile, so it does not need Task 2 or H4.

Job timeout: **100 minutes** (caps sum 90 plus the 10-minute margin). Runner `ubuntu-24.04`. The job copies the Task 3 §2.8 template (15 steps) and adds one gated step for `-011`.

| job               | job timeout | each step and its cap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | sum of step caps | worst case                                                                                                 | margin (>= 10 min) |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ |
| task5-reset-token | 100         | Task 3 §2.8 template: checkout 3; setup-node 3; `npm ci` 5; k6 setup 3; `bootstrap.sh twenty` 3; verify `TWENTY_REF` and that no `API_RATE_LIMITING_*` name is set (names only) 1; `scripts/ci/compose-pull.sh` 6; `npm run up:twenty` with `limiterProfileEnv("productionLike")` (empty) 12; `npm run seed:twenty` 10; `npm run smoke:twenty` 2; `run-load.ts --case P6-TW-LOAD-005 --profile $P6_PROFILE` (background k6, token loop concurrent, oracle, user leak check, `twentyCleanup`) 15; `run-load.ts --case P6-TW-LOAD-011` (gated: the expiry boundary, about 6 minutes of waiting) 15 (`if: gate open`); token scan of `results/` 2; upload the redacted `results/load/` 3; container logs 2; `npm run down:twenty` with `TWENTY_DOWN_VOLUMES=1` 5 (`if: always()`) | 90               | 90 (the `-011` step runs only when its gate is open; a closed gate skips it, and the summary says NOT RUN) | 90                 | **10** |

- No existing timeout changes (C1). Every step has `timeout-minutes` (C2). The down step has `if: ${{ always() }}` (C5).
- The `-011` step's gate is decided by the runner from the DB `expiresAt` before the step; the step's `if:` reads that result.

## Expected output

Under `results/load/P6-TW-LOAD-005/<runId>/` (Task 3 §2.9, on the runner):

- `run-meta.json` (full, private): `{ "case": "P6-TW-LOAD-005", "profile": "full", "limiterProfile": "productionLike", "authMode": "userToken", "tokens": 40, "redeemsPerToken": 3, "expiryS": 300, "twentyRef": "7cbdfec6f346b43715bc2056932f4fad5886f733", "harnessTag": "v0.2.15", "validity": { "verdict": "VALID" }, "environment": { "kind": "github-actions" } }`.
- `verdict.json` (full, private): the runner's fields plus `stages.resetToken` (the `TokenJoin` counts and `-011` counts).
- **Uploaded artefact (redacted, decided):** `publicArtefact(verdict, runMeta)` only. It keeps `caseId`, `runId`, `outcome` (the verdict word), the finding ID when a multi-success result exists, `validity`, environment kind and SHAs. It drops `stages.resetToken`, `tokens`, `redeemsPerToken`, every count, and every token, hash or body. The redacted file is named `verdict-public.json`.
- Job summary (public): `P6-TW-LOAD-005 verdict=<PASS|PRODUCT BUG (SUSPECTED)|INCONCLUSIVE>`; a multi-success result adds "matches P6-TW-RACE-004, see private security report"; `P6-TW-LOAD-011 verdict=<PASS|PRODUCT BUG (SUSPECTED)|INCONCLUSIVE|NOT RUN>`. No count appears anywhere public (Q-DISCLOSE).
- Artefact name `tw-load-005-<run_id>` (the redacted content only), 14-day retention. The token scan runs before the upload.

**Outcome and validity (decided, option b).** Validity decides VALID. A VALID run counts toward the 3 closeout medians whatever its outcome. The verdict is reported separately.

## Environment changes

No environment change. The stack, k6, the harness and the helper scripts come from the existing setup (`npm ci`, `scripts/bootstrap.sh twenty`, `scripts/install-k6.sh`, Docker). This case needs no pin bump. Nothing in `.cursor/` or `.claude/hooks/` changes.

## Build order

Each step runs `npm run check` before every push and prints the unit count.

- **S1. Re-check against the merged Task 3 (its plan and its code on main) and adjust this plan before coding. List every difference and the change it causes in the plan's re-check table. If a difference changes an oracle or a threshold, stop and report it.**
  - Files: this plan only. Commands: `git fetch origin main`, `git show origin/main:docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md`, `grep -n "export" k6/lib/twenty-auth.js k6/journeys/tw-background.js src/load/reconcile/twenty.ts src/twenty/limiter-profile.ts`, `cat .github/workflows/twenty-load.yml`, rows B1–B7.
  - Expected: the re-check table lists each I1–I6 with the real name.
- **S2. Pure oracle, redaction, public artefact (no I/O).** Files: `src/twenty/oracle-reset-token.ts` (pure part), `tests/unit/oracle-reset-token.test.ts`. Command: `node --test tests/unit/oracle-reset-token.test.ts`. Expected: 8 tests pass. Commit: `feat(load): add the one-time token join and the public artefact redaction`.
- **S3. Expiry boundary (pure).** Files: `src/twenty/window-oracle.ts`, `tests/unit/window-oracle.test.ts`. Expected: 5 tests pass (including the before 0 / after 1 fixture). Commit: `feat(load): add the reset token expiry boundary verdict`.
- **S4. DB reads (SQL text checked, no database).** Files: `src/twenty/oracle-reset-token.ts` (SQL functions). Expected: a unit test asserts `hashChangedSql` returns a boolean expression and never selects `"passwordHash"` as a value. Commit: `feat(load): read the hash change as a boolean only`.
- **S5. Token loop.** Files: `src/twenty/reset-token-load.ts` (NEW), a unit test for its pure mapping (no network). Expected: one trial's result has no token-shaped string. Commit: `feat(load): add the reset token loop with counts-only output`.
- **S6. k6 background.** Files: `k6/cases/tw-load-005.js` (NEW). Command: `npm run k6:inspect`. Commit: `feat(load): add the tw-load-005 background case`.
- **S7. Registration lines.** Files: the case registry (`src/load/cases.ts`, entries for `-005` and `-011`) and one per-case hook line in `src/load/reconcile/twenty.ts`. Commit: `feat(load): register P6-TW-LOAD-005 and -011 in the twenty load runner`.
- **S8. Job and README.** Files: `.github/workflows/twenty-load.yml` (`# >>> task5 jobs`, with the guard above), `README.md` (Task 5 sub-marker). Command: `npm run lint:actions`. Commit: `ci(load): add the task 5 reset token job`.
- **S9. Local run (no pin needed).** Commands: `npm run up:twenty`, `npm run seed:twenty`, `node scripts/load/run-load.ts --case P6-TW-LOAD-005 --profile pr`, then `TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. Expected: `results/load/P6-TW-LOAD-005/<runId>/verdict-public.json` has no count key.
- **S10. Full check and push.** `npm run check`. Then `git push -u origin <build branch>`.
- **S11. Owner merge and dispatch.** The owner merges with "Create a merge commit". **As soon as this task merges to main, dispatch 3 runs of the Twenty load workflow on main** (the GitHub web UI, Actions tab, the workflow, "Run workflow", branch `main`, input `profile` = `full`; or the REST dispatch endpoint `POST /repos/<owner>/<repo>/actions/workflows/twenty-load.yml/dispatches` with `ref: main` and `inputs.profile` = `full`). A dispatch runs every Twenty load job of the workflow; a per-case input is requested from Task 3. Record the run URLs in the Task 8 closeout input list only (no counts in the PR body). If the dispatch returns 403, write it as an owner step with the exact web UI clicks and carry on.

**Build-session parallelism note:** Tasks 4, 5 and 6 build in parallel. Each merges separately. The second and third PR run `git merge origin/main` and keep the other tasks' jobs under their markers.

## Extra risky cases

Each is labelled **EXTRA**, has no P6 id, and enters the build only if the budget still fits.

| case                                                              | question                                                                    | oracle                                                                                                                                                            | cost                 | status                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------- |
| EXTRA-T5-1 sequential replay after a success                      | after one success, does a later redemption of the same token still succeed? | every later redemption is refused (4xx, no 200 with success)                                                                                                      | 2 requests per token | NOT PROBED; build-time                        |
| EXTRA-T5-2 redeem racing a second reset request for the same user | after a second reset request, does the older token stop working?            | the older token is refused and the newer one is accepted, once                                                                                                    | 2 tokens per user    | NOT PROBED; build-time                        |
| EXTRA-T5-3 token of user A, identity of user B                    | can a token for user A change user B's password?                            | the redemption call has no identity field (`redeemResetToken` takes the token and the new password only, `src/twenty/api.ts:131–137`); user B's hash is unchanged | 1 extra user         | NOT PROBED; the API shape is read from source |
| EXTRA-T5-4 malformed token                                        | is the error code stable and is there no stack trace in the body?           | a 4xx or GraphQL error with a code; no `stack` key in the body                                                                                                    | 3 requests           | NOT PROBED; build-time                        |

## Risks, roadmap conflicts and open decisions

### Roadmap conflicts

| roadmap says                                                                                                    | probe shows                                                                | decision or open question                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Task 5 "Files likely touched": `src/twenty/oracle.ts` (hash-change and token queries)                           | the ownership table gives Task 5 a NEW file and append-only `mailpit.ts`   | New file `src/twenty/oracle-reset-token.ts`.                                                                                |
| Task 5 probe "how to detect hash changed once without reading the hash value"                                   | the existing helper `passwordHashMd5` returns a digest (`oracle.ts:60–65`) | Boolean-only SQL with an in-memory digest (row 8).                                                                          |
| Task 5 probe "whether auth mutations have a stricter limit"                                                     | yes: 3 per 15 min per email (row 5)                                        | Per-user requests stay at 1; `-011` adds 1.                                                                                 |
| Task 5 probe "throwaway-user cleanup"                                                                           | not probed (row 10)                                                        | Run-scoped stack and count-based leak check (Q5).                                                                           |
| Task 5 probe "token expiry at image defaults (gate for -011)"                                                   | 300 s (row 2)                                                              | Gate **open**; `-011` built.                                                                                                |
| roadmap Task 5 "Depends on Task 2" and Phase 5 D3 ("Tasks 4 and 5 run on the functional profile")               | the user session is not limited by the API speed limiter (Task 3 §2.12)    | This case runs on the `productionLike` profile and needs Task 3a only (review fix 8). D3 is superseded for Task 5 by §2.12. |
| roadmap line 408–409: a multi-winner result is counted under the same finding ID and "records the rate vs load" | the probe matched `P6-TW-RACE-004` (row 7)                                 | Counted under the ID only; the rate vs load is withheld from every public surface (Q-DISCLOSE, decided).                    |
| roadmap "CI change: nightly + dispatch"                                                                         | no Twenty LOAD job exists                                                  | Job in `twenty-load.yml`; nightly and dispatch only.                                                                        |
| roadmap "Done when: ≥ 3 VALID nightly runs"                                                                     | the public record is verdict-only and redacted                             | The run URLs are the public record; counts stay in the private report.                                                      |

### Decided answers (owner, 2026-10-29)

- **Q-DISCLOSE: DECIDED.** Verdict word and finding ID only, until the vendor replies. No counts in any public summary, job summary, release note or dashboard. The uploaded artefact is redacted (`publicArtefact`). Counts stay in the private report.
- **VALID (Q7): DECIDED as option (b).** A run is VALID when its validity is VALID on github-actions, whatever the outcome. This contradicts Task 3 §2.11.
- **Auth: DECIDED (Task 3 §2.12).** 005 and 011 use a user session. This plan follows it.

### Open decisions (not yet decided)

- **Q1. Redemptions per token.** N = 3 (roadmap "N times in parallel"). **Recommendation: keep 3.**
- **Q2. Tokens per run.** 40 tokens over 300 s. **Recommendation: keep**, because row 4 shows mail throughput well inside it.
- **Q3. `-011` placement.** Same job (its 15-minute step is inside the cap). **Recommendation: keep.**
- **Q4. Member cleanup.** Run-scoped stack with a count-based leak check (no delete mutation probed). **Recommendation: keep** (B5 re-checks at build).
- **Q5. "Hash changed exactly once" derivation.** The success count plus the boolean change (no DB writes allowed). **Recommendation: keep.**
- **Q6. Public artefact keys.** The whitelist in `publicArtefact` (verdict word, finding ID, validity, environment kind, SHAs). Owner review of the whitelist before the first merge is recommended.

### Cross-plan contradictions (Task 3 must change; this plan cannot decide them)

1. Task 3 §2.11: change VALID to validity-based (owner decided option b).
2. Task 3 §6.8: add a per-case `case` dispatch input, or accept that dispatch runs every job of the workflow.
3. Task 3 §6.8: the concurrency group must key the schedule branch on `github.event.schedule`.

### Risks

- The Q-DISCLOSE redaction is only as good as the whitelist and the token scan. A test (fixture 8) covers the whitelist; the scan covers stdout.
- Token mail latency under load: row 4 says mails arrive in under 0.5 s, but load could slow the worker. The 5-minute spread and the 60 s slack cover that; B4 re-checks.
- A token could expire mid-run (roadmap line 430): each token is redeemed within seconds of its request, far inside 300 s.

## Done when

Roadmap "Done when" (lines 425–428), adjusted only by the decided answers:

- ≥ 3 VALID nightly runs (validity VALID on github-actions, any outcome) on `main`. The public record is the three run URLs and the verdict word; a multi-success result is named by ID only.
- `-011` lands (≥ 3 VALID runs on the gate-open job) or is in "Later" with its gate evidence (row 2 and the gate section).
- No token, hash, count or redemption body in any public artefact, log or summary (the scan, `publicArtefact` and `redactForArtefact` tests).
- `npm run check` green on the build PR.

### Rule self-check (section 0 of the planning prompt; rule F.20)

- N1–N5: met (every step ran without a pause; the progress log is outside the repo).
- R1–R8: met (GitHub MCP tools; plain git; explicit paths; no force push; no merge; no PR comments; owner steps use web UI wording only). Owner names are not written in repo text: the S11 endpoint uses `<owner>/<repo>`.
- O1–O8: met for this plan file. **O5:** `P6-TW-RACE-004` is named by ID only, with "private security report". No mechanism, count, rate, timing, reproduction or endpoint detail appears in this plan. The consume path is not described; the redemption call is named by its helper only.
- P1–P5: met (probes before design; products started and stopped through `npm run up:twenty` and `npm run down:twenty`; no process killed; timings not published).
- C1–C5: met (no timeout raised; every step capped; margin 10; down step with `if: always()`).
- E1: met ("No environment change" with the reason).
- H1–H8: no hard stop hit by this plan. The cross-plan contradictions are reported, not decided here.
