# P6 Phase 5 Task 3: Twenty load foundation (plan only)

This plan changes nothing in the repo except this file. It is a junior-engineer guide: a builder follows it
in order, runs the checks it names, and stops where it says to stop. Scope source: the Phase 5 roadmap
[2026-10-22-p6-phase5-roadmap.md](2026-10-22-p6-phase5-roadmap.md), "Task 3" (lines 312–366), "Task 4" to "Task 6"
(lines 367–464, read for what they need from this task), decisions D1–D11 (lines 533–575). Rules and their
numbering come from [docs/agent-rules.md](../agent-rules.md) and the planning rules in the task prompt.

## 1. Header

- **Title.** P6 Phase 5 Task 3: Twenty load foundation (plan only).
- **Date.** 2026-10-29 (Asia/Colombo).
- **Plan branch.** `plan/2026-10-29-p6-phase5-task3` (no PR, see §17; the owner's answers are in §17.1).
- **Build branch (roadmap pattern).** `feat/2026-10-29-p6-twenty-load-foundation` (the build date may move; the
  build session uses the date it starts). Two PRs, as Q2 decided (3a, then 3b): `feat/<date>-p6-twenty-load-foundation` (3a) and
  `feat/<date>-p6-twenty-load-functional` (3b).
- **Mapped case IDs.** `P6-TW-LOAD-010` (gated), `P6-TW-LOAD-008` (gated). Foundation work has no P6 ID; its run
  label is `TW-BG-FOUNDATION` (Q3, DECIDED: no P6 ID). Retired IDs `P6-TW-LOAD-001`, `-002`, `-003` stay retired and are never reused.
- **Roadmap section.** Phase 5 roadmap, "Task 3: Twenty load foundation", lines 312–366; decisions D2, D3, D6, D7,
  D11 at lines 533–575.
- **Base SHA of `main`.** `5215127a038dbec6b6aef431cf20dcab08e41e11` (2026-10-29T03:48:13Z = 09:18 Asia/Colombo). The
  commit subject is `merge(main): clear the pending list after p6-phase4c (#160)`.
- **Harness pin on main.** `qa-portfolio-harness` `v0.2.15` (`package.json:63`). H4 is not tagged yet.
- **Baseline unit count (B0).** 1405 (measured 2026-10-29 with `npm run check`; the prompt's 1403 is stale).
- **Environment change.** No (§13). The probe ran in this Claude Code cloud session without any change.
- **Owner review.** Done. The answers are in §17.1: Q1 to Q5 and Q11 DECIDED; Q10 revised (§2.12); Q6, Q7, Q8, Q9 and Q12 open.

## 2. Interfaces for Tasks 4–6

This section is frozen once the plan branch is pushed (commit `docs(plans): add the phase 5 task 3 plan`). Tasks 4, 5
and 6 build against exactly these names. A change here needs an owner decision recorded in §17.1. Every name below is NEW
unless it says "existing".

### 2.1 k6 auth helper: `k6/lib/twenty-auth.js` (NEW)

```js
// k6/lib/twenty-auth.js
export function authorizationHeader() {
  // Returns "Bearer <token>" from __ENV.TWENTY_API_KEY when set (API-key cases, §2.12), else from __ENV.TWENTY_TOKEN (user-token case). Throws when neither is set.
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
  counts?: BackgroundCounts, // additive, optional (added at the plan review, §6.7): the patch, 5xx and 429 counters
): Promise<AuditResult>;
// clientCount = the k6 counter p6_tw_created. Returns the AuditResult shape of src/load/reconcile/types.ts (existing).
// Without `counts` the patch, 5xx and 429 checks are skipped and reported as "pending", so Tasks 4-6 can call it unchanged.
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

## 2.12 Auth path per case (frozen)

Each case authenticates in exactly one of two ways. This table is frozen; a change is an owner decision recorded in §17.1.

| Case                  | Auth                    | Why                                                                                                               |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TW-BG-FOUNDATION (3a) | user token              | pipeline proof; the limiter is not in play                                                                        |
| P6-TW-LOAD-004        | API key                 | concurrent integration edits; the realistic integration path, limiter in play                                     |
| P6-TW-LOAD-005 / 011  | user session            | password-reset user flow; API speed limit does not apply                                                          |
| P6-TW-LOAD-006        | API key (required)      | the rate-limit contract only fires for apiKey                                                                     |
| P6-TW-LOAD-008        | API key                 | API capacity knee; the "H4 raised the limit, the limiter is not the knee" gate is only meaningful with an API key |
| P6-TW-LOAD-009        | two API keys (required) | per-key fairness                                                                                                  |
| P6-TW-LOAD-010        | API key                 | queue drain measured under API load                                                                               |

Verified in the fork (read-only, at the pin): `API.speed.allowedSpenderTypes = ['apiKey', 'application']`
(`usage-limit-definitions.constant.ts:9`). `buildSpendersFromAuthContext` maps a user token to a `userWorkspace` spender
and the `workspace` spender (`build-spenders-from-auth-context.util.ts:15–27`). Defaults apply only by spender type
(`build-speed-buckets.util.ts:67`). So the API speed limiter never fires for a user token. The roadmap's "every run is
limited at 100/min" holds only for API keys. Live check: P8 and P9.

Rules:

- A **user token** is the workspace token from `signInWorkspace` (`src/twenty/auth.ts`). k6 receives it as `TWENTY_TOKEN`.
- An **API key** is a seeded per-run key created in setup (§2.13). k6 receives it as `TWENTY_API_KEY` and sends it as
  `Bearer <key>`, the header the harness uses for API-key auth (`node_modules/qa-portfolio-harness/src/adapters/twenty.adapter.ts:258–263`).
- The runner always mints the user token: setup, cleanup and the reconcile read-backs need it. k6 receives only the key
  for API-key cases, and only the token for user-token cases.
- Oracle rule O10 (§7): a case in the limiter-claim set {P6-TW-LOAD-004, -006, -008, -009} with any auth other than API key
  is INVALID by design.

## 2.13 Seeded API-key helper: `src/twenty/api-key.ts` (NEW)

```ts
export interface RunApiKey {
  id: string;
  token: string;
}
export async function createRunApiKey(opts: {
  baseUrl: string; // e.g. http://127.0.0.1:3002
  authorizationHeader: string; // the user token's header from signInWorkspace
  name: string; // "<runPrefix>-key": the prefix lets the leak check find it
  expiresAt: string; // ISO time, now + 2 h (longer than any Phase 5 run)
  fetchImpl?: typeof fetch;
}): Promise<RunApiKey>;
// Calls the GraphQL mutation that creates an API key, on /metadata. The mutation name and response path are NOT PROBED
// here (a write); the build confirms them in the 3b local proof (§5 row 6). Throws Error("TEST BUG: <GraphQL message>")
// with messages only, never the key value.
export async function revokeRunApiKey(opts: {
  baseUrl: string;
  authorizationHeader: string;
  id: string;
  fetchImpl?: typeof fetch;
}): Promise<void>;
```

- **Created** in setup (`twentySetupWith`, §6.5), only for `apiKey` cases (`TWENTY_CASE_AUTH`). The value goes to
  `ctx.secrets.TWENTY_API_KEY`; the id goes to `ctx.handles.apiKey`. Never to `ctx.config`, a file or a log.
- **Revoked** in cleanup (`twentyCleanupWith`), before the leak check, via `revokeRunApiKey`. The leak query then reads
  `SELECT count(*) FROM core."apiKey" WHERE name LIKE '<prefix>%' AND "revokedAt" IS NULL` (read-only; the columns
  `name` and `revokedAt` are confirmed in P24). It must be 0; otherwise TEST BUG.
- **Never printed or written to an artefact.** The k6 journey never logs the header. The workflow token scan (§8) must match
  the key's format; that format is NOT PROBED here. In the first API-key build run, if the key does not match the scan
  patterns, the scan is extended (never weakened) and the change is recorded.
- The harness seed's own key row (`core."apiKey"` count 1, P24) is not used: its token cannot be read back.

## 3. What it proves

One paragraph per mapped case, then the foundation.

**`TW-BG-FOUNDATION` (foundation, not a P6 case; auth: user token, §2.12).** Twenty can be load-tested through the existing LOAD runner: the
runner mints a workspace token, a background journey writes and reads prefixed companies at a fixed rate, container and
database telemetry is sampled, and the post-load audit reconciles every created row. The question is whether the
pipeline is valid end to end on the image defaults, with zero 429 and zero 5xx. Oracle: created intents equal the
database rows with the run prefix; patched intents equal rows whose `updatedAt` is later than `createdAt`; no status
5xx; no leftover prefixed row after cleanup. Verdicts: PASS (all four hold, k6 thresholds hold), FAIL (a PRODUCT BUG or
TEST BUG, with the evidence in `reasons`), INVALID (the validity judge flags dropped iterations, a telemetry gap or a
clock skew), ENV (setup failed before load). This is a functional-load label: it is not a capacity claim.

**`P6-TW-LOAD-010` (gated, worker queue drain; auth: API key, §2.12).** After a write burst on the background journey, the BullMQ backlog of
the Twenty worker must drain. The question is how long the backlog takes to reach zero. Oracle: sample the queue
lengths every second with read-only Redis commands (`LLEN` of `:wait` and `:active`, `ZCARD` of `:delayed`, the
whitelist in §8). Verdicts: PASS (the backlog reaches zero inside the drain window, and the drain time is recorded),
FAIL (the backlog never reaches zero inside the window; a PRODUCT BUG candidate, SUSPECTED until it repeats, rule 13),
INVALID (the monitor could not read the queue more than once in five seconds), NOT RUN (the gate is closed, §12). The
drain window is a bound for the wait, not a latency target; the build records it from its own probe (Q6).

**`P6-TW-LOAD-008` (gated, Twenty knee; auth: API key, §2.12).** The Phase 4 breakpoint method on the background journey, on the functional
profile, reported as a step range (`P6-RULE-006`). The question is at what rate the system stops keeping up. Oracle:
the Phase 4 knee stop rule, unchanged. Verdicts: a step range with the stop reason, or PASS when the stop rule ends the
run and the limiter did not (the limiter-caused stop is recorded as a finding, not a result). NOT RUN until its gate
opens (§12, Q7).

## 4. Live probe evidence

Every probe below ran in this session on 2026-10-29 (Asia/Colombo, approximately 11:35–12:40), through the harness
(`npm run up:twenty`, `seed:twenty`, `smoke:twenty`, `down:twenty`) or as read-only commands against the running stack.
Nothing was written to the Twenty database. Secrets: the harness dev credentials were read in memory only; no token,
password, hash or pk key was printed. Timings are session facts (rule P4), not published numbers.

| #   | fact                                                                                | evidence (path:line, command + output, or run URL)                                                                                                                                                                                                                                                                                                                                                                                                                                  | what it changes in the design                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Twenty fork is at `TWENTY_REF` `7cbdfec6…`                                          | `bash scripts/bootstrap.sh twenty` exit 0 in 12 s; `git -C /home/user/products/twenty-CRM rev-parse HEAD` = `7cbdfec6f346b43715bc2056932f4fad5886f733`. The fork is public; `add_repo` returned read access without attaching.                                                                                                                                                                                                                                                      | The job template clones the fork exactly as `perf.yml` does (§2.8).                                                                                                                                                                                                                  |
| P2  | Image pull through the CI helper                                                    | `scripts/ci/compose-pull.sh -p qa-harness-twenty -f docker-compose.yml -f <overlay>` exit 0, 26 s; `Image twentycrm/twenty:v2.44.0 Pulled`.                                                                                                                                                                                                                                                                                                                                         | Pull cap 6 min is enough (§2.8 step 7).                                                                                                                                                                                                                                              |
| P3  | `npm run up:twenty` starts 5 containers, healthy in 127 s                           | exit 0, 127 s. `docker ps` after up: `qa-harness-twenty-server-1` (healthy), `-worker-1`, `-db-1` (healthy), `-redis-1` (healthy), `-mailpit-1` (healthy). App `http://127.0.0.1:3002/healthz` HTTP 200 (harness output).                                                                                                                                                                                                                                                           | Up cap 12 min (§2.8 step 8). Container names are `qa-harness-twenty-<service>-1`.                                                                                                                                                                                                    |
| P4  | Seed creates the workspace and four users                                           | `npm run seed:twenty` exit 0, 76 s; output `twenty seed: created=true users=4`.                                                                                                                                                                                                                                                                                                                                                                                                     | Seed cap 10 min (§2.8 step 9). Seed workspace subdomain `apple`, display name `Apple` (`src/twenty/env.ts` defaults).                                                                                                                                                                |
| P5  | Health smoke passes                                                                 | `npm run smoke:twenty` exit 0, `5/5 shared iters`.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Step 10 unchanged.                                                                                                                                                                                                                                                                   |
| P6  | Auth for k6: sign-in then workspace token exchange works; token length and lifetime | `signInWorkspace` (`src/twenty/auth.ts`, existing) on `http://127.0.0.1:3002`: token length 668 (length only); JWT claims `sub,userId,workspaceId,workspaceMemberId,userWorkspaceId,type,authProvider,isImpersonating,iat,exp`; `exp - iat` = 1800 s. Token lifetime from `ACCESS_TOKEN_EXPIRES_IN = '30m'` (`config-variables.ts:348`).                                                                                                                                            | The runner mints the token in setup (not an API key, Q10). Runs longer than about 25 min need a re-sign-in (Q12).                                                                                                                                                                    |
| P7  | An invalid bearer is refused with 401                                               | `curl -H 'Authorization: Bearer invalid.token.value' http://127.0.0.1:3002/rest/companies?limit=1` → HTTP 401.                                                                                                                                                                                                                                                                                                                                                                      | The error-code extra (§11, EXTRA-C) expects 401 and never 500.                                                                                                                                                                                                                       |
| P8  | Limiter at image defaults, user workspace token, 150 requests                       | Probe script (scratchpad, not in repo): 100 × `GET /rest/companies?limit=1` → `{"200":100}`; 30 × `POST /graphql` companies → `{"200":30}`; 20 × `POST /metadata currentUser` → `{"200":20}`. No `retry-after` or `x-ratelimit-*` header on any response; no error code.                                                                                                                                                                                                            | At image defaults the user-token path is not rate-limited in this burst. The roadmap's "every run is limited at 100/min" does not hold for user tokens (§10, conflict 1).                                                                                                            |
| P9  | Limiter state: no speed keys after the burst                                        | `docker compose -p qa-harness-twenty … exec -T redis redis-cli --scan --pattern '*speed*' \| wc -l` → `0`. `DBSIZE` 523; key prefixes `bull` 333, `engine` 189, `module` 1.                                                                                                                                                                                                                                                                                                         | The limiter writes only for buckets that exist; a user token creates none (source: `usage-limit-speed.service.ts` `consumeTokens` runs only when buckets exist).                                                                                                                     |
| P10 | Which spenders the limiter binds (source)                                           | `usage-limit-definitions.constant.ts:15` (`spenderType: 'apiKey'`), `:19–21` (`API_RATE_LIMITING_SHORT_TTL_IN_MS`, `…_SHORT_LIMIT`, `perWorkspace`), `:28–34` (`…_LONG_*`, overridable), `:41` (`spenderType: 'application'`), `:45–47` (`APPLICATION_API_RATE_LIMITING_TTL_IN_MS`, `…_LIMIT`, `crossWorkspace`). There is no default for `userWorkspace`. `build-speed-buckets.util.ts:67` filters defaults by spender type.                                                       | Only API-key and application clients are limited. The functional profile matters for API-key clients only (§6.3, conflict 2).                                                                                                                                                        |
| P11 | Headers and status on a limiter hit (source, NOT PROBED live)                       | `build-rate-limit-response-headers.util.ts:10–13`: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. REST maps the limit to 429: `usage-limit-to-rest-api-exception-handler.util.ts:22`. GraphQL maps the code with `usageLimitToGraphqlApiExceptionHandler` (`usage-limit-graphql-api-exception.filter.ts:27`).                                                                                                                                    | Task 6 needs these; a 429 needs an API key, which is a write, so it is not probed here; the build re-checks it in 3b (§5 row 6).                                                                                                                                                     |
| P12 | Limiter state location and reset                                                    | Redis 8.10.3 service `redis` (`packages/twenty-docker/docker-compose.yml:128`, no volume: `docker inspect` Mounts empty). Key shape from `build-speed-bucket-key.util.ts:28`: `{<workspaceId>}:speed:<resourceType>:<operationType>:<spenderType>:<spenderId                                                                                                                                                                                                                        | ->:<windowSec>`. Script `usage-limit:try-consume-token-buckets` (`try-consume-token-buckets-script.constant.ts:7`). `down:twenty`removed the Redis container; its state should be gone (inferred from the removal and the empty mounts, not re-checked after a fresh`up`, §5 row 8). | A fresh `up` starts with empty limiter state, so Task 6 needs no Redis flush and P6 never writes Redis (Q9). |
| P13 | The limiter fails open                                                              | `usage-limit-speed.service.ts:154` and `:166` return `fullAdmission` when the cache store fails (`CacheStorageException`).                                                                                                                                                                                                                                                                                                                                                          | A 500 cannot come from the limiter; a Redis outage shows as no 429 (noted for Task 6).                                                                                                                                                                                               |
| P14 | Speed limiter binds only root query-runner operations                               | `common-base-query-runner.service.ts:135–136`: `consumeApiSpeedLimit` runs when `isRootOperation`. `/metadata` auth calls do not go through it.                                                                                                                                                                                                                                                                                                                                     | Auth calls are not limited by the API speed limiter (matches P8's auth-path burst).                                                                                                                                                                                                  |
| P15 | Auth-path throttle exists for password reset                                        | `auth.resolver.ts:126–127`: `PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX = 3`, window 15 min; `:1127–1131` `tokenBucketThrottleOrThrow('password-reset-email:<email>', …)`.                                                                                                                                                                                                                                                                                                                 | Task 5 must request each reset at most three times per email per 15 min (cross-task note, §10).                                                                                                                                                                                      |
| P16 | Captcha is off when no driver is set                                                | `captcha-driver.factory.ts:27–28`: `if (!driver) return 'disabled'`. `CaptchaGuard` is on `emailPasswordResetLink` (`auth.resolver.ts`). Whether `validate()` passes when disabled: NOT PROBED.                                                                                                                                                                                                                                                                                     | Cross-task note for Task 5 only.                                                                                                                                                                                                                                                     |
| P17 | Password reset token expiry                                                         | `config-variables.ts:143`: `PASSWORD_RESET_TOKEN_EXPIRES_IN = '5m'`. `reset-password.service.ts:106–117` computes `expiresAt` from it.                                                                                                                                                                                                                                                                                                                                              | The `P6-TW-LOAD-011` gate (expiry ≤ 15 min) looks open for Task 5 (cross-task note, §10).                                                                                                                                                                                            |
| P18 | Queue is BullMQ on Redis; queue keys readable with read-only commands               | `BullMQDriver` (`src/engine/core-modules/message-queue/drivers/bullmq.driver.ts`, fork); `docker compose … exec -T redis redis-cli --scan --pattern 'bull:*'` → 333 keys: `bull:cron-queue:repeat` 77, `bull:webhook-queue:metrics`, `bull:workspace-queue:meta`, `bull:workflow-queue:stalled-check`, `bull:workspace-destroy-queue:*`. `:completed` is a sorted set (`ZCARD` 193 and 17). No `:wait` key at idle (empty list = no key).                                           | `P6-TW-LOAD-010` gate: job state is readable without writes through read-only Redis commands (Q6). Redis is not published to the host; the read goes through `docker compose exec`.                                                                                                  |
| P19 | The harness adds no rate-limit env                                                  | `node_modules/qa-portfolio-harness/docker/twenty.compose.yml` has no `API_RATE_LIMITING` (grep returns none). The image env has no `API_RATE_LIMITING_*` name (`docker image inspect`; the list was filtered on `NODE                                                                                                                                                                                                                                                               | PATH                                                                                                                                                                                                                                                                                 | PORT                                                                                                         | RATE | PG_`, which matched `PATH`, `NODE_VERSION`, `NODE_ENV`and no rate name).`twenty.adapter.ts`passes only`TAG`and`TWENTY_BASE_URL` in the compose env (`composeOpts`). | Process env does not reach the containers today. Setting `API_RATE_LIMITING_*` in the shell is a no-op until H4 (Task 1) is tagged and pinned (Q5). |
| P20 | The Twenty DB container is not found by the existing discovery                      | `src/load/telemetry/cgroup-stats.ts:54` filters `name=qa-harness-${product}-postgres`. Live: `docker ps --filter name=qa-harness-twenty-postgres` → 0 lines; `--filter name=qa-harness-twenty-db` → 1 line.                                                                                                                                                                                                                                                                         | The container source of the sampler stays absent unless the filter gets a Twenty pattern (Q4).                                                                                                                                                                                       |
| P21 | `docker stats` is too slow to sample every second                                   | `docker stats --no-stream --format '{{json .}}' qa-harness-twenty-server-1` → 1037 ms for one container; the four-container call averaged 2029 ms over 3 calls. `cgroup-stats.ts:86–88` already calls it "the slow fallback".                                                                                                                                                                                                                                                       | docker-stats.ts reads cgroup files instead (P22, P23), not `docker stats`.                                                                                                                                                                                                           |
| P22 | cgroup v1 file reads are cheap                                                      | Host is cgroup v1 (`stat -f -c %T /sys/fs/cgroup` → `tmpfs`; `blkio`, `cpu`, `cpuacct`, `memory` dirs). `/sys/fs/cgroup/memory/docker/<id>/memory.usage_in_bytes` read: 874188800 for the server. 20 reads: 35 ms. Paths in `cgroup-stats.ts:17–20`.                                                                                                                                                                                                                                | docker-stats.ts reads the cgroup files for the kind `detectCgroup` reports (v1 or v2), per container (server, worker, db); no v1 path is hard-coded.                                                                                                                                 |
| P23 | `/proc/<pid>` of a container is readable on the host                                | `docker inspect -f '{{.State.Pid}}' qa-harness-twenty-server-1` in 27 ms; `/proc/<pid>/status` → `VmRSS: 846304 kB`, `Threads: 11`; `/proc/<pid>/fd` count 38.                                                                                                                                                                                                                                                                                                                      | Process-level fds and threads for each container come from `/proc` (GitHub-hosted runner: NOT PROBED, §5 re-check 9).                                                                                                                                                                |
| P24 | Reconcile sources: tables, columns, counts                                          | Read-only SQL through `createReadOnlyPool` on `127.0.0.1:5434` (the repo's oracle pool, `src/oracles/pg.ts`): `resolveWorkspaceSchema(pool,'apple')` resolves a `workspace_<base36>` schema. `workspace.company` columns include `id, createdAt, updatedAt, deletedAt, name`; company rows: total 599, live 599, with `updatedAt` 599. `core."apiKey"` total 1, active 1. `core."appToken"` by type: `REFRESH_TOKEN` 2, no `PASSWORD_RESET_TOKEN` at seed time. `core."user"` 1005. | The reconcile for the background journey counts `company` rows by name prefix and `updatedAt > createdAt`. Token checks belong to Task 5.                                                                                                                                            |
| P25 | The oracle pool refuses non-SELECT queries                                          | `src/oracles/pg.ts:39` `assertSelectOnly` threw `TEST BUG: oracle query is not SELECT-only` for `SHOW shared_preload_libraries`. A write attempt in a rolled-back transaction gave SQLSTATE `25006` (`readOnlyWriteSqlstate`, `src/twenty/oracle.ts`).                                                                                                                                                                                                                              | Reads for the Twenty oracle use `SELECT current_setting(...)`. The read-only guard works.                                                                                                                                                                                            |
| P26 | Harness H1 is not active on this stack                                              | `SELECT current_setting('shared_preload_libraries')` → empty; `pg_stat_statements` not installed (`pg_extension` count 0).                                                                                                                                                                                                                                                                                                                                                          | Not a Task 3 concern; it is the Task 2 starting state (noted in §10).                                                                                                                                                                                                                |
| P27 | Image facts (one-shot read-only containers, no server started)                      | `docker image inspect twentycrm/twenty:v2.44.0`: `Entrypoint ["/app/entrypoint.sh"]`, `Cmd ["node","dist/main"]`, `User 1000`, `WorkingDir /app/packages/twenty-server`. `docker run --rm --entrypoint node … -v` → `v24.19.0`. `tail -3 /app/entrypoint.sh` ends with `exec "$@"`. No `NODE_OPTIONS` in the image env.                                                                                                                                                             | Consistent with roadmap Note 3 (H2 feasible in principle). Nothing in this task needs H2.                                                                                                                                                                                            |
| P28 | Mailpit is reachable and empty                                                      | `GET http://127.0.0.1:8025/api/v1/messages` HTTP 200, `"total":0`.                                                                                                                                                                                                                                                                                                                                                                                                                  | Mailpit is not needed by the background journey (Task 5 uses it).                                                                                                                                                                                                                    |
| P29 | Token scope for the seeded admin                                                    | `signIn` returned `availableWorkspaces` with the seeded workspace; `getAuthTokensFromLoginToken` exchanged it (`src/twenty/auth.ts` `signInWorkspace`). The harness's own `authenticate()` picks `workspaces[0]` (`twenty.adapter.ts:258–`), P6's helper picks by display name (`src/twenty/auth.ts` `pickWorkspace`).                                                                                                                                                              | The k6 helper picks by name and fails loudly when the name is missing (TEST BUG).                                                                                                                                                                                                    |
| P30 | `docker compose down` with `TWENTY_DOWN_VOLUMES=1` leaves nothing                   | `npm run down:twenty` exit 0, 3 s; containers left for project `qa-harness-twenty`: 0; volumes left: 0.                                                                                                                                                                                                                                                                                                                                                                             | Matches CI's `TWENTY_DOWN_VOLUMES: "1"` (`perf.yml:1786` pattern).                                                                                                                                                                                                                   |
| P31 | Pre-existing CI budget arithmetic                                                   | `perf.yml` `twenty-smoke` (lines 1777–1967): 17 step caps summing to 95 min against `timeout-minutes: 20` (line 1781). `twenty-races` (1971) and `twenty-obs` (2151) have the same shape.                                                                                                                                                                                                                                                                                           | The roadmap's "LOAD step inside twenty-smoke" does not fit C3 (§10, conflict 3).                                                                                                                                                                                                     |
| P32 | Existing `package.json` has one npm script per LOAD case                            | `package.json:35–58` (`load:*` lines). Lane A's Task 2 owns `package.json` for the pin only.                                                                                                                                                                                                                                                                                                                                                                                        | The workflow calls `node scripts/load/run-load.ts --case …` directly; this plan adds no npm script (§6.5, conflict 6).                                                                                                                                                               |
| P33 | Evidence workflow ids                                                               | `pages.yml:30` and `evidence-release.yml:39`: `EVIDENCE_WORKFLOW_IDS: "376454455 396253729 397232763 398161444"`; `tests/unit/evidence-release-ids.test.ts:8` asserts four ids.                                                                                                                                                                                                                                                                                                     | A new workflow needs its own `ci(evidence)` PR after its first `main` run (§2.7).                                                                                                                                                                                                    |
| P34 | Harness pin and overlay                                                             | `package.json:63`: `"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.15"`. The overlay (`docker/twenty.compose.yml`) has no passthrough, no `NODE_OPTIONS`, `TAG` default `v2.44.0`.                                                                                                                                                                                                                                                                             | Same as P19.                                                                                                                                                                                                                                                                         |
| P35 | Baseline `npm run check` on `main`                                                  | `npm run check` exit 0; `# tests 1405`, `# pass 1405`, `# fail 0` (`$HOME/check-b0.log`).                                                                                                                                                                                                                                                                                                                                                                                           | B0 = 1405 (§14).                                                                                                                                                                                                                                                                     |

NOT PROBED items (each has a build-time re-check in §5): a 429 response with the headers (needs an API key, P11; re-check in 3b, §5 row 6); the
`apiKey` and `application` keying with two credentials (needs a second key, §10 conflict 2); REST write shapes
`POST /rest/companies`, `PATCH /rest/companies/{id}` and the `destroyCompany` mutation (read-only probe; the shapes come
from Phase 2's `src/twenty/api.ts`, which passed CI); password-reset email delivery (write, Task 5); whether
`validate()` passes when captcha is disabled (P16); the GitHub-hosted runner's cgroup layout (P22, P23).

Two findings to escalate in the report, not to fix here: P31 (existing jobs fail C3 literally) and P20 (the DB
container discovery finds nothing for Twenty).

## 4a. Depends on

| Dependency                                                                                                    | Status on main                                                             | Blocks the build start?                                              | Blocks the CI run?                                                               | Blocks the closeout?                      |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| Phase 2 Tasks 6–7 (Twenty stack, `src/twenty/*`, races, `twenty-*` jobs)                                      | present (`src/twenty/`, `perf.yml:1777`)                                   | no                                                                   | no                                                                               | no                                        |
| Phase 3 Tasks 3–6 (k6 lib, runner, telemetry, reconcile)                                                      | present (`scripts/load/run-load.ts`, `src/load/*`, `k6/lib/*`)             | no                                                                   | no                                                                               | no                                        |
| Phase 4 Task 1 (breakpoint method) and Task 6 (profile pattern)                                               | present (`src/load/knee/*`, `src/load/spike/*`)                            | no (for 3a)                                                          | no                                                                               | only for `P6-TW-LOAD-008`                 |
| Task 1 (H4 in harness v0.2.16, all six `API_RATE_LIMITING_*` and `APPLICATION_API_RATE_LIMITING_*` names, Q5) | not tagged                                                                 | no (3a)                                                              | **yes for 3b**: the functional values do nothing until H4 reaches the containers | yes                                       |
| Task 2 (pin bump to harness v0.2.16)                                                                          | not merged                                                                 | no (3a)                                                              | **yes for 3b**                                                                   | yes                                       |
| Owner decisions (§17.1)                                                                                       | Q1 to Q5 and Q11 DECIDED; Q6, Q7, Q8, Q9 and Q12 open; Q10 revised (§2.12) | Q1 to Q4 are decided, so the 3a build can start from the plan branch | no                                                                               | no                                        |
| Owner: the `ci(evidence)` PR after the first main run                                                         | owner action                                                               | no                                                                   | no                                                                               | yes (for the closeout's evidence release) |

## 5. Build-time re-check (the build session runs this table first)

| #   | fact                                                                                                             | how to re-check at build start                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | if it changed                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Harness pin is still `v0.2.15` or the Task 2 tag                                                                 | `grep -n qa-portfolio-harness package.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Use the new pin; re-run P19 and P34.                                                      |
| 2   | Twenty overlay still has no rate-limit names                                                                     | `grep -c API_RATE_LIMITING node_modules/qa-portfolio-harness/docker/twenty.compose.yml` → 0 for 3a; ≥ 6 after H4                                                                                                                                                                                                                                                                                                                                                                                                                                                           | After H4: 3b can pass the names; re-run §6.3 checks.                                      |
| 3   | Limiter source at the fork pin                                                                                   | `grep -n "API_RATE_LIMITING_SHORT_LIMIT = " …/config-variables.ts` → 100 at 1722; `usage-limit-definitions.constant.ts` names at 19–21, 32–34, 45–47                                                                                                                                                                                                                                                                                                                                                                                                                       | Re-derive §6.3 from the new defaults.                                                     |
| 4   | Token lifetime and claims                                                                                        | sign in once; print `exp - iat` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Re-check the 25-min re-sign-in rule (Q12).                                                |
| 5   | Container names after `up`                                                                                       | `docker ps --format '{{.Names}}' --filter label=com.docker.compose.project=qa-harness-twenty` → `…-server-1`, `…-worker-1`, `…-db-1`, `…-redis-1`                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix §6.4 discovery patterns.                                                              |
| 6   | API-key 429 path (P11). This is the oracle that proves H4's raised values take effect in the functional profile. | 3b, local, before the 3b PR. (1) Image defaults, a seeded key from `createRunApiKey` (§2.13): a paced burst of 300 requests at 20 rps (never above `SHORT_LIMIT` in one second); expect a 429 once the 100-per-60 s long window fills. Record the status, `Retry-After`, `X-RateLimit-Limit` (100), `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and the Redis speed key of the `apiKey` spender (shape in `build-speed-bucket-key.util.ts:28`). (2) Start the functional stack (six names, §6.3) and repeat the same burst with a new key: expect zero 429. Record both. | No 429 at defaults: the key is not limited, so stop 3b and root-cause it (TEST BUG).      |
| 7   | REST write shapes (`createCompany`, `patchCompany`, `destroyCompany`)                                            | 1-iteration smoke of `tw-background` in the build's first run (a dispatch). The create response goes through the existing `createCompany` in `src/twenty/api.ts` (its `{ data: { createCompany: { id } } }` path); no new shape is defined. Also check `destroyCompany` on a soft-deleted id.                                                                                                                                                                                                                                                                              | Adjust `runTwBackground` and the cleanup sweep.                                           |
| 8   | Redis state after `up`                                                                                           | `docker compose … exec -T redis redis-cli DBSIZE` right after `up:twenty` is small (no seed yet)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | If not small, the reset-by-recreate rule (Q9) fails: add a flush-free check to preflight. |
| 9   | docker-stats source on GitHub-hosted runners                                                                     | the first CI run's `telemetry-main.json` `sources` shows `containers: true`; the container `kind` (cgroup-v1 or cgroup-v2) in the telemetry file                                                                                                                                                                                                                                                                                                                                                                                                                           | If absent, record the gap and use `/proc` only.                                           |
| 10  | BullMQ key names                                                                                                 | `redis-cli --scan --pattern 'bull:*:wait'` returns keys while the queue is busy (during a burst)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | If not, the `P6-TW-LOAD-010` monitor changes (Q6).                                        |
| 11  | Effective limiter env inside the container (3b)                                                                  | `docker compose … exec -T server printenv API_RATE_LIMITING_LONG_LIMIT` equals the profile value                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | If not equal, the run is ENV (§7).                                                        |
| 12  | Seed workspace and user names                                                                                    | `npm run seed:twenty` `users=4`; `core.workspace` row for subdomain `apple`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Update the defaults in `src/twenty/env.ts`.                                               |
| 13  | Reset token expiry (for Task 5, not Task 3)                                                                      | `config-variables.ts:143`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Task 5 re-checks.                                                                         |

**Row 9 note (cgroup, owner review).** The code uses the existing `readContainerStats` and `detectCgroup` (cgroup v1 and
v2, `src/load/telemetry/cgroup-stats.ts`). The probe host was cgroup v1. The owner's note: GitHub `ubuntu-latest` (22.04 and
24.04) runners are cgroup v2, so the first CI run must record `kind: cgroup-v2`. No v1 path is hard-coded.

## 6. Design

### 6.1 File list and ownership (this table is the Lane B Task 3 row of the four-prompt table, copied)

The same table is in all four Phase 5 planning prompts. This plan keeps to its own rows. A "registration line" is a one-line
or one-entry edit in a shared file. The PR that merges second runs `git merge origin/main` and keeps both entries (a merge commit).

| Owner (build)                      | Owns (may create or change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Shared, registration line only                                                                                                                                                                                                                                                                                                                                                      | Must NOT touch                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane A, Task 1 (harness repo only) | everything in qa-portfolio-harness for H1, H2, H4: docker/{medusa,documenso,twenty,cal}.compose.yml, src/adapters/*, src/config.ts, tests, README, CHANGELOG, package.json version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                                                                                | the P6 repo, product forks, node_modules/                                                                                                      |
| Lane A, Task 2 (P6)                | package.json and package-lock.json (the harness pin only); every -h0.2.15 cache-key suffix line in perf.yml, knee.yml, gate.yml and soak.yml; tests/unit/harness-pin.test.ts; harness-flag env: lines in EXISTING LOAD steps of perf.yml and soak.yml (env only, no cap change); src/load/telemetry/{pg-top-queries,event-loop}.ts, src/load/telemetry/preload/el-delay.cjs, src/load/telemetry/sampler.ts, src/load/telemetry/run.ts, src/load/chart/*; tests/unit/telemetry-top-queries.test.ts, tests/unit/telemetry-event-loop.test.ts; the P6-X-LOAD-009 A/A step; README "How to read the chart" and harness-version lines; harness-flag lines in .env.example (placeholders only) | none                                                                                                                                                                                                                                                                                                                                                                                | every Twenty load file below, the new Twenty load workflow or jobs, pages.yml, scripts/dashboard/_, src/dashboard/_, the soak-release workflow |
| Lane B, Task 3                     | k6/lib/twenty-auth.js, k6/journeys/tw-background.js, k6/cases/tw-background.js, k6/cases/tw-load-008.js, k6/cases/tw-load-010.js, src/load/reconcile/twenty.ts, src/load/telemetry/docker-stats.ts, a new Twenty limiter-profile module (functional values; name chosen in the Task 3 plan), tests/unit/reconcile-twenty.test.ts and its other new tests; the Twenty load CI home (default: a NEW workflow .github/workflows/twenty-load.yml, see Q-PLACE) with its foundation job and three empty, separated marker comments # >>> task4 jobs, # >>> task5 jobs, # >>> task6 jobs; README "Twenty load" section with the same three sub-markers                                         | scripts/load/run-load.ts and the case registry (Twenty entries); src/load/reconcile/index.ts; src/load/telemetry/sampler.ts (one hook for docker-stats); evidence-release.yml, pages.yml and tests/unit/evidence-release-ids.test.ts workflow-id list ONLY if Q-PLACE picks a new workflow, and then in a separate ci(evidence) PR after the workflow's first main run gives its id | perf.yml existing jobs, Lane A rows, Tasks 4–7 own files                                                                                       |
| Lane B, Task 4                     | k6/cases/tw-load-004.js, src/load/lost-update.ts, tests/unit/lost-update.test.ts, new Twenty oracle code in a NEW file (for example src/twenty/oracle-lost-update.ts); its job under # >>> task4 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                       | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export if a new file is impossible                                                                                                                                                                                                                                        | Tasks 3, 5, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 5                     | k6/cases/tw-load-005.js, new reset-token oracle code in a NEW file (for example src/twenty/oracle-reset-token.ts), its tests; src/twenty/mailpit.ts (append-only helpers); its job under # >>> task5 jobs (plus P6-TW-LOAD-011 if the gate opens); README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/reconcile/twenty.ts (one per-case hook); src/twenty/oracle.ts only as an appended export                                                                                                                                                                                                                                                                    | Tasks 3, 4, 6, 7 own files, Lane A rows                                                                                                        |
| Lane B, Task 6                     | k6/cases/tw-load-006.js, k6/cases/tw-load-009.js (gated), its tests; its job (own Twenty start with image-default limits and its own down) under # >>> task6 jobs; README under its sub-marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | case registry; src/load/recovery.ts (reuse; an appended export only if needed)                                                                                                                                                                                                                                                                                                      | the functional-profile module (reads it never), Tasks 3, 4, 5, 7 own files, Lane A rows                                                        |
| Lane C, Task 7                     | a NEW workflow that captures the weekly soak (default name .github/workflows/soak-release.yml), the weekly summary writer (new script), the trend module (roadmap name src/load/soak/trend.ts, or src/dashboard/soak/weekly-trend.ts if the probe shows that is where readers live), its render section, tests/unit/soak-trend.test.ts and fixtures, README trend section                                                                                                                                                                                                                                                                                                                | scripts/dashboard/build-site.ts (trend hook), src/dashboard/render/page.ts (one section call), pages.yml (add the new workflow to workflow_run and a step that lists p6-soak-* releases; contents: read stays)                                                                                                                                                                      | soak.yml (Lane A owns it; Task 7 reads the soak run's artefacts instead), perf.yml, every Lane A and Lane B file                               |

Merge order: Task 1 harness PRs, then the owner tags the harness; Task 2 (pin bump); Task 3 (if the Task 3 plan splits it, 3a foundation may merge before Task 2 and 3b, the verified functional profile, after Task 2); Tasks 4, 5 and 6 in any order after Task 3 (4 and 5 also need Task 2 merged for their CI; 6 does not); Task 7 any time. Task 8 (closeout) comes last and is not planned now.

**Gaps in that table (Q4).** Five shared files must change for this task and no row names them: `src/load/types.ts` (`LoadProduct`, `LoadCase`, `RunMeta`), `src/load/reconcile/types.ts` (`AuditProduct`, `AuditStageConfig`), `src/load/telemetry/stages.ts` (the `LOG_FILES` and `DATABASE_URL` maps keyed by `LoadProduct`, lines 27 and 47), `src/load/readiness.ts` (`READINESS`, line 8) and `src/load/telemetry/cgroup-stats.ts` (the discovery filter, line 54), plus `src/load/run-meta.ts` (the `limiterProfile` field). Each change is one line or one entry. Owner decision (Q4, DECIDED): accepted as registration lines of Lane B Task 3, listed below.

Accepted registration lines (Q4, DECIDED), part of the Lane B Task 3 row:

- `src/load/types.ts`: `LoadProduct` gains `"twenty"`; `LoadCase` gains `gated?: boolean`; `RunMeta` gains `limiterProfile?`.
- `src/load/reconcile/types.ts`: `AuditProduct` gains `"twenty"`; `AuditStageConfig` gains the twenty variant.
- `src/load/telemetry/stages.ts`: `LOG_FILES.twenty` (empty) and `DATABASE_URL.twenty`.
- `src/load/readiness.ts`: `READINESS.twenty`.
- `src/load/telemetry/cgroup-stats.ts`: a per-product container name for `discoverContainer` (`twenty` → `qa-harness-twenty-db-1`).
- `src/load/run-meta.ts`: writes `limiterProfile` when it is set.

### 6.2 Data flow (one run)

The runner order is fixed by `src/load/runner.ts` (`ORDER`, line 39 region): `setup → preflight → samplerStart → k6 → samplerStop →
drain → reconcile → cleanup → tokenScan → verdict`. For `TW-BG-FOUNDATION`:

1. **setup** (`twentySetup`, §6.5): read the Twenty env (`src/twenty/env.ts`), open the read-only pool, sign in and exchange
   the workspace token (`signInWorkspace`, `src/twenty/auth.ts`), resolve the workspace schema (`resolveWorkspaceSchema`,
   `src/twenty/oracle.ts`), set `ctx.secrets.TWENTY_TOKEN`, `ctx.config.audit`, `ctx.meta.limiterProfile`.
2. **preflight**: `ok` (the existing stage). Build-time check §5 row 8 runs as a read-only preflight in 3b.
3. **samplerStart** (`samplerStart`, `src/load/telemetry/stages.ts`): the product sources for `twenty` (§6.4).
4. **k6**: `runAllK6` runs `k6/cases/tw-background.js` with `P6_LOAD_CONFIG` and the secret env `TWENTY_TOKEN`.
5. **samplerStop**, **drain** (`ok`).
6. **reconcile**: the validity judge (existing), then `reconcileTwenty` (§6.7).
7. **cleanup**: `twentyCleanup` (sweep, then the leak check, §8).
8. **tokenScan**: the existing scan of the run directory.
9. **verdict**: the existing writer. Outcome from `evaluateVerdict` (`src/load/runner.ts`).

### 6.3 Limiter profiles and the functional values

`src/twenty/limiter-profile.ts` (NEW) holds the two profiles. Only the functional profile sets anything.

| Environment name                          | Functional value | Image default (fork pin)          | Why                                                     |
| ----------------------------------------- | ---------------- | --------------------------------- | ------------------------------------------------------- |
| `API_RATE_LIMITING_SHORT_TTL_IN_MS`       | `1000`           | 1000 (`config-variables.ts:1713`) | unchanged                                               |
| `API_RATE_LIMITING_SHORT_LIMIT`           | `100`            | 100 (`:1722`)                     | unchanged; headroom 5× over the 20 rps ceiling          |
| `API_RATE_LIMITING_LONG_TTL_IN_MS`        | `60000`          | 60000 (`:1730`)                   | unchanged                                               |
| `API_RATE_LIMITING_LONG_LIMIT`            | `3600`           | 100 (`:1739`)                     | raised by the formula below                             |
| `APPLICATION_API_RATE_LIMITING_TTL_IN_MS` | `60000`          | 60000 (`:1748`)                   | unchanged (application clients are not used in Phase 5) |
| `APPLICATION_API_RATE_LIMITING_LIMIT`     | `500`            | 500 (`:1757`)                     | unchanged                                               |

**Formula.** For each window `W` (seconds), `LIMIT_W = ceil(P_peak × W × H)`, where `P_peak` is the peak request rate of
all functional Phase 5 runs and `H` is the headroom factor. `P_peak = 20` requests per second is the **design ceiling**
for every functional run in Phase 5: the Task 3 `full` profile is 2 iterations/s × 4 requests = 8 rps, and the ceiling
leaves 2.5× for Tasks 4 and 5, which must keep their peak at or below 20 rps or change this table (Q8). `H = 3`.
Long window: `ceil(20 × 60 × 3) = 3600`. Short window: `ceil(20 × 1 × 3) = 60`, which is below the default 100, so the
short limit keeps its default.

**What the values do, and do not do.** The limiter binds only `apiKey` and `application` spenders (P10). The user-token
journeys of Tasks 3, 4 and 5 are not limited at image defaults (P8, P9). So the functional profile changes the result
only for API-key clients, and no Phase 5 journey uses one. The profile is still applied, recorded and checked (Q8).

**Verification (3b only).** Before a functional run, the job reads each of the six names from the running server
container (`docker compose … exec -T server printenv <name>`, read-only) and compares it with the profile. A mismatch is
`ENV` (§7, O9). Until harness v0.2.16 (H4) reaches the containers, this check fails, and 3b must not run (Q2, P19). The API-key 429 proof in §5 row 6 is the second check.

### 6.4 Telemetry: container sources and `docker-stats`

`src/load/telemetry/docker-stats.ts` (NEW) reads the three Twenty containers without `docker stats` (P21):

```ts
export const TWENTY_CONTAINER_ROLES = ["server", "worker", "db"] as const;
export interface TwentyContainer {
  role: (typeof TWENTY_CONTAINER_ROLES)[number];
  name: string;
  id: string;
  kind: CgroupKind;
}
export async function discoverTwentyContainers(
  exec?: (cmd: string, args: string[]) => Promise<string>,
): Promise<TwentyContainer[]>;
// For each role: docker ps --filter name=qa-harness-twenty-<role>-1 (exact name), then docker inspect -f {{.Id}}.
// A role that is not running is left out and reported in the sampler's sources (never a throw).
export function readContainerSample(
  c: TwentyContainer,
): { cpuNs: number; memBytes: number } | undefined;
// Calls readContainerStats(c.kind, c.id) (src/load/telemetry/cgroup-stats.ts:69, existing). Undefined when unreadable.
export function readProcSample(
  pid: number,
): { rssKb: number; threads: number; fds: number } | undefined;
// Reads /proc/<pid>/status (VmRSS, Threads) and counts /proc/<pid>/fd. Undefined when unreadable.
```

`openSources("twenty")` (`src/load/telemetry/stages.ts`, registration line for `DATABASE_URL.twenty` = `twentyDatabaseUrlFromEnv`)
gives the pool (port 5434, one connection, `max: 1`), the readiness URL `${TWENTY_BASE_URL}/healthz` (`READINESS.twenty`), no
log file (the Twenty container logs are captured by the job, §2.8 step 14), and no single app process. The database
container is found by `discoverContainer` (`cgroup-stats.ts:46`). Its filter is changed to a per-product name pattern: `qa-harness-twenty-db-1` for Twenty (P20, Q4).

The sampler (`src/load/telemetry/sampler.ts`, registration line) takes one optional `containers?: TwentyContainer[]`. When set,
each tick adds `containers: [{ role, cpuNs, memBytes, rssKb, threads, fds }]`. Off by default, so no other product changes.
The sample cost is recorded in `sampleCostMs` (existing). The measured read cost is about 6 ms per tick for three containers
(P22: 35 ms for 20 reads of one file).

### 6.5 Setup and cleanup stages: `src/load/products/twenty.ts` (NEW)

```ts
export interface TwentyDeps {
  openPool: () => pg.Pool; // createReadOnlyPool(twentyDatabaseUrlFromEnv())
  signIn: (env: NodeJS.ProcessEnv) => Promise<{ authorizationHeader: string; origin: string }>; // signInWorkspace
  resolveSchema: (
    pool: pg.Pool,
    subdomain: string,
  ) => Promise<{ workspaceId: string; schema: string }>;
  listPrefixedIds: (pool: pg.Pool, schema: string, prefix: string) => Promise<string[]>; // read-only SELECT
  destroy: (ids: string[], authorizationHeader: string) => Promise<string[]>; // GraphQL, one call per id
  leakCount: (pool: pg.Pool, schema: string, prefix: string) => Promise<number>; // companyRowsByPrefix
}
export async function twentySetupWith(ctx: LoadContext, deps: TwentyDeps): Promise<StageResult>;
// Errors: any failure returns { ok: false, kind: "ENV", reasons: ["twenty setup failed: <message>"] } (the message holds no token).
// Sets: ctx.secrets.TWENTY_TOKEN, ctx.config.audit = { product: "twenty", prefixLike, schema }, ctx.handles.twentyPool, ctx.meta.limiterProfile.
export async function twentyCleanupWith(ctx: LoadContext, deps: TwentyDeps): Promise<StageResult>;
// Sweep (ids of prefixed companies, live and soft-deleted, then destroy), then leak = leakCount; leak !== 0 → TEST BUG.
export const twentySetup = (ctx: LoadContext) => twentySetupWith(ctx, defaultTwentyDeps);
export const twentyCleanup = (ctx: LoadContext) => twentyCleanupWith(ctx, defaultTwentyDeps);
```

**Per-case auth (§2.12).** `src/load/products/twenty.ts` holds `TWENTY_CASE_AUTH` (case id → `"userToken"` or `"apiKey"`),
copied from the frozen table of §2.12, and `LIMITER_CLAIM_CASES` (the four ids of rule O10). Setup always signs in for the
user token. For an `apiKey` case it then calls `createRunApiKey` (§2.13) and sets `ctx.secrets.TWENTY_API_KEY`. A case in
`LIMITER_CLAIM_CASES` whose auth is not `apiKey` pushes `"rate-limit claim without an API key (by design, O10)"` to `ctx.invalid`
and returns ok. Its `runs()` then returns no k6 run (`ctx.invalid.length > 0 ? [] : [...]`), so the verdict is INVALID through the
runner's existing path (`evaluateVerdict`, `src/load/runner.ts:54`).

The limiter profile name comes from `P6_TWENTY_LIMITER_PROFILE` (set by the workflow step, §6.8). A missing or unknown name
is `ENV`. The stage writes the profile name to `ctx.meta` (Q4 adds the field to `RunMeta`), so `run-meta.json` records it.

### 6.6 The background journey (k6) skeleton

```js
// k6/journeys/tw-background.js (NEW)
import http from "k6/http";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { authorizationHeader, restHeaders } from "../lib/twenty-auth.js";
export const createdCounter = new Counter("p6_tw_created");
export const updatedCounter = new Counter("p6_tw_updated");
export const serverErrorCounter = new Counter("p6_tw_5xx");

export function runTwBackground(cfg, opts = {}) {
  const headers = restHeaders(authorizationHeader());
  const n = exec.scenario.iterationInTest;
  const name = `${cfg.prefix}-${n}-a`; // companyName(prefix, trial, side) in src/twenty/payloads.ts:4
  // 1. POST /rest/companies {name}  → 2xx: createdCounter.add(1), keep the id through the existing `createCompany` parser (`src/twenty/api.ts`, `{ data: { createCompany: { id } } }`; §5 row 7)
  // 2. GET  /rest/companies/<id>    → read back the name (a check, not a counter)
  // 3. PATCH /rest/companies/<id> {name: name + "-u"} → 2xx: updatedCounter.add(1)
  // 4. GET  /rest/companies/<id>    → read back the new name
  // Any status >= 500 → serverErrorCounter.add(1). Returns { created: [id], patched: 0 | 1, serverErrors: count }.
  return { created: [], patched: 0, serverErrors: 0 }; // skeleton; the build fills the four steps
}
```

The case script composes the journey as `k6/cases/doc-load-001.js` does (§2.3). The journey uses `k6/lib/http.js` only
through `restHeaders`; it adds no retry (the Phase 3 retry rules apply only to the Phase 4 journeys).

### 6.7 The reconcile hook: `src/load/reconcile/twenty.ts` (NEW)

```ts
export interface BackgroundCounts {
  created: number;
  patched: number;
  serverErrors: number;
  limited429: number;
}
export interface BackgroundRows {
  total: number;
  updated: number;
} // rows with the prefix (any state); updatedAt > createdAt
export function judgeBackground(counts: BackgroundCounts, rows: BackgroundRows): Finding[];
// Pure. created != total → PRODUCT BUG (total < created: lost write) or TEST BUG (total > created: phantom row).
// patched != updated → PRODUCT BUG (updated < patched) or TEST BUG (updated > patched).
// serverErrors > 0 → PRODUCT BUG "5xx on background journey" (SUSPECTED until it repeats, rule 13).
// limited429 > 0 → TEST BUG "limiter engaged on a user token" (a finding about the profile, not a product verdict).
export async function reconcileTwenty(
  pool: pg.Pool,
  cfg: TwentyAuditConfig,
  clientCount: number | undefined,
  counts?: BackgroundCounts,
): Promise<AuditResult>;
// SCHEMA_RE pattern (module-local in src/twenty/oracle.ts; the build copies it into src/load/reconcile/twenty.ts and does not edit src/twenty/oracle.ts), then one SELECT count(*), count(*) FILTER (WHERE "updatedAt" > "createdAt") FROM "<schema>".company WHERE name LIKE $1.
// Returns an AuditResult (schema 1, src/load/reconcile/types.ts) with checks named "created-vs-rows", "patched-vs-updated", "5xx", "429".
```

Registration in `src/load/reconcile/index.ts`: `case "twenty":` in `reconcile()` (line 75 region) calls `reconcileTwenty`,
and `CLIENT_COUNTER.twenty = "p6_tw_created"` (line 54 region). The `counts` input is read from the k6 summary by the
case's own stage (`summaryCounter`, `src/load/reconcile/index.ts`, existing).

### 6.8 CI: `.github/workflows/twenty-load.yml` (NEW)

```yaml
name: twenty-load
on:
  pull_request:
    paths:
      [
        ".github/workflows/twenty-load.yml",
        "k6/**",
        "src/load/**",
        "src/twenty/**",
        "scripts/load/**",
        "scripts/ci/**",
        "package.json",
        "package-lock.json",
      ]
  push:
    branches: [main]
    paths:
      [
        ".github/workflows/twenty-load.yml",
        "k6/**",
        "src/load/**",
        "src/twenty/**",
        "scripts/load/**",
        "scripts/ci/**",
        "package.json",
        "package-lock.json",
      ]
  workflow_dispatch:
    inputs:
      profile:
        description: "pr or full (dispatches default to full)"
        required: false
        default: full
        type: choice
        options: [full, pr]
  schedule:
    - cron: "43 3 * * *" # nightly, off perf.yml's 02:17 UTC
permissions:
  contents: read
concurrency:
  group: twenty-load-${{ github.event_name == 'schedule' && 'nightly' || github.event_name == 'workflow_dispatch' && github.run_id || github.ref }}
  cancel-in-progress: true
jobs:
  twenty-load-foundation: # steps and caps: §2.8
    runs-on: ubuntu-24.04
    timeout-minutes: 80 # 70 (sum of step caps) + 10
    env:
      P6_WORKING_DIRECTORY: p6
      PRODUCTS_ROOT: ${{ github.workspace }}/products
      TWENTY_REF: 7cbdfec6f346b43715bc2056932f4fad5886f733 # must equal scripts/bootstrap.sh (step 6 checks it)
      TWENTY_IMAGE_TAG: v2.44.0
      TAG: v2.44.0
      TWENTY_BASE_URL: http://127.0.0.1:3002
      P6_TWENTY_DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5434/default # public harness default, not a secret
      TWENTY_DOWN_VOLUMES: "1"
      P6_PROFILE: ${{ github.event_name == 'pull_request' && 'pr' || inputs.profile || 'full' }}
      P6_TWENTY_LIMITER_PROFILE: productionLike # 3b: functional (the six env entries, §6.3, on the up step)
    steps: [] # the 15 steps of §2.8, in that order
# >>> task4 jobs

# >>> task5 jobs

# >>> task6 jobs
```

Why the triggers: `pull_request` with paths runs the short profile only when Twenty load code changes; `push` to `main` runs
the full profile on merge; the nightly cron gives the roadmap's scheduled evidence; `workflow_dispatch`
lets the owner run the runs for the closeout medians (P4: medians come only from at least 3 VALID Actions runs). The concurrency group keeps a nightly run and a push
from cancelling each other, the same pattern as `perf.yml:21–25`.

The step `up:twenty` takes `env:` entries from `limiterProfileEnv(...)` (§2.6). In 3a it is empty (`productionLike`). The
YAML values for `functional` are written by hand in the 3b job and checked against `src/twenty/limiter-profile.ts` by
`tests/unit/twenty-load-workflow.test.ts` (no drift).

### 6.9 Case registry and gate guard (registration lines)

- `src/load/cases.ts`: `TW_BG_FOUNDATION` (§2.4) and the gated `P6_TW_LOAD_008`, `P6_TW_LOAD_010` (`gated: true`, no `runs`
  until their gate opens). Add the three entries to `CASES` (`src/load/cases.ts:1462`).
- `scripts/load/run-load.ts`: after `found` is resolved (line 37 region), `if (found.gated) fail("ENV: case " + found.id + " is gated (NOT RUN)")`.
- The workflow calls the runner directly: `node scripts/load/run-load.ts --case TW-BG-FOUNDATION --profile "$P6_PROFILE"`.
  No npm script is added (P32, §10 conflict 6).

## 7. Oracles and verdict rules

Verdict words: **PASS** (every check holds), **FAIL** (a PRODUCT BUG or TEST BUG, or a k6 exit code not allowed), **INVALID**
(the validity judge says the run is not valid), **ENV** (setup or preflight failed), **NOT RUN** (a gated case whose gate is
closed). Labels follow rule 13: PRODUCT BUG is SUSPECTED until a repeated full-count run reproduces it.

| ID  | check                      | formula                                                                                                   | where the number lives                           | a violation is                                                                                                                                              |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | created rows               | `rows(all states, prefix) == p6_tw_created`                                                               | exact equality, no tolerance                     | `rows < created`: PRODUCT BUG (lost write). `rows > created`: TEST BUG (phantom or prefix collision)                                                        |
| O2  | updated rows               | `rows(updatedAt > createdAt, prefix) == p6_tw_updated`                                                    | exact                                            | `<`: PRODUCT BUG (lost update). `>`: TEST BUG                                                                                                               |
| O3  | server errors              | `p6_tw_5xx == 0`                                                                                          | exact                                            | PRODUCT BUG, SUSPECTED until repeated                                                                                                                       |
| O4  | no response                | every k6 request has a status                                                                             | exact                                            | TEST BUG (harness or network)                                                                                                                               |
| O5  | limiter at production-like | HTTP 429 count `== 0` on the user token                                                                   | exact                                            | TEST BUG "limiter engaged on a user token" (a finding for §10)                                                                                              |
| O6  | k6 thresholds              | `checks: rate==1`, `http_req_failed: rate==0`                                                             | `standardOptions` (`k6/lib/pure/options.js:120`) | k6 exit 99 → FAIL                                                                                                                                           |
| O7  | leak after cleanup         | `leakCount(prefix, all states) == 0`                                                                      | `twentyCleanupWith`                              | TEST BUG → FAIL                                                                                                                                             |
| O8  | validity                   | the existing judge (dropped iterations, VU exhaustion, telemetry gaps, clock skew)                        | `src/load/validity.ts`                           | INVALID                                                                                                                                                     |
| O9  | functional env (3b)        | each of the six names equals the profile value inside `server`                                            | the preflight read (§6.3)                        | ENV                                                                                                                                                         |
| O10 | auth for limiter claims    | a case in `LIMITER_CLAIM_CASES` (P6-TW-LOAD-004, -006, -008, -009) runs only with `auth = apiKey` (§2.12) | the frozen table of §2.12                        | INVALID by design: setup pushes the reason to `ctx.invalid`, the case's `runs()` returns no k6 run, and the verdict is INVALID (the runner's existing path) |

There are **no latency or throughput thresholds** in this foundation (the roadmap sets none). Latency percentiles are
reported, not gated. The background journey's `checks` threshold is the only gate on the k6 side.

**P6-TW-LOAD-010 (gated):** PASS when the Twenty worker backlog (`LLEN :wait` + `LLEN :active` + `ZCARD :delayed`, in the
`workspace-queue` and `webhook-queue` lists the journey writes to) reaches zero inside the drain window, and the drain time is
recorded. FAIL when it does not reach zero inside the window (PRODUCT BUG candidate). INVALID when the monitor cannot read the
queue more than once in five seconds. The drain window is a bound on the wait, not a latency target; the build records it
from its own probe (Q6).

**P6-TW-LOAD-008 (gated):** the Phase 4 knee stop rule, unchanged, on the background journey with the functional profile.
PASS when the stop rule ends the run and no limiter 429 caused the stop; FAIL when the limiter ends it (recorded as a
finding); otherwise the step range is reported (P6-RULE-006).

## 8. Data isolation, cleanup and leak check

- **Prefix.** `p6RunPrefix()` (`src/races/prefix.ts`, existing) → `caseDataPrefix(runPrefix, "TW-BG-FOUNDATION")`
  (`k6/lib/pure/prefix.js:19`). Every company name is `<prefix>-<n>-<side>`. A name without the prefix is never touched.
- **Sweep.** `listPrefixedIds` is a read-only `SELECT id FROM "<schema>".company WHERE name LIKE '<prefix>%'` (any deletion
  state). `destroy` calls the product's GraphQL `destroyCompany` once per id (`src/twenty/api.ts`, existing mutation). Writes
  go through the product's API, never through the oracle pool.
- **Leak check.** `leakCount` (`companyRowsByPrefix`, `src/twenty/oracle.ts`, existing) counts rows of any state after the
  sweep. It must be 0. A soft-deleted row that `destroyCompany` cannot remove is a leak and fails the job (rule O7). Whether
  `destroyCompany` hard-deletes a soft-deleted row is NOT PROBED (§5 row 7); the build checks it on a one-row smoke first.
- **Token.** `TWENTY_TOKEN` lives in `ctx.secrets` and reaches only the k6 process named in `secretEnv`. It is never written
  to a file. The token scan (`scanOutDir`, `src/load/stages.ts`; and the workflow's token-scan step) runs on every result file.
- **API key (per run, §2.13).** The seeded key is created in setup only for `apiKey` cases, is named with the run prefix,
  is revoked in cleanup, and the leak query (active rows with the prefix must be 0) checks it. Its value is never printed,
  logged or written to a file; it reaches k6 only through `secretEnv`. The workflow's token scan must match the key's format (§2.13).
- **Credentials.** The Twenty dev credentials come from `src/twenty/env.ts` defaults (the harness's public dev seed). They
  are read in memory and never printed (rule O4).
- **Redis (3b, P6-TW-LOAD-010 only).** Read-only commands only, from a whitelist of `SCAN`, `TYPE`, `LLEN`, `ZCARD`,
  `DBSIZE`. Any other command name throws `TEST BUG: redis command not allowed`. A unit test covers the whitelist.
- **Limiter state.** Read-only check in preflight (3b): speed keys are 0 before a functional run (Q9).

## 9. CI budget (rule C4)

Job `twenty-load-foundation` (new). Rule C3 is met by construction: job timeout 80, sum of step caps 70, margin 10.

| job                                       | job timeout | each step and its cap                                                                                                                                                                                             | sum of step caps | worst case | margin (>= 10 min) |
| ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | ------------------ |
| twenty-load-foundation (3a)               | 80          | checkout 3; setup-node 3; npm ci 5; k6 setup 3; bootstrap 3; verify TWENTY_REF 1; compose pull 6; up:twenty 12; seed 10; smoke 2; LOAD run 10; token scan 2; artefact upload 3; container logs 2; down (always) 5 | 70               | 70         | 10                 |
| twenty-load-foundation (3b adds one step) | 82          | + verify limiter env in server (read-only printenv) 2                                                                                                                                                             | 72               | 72         | 10                 |

The API-key create and revoke run inside the LOAD step (cap 10 min), so the sum of caps does not change for either profile.

Measured in this session (not published, P4): pull 26 s, bootstrap 12 s, up 127 s, seed 76 s, smoke under 1 s.
Triggers and expected run lengths: PR (`pr` profile, an estimate of about 8 min), push to `main` and nightly and dispatch (`full`,
an estimate of about 10 min). The timeouts of every existing job are unchanged (C1). The existing `twenty-smoke`, `twenty-races`
and `twenty-obs` jobs do not meet C3 read literally (P31); they are recorded, not changed (Q11).

## 10. Roadmap conflicts and cross-task notes

### 10.1 Conflicts with the roadmap (numbered; the numbers are referenced in §4 and §6)

| #   | roadmap says                                                                                                                     | probe shows                                                                                                                                                                                                    | decision or open question                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Twenty's limiter appears to be ON by default ... every Twenty run is limited at about 100 requests/minute" (roadmap D2 note 1)  | User-token bursts of 150 requests: 0 × 429, no rate-limit headers, no speed key in Redis (P8, P9). The limiter binds only `apiKey` and `application` spenders (P10).                                           | Record the observation. The user-token path is not limited at image defaults. Tasks 4 and 5 are not shaped by the limiter; Task 6 must use API keys to see a 429 (P11).                 |
| 2   | Functional profile (D3) is used by `-004` and `-005` because the limiter would shape them                                        | Those journeys use the user token, so the profile changes nothing at image defaults (P8, P9).                                                                                                                  | Keep D3 as agreed (the profile is applied and recorded per run, and protects against a future limiter change). The owner should know the Task 4 and 5 results do not depend on it (Q8). |
| 3   | The Task 3 LOAD step sits inside `twenty-smoke` (roadmap "Scope", CI)                                                            | `twenty-smoke` is capped at 20 min (`perf.yml:1781`) and its 17 step caps sum to 95 min (P31).                                                                                                                 | A new job in a new workflow (Q1, DECIDED). The existing job is not changed here; it joins the owner-tracked ci(perf) budget PR (Q11, DECIDED).                                          |
| 4   | H4 is "opt-in passthrough of `API_RATE_LIMITING_*` only" (roadmap D6)                                                            | The application limits are named `APPLICATION_API_RATE_LIMITING_*` (`usage-limit-definitions.constant.ts:45–46`), which does not start with `API_RATE_LIMITING_`.                                              | H4's allowlist must name the six exact variables (Q5). This is a request to Lane A's Task 1.                                                                                            |
| 5   | Container telemetry through `docker stats` (roadmap "Scope", telemetry)                                                          | `docker stats --no-stream` costs about 1 s per container (P21).                                                                                                                                                | Read cgroup and `/proc` files per container (P22, P23). `docker stats` stays only as the existing slow fallback.                                                                        |
| 6   | Each LOAD case has a `load:*` npm script (roadmap is silent; existing pattern P32)                                               | This task would need a `package.json` edit, which Lane A's Task 2 owns for the pin only.                                                                                                                       | The workflow calls `node scripts/load/run-load.ts --case …` directly. No npm script is added.                                                                                           |
| 7   | The DB container is found by the existing discovery (roadmap "container telemetry" for Twenty)                                   | The filter is `qa-harness-<product>-postgres`; Twenty's DB is `qa-harness-twenty-db-1` (P20).                                                                                                                  | A per-product name pattern in `cgroup-stats.ts` (Q4).                                                                                                                                   |
| 8   | "Phase 2 Task 6 decides the mechanism" for k6 auth (roadmap "Scope", `k6/lib`)                                                   | The harness `authenticate()` supports an API key (`Bearer <key>`, `twenty.adapter.ts:258–263`) and sign-in. `src/twenty/auth.ts` signs in and exchanges the user token. The limiter binds only API keys (P10). | Per-case auth, frozen in §2.12: the user token for the foundation; a seeded API key for every limiter-relevant or capacity case. Q10 (revised, DECIDED).                                |
| 9   | Gate for `P6-TW-LOAD-008`: "H4 raises the limits enough that the stop rule, not the limiter, ends the run"                       | H4 is not tagged. At image defaults the user-token path is not limited (P8, P9), so the limiter is not the stop today.                                                                                         | The gate stays closed until H4 is tagged and pinned and a dry run shows the stop rule ends the run (Q7).                                                                                |
| 10  | Gate for `P6-TW-LOAD-010`: "job state readable from outside without writes (e.g. a read-only queue inspect the harness exposes)" | The harness exposes no queue endpoint. BullMQ state is readable with read-only Redis commands through `docker compose exec` (P18).                                                                             | Open the gate on that evidence if the owner accepts the exec route (Q6).                                                                                                                |
| 11  | Gate for `P6-TW-LOAD-011` (Task 5): expiry ≤ 15 min                                                                              | `PASSWORD_RESET_TOKEN_EXPIRES_IN = '5m'` (P17).                                                                                                                                                                | Cross-task note for Task 5 (§10.2). Not a Task 3 decision.                                                                                                                              |
| 12  | Plan branches get no PR (agent rule A.6; B.10)                                                                                   | The task prompt's section 7 asked for one plan PR.                                                                                                                                                             | The owner closes the review PR unmerged. Plan branches never get a PR and never merge; section 7 step 6 of the prompt is void.                                                          |
| 13  | Roadmap "files likely touched" for Task 3                                                                                        | Five shared files and one run-meta field are needed (§6.1 gaps).                                                                                                                                               | Registration lines, accepted (Q4, DECIDED).                                                                                                                                             |
| 14  | Prompt: "B0 was 1403 after PR #157"                                                                                              | Measured 1405 on `5215127` (P35).                                                                                                                                                                              | B0 = 1405 (re-measured at build start, §5).                                                                                                                                             |
| 15  | Roadmap Note 3 and D3: set `API_RATE_LIMITING_*` for the functional profile through H4                                           | The harness compose passes only `TAG` and `TWENTY_BASE_URL` into the compose environment, and the overlay does not reference any rate-limit name (P19).                                                        | Until H4 reaches the containers, a functional env is a no-op. That is why 3a is production-like and 3b waits for the pin (Q2).                                                          |
| 16  | Roadmap D2 note 1: production-like limits are "image defaults, nothing set"                                                      | Confirmed for the names checked: no `API_RATE_LIMITING_*` name in the image env (P27).                                                                                                                         | No conflict. Recorded.                                                                                                                                                                  |
| 17  | The roadmap's probe item "which routes the limiter guards"                                                                       | Covered: root query-runner operations, REST and GraphQL data calls. `/metadata` auth is not covered (P14).                                                                                                     | Recorded. The route list is final for this task.                                                                                                                                        |
| 18  | Roadmap's "Twenty job time with seed (Phase 2 Task 6 measures first boot)"                                                       | Measured in this session: up 127 s, seed 76 s (P3, P4).                                                                                                                                                        | Used for the caps (§2.8).                                                                                                                                                               |

### 10.2 Cross-task notes (for the plans of Tasks 2, 4, 5 and 6; not decided here)

- **Task 2 (Lane A, pin bump).** 3b waits for this pin bump to reach harness v0.2.16 (Q2, Q5). `shared_preload_libraries` is empty and `pg_stat_statements` is not installed on the
  Twenty DB in this stack (P26), so the Task 2 top-query rows cannot read Twenty until H1 reaches it. Task 2's
  `sampler.ts` and `run.ts` changes overlap this task's one-hook edit in `sampler.ts`: whichever PR merges second
  merges the other's line.
- **Task 4 (`P6-TW-LOAD-004`).** Auth: API key (§2.12). The journey's writes are plain PATCH calls. The roadmap's probe item "whether PATCH writes
  only the sent fields" is still open for Task 4 (not probed here: writes).
- **Task 5 (`P6-TW-LOAD-005`, `-011`).** Auth: user session (§2.12). (a) Password-reset requests are throttled to 3 per 15 minutes per email
  (`auth.resolver.ts:126–127` and `:1127–1131`, P15), so each throwaway user may request at most three resets per window.
  (b) `CaptchaGuard` is on the reset mutation, but no captcha driver is set by default and the factory returns
  `disabled` (`captcha-driver.factory.ts:27–28`, P16). Whether `validate()` passes when disabled is NOT PROBED.
  (c) The reset token expires after `5m` (`config-variables.ts:143`, P17): the `-011` gate (≤ 15 min) looks open.
- **Task 6 (`P6-TW-LOAD-006`, `-009`).** Auth: API key, required (§2.12); `-009` uses two keys. A 429 needs an API-key client (P10, P11). The production-like profile is
  image defaults. Redis state resets on a fresh `up` because the Redis container has no volume (P12). `-009` fairness
  needs two keys, which Task 6 creates in its own setup (a write through the API, not the oracle).

## 11. EXTRA cases (labelled EXTRA, no new P6 ID)

Each extra is proposed only. It is in scope only if the owner accepts it and the budget fits (§9 has no room in the
foundation job; an extra runs as its own step only after 3a is green).

| label                            | question                                                              | oracle                                                                       | cost                                               | note                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| EXTRA-A (replay of a create)     | does a repeated identical `POST /rest/companies` create a second row? | each replay is counted; the expectation is recorded as a finding, not a pass | 2 requests per sampled iteration, 1% of iterations | Twenty's REST create has no idempotency key in the calls this plan uses (`src/twenty/api.ts`).                                         |
| EXTRA-B (authorisation boundary) | can a Limited member PATCH a company created by the Admin?            | `403` or `404`, and the row is unchanged in the DB (read-only check)         | 2 requests per sampled iteration                   | Uses the seeded Limited member from the harness seed list (`twenty.adapter.ts`, `seedUsers`); the dev password is read in memory only. |
| EXTRA-C (error codes under load) | do invalid or missing ids return 401 or 404, never 500?               | status class per request; 500 is a PRODUCT BUG (SUSPECTED)                   | 1% of iterations, one request each                 | P7 shows the invalid-bearer status is 401.                                                                                             |

## 12. Gates

| case           | gate condition (roadmap)                                             | evidence now                                                                                                                | status                                                                                       | opens when                                                                                                                       |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P6-TW-LOAD-010 | job state readable from outside without writes                       | P18: `LLEN`, `ZCARD`, `TYPE`, `SCAN` on BullMQ keys through `docker compose exec redis-cli` work and are read-only          | **NOT RUN** until Q6 is accepted and the 3b monitor proves a read during a burst (§5 row 10) | Q6 accepted, a dispatch shows the backlog rising and draining, then at least 3 VALID runs before any medians                     |
| P6-TW-LOAD-008 | H4 raises the limits so the stop rule, not the limiter, ends the run | H4 not tagged (P19). At image defaults the user-token path is not limited (P8, P9), so the knee runs on an API key (§2.12). | **NOT RUN** (gate closed)                                                                    | harness v0.2.16 (H4, six names) pinned by Task 2, an API-key knee (§2.12), and a dry run whose stop reason is the stop rule (Q7) |

## 13. Environment changes (rule E1)

**No environment change, in either cloud.** Every tool the probe used worked in this Claude Code cloud session with no
change: Docker 29.9.2 and Compose v5.6.1 (`/usr/bin/docker`), Node v22.23.3 first on `PATH`, k6 v2.3.0 (`.k6-version`,
installed by the session hook), the harness scripts, and the cgroup v1 files the telemetry reads (P22). Cursor cloud was
not probed in this session; the build re-checks row 9 of §5 there (the cgroup layout and `docker stats` cost) before its
first run. The GitHub-hosted runner's cgroup layout is also NOT PROBED here (§5 row 9): the first CI run records it.

## 14. Done when (roadmap, made measurable) and rule self-check

### 14.1 Done when

The roadmap's Task 3 "Done when", adjusted only by the agreed decisions:

1. The background journey runs VALID with telemetry, a chart and a clean Twenty audit **on the PR and once on `main`**.
   Measurable: `TW-BG-FOUNDATION` `verdict.json` `outcome: PASS`, `validity.verdict: VALID`, `audit.json` with no violation,
   on the PR run and on the push run.
2. The active limiter profile is recorded per run. Measurable: `run-meta.json` `limiterProfile` is present on every run
   (3a: `productionLike`; 3b: `functional`).
3. `P6-TW-LOAD-010` and `P6-TW-LOAD-008` each land (at least 3 VALID runs), or each is listed under "Later" with its gate
   evidence. Measurable: §12 status updated in the 3b PR.
4. `npm run check` is green. Measurable: the unit count after each build step matches §14.2.

### 14.2 Unit count (B0 = 1405, measured on main at 5215127; the build re-measures at its start)

| build step (§16)                                           | expected new unit tests       | expected total |
| ---------------------------------------------------------- | ----------------------------- | -------------- |
| S1 (start, no commit)                                      | 0                             | 1405           |
| S2 (types and registration lines)                          | 0                             | 1405           |
| S3 (limiter profile)                                       | 4                             | 1409           |
| S4 (k6 helper, journey, case script)                       | 0 (`npm run k6:inspect` only) | 1409           |
| S5 (docker-stats and sampler hook)                         | 4                             | 1413           |
| S6 (reconcile hook)                                        | 6                             | 1419           |
| S7 (products stages, API-key helper, registry, gate guard) | 7                             | 1426           |
| S8 (workflow and its shape test)                           | 3                             | 1429           |
| S9 (README)                                                | 0                             | 1429           |
| S12 (3b functional profile)                                | 1                             | 1430           |

If a step's count differs, the build stops and explains (rule C.11). It never edits the expected number.

### 14.3 Rule self-check (section 0 of the task prompt and `docs/agent-rules.md`)

| rule                                                        | status for this plan                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1–N5 (no pause, unknowns probed, root causes, log updates) | met: every probe ran; the findings are root-caused in §4 and §10                                                                                                                                                                                                                                                                             |
| R1–R8 (GitHub and git)                                      | met, with one note: the identity used is the repository owner's (`get_me` returned the owner login, not the excluded account, so H1 did not apply); commits stage explicit paths; no force push; no merge; `add_repo` was used for the fork read                                                                                             |
| A.6 and B.10 (plan branches)                                | met: the plan branch carries the plan only; it gets no PR and never merges (owner's review decision)                                                                                                                                                                                                                                         |
| R5 (commit and PR text)                                     | met: no attribution footers, no session links in commit or PR text                                                                                                                                                                                                                                                                           |
| R6 (no personal names in repo text)                         | met: the text says "the owner"                                                                                                                                                                                                                                                                                                               |
| R7 (no comments, no @-mentions)                             | met: no PR or issue comment was posted                                                                                                                                                                                                                                                                                                       |
| F.20 (plan self-check)                                      | met: (a) the Done-when items are met or listed (§14.1, §12); (b) every existing name the plan cites was grepped (§14.4); (c) the CI estimates match between §2.8 and §9; (d) each new function has a skeleton and each build step has its command, expected output and commit (§16); (e) only the owner's answers are marked DECIDED (§17.1) |
| O1 (only the plan file is added)                            | met: `docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md` is the only file added                                                                                                                                                                                                                                                |
| O2 (no roadmap or earlier plan edited)                      | met                                                                                                                                                                                                                                                                                                                                          |
| O3 (no product fork or node_modules edit)                   | met: the fork checkout was used read-only; the harness wrote its gitignored docker env file in the fork's docker directory (harness behaviour, not a tracked change); no tracked file was edited                                                                                                                                             |
| O4 (no secret printed)                                      | met: tokens were printed as length only; the dev password was not printed; the DB URL is the harness public default                                                                                                                                                                                                                          |
| O5 (private items)                                          | met: no private-disclosure item is named or described in this file                                                                                                                                                                                                                                                                           |
| O6 (IDs unchanged, no renumbering)                          | met: `P6-TW-LOAD-008`, `-010` and `-011` are as the roadmap writes them; the foundation has no P6 ID (Q3)                                                                                                                                                                                                                                    |
| O7 (no weaker threshold)                                    | met: no threshold is set; the k6 thresholds are the existing ones                                                                                                                                                                                                                                                                            |
| O8 (no GitHub CLI)                                          | met                                                                                                                                                                                                                                                                                                                                          |
| P1 (probe first)                                            | met: §4                                                                                                                                                                                                                                                                                                                                      |
| P2 (products only through harness scripts)                  | met: Twenty was started, seeded and stopped only through `npm run up:twenty`, `seed:twenty` and `down:twenty`; the image pull used the CI script                                                                                                                                                                                             |
| P3 (no foreign process touched)                             | met: only the project `qa-harness-twenty` containers were read or stopped                                                                                                                                                                                                                                                                    |
| P4 (session timings are not published numbers)              | met                                                                                                                                                                                                                                                                                                                                          |
| P5 (one-shot image facts)                                   | met: P27 names its commands                                                                                                                                                                                                                                                                                                                  |
| C1–C5 (CI budget)                                           | met: no timeout raised; every new step has a cap; job timeout 80 = 70 + 10; the Twenty load job brings its product up and has its own down (C5)                                                                                                                                                                                              |
| E1 (environment)                                            | met: §13                                                                                                                                                                                                                                                                                                                                     |
| H1–H8 (hard stops)                                          | none hit (H1: the identity is the owner's; H3: the probe needed no secret beyond the public harness dev defaults; H5: no secret found in the files this probe read)                                                                                                                                                                          |

### 14.4 Name check (rule F.20(b))

Grepped on 2026-10-29 at the base SHA and the fork pin. "module-local" means the name is not exported. NEW names are created by the build and are not listed.

| name                                                                                     | where                                                                                                                       | status        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `signInWorkspace`                                                                        | `src/twenty/auth.ts`                                                                                                        | exists        |
| `createCompany`, `patchCompany`, `destroyCompany`                                        | `src/twenty/api.ts:59` and following                                                                                        | exist         |
| `resolveWorkspaceSchema`, `companyRowsByPrefix`                                          | `src/twenty/oracle.ts:19`, `:100`                                                                                           | exist         |
| `SCHEMA_RE`                                                                              | `src/twenty/oracle.ts:4`                                                                                                    | module-local  |
| `companyName`                                                                            | `src/twenty/payloads.ts`                                                                                                    | exists        |
| `createReadOnlyPool`, `selectRows`, `closePool`                                          | `src/oracles/pg.ts:43`, `:57`, `:123`                                                                                       | exist         |
| `readContainerStats`, `detectCgroup`, `discoverContainer`                                | `src/load/telemetry/cgroup-stats.ts:69`, `:9`, `:46`                                                                        | exist         |
| `openSources`, `samplerStart`                                                            | `src/load/telemetry/stages.ts`                                                                                              | exist         |
| `LOG_FILES`, `DATABASE_URL`                                                              | `src/load/telemetry/stages.ts:27`, `:47`                                                                                    | module-local  |
| `READINESS`                                                                              | `src/load/readiness.ts:8`                                                                                                   | exists        |
| `CLIENT_COUNTER`, `summaryCounter`, `reconcileStage`, `composeStages`                    | `src/load/reconcile/index.ts`                                                                                               | exist         |
| `conservationStage`                                                                      | `src/load/med-conservation.ts:196`                                                                                          | exists        |
| `scanOutDir`                                                                             | `src/load/stages.ts`                                                                                                        | exists        |
| `ORDER`, `writeVerdictFile`                                                              | `src/load/runner.ts:39`, `:113`                                                                                             | module-local  |
| `evaluateVerdict`, `runLoad`                                                             | `src/load/runner.ts:54`, `:169`                                                                                             | exist         |
| `buildRunMeta`                                                                           | `src/load/run-meta.ts:53`                                                                                                   | exists        |
| `newRunId`, `LOAD_ROOT`                                                                  | `src/load/paths.ts:10`, `:3`                                                                                                | exist         |
| `judgeValidity`                                                                          | `src/load/validity.ts`                                                                                                      | exists        |
| `CASES`                                                                                  | `src/load/cases.ts:1462`                                                                                                    | exists        |
| `loadRepoEnv`                                                                            | `src/load/env.ts`                                                                                                           | exists        |
| `p6RunPrefix`                                                                            | `src/races/prefix.ts:5`                                                                                                     | exists        |
| `loadLoadConfig`, `standardOptions`, `openModelScenario`, `clockHooks`, `caseDataPrefix` | `k6/lib/config.js:9`, `k6/lib/pure/options.js:37`, `:120`, `k6/lib/markers.js:47`, `k6/lib/pure/prefix.js:19`               | exist         |
| harness `authenticate()` with API-key `Bearer`                                           | `node_modules/qa-portfolio-harness/src/adapters/twenty.adapter.ts:258–263`                                                  | exists        |
| fork speed defaults by spender type                                                      | `usage-limit-definitions.constant.ts:9`; `build-spenders-from-auth-context.util.ts:15–27`; `build-speed-buckets.util.ts:67` | exist (fork)  |
| `buildSpeedBucketKey` shape                                                              | `build-speed-bucket-key.util.ts:28`                                                                                         | exists (fork) |
| Redis service                                                                            | `packages/twenty-docker/docker-compose.yml:128`                                                                             | exists (fork) |

## 15. Expected output

**Files** (under `results/load/TW-BG-FOUNDATION/<runId>/`, `<runId>` = `<UTC compact>-<8 hex>` from `newRunId()`):
`verdict.json`, `run-meta.json`, `k6-main-summary.json`, `k6-main.json.gz`, `k6-main.log`, `telemetry-main.json`,
`telemetry-main.csv`, `chart-main.html`, `audit.json`. The container logs (`results/twenty/containers.log`) and the token
scan result are not in this directory.

**Shapes** (shape only, not a measured run; `…` marks fields a run fills):

```text
verdict.json   { "schema": 1, "caseId": "TW-BG-FOUNDATION", "runId": "…", "profile": "pr|full",
                 "label": "functional load, not capacity", "outcome": "PASS|FAIL|INVALID|ENV",
                 "reasons": [], "invalid": [], "validity": { "verdict": "VALID|INVALID", "reasons": [] },
                 "k6": [ { "label": "main", "exitCode": 0, "requests": …, "iterations": …, "dropped": 0, … } ],
                 "runMeta": "run-meta.json", "stages": { "setup": {…}, "k6": {…}, "reconcile": {…}, … } }
run-meta.json  … "software": { "products": { "twenty": "<fork SHA>" } }, "limiterProfile": "productionLike|functional",
                 "environment": { "kind": "github-actions", "workflow": "twenty-load", "runUrl": "…" }
telemetry-main.json  … "containers": [ { "role": "server|worker|db", "cpuNs": …, "memBytes": …, "rssKb": …, "threads": …, "fds": … } ]
audit.json     { "schema": 1, "product": "twenty", "prefixLike": "<prefix>%", "rowsSeen": …,
                 "checks": [ { "name": "created-vs-rows", "ok": true, "detail": "…counts…" }, … ],
                 "violations": [], "knownBugs": {}, "unexpected": [], "pending": [], "leak": [] }
```

Counts and ids only in every file; no token, password, hash or pk key (token scan, §8).

**Job summary** (written by the runner to `GITHUB_STEP_SUMMARY`, existing format in `src/load/runner.ts`):
`### TW-BG-FOUNDATION: PASS (pr profile, functional load, not capacity)`, then one line per reason if any.

**Artefact.** Name `twenty-load-foundation`, path `results/load/`, `retention-days: 14` (the `perf.yml` practice; 14 days is
the Actions expiry noted in the roadmap). Uploaded only after the token scan passes (`if: always() && steps.token_scan.outcome == 'success'`).

## 16. Build order (one commit per step; `npm run check` before every push)

Each step lists its files, its exact command, the expected output and its commit message (lowercase Conventional Commit).
Before every push, run `npm run check` and compare the unit count with §14.2. If it differs, stop and explain.

**S1. Start and re-check (no commit).** `git fetch origin main && git switch -c feat/<date>-p6-twenty-load-foundation origin/main`;
`npm ci`; `npm run check`. Expected: every stage passes; the unit count is 1405 (re-measure; if different, record it as the
new B0). Run every row of §5 and record the result. Do not start the build if row 1 or 5 changed; stop and report.

**S2. Register the product in the shared types (no behaviour).** Files (registration lines, Q4):
`src/load/types.ts` (`LoadProduct` gains `"twenty"`, line 1; `LoadCase` gains `gated?: boolean`; `RunMeta` gains
`limiterProfile?: "functional" | "productionLike"`);
`src/load/reconcile/types.ts` (`AuditProduct` gains `"twenty"`, line 3; `AuditStageConfig` gains
`{ product: "twenty"; prefixLike: string; schema: string }`);
`src/load/telemetry/stages.ts` (`LOG_FILES.twenty = ""`, and `openSources` skips an empty name; `DATABASE_URL.twenty = (env) => twentyDatabaseUrlFromEnv(env)`);
`src/load/readiness.ts` (`READINESS.twenty = (env) => [\`${base(env.TWENTY_BASE_URL, "http://127.0.0.1:3002")}/healthz\`]`);
`src/load/telemetry/cgroup-stats.ts` (a per-product container name: `twenty` → `qa-harness-twenty-db-1`; the other products unchanged, P20);
`src/load/run-meta.ts` (writes `limiterProfile` when `ctx.meta.limiterProfile` is set).
Command: `npm run typecheck`. Expected: no error. Commit: `feat(load): register the twenty product in the load types`.

**S3. Limiter profile module (+4 tests).** Files: `src/twenty/limiter-profile.ts` (§2.6, the six values of §6.3),
`tests/unit/twenty-limiter-profile.test.ts`. Tests: (1) `productionLike` is empty; (2) `functional` has exactly the six names;
(3) `functional` values equal §6.3; (4) an unknown name throws `TEST BUG: unknown limiter profile`. Command:
`node --test tests/unit/twenty-limiter-profile.test.ts`. Expected: 4 pass. Commit: `feat(twenty): add the limiter profile module`.

**S4. k6 side: auth helper, journey, case script (no unit tests).** Files: `k6/lib/twenty-auth.js` (§2.1),
`k6/journeys/tw-background.js` (the four steps of §6.6, filled), `k6/cases/tw-background.js` (§2.3),
`k6/cases/tw-background.example.json` (the defaults of the case script). Command: `npm run k6:inspect`. Expected: the
inspect step passes. Commit: `feat(k6): add the twenty auth helper and background journey`.

**S5. docker-stats module and the sampler hook (+4 tests).** Files: `src/load/telemetry/docker-stats.ts` (§6.4),
`tests/unit/docker-stats.test.ts`, one hook in `src/load/telemetry/sampler.ts` (`containers?: TwentyContainer[]` in
`SamplerOptions`; one line in the tick that adds `containers` when set). Tests: (1) discovery returns only the running roles
(a fake `exec`); (2) `readContainerSample` is undefined for kind `absent`; (3) `readProcSample` parses `VmRSS` and `Threads`
(a fake `readFile`); (4) `readProcSample` is undefined when the file cannot be read. Command: `node --test tests/unit/docker-stats.test.ts`.
Expected: 4 pass. Commit: `feat(load): sample twenty containers from cgroup and proc files`.

**S6. Reconcile hook (+6 tests).** Files: `src/load/reconcile/twenty.ts` (§6.7), `tests/unit/reconcile-twenty.test.ts`,
registration lines in `src/load/reconcile/index.ts` (the `twenty` case in `reconcile()`; `CLIENT_COUNTER.twenty`). Tests:
(1) equal counts → no finding; (2) `total < created` → PRODUCT BUG; (3) `total > created` → TEST BUG; (4) `updated != patched`
both ways; (5) `serverErrors > 0` → PRODUCT BUG; (6) `limited429 > 0` → TEST BUG. Commit: `feat(load): add the twenty background reconcile`.

**S7. Setup and cleanup stages, the API-key helper and the registry (+7 tests).** Files: `src/load/products/twenty.ts` (§6.5), `src/twenty/api-key.ts` (§2.13), `tests/unit/twenty-api-key.test.ts`,
`tests/unit/twenty-products.test.ts`, registry entries in `src/load/cases.ts` (`TW_BG_FOUNDATION`, and the two gated cases
with `gated: true` and no `runs`), the gate guard in `scripts/load/run-load.ts` (§6.9). Tests: (1) a missing Twenty env is `ENV`;
(2) a good setup sets `TWENTY_TOKEN` and `ctx.config.audit`; (3) cleanup calls `destroy` with exactly the prefixed ids;
(4) a leak count of 1 is a TEST BUG; (5) cleanup with no prefixed rows is ok; (6) `createRunApiKey` returns the id and token from a fake response, and its error holds no key value; (7) `revokeRunApiKey` sends the revoke mutation for the given id. Command: `node --test tests/unit/twenty-products.test.ts tests/unit/twenty-api-key.test.ts`.
Expected: 7 pass. Commit: `feat(load): wire the twenty background case`.

**S8. The CI workflow (+3 tests).** Files: `.github/workflows/twenty-load.yml` (§6.8 and the 15 steps of §2.8, with the three
markers at the end), `tests/unit/twenty-load-workflow.test.ts` (tests: (1) the jobs are exactly `twenty-load-foundation`;
(2) the `P6_TWENTY_LIMITER_PROFILE` value of 3a is `productionLike`; (3) the three markers appear in order, each followed by one
unchanged blank line). Commands: `npm run lint:actions` and `node --test tests/unit/twenty-load-workflow.test.ts`. Expected:
actionlint passes; 3 tests pass. Commit: `ci(twenty): add the twenty load workflow`.

**S9. README section (no tests).** File: `README.md`, a "Twenty load" section with three sub-markers
`<!-- >>> task4 section -->`, `<!-- >>> task5 section -->`, `<!-- >>> task6 section -->` (each followed by one blank line).
Command: `npm run format:check`. Expected: passes. Commit: `docs(readme): describe the twenty load foundation`.

**S10. Local proof through the harness (no commit unless a fix).** Commands, in order: `bash scripts/bootstrap.sh twenty`;
`bash scripts/ci/compose-pull.sh -p qa-harness-twenty -f docker-compose.yml -f <overlay>` (from the fork's docker dir);
`npm run up:twenty`; `npm run seed:twenty`; `npm run smoke:twenty`;
`node scripts/load/run-load.ts --case TW-BG-FOUNDATION --profile pr`; then
`TWENTY_DOWN_VOLUMES=1 npm run down:twenty`. Expected: `TW-BG-FOUNDATION PASS …/verdict.json`; zero containers and zero
volumes left for `qa-harness-twenty`. Record the wall times (rule P4: session timings only). Any failure: root-cause it (N4)
and fix in a new commit on the branch.

**S11. Push 3a and open its PR.** `git push -u origin feat/<date>-p6-twenty-load-foundation`. Open one PR with the title
`feat(twenty): add the twenty load foundation`. Wait for the CI run; read its log once (rule 15). Expected: the `pr` profile
run is PASS and VALID; the job's token scan passes. After the owner merges (merge commit), the `main` run on the `full`
profile must also be PASS and VALID. Record both run URLs.

**S12. The functional profile (3b; after Task 2 is merged and harness v0.2.16 is pinned).** Files: the `up:twenty` step of `.github/workflows/twenty-load.yml`
gains the six `env:` entries of §6.3 and `P6_TWENTY_LIMITER_PROFILE: functional`; one 2-minute step after `up:twenty` that runs
`docker compose … exec -T server printenv <name>` for the six names and fails `ENV` on any mismatch (§6.3, O9); the
workflow test (S8 test 2) changes to expect `functional`. Before the PR, run the API-key 429 proof locally (§5 row 6): a defaults stack gives 429, then a functional stack gives zero 429 for the same paced burst; record both. Expected: `npm run check` gives 1430; the functional run is VALID;
`run-meta.json` shows `limiterProfile: functional`; the verified values appear in the job log. Commit:
`feat(twenty): verify the functional limiter profile`.

**S13. The gated cases (only when their gate is open; §12).** Files: `k6/cases/tw-load-010.js` and
`src/load/telemetry/queue-depth.ts` (read-only whitelist, §8, with its own unit test) or `k6/cases/tw-load-008.js`. A separate PR.
Commit: `feat(twenty): add the gated worker drain case` (or `…knee case`).

## 17. Open decisions, owner steps and the plan PR

### 17.1 Owner answers and open decisions

**DECIDED (the owner's answers to the review; final for this plan).**

- **Q1 (where the Twenty load jobs live): DECIDED, (b).** A new workflow `.github/workflows/twenty-load.yml`. Consequence: one `ci(evidence)` PR after its first `main` run (§2.7).
- **Q2 (split): DECIDED, 3a then 3b.** 3a is the foundation. 3b, the verified functional profile, builds only after Task 2's pin bump and the harness v0.2.16 tag (H4 with all six variables).
- **Q3 (foundation label): DECIDED.** No new P6 case ID for the foundation run. The run is `TW-BG-FOUNDATION`.
- **Q4 (shared registration lines): DECIDED.** The six shared-file edits are accepted as registration lines and listed in §6.1.
- **Q5 (H4 names): DECIDED.** H4 names all six variables: `API_RATE_LIMITING_SHORT_TTL_IN_MS`, `API_RATE_LIMITING_SHORT_LIMIT`, `API_RATE_LIMITING_LONG_TTL_IN_MS`, `API_RATE_LIMITING_LONG_LIMIT`, `APPLICATION_API_RATE_LIMITING_TTL_IN_MS`, `APPLICATION_API_RATE_LIMITING_LIMIT`. Sent to Lane A as its fix 18.
- **Q10 (k6 auth): DECIDED, revised.** Per case, as frozen in §2.12: the user token for `TW-BG-FOUNDATION`; a seeded per-run API key (§2.13) for the other cases in that table. The earlier "runner sign-in, no API key" answer is replaced.
- **Q11 (existing `twenty-*` jobs and C3): DECIDED.** `twenty-smoke` stays as it is in this plan. It joins the owner-tracked `ci(perf)` budget PR.

**OPEN (the owner has not answered; each has a recommendation).**

- **Q6 (P6-TW-LOAD-010 gate, read route) — blocks `-010` only.** Read the BullMQ queue state with read-only Redis commands run through `docker compose exec`, with a whitelist (`SCAN`, `TYPE`, `LLEN`, `ZCARD`, `DBSIZE`), or ask Lane A for a read-only queue endpoint (new harness work). **Recommendation: the exec route with the whitelist** (read-only, P18, no harness change). The drain window is then set from a 3b probe.
- **Q7 (P6-TW-LOAD-008 gate) — open; the auth rule is decided.** The knee runs on an API key (§2.12). The gate opens when harness v0.2.16 is pinned and a dry run with an API key shows the stop rule, not the limiter, ends the run. The 429 proof of §5 row 6 is the first check. **Recommendation: keep this rule.**
- **Q8 (functional profile) — for Tasks 4 to 6.** The profile changes results only for API-key cases (§2.12); user-token cases are unaffected at image defaults (P8, P9). **Recommendation: keep it and record it per run.** The Phase 5 functional peak ceiling of 20 rps applies to the API-key cases; a case that needs more must change §6.3 in its own plan.
- **Q9 (limiter state reset) — for Task 6 and 3b.** Rely on container recreation (no Redis volume, P12) with a read-only preflight that speed keys are 0. **Recommendation: yes.** A flush command would write to Redis, which P6 never does.
- **Q12 (token lifetime) — for Tasks 4 to 6.** The user token lasts 1800 s (P6). API keys carry their own expiry (2 h, §2.13). **Recommendation:** keep user-token runs under 25 min, or add a re-sign-in to the setup helper for longer runs. Not needed for the Task 3 profiles.

### 17.2 Owner steps (GitHub web UI wording)

1. Confirm the answers in §17.1. The DECIDED items are final. Q6, Q7, Q8, Q9 and Q12 remain open.
2. The owner closes the plan PR unmerged. The build starts from the plan branch after the owner answers above.
3. After 3a merges, open the **Actions** tab, choose the `twenty-load` workflow, click **Run workflow** and pick `full`, to produce the first `main` evidence run. Note its run id for the `ci(evidence)` PR (§2.7).
4. After Lane A tags harness v0.2.16, confirm that H4's allowlist names the six variables (Q5). This is needed before 3b.
5. After the first `main` run of the new workflow, the `ci(evidence)` PR that adds its workflow id is reviewed and merged by the owner.
6. Track the owner's `ci(perf)` budget PR for the existing `twenty-*` jobs (Q11).

### 17.3 Unblocks

- The 3a build can start from the plan branch now: Q1 to Q4 are decided.
- 3b can start after Task 2 merges and harness v0.2.16 is tagged and pinned.
- Tasks 4 to 6 can start after 3a merges. Tasks 4 and 5 also need Task 2 for their CI.

### 17.4 Plan PR

None. The plan branch gets no PR and never merges (agent rule A.6, B.10). The review PR is closed unmerged by the owner.
