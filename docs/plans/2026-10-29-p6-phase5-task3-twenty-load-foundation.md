# P6 Phase 5 Task 3: Twenty load foundation (plan only)

This plan changes nothing in the repo except this file. It is a junior-engineer guide: a builder follows it
in order, runs the checks it names, and stops where it says to stop. Scope source: the Phase 5 roadmap
[2026-10-22-p6-phase5-roadmap.md](2026-10-22-p6-phase5-roadmap.md), "Task 3" (lines 312–366), "Task 4" to "Task 6"
(lines 367–464, read for what they need from this task), decisions D1–D11 (lines 533–575). Rules and their
numbering come from [docs/agent-rules.md](../agent-rules.md) and the planning rules in the task prompt.

## 1. Header

- **Title.** P6 Phase 5 Task 3: Twenty load foundation (plan only).
- **Date.** 2026-10-29 (Asia/Colombo).
- **Plan branch.** `plan/2026-10-29-p6-phase5-task3` (one plan PR, see §17).
- **Build branch (roadmap pattern).** `feat/2026-10-29-p6-twenty-load-foundation` (the build date may move; the
  build session uses the date it starts). Two PRs if Q2 is accepted: `feat/<date>-p6-twenty-load-foundation` (3a) and
  `feat/<date>-p6-twenty-load-functional` (3b).
- **Mapped case IDs.** `P6-TW-LOAD-010` (gated), `P6-TW-LOAD-008` (gated). Foundation work has no P6 ID; its run
  label is `TW-BG-FOUNDATION` (Q3). Retired IDs `P6-TW-LOAD-001`, `-002`, `-003` stay retired and are never reused.
- **Roadmap section.** Phase 5 roadmap, "Task 3: Twenty load foundation", lines 312–366; decisions D2, D3, D6, D7,
  D11 at lines 533–575.
- **Base SHA of `main`.** `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29T03:48:13Z = 09:18 Asia/Colombo). The
  commit subject is `merge(main): clear the pending list after p6-phase4c (#160)`.
- **Harness pin on main.** `qa-portfolio-harness` `v0.2.15` (`package.json:63`). H4 is not tagged yet.
- **Baseline unit count (B0).** 1405 (measured 2026-10-29 with `npm run check`; the prompt's 1403 is stale).
- **Environment change.** No (§13). The probe ran in this Claude Code cloud session without any change.
- **Stop for owner review.** Yes, under agent rule 10: the task adds a CI workflow and shared runner files (Q1, Q4).

## 2. Interfaces for Tasks 4–6

This section is frozen once the plan branch is pushed (commit `docs(plans): add the phase 5 task 3 plan`). Tasks 4, 5
and 6 build against exactly these names. A change here needs an owner note in the plan PR. Every name below is NEW
unless it says "existing".

### 2.1 k6 auth helper: `k6/lib/twenty-auth.js` (NEW)

```js
// k6/lib/twenty-auth.js
export function authorizationHeader() {
  // Returns "Bearer <token>" from __ENV.TWENTY_TOKEN (a secret env name, see 2.3). Throws when absent.
  // Throws: Error("TEST BUG: TWENTY_TOKEN is not set"). Never logs the value.
}
export function signInWithPassword({ baseUrl, email, password, workspaceName }) {
  // Standalone path for `k6 run`. Two GraphQL calls on `${baseUrl}/metadata`: signIn, then getAuthTokensFromLoginToken,
  // the same order as src/twenty/auth.ts signInWorkspace (existing, lines 47–75 region). Returns "Bearer <token>".
  // Throws: Error("TEST BUG: <GraphQL message>") with messages only, never a body.
}
export function restHeaders(authorization) {
  // Returns { Authorization: authorization, "Content-Type": "application/json" }.
}
```

The runner side (TypeScript, not k6) mints the token in the setup stage with the existing `signInWorkspace()` from
`src/twenty/auth.ts` (existing) and passes it to the k6 process as `TWENTY_TOKEN` through `K6RunSpec.secretEnv`
(`src/load/types.ts` line 37 region, existing mechanism used by Documenso's `DOCUMENSO_API_TOKEN`).

### 2.2 Background journey: `k6/journeys/tw-background.js` (NEW)

```js
// k6/journeys/tw-background.js
export function runTwBackground(cfg, opts = {}) {
  // cfg: { baseUrl: string, prefix: string } (prefix = caseDataPrefix(runPrefix, caseId), k6/lib/pure/prefix.js:19).
  // One iteration: create one company, read it back, patch its name once, read it back. Names are `${prefix}-${n}-${side}`.
  // Returns: { created: string[], patched: number, serverErrors: number }.
  // Counters (k6/metrics): p6_tw_created (one per 2xx create), p6_tw_updated (one per 2xx patch),
  //   p6_tw_5xx (one per status >= 500). The reconcile stage reads p6_tw_created from the k6 summary.
}
```

### 2.3 Case script composition: `k6/cases/tw-background.js` (NEW)

The case script follows `k6/cases/doc-load-001.js`: it reads `P6_LOAD_CONFIG` (`loadLoadConfig`, `k6/lib/config.js:9`),
builds `standardOptions` and `openModelScenario` (`k6/lib/pure/options.js:37`, `:120`), calls `clockHooks`
(`k6/lib/markers.js:47`) and calls `runTwBackground(cfg, {})` from its `journey()` export. The token comes from
`TWENTY_TOKEN` only (never from the config file). The defaults in the file equal `k6/cases/tw-background.example.json`.

### 2.4 Case registry entry: `src/load/cases.ts` (registration lines) and `LoadCase` (`src/load/types.ts:88`, existing)

```ts
export const TW_BG_FOUNDATION: LoadCase = {
  id: "TW-BG-FOUNDATION", // Q3: no P6 ID; the foundation is not a mapped case
  title: "Twenty background journey (foundation)",
  product: "twenty",
  label: "functional load, not capacity",
  telemetry: { product: "twenty" },
  profiles: {
    pr: { rate: 1, durationSec: 30, maxLatencyMs: 4000 },
    full: { rate: 2, durationSec: 120, maxLatencyMs: 4000 },
  },
  runs: () => [
    { label: "main", script: "k6/cases/tw-background.js", env: {}, secretEnv: ["TWENTY_TOKEN"] },
  ],
  stages: { setup: twentySetup, reconcile: reconcileStage, cleanup: twentyCleanup },
};
```

`twentySetup` and `twentyCleanup` are exported from `src/load/products/twenty.ts` (NEW, §6.5). The case is added to
`CASES` (`src/load/cases.ts:1462`, existing) with one registration line. The gated cases `P6-TW-LOAD-008` and
`P6-TW-LOAD-010` are registered with `gated: true` (a new optional field on `LoadCase`, Q4); `scripts/load/run-load.ts`
refuses a gated case with `ENV: case <id> is gated (NOT RUN)` (Q4).

### 2.5 Reconcile hook: `src/load/reconcile/twenty.ts` (NEW)

```ts
export interface TwentyAuditConfig {
  product: "twenty";
  prefixLike: string; // "<prefix>%", the LIKE pattern of the run's names
  schema: string; // "workspace_<base36>", from resolveWorkspaceSchema (src/twenty/oracle.ts)
}
export async function reconcileTwenty(
  pool: pg.Pool,
  cfg: TwentyAuditConfig,
  clientCount: number | undefined,
): Promise<AuditResult>;
// clientCount = the k6 counter p6_tw_created. Returns the AuditResult shape of src/load/reconcile/types.ts (existing).
```

Registration (one line each, `src/load/reconcile/index.ts`, existing): a `case "twenty":` in the `reconcile()` switch
(line 75 region) and `twenty: "p6_tw_created"` in `CLIENT_COUNTER` (line 54). A case that needs more checks composes
its own stage the way `conservationStage` is composed: `composeStages([reconcileStage, myStage])`.

### 2.6 Limiter profile: `src/twenty/limiter-profile.ts` (NEW)

```ts
export const LIMITER_PROFILE_NAMES = ["functional", "productionLike"] as const;
export type LimiterProfileName = (typeof LIMITER_PROFILE_NAMES)[number];
export const functional: Readonly<Record<string, string>>; // the six names and values in §6.3
export const productionLike: Readonly<Record<string, string>> = {}; // image defaults: nothing set
export function limiterProfileEnv(name: LimiterProfileName): Record<string, string>;
// Returns a copy of the chosen map. Throws Error("TEST BUG: unknown limiter profile <name>") for any other name.
```

The workflow passes the chosen map to the `up:twenty` step as `env:` entries before `npm run up:twenty`, and the runner
writes the name to `run-meta.json` as `limiterProfile` (Q4 adds the field to `RunMeta`).

### 2.7 Twenty load CI home (Q1 result: option b, a new workflow)

- File: `.github/workflows/twenty-load.yml` (NEW). Job id: `twenty-load-foundation` (3a). Its job template is §2.8.
- Markers, in this order and each followed by one unchanged blank line, at the end of the file:
  `# >>> task4 jobs`, `# >>> task5 jobs`, `# >>> task6 jobs`. The three build sessions append their jobs under their own marker.
- The workflow id is added to `EVIDENCE_WORKFLOW_IDS` (`pages.yml:30`, `evidence-release.yml:39`) and to
  `tests/unit/evidence-release-ids.test.ts` in a separate `ci(evidence)` PR after the first `main` run (the id exists only then).

### 2.8 Job template (every Twenty load job copies this shape)

Steps, in order, with the `timeout-minutes` cap of each. The job timeout is the sum of the caps plus 10 (rule C3).

| #   | step                                                                 | cap (min) | what it does                                   |
| --- | -------------------------------------------------------------------- | --------- | ---------------------------------------------- |
| 1   | checkout (P6 into `p6/`, `persist-credentials: false`)               | 3         | same as `perf.yml` twenty-smoke                |
| 2   | setup-node (`.nvmrc`, npm cache)                                     | 3         | same as `perf.yml`                             |
| 3   | `npm ci` in `p6/`                                                    | 5         | P6 dependencies, pinned by `package-lock.json` |
| 4   | k6 setup (pinned action SHA from `perf.yml`, `.k6-version`)          | 3         | the k6 pin                                     |
| 5   | `bash scripts/bootstrap.sh twenty` with `BOOTSTRAP_SKIP_INSTALL=1`   | 3         | clones the fork at `TWENTY_REF`                |
| 6   | verify `TWENTY_REF` against `bootstrap.sh`                           | 1         | same guard as `perf.yml`                       |
| 7   | `scripts/ci/compose-pull.sh -p qa-harness-twenty`                    | 6         | image pull, 3 tries                            |
| 8   | `npm run up:twenty` with the chosen limiter profile as `env:`        | 12        | the Twenty stack                               |
| 9   | `npm run seed:twenty`                                                | 10        | seed                                           |
| 10  | `npm run smoke:twenty`                                               | 2         | `GET /healthz`                                 |
| 11  | `node scripts/load/run-load.ts --case TW-BG-FOUNDATION --profile <pr | full>`    | 10                                             | the LOAD run (one k6 process) |
| 12  | token scan of `results/` (the `perf.yml` pattern)                    | 2         | no token value in any uploaded file            |
| 13  | upload `results/load/` artefact (14-day retention)                   | 3         | `actions/upload-artifact`                      |
| 14  | capture container logs (`docker compose … logs`)                     | 2         | `results/twenty/containers.log`                |
| 15  | `npm run down:twenty` with `TWENTY_DOWN_VOLUMES=1`, `if: always()`   | 5         | removes volumes (C5)                           |

Sum of caps 70; job timeout 80 (margin 10). Measured on 2026-10-29 in this session (not published): pull 26 s, bootstrap
12 s, up 127 s, seed 76 s, smoke under 1 s. Every cap is at least 2× the measured time.

### 2.9 Result files and verdict fields

Under `results/load/TW-BG-FOUNDATION/<runId>/` (the existing runner layout, `src/load/paths.ts`):
`verdict.json`, `run-meta.json`, `k6-main-summary.json`, `k6-main.json.gz`, `k6-main.log`, `telemetry-main.json`,
`telemetry-main.csv`, `chart-main.html`, `audit.json`. New content, no new file names: `telemetry-main.json` gains a
`containers` array (one entry per Twenty container: `name`, `role`, `samples`), and `run-meta.json` gains
`limiterProfile`.

`verdict.json` (schema 1, existing writer `writeVerdictFile` in `src/load/runner.ts`): `caseId`, `runId`, `profile`,
`label`, `outcome` (`PASS` | `FAIL` | `INVALID` | `ENV`), `reasons[]`, `invalid[]`, `validity { verdict, reasons }`,
`k6[]`, `runMeta`, `stages {…}`. The reasons are counts and ids only.

### 2.10 Cleanup sweep and leak check

`twentyCleanup(ctx)` (NEW, `src/load/products/twenty.ts`) sweeps every company whose name starts with the run prefix
(live and soft-deleted), then runs the leak check `companyRowsByPrefix(pool, schema, prefix)` (existing,
`src/twenty/oracle.ts`). The leak check must return 0; any other value is a TEST BUG and fails the job.

### 2.11 Run-label rule (P6-RULE-003)

A run counts as VALID only when `verdict.json` has `outcome: "PASS"` and `validity.verdict: "VALID"`, and
`run-meta.json` has `environment.kind: "github-actions"`. Medians come only from at least 3 VALID runs, computed by the
owner. The verdict and the job summary name the profile (`functional` or `productionLike`) and the case label.

## 3. What it proves

One paragraph per mapped case, then the foundation.

**`TW-BG-FOUNDATION` (foundation, not a P6 case).** Twenty can be load-tested through the existing LOAD runner: the
runner mints a workspace token, a background journey writes and reads prefixed companies at a fixed rate, container and
database telemetry is sampled, and the post-load audit reconciles every created row. The question is whether the
pipeline is valid end to end on the image defaults, with zero 429 and zero 5xx. Oracle: created intents equal the
database rows with the run prefix; patched intents equal rows whose `updatedAt` is later than `createdAt`; no status
5xx; no leftover prefixed row after cleanup. Verdicts: PASS (all four hold, k6 thresholds hold), FAIL (a PRODUCT BUG or
TEST BUG, with the evidence in `reasons`), INVALID (the validity judge flags dropped iterations, a telemetry gap or a
clock skew), ENV (setup failed before load). This is a functional-load label: it is not a capacity claim.

**`P6-TW-LOAD-010` (gated, worker queue drain).** After a write burst on the background journey, the BullMQ backlog of
the Twenty worker must drain. The question is how long the backlog takes to reach zero. Oracle: sample the queue
lengths every second with read-only Redis commands (`LLEN` of `:wait` and `:active`, `ZCARD` of `:delayed`, the
pattern in §5.6). Verdicts: PASS (the backlog reaches zero inside the drain window, and the drain time is recorded),
FAIL (the backlog never reaches zero inside the window; a PRODUCT BUG candidate, SUSPECTED until it repeats, rule 13),
INVALID (the monitor could not read the queue more than once in five seconds), NOT RUN (the gate is closed, §12). The
drain window is a bound for the wait, not a latency target; the build records it from its own probe (Q6).

**`P6-TW-LOAD-008` (gated, Twenty knee).** The Phase 4 breakpoint method on the background journey, on the functional
profile, reported as a step range (`P6-RULE-006`). The question is at what rate the system stops keeping up. Oracle:
the Phase 4 knee stop rule, unchanged. Verdicts: a step range with the stop reason, or PASS when the stop rule ends the
run and the limiter did not (the limiter-caused stop is recorded as a finding, not a result). NOT RUN until its gate
opens (§12, Q7).

## 4. Live probe evidence

Every probe below ran in this session on 2026-10-29 (Asia/Colombo, approximately 11:35–12:40), through the harness
(`npm run up:twenty`, `seed:twenty`, `smoke:twenty`, `down:twenty`) or as read-only commands against the running stack.
Nothing was written to the Twenty database. Secrets: the harness dev credentials were read in memory only; no token,
password, hash or pk key was printed. Timings are session facts (rule P4), not published numbers.

| #   | fact                                                                                | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                                                                                                  | what it changes in the design                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Twenty fork is at `TWENTY_REF` `7cbdfec6…`                                          | `bash scripts/bootstrap.sh twenty` exit 0 in 12 s; `git -C /home/user/products/twenty-CRM rev-parse HEAD` = `7cbdfec6f346b43715bc2056932f4fad5886f733`. The fork is public; `add_repo` returned read access without attaching.                                                                                                                                                                                                                                                      | The job template clones the fork exactly as `perf.yml` does (§2.8).                                                                                                                  |
| P2  | Image pull through the CI helper                                                    | `scripts/ci/compose-pull.sh -p qa-harness-twenty -f docker-compose.yml -f <overlay>` exit 0, 26 s; `Image twentycrm/twenty:v2.44.0 Pulled`.                                                                                                                                                                                                                                                                                                                                         | Pull cap 6 min is enough (§2.8 step 7).                                                                                                                                              |
| P3  | `npm run up:twenty` starts 5 containers, healthy in 127 s                           | exit 0, 127 s. `docker ps` after up: `qa-harness-twenty-server-1` (healthy), `-worker-1`, `-db-1` (healthy), `-redis-1` (healthy), `-mailpit-1` (healthy). App `http://127.0.0.1:3002/healthz` HTTP 200 (harness output).                                                                                                                                                                                                                                                           | Up cap 12 min (§2.8 step 8). Container names are `qa-harness-twenty-<service>-1`.                                                                                                    |
| P4  | Seed creates the workspace and four users                                           | `npm run seed:twenty` exit 0, 76 s; output `twenty seed: created=true users=4`.                                                                                                                                                                                                                                                                                                                                                                                                     | Seed cap 10 min (§2.8 step 9). Seed workspace subdomain `apple`, display name `Apple` (`src/twenty/env.ts` defaults).                                                                |
| P5  | Health smoke passes                                                                 | `npm run smoke:twenty` exit 0, `5/5 shared iters`.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Step 10 unchanged.                                                                                                                                                                   |
| P6  | Auth for k6: sign-in then workspace token exchange works; token length and lifetime | `signInWorkspace` (`src/twenty/auth.ts`, existing) on `http://127.0.0.1:3002`: token length 668 (length only); JWT claims `sub,userId,workspaceId,workspaceMemberId,userWorkspaceId,type,authProvider,isImpersonating,iat,exp`; `exp - iat` = 1800 s. Token lifetime from `ACCESS_TOKEN_EXPIRES_IN = '30m'` (`config-variables.ts:348`).                                                                                                                                            | The runner mints the token in setup (not an API key, Q10). Runs longer than about 25 min need a re-sign-in (Q12).                                                                    |
| P7  | An invalid bearer is refused with 401                                               | `curl -H 'Authorization: Bearer invalid.token.value' http://127.0.0.1:3002/rest/companies?limit=1` → HTTP 401.                                                                                                                                                                                                                                                                                                                                                                      | The error-code extra (§11, EXTRA-C) expects 401 and never 500.                                                                                                                       |
| P8  | Limiter at image defaults, user workspace token, 150 requests                       | Probe script (scratchpad, not in repo): 100 × `GET /rest/companies?limit=1` → `{"200":100}`; 30 × `POST /graphql` companies → `{"200":30}`; 20 × `POST /metadata currentUser` → `{"200":20}`. No `retry-after` or `x-ratelimit-*` header on any response; no error code.                                                                                                                                                                                                            | At image defaults the user-token path is not rate-limited in this burst. The roadmap's "every run is limited at 100/min" does not hold for user tokens (§10, conflict 1).            |
| P9  | Limiter state: no speed keys after the burst                                        | `docker compose -p qa-harness-twenty … exec -T redis redis-cli --scan --pattern '*speed*' \| wc -l` → `0`. `DBSIZE` 523; key prefixes `bull` 333, `engine` 189, `module` 1.                                                                                                                                                                                                                                                                                                         | The limiter writes only for buckets that exist; a user token creates none (source: `usage-limit-speed.service.ts` `consumeTokens` runs only when buckets exist).                     |
| P10 | Which spenders the limiter binds (source)                                           | `usage-limit-definitions.constant.ts:15` (`spenderType: 'apiKey'`), `:19–21` (`API_RATE_LIMITING_SHORT_TTL_IN_MS`, `…_SHORT_LIMIT`, `perWorkspace`), `:28–34` (`…_LONG_*`, overridable), `:41` (`spenderType: 'application'`), `:45–47` (`APPLICATION_API_RATE_LIMITING_TTL_IN_MS`, `…_LIMIT`, `crossWorkspace`). There is no default for `userWorkspace`. `build-speed-buckets.util.ts:67` filters defaults by spender type.                                                       | Only API-key and application clients are limited. The functional profile matters for API-key clients only (§6.3, conflict 2).                                                        |
| P11 | Headers and status on a limiter hit (source, NOT PROBED live)                       | `build-rate-limit-response-headers.util.ts:10–13`: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. REST maps the limit to 429: `usage-limit-to-rest-api-exception-handler.util.ts:22`. GraphQL maps the code with `usageLimitToGraphqlApiExceptionHandler` (`usage-limit-graphql-api-exception.filter.ts:27`).                                                                                                                                    | Task 6 needs these; a 429 needs an API key, which is a write, so it is not probed here (NOT PROBED, §5 re-check 6).                                                                  |
| P12 | Limiter state location and reset                                                    | Redis 8.10.3 service `redis` (`packages/twenty-docker/docker-compose.yml:128`, no volume: `docker inspect` Mounts empty). Key shape from `build-speed-bucket-key.util.ts:28`: `{<workspaceId>}:speed:<resourceType>:<operationType>:<spenderType>:<spenderId                                                                                                                                                                                                                        | ->:<windowSec>`. Script `usage-limit:try-consume-token-buckets` (`try-consume-token-buckets-script.constant.ts:7`). `down:twenty` removed the Redis container, so its state is gone. | A fresh `up` starts with empty limiter state, so Task 6 needs no Redis flush and P6 never writes Redis (Q9). |
| P13 | The limiter fails open                                                              | `usage-limit-speed.service.ts:154` and `:166` return `fullAdmission` when the cache store fails (`CacheStorageException`).                                                                                                                                                                                                                                                                                                                                                          | A 500 cannot come from the limiter; a Redis outage shows as no 429 (noted for Task 6).                                                                                               |
| P14 | Speed limiter binds only root query-runner operations                               | `common-base-query-runner.service.ts:135–136`: `consumeApiSpeedLimit` runs when `isRootOperation`. `/metadata` auth calls do not go through it.                                                                                                                                                                                                                                                                                                                                     | Auth calls are not limited by the API speed limiter (matches P8's auth-path burst).                                                                                                  |
| P15 | Auth-path throttle exists for password reset                                        | `auth.resolver.ts:126–127`: `PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX = 3`, window 15 min; `:1127–1131` `tokenBucketThrottleOrThrow('password-reset-email:<email>', …)`.                                                                                                                                                                                                                                                                                                                 | Task 5 must request each reset at most three times per email per 15 min (cross-task note, §10).                                                                                      |
| P16 | Captcha is off when no driver is set                                                | `captcha-driver.factory.ts:27–28`: `if (!driver) return 'disabled'`. `CaptchaGuard` is on `emailPasswordResetLink` (`auth.resolver.ts`). Whether `validate()` passes when disabled: NOT PROBED.                                                                                                                                                                                                                                                                                     | Cross-task note for Task 5 only.                                                                                                                                                     |
| P17 | Password reset token expiry                                                         | `config-variables.ts:143`: `PASSWORD_RESET_TOKEN_EXPIRES_IN = '5m'`. `reset-password.service.ts:106–117` computes `expiresAt` from it.                                                                                                                                                                                                                                                                                                                                              | The `P6-TW-LOAD-011` gate (expiry ≤ 15 min) looks open for Task 5 (cross-task note, §10).                                                                                            |
| P18 | Queue is BullMQ on Redis; queue keys readable with read-only commands               | `BullMQDriver` (`src/engine/core-modules/message-queue/drivers/bullmq.driver.ts`, fork); `docker compose … exec -T redis redis-cli --scan --pattern 'bull:*'` → 333 keys: `bull:cron-queue:repeat` 77, `bull:webhook-queue:metrics`, `bull:workspace-queue:meta`, `bull:workflow-queue:stalled-check`, `bull:workspace-destroy-queue:*`. `:completed` is a sorted set (`ZCARD` 193 and 17). No `:wait` key at idle (empty list = no key).                                           | `P6-TW-LOAD-010` gate: job state is readable without writes through read-only Redis commands (Q6). Redis is not published to the host; the read goes through `docker compose exec`.  |
| P19 | The harness adds no rate-limit env                                                  | `node_modules/qa-portfolio-harness/docker/twenty.compose.yml` has no `API_RATE_LIMITING` (grep returns none). The image env has only `PATH`, `NODE_VERSION`, `NODE_ENV` (`docker image inspect`). `twenty.adapter.ts` passes only `TAG` and `TWENTY_BASE_URL` in the compose env (`composeOpts`).                                                                                                                                                                                   | Process env does not reach the containers today. Setting `API_RATE_LIMITING_*` in the shell is a no-op until H4 (Task 1) is tagged and pinned (Q5).                                  |
| P20 | The Twenty DB container is not found by the existing discovery                      | `src/load/telemetry/cgroup-stats.ts:54` filters `name=qa-harness-${product}-postgres`. Live: `docker ps --filter name=qa-harness-twenty-postgres` → 0 lines; `--filter name=qa-harness-twenty-db` → 1 line.                                                                                                                                                                                                                                                                         | The container source of the sampler stays absent unless the filter gets a Twenty pattern (Q4).                                                                                       |
| P21 | `docker stats` is too slow to sample every second                                   | `docker stats --no-stream --format '{{json .}}' qa-harness-twenty-server-1` → 1037 ms for one container; the four-container call averaged 2029 ms over 3 calls. `cgroup-stats.ts:86–88` already calls it "the slow fallback".                                                                                                                                                                                                                                                       | docker-stats.ts reads cgroup files instead (P22, P23), not `docker stats`.                                                                                                           |
| P22 | cgroup v1 file reads are cheap                                                      | Host is cgroup v1 (`stat -f -c %T /sys/fs/cgroup` → `tmpfs`; `blkio`, `cpu`, `cpuacct`, `memory` dirs). `/sys/fs/cgroup/memory/docker/<id>/memory.usage_in_bytes` read: 874188800 for the server. 20 reads: 35 ms. Paths in `cgroup-stats.ts:17–20`.                                                                                                                                                                                                                                | docker-stats.ts reads v1 files per container (server, worker, db).                                                                                                                   |
| P23 | `/proc/<pid>` of a container is readable on the host                                | `docker inspect -f '{{.State.Pid}}' qa-harness-twenty-server-1` in 27 ms; `/proc/<pid>/status` → `VmRSS: 846304 kB`, `Threads: 11`; `/proc/<pid>/fd` count 38.                                                                                                                                                                                                                                                                                                                      | Process-level fds and threads for each container come from `/proc` (GitHub-hosted runner: NOT PROBED, §5 re-check 9).                                                                |
| P24 | Reconcile sources: tables, columns, counts                                          | Read-only SQL through `createReadOnlyPool` on `127.0.0.1:5434` (the repo's oracle pool, `src/oracles/pg.ts`): `resolveWorkspaceSchema(pool,'apple')` resolves a `workspace_<base36>` schema. `workspace.company` columns include `id, createdAt, updatedAt, deletedAt, name`; company rows: total 599, live 599, with `updatedAt` 599. `core."apiKey"` total 1, active 1. `core."appToken"` by type: `REFRESH_TOKEN` 2, no `PASSWORD_RESET_TOKEN` at seed time. `core."user"` 1005. | The reconcile for the background journey counts `company` rows by name prefix and `updatedAt > createdAt`. Token checks belong to Task 5.                                            |
| P25 | The oracle pool refuses non-SELECT queries                                          | `src/oracles/pg.ts:39` `assertSelectOnly` threw `TEST BUG: oracle query is not SELECT-only` for `SHOW shared_preload_libraries`. A write attempt in a rolled-back transaction gave SQLSTATE `25006` (`readOnlyWriteSqlstate`, `src/twenty/oracle.ts`).                                                                                                                                                                                                                              | Reads for the Twenty oracle use `SELECT current_setting(...)`. The read-only guard works.                                                                                            |
| P26 | Harness H1 is not active on this stack                                              | `SELECT current_setting('shared_preload_libraries')` → empty; `pg_stat_statements` not installed (`pg_extension` count 0).                                                                                                                                                                                                                                                                                                                                                          | Not a Task 3 concern; it is the Task 2 starting state (noted in §10).                                                                                                                |
| P27 | Image facts (one-shot read-only containers, no server started)                      | `docker image inspect twentycrm/twenty:v2.44.0`: `Entrypoint ["/app/entrypoint.sh"]`, `Cmd ["node","dist/main"]`, `User 1000`, `WorkingDir /app/packages/twenty-server`. `docker run --rm --entrypoint node … -v` → `v24.19.0`. `tail -3 /app/entrypoint.sh` ends with `exec "$@"`. No `NODE_OPTIONS` in the image env.                                                                                                                                                             | Consistent with roadmap Note 3 (H2 feasible in principle). Nothing in this task needs H2.                                                                                            |
| P28 | Mailpit is reachable and empty                                                      | `GET http://127.0.0.1:8025/api/v1/messages` HTTP 200, `"total":0`.                                                                                                                                                                                                                                                                                                                                                                                                                  | Mailpit is not needed by the background journey (Task 5 uses it).                                                                                                                    |
| P29 | Token scope for the seeded admin                                                    | `signIn` returned `availableWorkspaces` with the seeded workspace; `getAuthTokensFromLoginToken` exchanged it (`src/twenty/auth.ts` `signInWorkspace`). The harness's own `authenticate()` picks `workspaces[0]` (`twenty.adapter.ts:258–`), P6's helper picks by display name (`src/twenty/auth.ts` `pickWorkspace`).                                                                                                                                                              | The k6 helper picks by name and fails loudly when the name is missing (TEST BUG).                                                                                                    |
| P30 | `docker compose down` with `TWENTY_DOWN_VOLUMES=1` leaves nothing                   | `npm run down:twenty` exit 0, 3 s; containers left for project `qa-harness-twenty`: 0; volumes left: 0.                                                                                                                                                                                                                                                                                                                                                                             | Matches CI's `TWENTY_DOWN_VOLUMES: "1"` (`perf.yml:1786` pattern).                                                                                                                   |
| P31 | Pre-existing CI budget arithmetic                                                   | `perf.yml` `twenty-smoke` (lines 1777–1967): 17 step caps summing to 95 min against `timeout-minutes: 20` (line 1781). `twenty-races` (1971) and `twenty-obs` (2151) have the same shape.                                                                                                                                                                                                                                                                                           | The roadmap's "LOAD step inside twenty-smoke" does not fit C3 (§10, conflict 3).                                                                                                     |
| P32 | Existing `package.json` has one npm script per LOAD case                            | `package.json:35–58` (`load:*` lines). Lane A's Task 2 owns `package.json` for the pin only.                                                                                                                                                                                                                                                                                                                                                                                        | The workflow calls `node scripts/load/run-load.ts --case …` directly; this plan adds no npm script (§6.5, conflict 6).                                                               |
| P33 | Evidence workflow ids                                                               | `pages.yml:30` and `evidence-release.yml:39`: `EVIDENCE_WORKFLOW_IDS: "376454455 396253729 397232763 398161444"`; `tests/unit/evidence-release-ids.test.ts:8` asserts four ids.                                                                                                                                                                                                                                                                                                     | A new workflow needs its own `ci(evidence)` PR after its first `main` run (§2.7).                                                                                                    |
| P34 | Harness pin and overlay                                                             | `package.json:63`: `"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.15"`. The overlay (`docker/twenty.compose.yml`) has no passthrough, no `NODE_OPTIONS`, `TAG` default `v2.44.0`.                                                                                                                                                                                                                                                                             | Same as P19.                                                                                                                                                                         |
| P35 | Baseline `npm run check` on `main`                                                  | `npm run check` exit 0; `# tests 1405`, `# pass 1405`, `# fail 0` (`$HOME/check-b0.log`).                                                                                                                                                                                                                                                                                                                                                                                           | B0 = 1405 (§14).                                                                                                                                                                     |

NOT PROBED items (each has a build-time re-check in §5): a 429 response with the headers (needs an API key, P11); the
`apiKey` and `application` keying with two credentials (needs a second key, §10 conflict 2); REST write shapes
`POST /rest/companies`, `PATCH /rest/companies/{id}` and the `destroyCompany` mutation (read-only probe; the shapes come
from Phase 2's `src/twenty/api.ts`, which passed CI); password-reset email delivery (write, Task 5); whether
`validate()` passes when captcha is disabled (P16); the GitHub-hosted runner's cgroup layout (P22, P23).

Two findings to escalate in the report, not to fix here: P31 (existing jobs fail C3 literally) and P20 (the DB
container discovery finds nothing for Twenty).

## 4a. Depends on

| Dependency                                                               | Status on main                                                 | Blocks the build start?      | Blocks the CI run?                                                               | Blocks the closeout?                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| Phase 2 Tasks 6–7 (Twenty stack, `src/twenty/*`, races, `twenty-*` jobs) | present (`src/twenty/`, `perf.yml:1777`)                       | no                           | no                                                                               | no                                        |
| Phase 3 Tasks 3–6 (k6 lib, runner, telemetry, reconcile)                 | present (`scripts/load/run-load.ts`, `src/load/*`, `k6/lib/*`) | no                           | no                                                                               | no                                        |
| Phase 4 Task 1 (breakpoint method) and Task 6 (profile pattern)          | present (`src/load/knee/*`, `src/load/spike/*`)                | no (for 3a)                  | no                                                                               | only for `P6-TW-LOAD-008`                 |
| Task 1 (H4 in harness v0.2.x, opt-in `API_RATE_LIMITING_*` names)        | not tagged                                                     | no (3a)                      | **yes for 3b**: the functional values do nothing until H4 reaches the containers | yes                                       |
| Task 2 (pin bump to the H4 tag)                                          | not merged                                                     | no (3a)                      | **yes for 3b**                                                                   | yes                                       |
| Owner decision on Q1, Q2, Q4, Q6, Q10                                    | open                                                           | yes, before the build starts | no                                                                               | no                                        |
| Owner: the `ci(evidence)` PR after the first main run                    | owner action                                                   | no                           | no                                                                               | yes (for the closeout's evidence release) |

## 5. Build-time re-check (the build session runs this table first)

| #   | fact                                                                  | how to re-check at build start                                                                                                                       | if it changed                                                                             |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Harness pin is still `v0.2.15` or the Task 2 tag                      | `grep -n qa-portfolio-harness package.json`                                                                                                          | Use the new pin; re-run P19 and P34.                                                      |
| 2   | Twenty overlay still has no rate-limit names                          | `grep -c API_RATE_LIMITING node_modules/qa-portfolio-harness/docker/twenty.compose.yml` → 0 for 3a; ≥ 6 after H4                                     | After H4: 3b can pass the names; re-run §6.3 checks.                                      |
| 3   | Limiter source at the fork pin                                        | `grep -n "API_RATE_LIMITING_SHORT_LIMIT = " …/config-variables.ts` → 100 at 1722; `usage-limit-definitions.constant.ts` names at 19–21, 32–34, 45–47 | Re-derive §6.3 from the new defaults.                                                     |
| 4   | Token lifetime and claims                                             | sign in once; print `exp - iat` only                                                                                                                 | Re-check the 25-min re-sign-in rule (Q12).                                                |
| 5   | Container names after `up`                                            | `docker ps --format '{{.Names}}' --filter label=com.docker.compose.project=qa-harness-twenty` → `…-server-1`, `…-worker-1`, `…-db-1`, `…-redis-1`    | Fix §6.4 discovery patterns.                                                              |
| 6   | 429 headers and status (P11)                                          | Task 6 build: create an API key in its setup and send a bounded burst; record status and headers. Task 3 does not need this.                         | Update the Task 6 plan.                                                                   |
| 7   | REST write shapes (`createCompany`, `patchCompany`, `destroyCompany`) | 1-iteration smoke of `tw-background` in the build's first run (a dispatch), read the response bodies' status and the `data.createCompany.id` path    | Adjust `runTwBackground` and the cleanup sweep.                                           |
| 8   | Redis state after `up`                                                | `docker compose … exec -T redis redis-cli DBSIZE` right after `up:twenty` is small (no seed yet)                                                     | If not small, the reset-by-recreate rule (Q9) fails: add a flush-free check to preflight. |
| 9   | docker-stats source on GitHub-hosted runners                          | the first CI run's `telemetry-main.json` `sources` shows `containers: true`; `cgroup-v1` or `cgroup-v2` in `run-meta`                                | If absent, record the gap and use `/proc` only.                                           |
| 10  | BullMQ key names                                                      | `redis-cli --scan --pattern 'bull:*:wait'` returns keys while the queue is busy (during a burst)                                                     | If not, the `P6-TW-LOAD-010` monitor changes (Q6).                                        |
| 11  | Effective limiter env inside the container (3b)                       | `docker compose … exec -T server printenv API_RATE_LIMITING_LONG_LIMIT` equals the profile value                                                     | If not equal, the run is ENV (§7).                                                        |
| 12  | Seed workspace and user names                                         | `npm run seed:twenty` `users=4`; `core.workspace` row for subdomain `apple`                                                                          | Update the defaults in `src/twenty/env.ts`.                                               |
| 13  | Reset token expiry (for Task 5, not Task 3)                           | `config-variables.ts:143`                                                                                                                            | Task 5 re-checks.                                                                         |
