# P6 Phase 2 Task 6: Twenty stack in P6 (build plan)

Branch `feat/2026-10-23-p6-twenty-stack` from `origin/main` `92a9a93`. The plan is the first commit on that branch and is
also on `plan/2026-10-23-p6-twenty-stack` (rule B10). No PR for the plan. The owner approved this plan on 2026-10-23 with the
changes in §0; the build follows on the feature branch, and the PR is opened after the build.

Probe date: 2026-10-23 (cloud VM, Docker 29.9.2, 4 vCPU, 16 GB). Roadmap: [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md) §Task 6.

## 0. Status, owner gate and inputs

- **Status.** Approved by the owner on 2026-10-23 with the changes in this section. The build runs on
  `feat/2026-10-23-p6-twenty-stack` after this docs commit. The PR is opened after the build, with `gh pr create`.
- **Owner instructions used** (task message, 2026-10-23): the image pull retry for `twenty-smoke` only; `timeout-minutes`
  on every step, sized from probe times (O5, never raised to fit); the rate-limiter note (verified in §3.4); the token scan by
  value, not name; the known-bug convention (`P6-OBS-TW-…`, annotation type `issue`, SUSPECTED, no `test.fail()` without an
  owner label).
- **Owner decisions (given in this session, 2026-10-23):**
  1. **O-T2 (changed):** no repository secrets. Bump `qa-portfolio-harness` to `v0.2.12`, which exports
     `TWENTY_DEFAULT_ADMIN_EMAIL` and `TWENTY_DEV_SEED_PASSWORD` from its package entry. `src/twenty/env.ts` uses
     `TWENTY_EMAIL` / `TWENTY_PASSWORD` when set, and the harness exports otherwise. The secrets lines are removed from the CI
     skeleton. No environment steps for either cloud agent.
  2. **O-T4 (confirmed):** the registry 500 is in the raw attempt-1 logs of run `39961527451` (§3.10). Escalation item 3 is NO.
  3. Every step has `timeout-minutes`, including checkout and the artefact uploads (5 min each).
  4. §8.3 uses the worst measured value for each row (first boot 183 s, seed 77 s). The margin stays at least 10 minutes
     under the 20-minute job timeout.
  5. Accepted as proposed: O-T1 (both refs), O-T3, O-T5 (value-only scan; X6 later), O-T6 (P6-OBS-TW-001 SUSPECTED in
     `docs/BACKLOG.md`, no test, no label), O-T7 (tag now, digest as X1), O-T8 (20 minutes), O-T10 (X5 backlog).
  6. O-T9 (changed): the first Cursor Cloud run confirms the Docker Hub pulls work. No setup change now.

## 1. Goal, scope and the cases covered

- **Goal (roadmap).** Twenty starts, answers a smoke check, passes a self-test and stops through the harness, locally and
  in CI. No product races.
- **Cases.** None mapped. The self-test is unmapped (roadmap): health burst, read-only oracle `SELECT 1` on the Twenty DB,
  a session auth proof (signIn, token exchange, `currentUser`, one REST read), and a token scan of the evidence.
- **In scope.**
  - `package.json`: the `qa-portfolio-harness` pin (`v0.2.12`), and the scripts `up:twenty`, `down:twenty`, `seed:twenty`,
    `smoke:twenty`, `race:twenty` (all through `scripts/harness.mjs` or the harness adapter; no new start logic).
  - `src/twenty/env.ts`, `src/twenty/auth.ts`, `src/twenty/oracle.ts` (NEW).
  - `scripts/seed-twenty.mjs` (NEW): seeds through the harness adapter's `seed()`.
  - `k6/smoke/twenty-health.js` (NEW), `playwright.config.ts` project `twenty-race`, `tests/twenty/races/twenty-self-test.spec.ts` (NEW).
  - CI job `twenty-smoke` in `.github/workflows/perf.yml`, with the image pull retry.
  - `.env.example` (names only), README section "Run Twenty" (no timing claims), `docs/BACKLOG.md` entries.
- **Out of scope.** Any race (Task 7), any API-key path, a change to the harness or to `scripts/evidence-token-scan.mjs`,
  pulls for the other three jobs (backlog X5), and any new known-bug test.
- **Files likely touched.** The roadmap list, plus `scripts/seed-twenty.mjs`, `tests/unit/twenty-auth.test.ts` (both NEW, §5),
  `package.json` and `package-lock.json` (the pin). `scripts/bootstrap.sh` already has `twenty` and `TWENTY_REF`, so it does
  not change (§4 D1).
- **Environment changes (both cloud agents).** None (owner decision 6; §0). Docker was already running when this session
  started (`docker info` succeeded before any command), and Docker Hub and GitHub were reachable. The Cursor Cloud agent
  was not probed; its first run confirms the pulls.

## 2. Assumptions the build depends on

Each row is probed in §3 unless marked.

| #   | Assumption                                                                                                         | Evidence                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| A1  | `node scripts/harness.mjs up twenty` returns by itself (compose `--wait`), so no long-running bridge is needed     | §3.1: exit 0 in 106–183 s, four runs |
| A2  | The image `twentycrm/twenty:v2.44.0` runs the harness overlay ports 3002 and 5434                                  | §3.2 `/healthz` 200                  |
| A3  | `bootstrap.sh twenty` clones the fork at `TWENTY_REF` quickly enough for CI (full clone, D10)                      | §3.1: 15 s, 593 MB                   |
| A4  | Seed works through `workspace:seed:dev` in the server container                                                    | §3.1: exit 0, 70 s and 77 s          |
| A5  | Sign-in with the seed login returns a workspace-agnostic token **and** workspaces with login tokens                | §3.3                                 |
| A6  | Data calls (REST, GraphQL data) need the **workspace** token from the login-token exchange, not the agnostic token | §3.3: 500 vs 200                     |
| A7  | The DB oracle refuses writes with SQLSTATE 25006 and the workspace schema can be derived from `core.workspace`     | §3.6                                 |
| A8  | The 100-per-second and 100-per-60-second API limits apply to **API keys**, not to login sessions                   | §3.4 (behaviour) and §3.4.1 (source) |
| A9  | Ports 3002, 5434, 8025 and 1025 are free when Twenty runs alone, and none clash with Cal, Documenso or Medusa      | §3.7                                 |
| A10 | Container logs carry no token values after the probe's authenticated traffic                                       | §3.8                                 |

## 3. Probe results (2026-10-23, live app)

Probe scripts are outside the repo, in
`/tmp/claude-0/-home-user-k6-load-concurrency-suite/e2d91dd0-e98c-52af-aeb4-09f5ad131ec1/scratchpad/probe/`
(`probe.mjs`, `exchange.mjs`, `api-burst.mjs`, `apikey.mjs`, `revoke.mjs`, `malformed.sh`, `cold-cycle.sh`; outputs
`*.out` and `*.log` next to them). The owner's `npm run up:twenty` / `down:twenty` scripts did not exist yet, so the probe
called the same entry point they will call: `node scripts/harness.mjs up twenty` and `… down twenty`.

### 3.1 Commands and exit codes

| #   | Command (in this order)                                                                   | Exit | Wall time | What it proves                                                        |
| --- | ----------------------------------------------------------------------------------------- | ---- | --------- | --------------------------------------------------------------------- |
| 1   | `bash scripts/bootstrap.sh twenty`                                                        | 0    | 15 s      | Full depth-1 clone at `TWENTY_REF` `7cbdfec6…`, 593 MB (A3)           |
| 2   | `node scripts/harness.mjs up twenty` (first run; images pulled inside `up`)               | 0    | 183 s     | Stack up; `/healthz` 200 at 14:13:21 (A1, A2)                         |
| 3   | seed: `docker compose … exec -T server yarn command:prod workspace:seed:dev` (first seed) | 0    | 70 s      | Seed works (A4)                                                       |
| 4   | `node scripts/harness.mjs down twenty` (volumes kept; the owner's "stop")                 | 0    | 2 s       | Stop works, no containers left                                        |
| 5   | `docker compose … pull` after removing the four images                                    | 0    | 34 s      | Cold pull of four images, 2.6 GB (twenty 1.84 GB)                     |
| 6   | `node scripts/harness.mjs up twenty` (warm: images cached, volumes kept)                  | 0    | 106 s     | Warm start                                                            |
| 7   | `TWENTY_DOWN_VOLUMES=1 node scripts/harness.mjs down twenty`                              | 0    | 3 s       | Volumes removed (the CI down)                                         |
| 8   | `node scripts/harness.mjs up twenty` (cold boot: fresh volumes, images present, no pull)  | 0    | 135 s     | First boot without a pull (`cold-cycle.sh`)                           |
| 9   | seed on the fresh DB                                                                      | 0    | 77 s      | Seed time on a fresh DB                                               |
| 10  | `TWENTY_DOWN_VOLUMES=1 … down twenty`                                                     | 0    | 2 s       | CI-style down                                                         |
| 11  | `node scripts/harness.mjs up twenty` (malformed-body run, §3.5)                           | 0    | 140 s     | Start on a fresh DB, then the §3.5 requests                           |
| 12  | `node scripts/harness.mjs down twenty` after §3.5                                         | 0    | not timed | Stop, no containers left (`down4.log`)                                |
| 13  | `npm run check` on untouched `main` (baseline)                                            | 0    | 20 s      | Baseline: 417 unit tests, prettier, actionlint, typecheck, k6 inspect |

Every start and stop in this table exited 0. Logs: `up1.log`, `seed.log`, `down1.log`, `pull-cold.log`, `up2-warm.log`,
`down2-vol.log`, `up3-cold.log`, `seed-cold.log`, `down3-vol.log`, `up4-malformed.log`, `down4.log`, `check-baseline.log`.

**Memory (proof only, not published).** Cold boot after seed: server 1.00 GiB, worker 1.00 GiB, db 128 MiB, redis 23 MiB,
mailpit 6 MiB, about 2.2 GiB in total. Warm, after the probe: server 0.97 to 1.00 GiB, worker 0.65 to 0.74 GiB, db 47 to
180 MiB. The 16 GB VM is far above that. Times are not performance numbers (rule 13 of the roadmap).

### 3.2 Routes, real statuses and bodies (one sample each)

| Request                                                             | Auth                                 | Status   | Body (trimmed)                                                                                 | Time          | What it means                                                      |
| ------------------------------------------------------------------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `GET /healthz` (3 samples)                                          | none                                 | 200      | `{"status":"ok","info":{},"error":{},"details":{}}`                                            | 79, 12, 6 ms  | Health ready (harness `isTwentyHealthyStatus` = 200)               |
| `GET /rest/does-not-exist`                                          | none                                 | 403      | `FORBIDDEN_EXCEPTION`, "Missing authentication token"                                          | 10 ms         | Unknown REST paths need auth                                       |
| `POST /metadata` signIn, wrong password                             | none                                 | 200      | `errors: ["Wrong password"]`, no data                                                          | 136 to 207 ms | GraphQL error with HTTP 200; the harness parser throws on `errors` |
| `POST /metadata` signIn, right password                             | none                                 | 200      | direct token present; 2 workspaces (`subdomainUrl` `http://127.0.0.1:3002/`, `customUrl` null) | 111 to 157 ms | A5                                                                 |
| `POST /metadata` `currentUser`                                      | agnostic token                       | 200      | `email` of the seed admin                                                                      | 32 to 35 ms   | The harness `proveAuth` passes with the agnostic token             |
| `POST /metadata` `currentUser`                                      | none                                 | 200      | `errors: ["Missing authentication token"]`                                                     | 10 ms         | GraphQL error, HTTP 200                                            |
| `POST /metadata` `getAuthTokensFromLoginToken`                      | login token, origin = `subdomainUrl` | 200      | workspace token                                                                                | 151 ms        | A6: the exchange works                                             |
| `GET /rest/people?limit=1`                                          | **agnostic** token                   | **500**  | `"No data sources found"`                                                                      | 6 ms          | A6: the agnostic token cannot read data                            |
| `GET /rest/people?limit=1`                                          | **workspace** token                  | **200**  | `{"data":{"people":[…]}}`                                                                      | ms            | A6 confirmed                                                       |
| `GET /rest/companies?limit=1`, `GET /rest/workspaceMembers?limit=1` | workspace token                      | 200, 200 | records                                                                                        | ms            | Other object routes work                                           |
| `GET /rest/people?limit=1`                                          | none                                 | 403      | "Missing authentication token"                                                                 | 3 to 4 ms     | Auth enforced                                                      |
| `POST /graphql` `people(first:1){totalCount}`                       | workspace token                      | 200      | `totalCount: 1200` (seed)                                                                      | 34 to 37 ms   | The GraphQL data path works with the workspace token               |
| `POST /graphql` same query                                          | agnostic token                       | 200      | `Cannot query field "people" on type "Query"`                                                  | 20 ms         | The agnostic token sees only the metadata schema                   |
| `POST /graphql` `{ __typename }`                                    | agnostic token                       | 200      | `{"data":{"__typename":"Query"}}`                                                              | 9 to 10 ms    | Liveness of `/graphql`                                             |
| `POST /metadata` `getApiKeyRoles`                                   | workspace token                      | 200      | roles: Admin, Impersonate-only, Object-restricted                                              | ms            | Permission model visible to an admin session                       |

### 3.3 Auth: why P6 must do its own token exchange

The harness `authenticate()` (`node_modules/qa-portfolio-harness/src/adapters/twenty.adapter.ts`) returns the **direct**
token from signIn when it exists, and uses the login-token exchange only when it is missing. On this stack the direct
token is always present (row 2 of §3.2), and it is the workspace-agnostic token: it passes `proveAuth` (`currentUser`) but
returns **500 "No data sources found"** on REST and an unknown-field error on GraphQL data. So a P6 data client must do
signIn, pick the workspace, and exchange its login token itself (§4 D3). This is a harness issue, recorded as backlog
item H-twenty-auth (not changed here; the harness is a pinned dependency).

### 3.4 Rate limiter: a login session is not limited; an API key is

| Burst (all on `/rest/people` unless noted) | Auth                                         | Requests | Result                            | Notes                                                                               |
| ------------------------------------------ | -------------------------------------------- | -------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `/healthz` in parallel                     | none                                         | 150      | 150 × 200 in 252 ms, max 189 ms   | Health route is not limited                                                         |
| `/healthz` in parallel                     | none                                         | 100      | 100 × 200 in 177 ms               |                                                                                     |
| `/rest/people` in parallel                 | workspace session                            | 100      | 100 × 200 in 971 ms               |                                                                                     |
| `/rest/people` in parallel                 | workspace session                            | 150      | 150 × 200 in 1036 ms              | No 429 at 150 in about a second                                                     |
| `/rest/people` sequential                  | workspace session                            | 150      | 150 × 200 in 2403 ms, max 32 ms   |                                                                                     |
| `/rest/people` in parallel                 | workspace session                            | 400      | 400 × 200 in 2787 ms              | No 429 at 400                                                                       |
| `/rest/people` in parallel                 | **API key** (throwaway, revoked)             | 150      | **100 × 200, 50 × 429** in 808 ms | 429 body: `Rate limit exceeded for apiKey: 100 requests per 60s.`, `retry-after: 1` |
| `/rest/people` sequential                  | **API key** (same key, window already spent) | 150      | 3 × 200, 147 × 429                | The 60-second bucket was full                                                       |

**Verdict.** The owner's note (100 per second and 100 per 60 seconds) is **true for API keys** and **not observed for
login sessions** at 400 parallel requests. §3.4.1 explains why.

#### 3.4.1 Source check (fork at `TWENTY_REF`)

- `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts` lines 1713 to 1739:
  `API_RATE_LIMITING_SHORT_LIMIT = 100` (TTL 1000 ms) and `API_RATE_LIMITING_LONG_LIMIT = 100` (TTL 60 000 ms).
- `packages/twenty-server/src/engine/core-modules/usage-limit/constants/usage-limit-definitions.constant.ts` lines 5 to 51:
  the API speed limits allow only spender types `apiKey` and `application`. A login session is spent as
  `userWorkspaceId` (`build-usage-spenders-from-auth-context.util.ts`), so it is not counted. Matches the probe.
- The built image contains the same definitions (`dist/engine/core-modules/usage-limit/constants/usage-limit-definitions.constant.js`
  in `twentycrm/twenty:v2.44.0`), which is the evidence for "the image and the fork source match closely enough" (probe item 3).

**What the 1-second limit does.** Not seen separately: the 60-second bucket was hit first in every API-key burst. Treat both
limits as 100 per window for API keys.

### 3.5 Malformed bodies: suspected hang (P6-OBS-TW-001, SUSPECTED)

Reproduced in three sessions (the first burst run, the `curl` check, and `malformed.sh` on a fresh stack; file
`malformed.out`):

| Request                           | Result                                           |
| --------------------------------- | ------------------------------------------------ |
| `POST /metadata` body `{}`        | no response: `curl` exit 28 at 20 s (status 000) |
| `POST /metadata` body `{"foo":1}` | 400 in 14 ms                                     |
| `POST /metadata` empty body       | no response: exit 28 at 20 s                     |
| `POST /graphql` body `{}`         | no response: exit 28 at 20 s                     |
| `POST /graphql` body `{"foo":1}`  | 400 in 11 ms                                     |
| `POST /graphql` empty body        | no response: exit 28 at 20 s                     |

The Node client (undici) gave up after its 300-second headers timeout (`HeadersTimeoutError`, in `burst.out`). The server log
has no error line for the hang. **Label: SUSPECTED** (convention: annotation type `issue`, ID first; §4 D14). It is not a
PRODUCT BUG until the owner labels it, and this task adds no `test.fail()` for it. The self-test never sends malformed bodies.

### 3.6 Database: read-only oracle and schema mapping

| Check                                                                           | Result                                                                                                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SELECT 1 AS ok` on the read-only pool (`default_transaction_read_only` = `on`) | `1`                                                                                                                                                                  |
| `CREATE TEMP TABLE p6_probe_write (x int)`                                      | SQLSTATE **25006**: "cannot execute CREATE TABLE in a read-only transaction" (A7)                                                                                    |
| Schemas                                                                         | `core`, `public`, `workspace_1wgvd1injqtife6y4rvfbu3h5` (Apple), `workspace_3ixj3i1a5avy16ptijtb3lae3` (YCombinator)                                                 |
| `core.workspace`                                                                | 2 rows: `subdomain` `apple` and `yc`                                                                                                                                 |
| Schema name rule                                                                | The fork's `getWorkspaceSchemaName` is `workspace_` + the UUID as a base-36 number. A one-line BigInt check reproduces both live schema names exactly (§6.3 fixture) |
| Workspace tables                                                                | `person` (1200 rows), `company`, `workspaceMember` in each workspace schema                                                                                          |
| `core.appToken`                                                                 | exists (row count changes with probes; not asserted)                                                                                                                 |
| `core."dataSource"`                                                             | **0 rows**, so it is not the mapping table. Do not use it                                                                                                            |

### 3.7 Ports

With Twenty alone: 3002, 5434, 8025 and 1025 open; 3000, 3001, 5450, 5451, 9000 and 5433 closed. Cal 3000/5450, Documenso
3001/5451 (Inbucket 9003, SMTP 2525) and Medusa 9000/5433 do not clash. CI runs one stack per job. **No clash (A9).**

### 3.8 Token scan of the logs

- `docker compose -p qa-harness-twenty logs --no-color` after the probe's authenticated traffic: 974 KB.
  Value patterns: `Bearer <16+ chars>` 0 hits; `eyJ…\.eyJ…\.…` (JWT) 0 hits. **A10 holds.**
- Startup noise, not findings: first-boot `ERROR: relation "core.appToken" does not exist` and similar, from migrations
  that run after the server starts, and `DatabaseConfigDriver [INIT] Failed to load config variables from database,
falling back to env`. Both are normal first-boot lines. Recorded so a later reader does not mistake them for a finding.
- The shared scan `scripts/evidence-token-scan.mjs` matches bare names (`sessionId`, `Authorization:`, `Bearer `), the
  Task 5 false-positive class. §4 D7 uses value patterns for Twenty.

### 3.9 Image, pins and timings

- `twentycrm/twenty:v2.44.0` repo digest `sha256:01fb6d2c00397976fd7613dbeb9703b514b52fb6270339b7a326a2a975d15b26`
  (created 2026-10-01, 1.84 GB). Also used: `postgres:16` (642 MB), `redis:latest` (213 MB, unpinned in the fork's
  compose), `axllent/mailpit:v1.22.3` (43.5 MB).
- The fork's `packages/twenty-server/package.json` has no `version` field, so versions cannot be compared that way. The
  fingerprint in §3.4.1 is the check used instead.
- Timings (proof only, not published): bootstrap 15 s; cold pull 34 s; first up with pull 183 s; cold up without pull 135 s;
  warm up 106 to 140 s; seed 70 to 77 s; down 2 to 3 s.

### 3.10 What the probe proves, and what it does not

- **Proves:** the stack starts, the seed works, health answers, sign-in and token exchange work, the REST and GraphQL data
  paths need the workspace token, the read-only oracle refuses writes, the schema name rule holds for both workspaces, the
  limiter applies to API keys and not to sessions, the token scan has nothing to find, and both stop paths exit 0.
- **Does not prove:** CI behaviour (runner speed, memory on a hosted runner, Docker Hub from GitHub); the Cursor Cloud agent;
  the self-test (built in step 4); the cause of the suspected hang (only its behaviour).
- **The registry 500 in run `39961527451` is confirmed (raw logs).** Attempt 1 failed `documenso-smoke` and `cal-smoke`.
  Raw job logs (`gh api repos/Jayami123/k6-load-concurrency-suite/actions/jobs/<id>/logs`):
  - `documenso-smoke` job `120440451056`, 13:29:55Z: `postgres Error received unexpected HTTP status: 500 Internal Server Error`,
    then `Error response from daemon: received unexpected HTTP status: 500 Internal Server Error`.
  - `cal-smoke` job `120440451294`, 13:30:30Z: the same error on `postgres_is_ready`.
  - The `gh run view --job <id> --log` view does not show these lines. That is why an earlier read of attempt 1 found no
    cause. Attempt 2 passed on every job.

## 4. Design and decisions (each with a reason)

- **D1 Clone: full depth-1 clone (roadmap D10 resolved).** The probe clone took 15 s and 593 MB. D10 asks for a sparse clone
  only if the full clone is slow; it is not, so `bootstrap.sh` stays as it is (no change, since `twenty` is already there).
- **D2 Start and stop through the harness (roadmap).** `package.json` scripts call `scripts/harness.mjs`; nothing new starts
  or stops the stack. `harness up` returns by itself (A1), so no `LONG_RUNNING` bridge (the Cal bridge in `harness.mjs`
  stays Cal-only).
- **D3 P6 signs in and exchanges its own workspace token (A6).** The harness `authenticate()` returns the agnostic token,
  which cannot read data (§3.3). `src/twenty/auth.ts` does signIn, picks the workspace by display name, exchanges the login
  token with the workspace origin, and returns `Bearer <workspace token>`. Reason: the self-test and later races need data.
- **D4 Login values: the environment first, then the harness exports (owner decision O-T2).** `src/twenty/env.ts` reads
  `TWENTY_EMAIL` and `TWENTY_PASSWORD` when set and not blank. Otherwise it uses `TWENTY_DEFAULT_ADMIN_EMAIL` and
  `TWENTY_DEV_SEED_PASSWORD` from `qa-portfolio-harness` v0.2.12 (its package entry; pin in step 1a). No repository secret and
  no literal in P6 code. The password is never printed (§6.2 test). Reason: it meets the roadmap rule (never retype) without a
  secret the owner has to manage, and the harness owns the dev seed values.
- **D5 - **D5 Rate limits: the self-test uses a session, and any 429 is neither a pass nor a race result.** Sessions are not limited
  (A8). The health route is not limited (§3.4). The self-test has no API key. If `TWENTY_API_KEY` is ever set, the 100 per
  60 seconds budget applies, so the self-test would need pacing; it does not use the key. A 429 is recorded in
  `statusCounts["429"]` and `oracle.rateLimited429`, and it fails the test as a setup error (TEST BUG), never as a pass.
  Burst size: 20 parallel `/healthz` per trial (150 parallel was measured clean, so 20 is well under any limit), and
  about 5 API calls per run (signIn, exchange, `currentUser`, one REST read).
- **D6 Trials.** PR 5, main, nightly and dispatch 50 (roadmap D6, Phase 1 D2) through `RACE_TRIALS`, as the Documenso job does.
- **D7 Token scan by value (Task 5 lesson).** The `twenty-smoke` job greps **values** only: `Bearer <token>` and JWT shapes,
  over the container log, the harness log and `results/races`. JSON results are read as `jq -c '{suites, errors}'`, because
  Playwright writes the repo's git diff into `config` (Task 5 closeout). The shared `scripts/evidence-token-scan.mjs` is not
  changed; §13 O-T5 asks whether to switch the job to it.
- **D8 Oracle: the read-only pool, SELECT only, schema by derivation.** `createReadOnlyPool(url)` from `src/oracles/pg.ts`
  (the existing pool, with `default_transaction_read_only=on`), `selectRows` for SELECT (it refuses anything else). The
  workspace schema comes from `core.workspace` by subdomain and the base-36 rule (§6.3). Nothing hard-codes a schema name.
  The one write attempt (`CREATE TEMP TABLE`) goes through `client.query` in a rolled-back transaction, as the Documenso
  self-test does, and must return 25006.
- **D9 No cleanup or leak check.** The self-test writes nothing (no account, no token, no webhook). The roadmap's "cleanup
  sweep" does not apply, and §6.6 says so in a comment.
- **D10 Histogram.** `createHistogram` / `recordTrial` / `createRerunRunner` / `runTrials` / `writeHistogram`, as in
  `tests/documenso/races/documenso-self-test.spec.ts`. The histogram is always written in `finally`.
- **D11 Pull retry (owner request, `twenty-smoke` only).** Three tries; `timeout 240` per try (a try that hangs is cut at 4
  minutes); backoff 15 s after try 1 and 30 s after try 2. Worst case for the step: 3 × 240 s + 15 s + 30 s = 765 s, so the step
  timeout is 14 minutes (840 s), which leaves a margin. The measured pull was 34 s.
- **D12 Compose down in CI removes volumes.** `TWENTY_DOWN_VOLUMES=1` in the job env, so no state carries into a rerun. The
  local default keeps volumes (2 to 3 s to stop, and a warm start is 106 s).
- **D13 Images are pinned by tag (`v2.44.0`), not digest.** The harness default is the tag. The digest is recorded in §3.9
  and proposed as an extra (§12 X1).
- **D14 Known-bug convention (owner instruction).** Any finding is an annotation of type `issue` whose description starts
  with its ID (`P6-OBS-TW-001: …`), status SUSPECTED. No `test.fail()` without an owner label. The job summary takes known
  bugs only from `issue` annotations (`src/ci/playwright-json-summary.ts` `ISSUE_ANNOTATION_TYPE`). Task 6 adds no test for
  P6-OBS-TW-001 (§3.5, §12 X3).
- **D15 Seeding goes through the harness adapter, not raw `docker exec`.** `scripts/seed-twenty.mjs` calls
  `getAdapter("twenty").seed()`. That keeps the seed command and its "already present" check in the harness, as the roadmap
  intends. The adapter reads its config lazily (`loadConfig()` parses `process.env` on the first call), so the script
  must set `PRODUCTS_ROOT` **before** calling `getAdapter`, or the harness falls back to a path inside `node_modules`.
- **D16 Unknown: the self-test does not use `TWENTY_API_KEY`.** Keeps the limiter out of the self-test (D5).

## 5. Files (exact paths)

| Path                                                                                      | Status    | Step     | Purpose                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                            | CHANGED   | 1a, 3, 4 | pin `qa-portfolio-harness` to `v0.2.12` (1a); scripts `up:twenty`, `down:twenty`, `seed:twenty`, `smoke:twenty` (3); `race:twenty` (4) |
| `package-lock.json`                                                                       | CHANGED   | 1a       | lock entry for the v0.2.12 pin (written by `npm install`)                                                                              |
| `src/twenty/env.ts`                                                                       | NEW       | 1        | URLs, workspace names, login values (env first, harness exports otherwise) (§6.1)                                                      |
| `tests/unit/twenty-env.test.ts`                                                           | NEW       | 1        | 6 unit tests (§6.2)                                                                                                                    |
| `src/twenty/auth.ts`                                                                      | NEW       | 2        | signIn, pick workspace, origin, exchange, `graphqlData` (§6.4)                                                                         |
| `tests/unit/twenty-auth.test.ts`                                                          | NEW       | 2        | 4 unit tests (§6.5)                                                                                                                    |
| `src/twenty/oracle.ts`                                                                    | NEW       | 3        | schema name, resolve schema, read-only write probe (§6.3)                                                                              |
| `tests/unit/twenty-oracle.test.ts`                                                        | NEW       | 3        | 3 unit tests (§6.3)                                                                                                                    |
| `scripts/seed-twenty.mjs`                                                                 | NEW       | 3        | seed through the adapter (§6.7)                                                                                                        |
| `k6/smoke/twenty-health.js`                                                               | NEW       | 3        | `GET /healthz` smoke (§6.8)                                                                                                            |
| `playwright.config.ts`                                                                    | CHANGED   | 4        | project `twenty-race` (§6.9)                                                                                                           |
| `tests/twenty/races/twenty-self-test.spec.ts`                                             | NEW       | 4        | the unmapped self-test (§6.6)                                                                                                          |
| `.github/workflows/perf.yml`                                                              | CHANGED   | 5        | job `twenty-smoke` (§8.2)                                                                                                              |
| `.env.example`                                                                            | CHANGED   | 6        | names only (§6.10)                                                                                                                     |
| `README.md`                                                                               | CHANGED   | 6        | section "Run Twenty", no timing claims (§6.10)                                                                                         |
| `docs/BACKLOG.md`                                                                         | CHANGED   | 6        | P6-OBS-TW-001 (SUSPECTED); H-twenty-auth; pull retry for the other jobs (X5)                                                           |
| `scripts/bootstrap.sh`                                                                    | unchanged | —        | already has `twenty`, `TWENTY_REF` and the clone (checked)                                                                             |
| `scripts/harness.mjs`, `scripts/evidence-token-scan.mjs`, `src/races/*`, `node_modules/*` | unchanged | —        | rule 14 (no harness or fork edits) and the roadmap                                                                                     |
| `.cursor/*`, `.claude/*`                                                                  | unchanged | —        | no environment change (§0 decision 6)                                                                                                  |

## 6. Code skeletons and tests (each new function and test)

Style follows the existing files (`tests/unit/documenso-env.test.ts`: `describe` / `it` from `node:test`, `assert/strict`).
Every skeleton below is a starting point; the build copies it and keeps the names.

### 6.1 `src/twenty/env.ts` (NEW, step 1)

```ts
import { TWENTY_DEFAULT_ADMIN_EMAIL, TWENTY_DEV_SEED_PASSWORD } from "qa-portfolio-harness";

const strip = (u: string) => u.replace(/\/$/, "");
const val = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || undefined;

/** Harness address (harness docker/twenty.compose.yml maps the app to 3002). */
export function twentyBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return strip(val(env, "TWENTY_BASE_URL") ?? "http://127.0.0.1:3002");
}

/** P6 override first, then the harness variable, then the harness default (published on 5434). Not a secret. */
export function twentyDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    val(env, "P6_TWENTY_DATABASE_URL") ??
    val(env, "TWENTY_DB_URL") ??
    "postgres://postgres:postgres@127.0.0.1:5434/default"
  );
}

/** Seed workspace subdomain (core.workspace.subdomain). */
export function twentySubdomainFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "P6_TWENTY_SUBDOMAIN") ?? "apple";
}

/** Seed workspace display name, as signIn lists it. */
export function twentyWorkspaceNameFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "P6_TWENTY_WORKSPACE_NAME") ?? "Apple";
}

/** TWENTY_EMAIL when set and not blank, else the harness export (owner decision O-T2). */
export function twentyEmailFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "TWENTY_EMAIL") ?? TWENTY_DEFAULT_ADMIN_EMAIL;
}

/** TWENTY_PASSWORD when set and not blank, else the harness export. Returned only, never logged. */
export function twentyPasswordFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "TWENTY_PASSWORD") ?? TWENTY_DEV_SEED_PASSWORD;
}
```

### 6.2 `tests/unit/twenty-env.test.ts` (NEW, step 1): 6 tests

```ts
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { TWENTY_DEFAULT_ADMIN_EMAIL, TWENTY_DEV_SEED_PASSWORD } from "qa-portfolio-harness";
import {
  twentyBaseUrlFromEnv,
  twentyDatabaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyPasswordFromEnv,
  twentySubdomainFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../src/twenty/env.ts";

describe("twenty env", () => {
  afterEach(() => mock.restoreAll());

  it("defaults to the harness address and the seed workspace", () => {
    assert.equal(twentyBaseUrlFromEnv({}), "http://127.0.0.1:3002");
    assert.equal(twentySubdomainFromEnv({}), "apple");
    assert.equal(twentyWorkspaceNameFromEnv({}), "Apple");
  });

  it("strips one trailing slash from the base URL", () => {
    assert.equal(
      twentyBaseUrlFromEnv({ TWENTY_BASE_URL: "http://127.0.0.1:4000/" }),
      "http://127.0.0.1:4000",
    );
  });

  it("prefers the P6 override, then TWENTY_DB_URL, then the harness default", () => {
    assert.equal(
      twentyDatabaseUrlFromEnv({}),
      "postgres://postgres:postgres@127.0.0.1:5434/default",
    );
    assert.equal(
      twentyDatabaseUrlFromEnv({ TWENTY_DB_URL: "postgres://a@h/x" }),
      "postgres://a@h/x",
    );
    assert.equal(
      twentyDatabaseUrlFromEnv({
        TWENTY_DB_URL: "postgres://a@h/x",
        P6_TWENTY_DATABASE_URL: "postgres://b@h/y",
      }),
      "postgres://b@h/y",
    );
  });

  it("uses TWENTY_EMAIL and TWENTY_PASSWORD when they are set", () => {
    assert.equal(twentyEmailFromEnv({ TWENTY_EMAIL: "login@example.test" }), "login@example.test");
    assert.equal(twentyPasswordFromEnv({ TWENTY_PASSWORD: "value-from-env" }), "value-from-env");
  });

  it("falls back to the harness exports when they are unset or blank", () => {
    assert.equal(twentyEmailFromEnv({}), TWENTY_DEFAULT_ADMIN_EMAIL);
    assert.equal(twentyEmailFromEnv({ TWENTY_EMAIL: "   " }), TWENTY_DEFAULT_ADMIN_EMAIL);
    assert.equal(twentyPasswordFromEnv({}), TWENTY_DEV_SEED_PASSWORD);
    assert.equal(twentyPasswordFromEnv({ TWENTY_PASSWORD: "  " }), TWENTY_DEV_SEED_PASSWORD);
  });

  it("never prints the password", () => {
    const log = mock.method(console, "log", () => {});
    const error = mock.method(console, "error", () => {});
    twentyPasswordFromEnv({});
    twentyPasswordFromEnv({ TWENTY_PASSWORD: "value-from-env" });
    assert.equal(log.mock.callCount() + error.mock.callCount(), 0);
  });
});
```

Test counts: 6 (defaults; trailing slash; DB precedence; env override; harness fallback; never prints).

### 6.3 `src/twenty/oracle.ts` (NEW, step 3) and `tests/unit/twenty-oracle.test.ts` (NEW, step 3): 3 tests

```ts
import pg from "pg";
import { selectRows } from "../oracles/pg.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The fork's getWorkspaceSchemaName: `workspace_` plus the UUID as a base-36 number.
 * Checked against the two live schemas in the probe (§3.6). Nothing else is hard-coded.
 */
export function workspaceSchemaName(workspaceId: string): string {
  if (!UUID.test(workspaceId)) {
    throw new Error("TEST BUG: workspace id is not a UUID");
  }
  return `workspace_${BigInt(`0x${workspaceId.replaceAll("-", "")}`).toString(36)}`;
}

/** Exactly one core.workspace row must match the subdomain, or the seed changed and the run is a setup error. */
export async function resolveWorkspaceSchema(
  pool: pg.Pool,
  subdomain: string,
): Promise<{ workspaceId: string; schema: string }> {
  const rows = await selectRows<{ id: string }>(
    pool,
    "SELECT id FROM core.workspace WHERE subdomain = $1",
    [subdomain],
  );
  if (rows.length !== 1) {
    throw new Error(
      `TEST BUG: expected one core.workspace row for subdomain ${subdomain}, got ${rows.length}`,
    );
  }
  const workspaceId = rows[0]!.id;
  return { workspaceId, schema: workspaceSchemaName(workspaceId) };
}

/**
 * A deliberate write on the read-only pool, rolled back. Returns the SQLSTATE ("25006" when refused).
 * Not a SELECT, so it does not go through selectRows (the same pattern as src/documenso's self-test).
 */
export async function readOnlyWriteSqlstate(pool: pg.Pool): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("CREATE TEMP TABLE p6_probe_write (x int)");
      return "accepted";
    } catch (err) {
      return err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}
```

```ts
// tests/unit/twenty-oracle.test.ts (NEW, step 3)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { resolveWorkspaceSchema, workspaceSchemaName } from "../../src/twenty/oracle.ts";

const APPLE = "20202020-1c25-4d02-bf25-6aeccf7ea419";
const YC = "3b8e6458-5fc1-4e63-8563-008ccddaa6db";

function fakePool(rows: unknown[]): pg.Pool {
  return { query: async () => ({ rows }) } as unknown as pg.Pool;
}

describe("twenty oracle", () => {
  it("maps the two live workspace ids to the schema names the server created", () => {
    assert.equal(workspaceSchemaName(APPLE), "workspace_1wgvd1injqtife6y4rvfbu3h5");
    assert.equal(workspaceSchemaName(YC), "workspace_3ixj3i1a5avy16ptijtb3lae3");
  });

  it("refuses a value that is not a UUID", () => {
    assert.throws(() => workspaceSchemaName("apple"), /TEST BUG/);
  });

  it("resolves the schema from exactly one row and fails on zero or two", async () => {
    const one = await resolveWorkspaceSchema(fakePool([{ id: APPLE }]), "apple");
    assert.deepEqual(one, { workspaceId: APPLE, schema: "workspace_1wgvd1injqtife6y4rvfbu3h5" });
    await assert.rejects(resolveWorkspaceSchema(fakePool([]), "apple"), /TEST BUG/);
    await assert.rejects(
      resolveWorkspaceSchema(fakePool([{ id: APPLE }, { id: YC }]), "apple"),
      /TEST BUG/,
    );
  });
});
```

### 6.4 `src/twenty/auth.ts` (NEW, step 2): signIn, pick, origin, exchange

```ts
export interface TwentyWorkspace {
  displayName: string;
  loginToken: string;
  workspaceUrls: { subdomainUrl?: string | null; customUrl?: string | null } | null;
}

interface SignInData {
  signIn: { availableWorkspaces: { availableWorkspacesForSignIn: TwentyWorkspace[] } };
}
interface ExchangeData {
  getAuthTokensFromLoginToken: { tokens: { accessOrWorkspaceAgnosticToken: { token: string } } };
}

const SIGN_IN = `mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) {
    availableWorkspaces { availableWorkspacesForSignIn { displayName loginToken workspaceUrls { subdomainUrl customUrl } } }
  }
}`;
const EXCHANGE = `mutation GetAuthTokensFromLoginToken($loginToken: String!, $origin: String!) {
  getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
    tokens { accessOrWorkspaceAgnosticToken { token } }
  }
}`;

/** Same order as the harness (selectWorkspaceOrigin): subdomain URL, then custom URL, then the base URL. */
export function originFor(workspace: TwentyWorkspace, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const subdomain = workspace.workspaceUrls?.subdomainUrl?.trim();
  if (subdomain) return subdomain.replace(/\/$/, "");
  const custom = workspace.workspaceUrls?.customUrl?.trim();
  if (custom) return custom.replace(/\/$/, "");
  return base;
}

/** Throws a TEST BUG naming the missing workspace; never prints the list's tokens. */
export function pickWorkspace(workspaces: TwentyWorkspace[], displayName: string): TwentyWorkspace {
  const found = workspaces.find((w) => w.displayName === displayName);
  if (!found) {
    throw new Error(
      `TEST BUG: no workspace named ${displayName} in signIn (got ${workspaces.length})`,
    );
  }
  return found;
}

/** POSTs a GraphQL operation. Throws on `errors` with the messages only, never the body. */
export async function graphqlData<T>(
  fetchImpl: typeof fetch,
  url: string,
  query: string,
  variables: Record<string, unknown>,
  authorizationHeader?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorizationHeader) headers.Authorization = authorizationHeader;
  const res = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) {
    throw new Error(
      `Twenty GraphQL error (HTTP ${res.status}): ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!body.data) throw new Error(`Twenty GraphQL returned no data (HTTP ${res.status})`);
  return body.data;
}

/**
 * signIn, pick the workspace by display name, exchange its login token for a workspace token.
 * The agnostic token from signIn is not returned: it cannot read data (§3.3).
 */
export async function signInWorkspace(opts: {
  baseUrl: string;
  email: string;
  password: string;
  workspaceName: string;
  fetchImpl?: typeof fetch;
}): Promise<{ authorizationHeader: string; origin: string }> {
  const f = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, "")}/metadata`;
  const signIn = await graphqlData<SignInData>(f, url, SIGN_IN, {
    email: opts.email,
    password: opts.password,
  });
  const workspace = pickWorkspace(
    signIn.signIn.availableWorkspaces.availableWorkspacesForSignIn,
    opts.workspaceName,
  );
  const origin = originFor(workspace, opts.baseUrl);
  const exchanged = await graphqlData<ExchangeData>(f, url, EXCHANGE, {
    loginToken: workspace.loginToken,
    origin,
  });
  const token = exchanged.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
  if (!token) throw new Error("Twenty exchange returned no workspace token");
  return { authorizationHeader: `Bearer ${token}`, origin };
}

/** `currentUser.email` with a given authorization header (the probe's `currentUser` check). */
export async function currentUserEmail(
  baseUrl: string,
  authorizationHeader: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const data = await graphqlData<{ currentUser: { email: string } }>(
    fetchImpl,
    `${baseUrl.replace(/\/$/, "")}/metadata`,
    "query CurrentUser { currentUser { email } }",
    {},
    authorizationHeader,
  );
  return data.currentUser.email;
}
```

### 6.5 `tests/unit/twenty-auth.test.ts` (NEW, step 2): 4 tests

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  graphqlData,
  originFor,
  pickWorkspace,
  signInWorkspace,
  type TwentyWorkspace,
} from "../../src/twenty/auth.ts";

const ws = (over: Partial<TwentyWorkspace> = {}): TwentyWorkspace => ({
  displayName: "Apple",
  loginToken: "LOGIN-TOKEN-FIXTURE",
  workspaceUrls: { subdomainUrl: "http://127.0.0.1:3002/", customUrl: null },
  ...over,
});

/** A fake fetch that answers from a queue of JSON bodies and records each URL. */
function fakeFetch(bodies: unknown[], calls: string[]): typeof fetch {
  return (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(bodies.shift()), { status: 200 });
  }) as typeof fetch;
}

describe("twenty auth", () => {
  it("picks the origin: subdomain URL, then custom URL, then the base URL", () => {
    assert.equal(originFor(ws(), "http://x"), "http://127.0.0.1:3002");
    assert.equal(
      originFor(
        ws({ workspaceUrls: { subdomainUrl: null, customUrl: "https://c.test/" } }),
        "http://x",
      ),
      "https://c.test",
    );
    assert.equal(originFor(ws({ workspaceUrls: null }), "http://x/"), "http://x");
  });

  it("names the missing workspace in a TEST BUG", () => {
    assert.equal(pickWorkspace([ws()], "Apple").displayName, "Apple");
    assert.throws(() => pickWorkspace([ws()], "Missing"), /TEST BUG: no workspace named Missing/);
  });

  it("throws the GraphQL messages and never the response body", async () => {
    const f = fakeFetch([{ errors: [{ message: "Wrong password" }], data: null }], []);
    await assert.rejects(graphqlData(f, "http://x/metadata", "query Q { a }", {}), (err: Error) => {
      assert.match(err.message, /Wrong password/);
      assert.doesNotMatch(err.message, /LOGIN-TOKEN-FIXTURE/);
      return true;
    });
  });

  it("signs in, then exchanges the login token at the workspace origin", async () => {
    const calls: string[] = [];
    const f = fakeFetch(
      [
        { data: { signIn: { availableWorkspaces: { availableWorkspacesForSignIn: [ws()] } } } },
        {
          data: {
            getAuthTokensFromLoginToken: {
              tokens: { accessOrWorkspaceAgnosticToken: { token: "WS-TOKEN" } },
            },
          },
        },
      ],
      calls,
    );
    const out = await signInWorkspace({
      baseUrl: "http://127.0.0.1:3002",
      email: "e",
      password: "p",
      workspaceName: "Apple",
      fetchImpl: f,
    });
    assert.equal(out.authorizationHeader, "Bearer WS-TOKEN");
    assert.equal(out.origin, "http://127.0.0.1:3002");
    assert.deepEqual(calls, ["http://127.0.0.1:3002/metadata", "http://127.0.0.1:3002/metadata"]);
  });
});
```

Note on test 3: `graphqlData` must not include the response body in its message. The skeleton puts only `errors[].message`.

### 6.6 `tests/twenty/races/twenty-self-test.spec.ts` (NEW, step 4)

```ts
import { expect, test } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { runTrials } from "../../../src/races/run-trials.ts";
import { createHistogram, writeHistogram } from "../../../src/races/histogram.ts";
import { createRerunRunner, spreadPolicyFromEnv } from "../../../src/races/rerun-on-spread.ts";
import { recordTrial } from "../../../src/races/trial-record.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import {
  closePool,
  createReadOnlyPool,
  selectRows,
  waitForStable,
} from "../../../src/oracles/pg.ts";
import {
  twentyBaseUrlFromEnv,
  twentyDatabaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyPasswordFromEnv,
  twentySubdomainFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../../src/twenty/env.ts";
import { currentUserEmail, signInWorkspace } from "../../../src/twenty/auth.ts";
import { readOnlyWriteSqlstate, resolveWorkspaceSchema } from "../../../src/twenty/oracle.ts";

const CASE_ID = "twenty-self-test";
const CONCURRENCY = 20;
// /healthz is the harness health route (200). It is not on the API limiter (§3.4).
const HEALTH_PATH = "/healthz";

test.describe.configure({ timeout: 180_000 });

test("twenty self-test (unmapped): health burst, read-only oracle, session auth proof", async () => {
  const trials = raceTrialsFromEnv();
  const base = twentyBaseUrlFromEnv();
  const pool = createReadOnlyPool(twentyDatabaseUrlFromEnv());
  const histogram = createHistogram({
    caseId: CASE_ID,
    title: "twenty self-test (unmapped)",
    product: "twenty",
    concurrency: CONCURRENCY,
    trials,
  });
  let passed = false;

  try {
    // 1. Health burst. Every trial fires 20 parallel GET /healthz; trial 0 is the warm-up (no verdict, no count).
    const runner = createRerunRunner(spreadPolicyFromEnv(), trials);
    const burst = async (trial: number) => {
      const fired = await fireTogether(
        CONCURRENCY,
        async () => {
          const res = await fetch(`${base}${HEALTH_PATH}`);
          return { status: res.status, body: await res.text() };
        },
        {
          warm: async () => {
            const res = await fetch(`${base}${HEALTH_PATH}`);
            await res.text();
          },
        },
      );
      // Record first so the real statuses stay in the histogram even when the check below fails.
      return recordTrial(trial, fired, () => {
        for (const req of fired.requests) {
          if (req.status === 429) {
            throw new Error(
              `TEST BUG: GET ${HEALTH_PATH} returned 429 (rate limited): not a pass, not a race result`,
            );
          }
          if (req.status !== 200) {
            throw new Error(
              `UNEXPECTED: GET ${HEALTH_PATH} HTTP ${req.status} (no product label; see D14)`,
            );
          }
        }
      });
    };
    await runner.warmup(() => burst(0));
    const results = await runTrials(trials, (trial) => runner.runTrial(trial, () => burst(trial)));
    runner.applyTo(histogram);
    expect(
      results.every((t) => t.ok),
      "health burst: at least one trial is not ok",
    ).toBe(true);

    // 2. Oracle: the read-only pool answers, a write is refused with 25006, and the workspace schema resolves.
    const one = await waitForStable(() =>
      selectRows<{ ok: number | string }>(pool, "SELECT 1 AS ok"),
    );
    histogram.oracle.selectOne = Number(one[0]?.ok ?? NaN);
    expect(histogram.oracle.selectOne).toBe(1);

    const sqlstate = await readOnlyWriteSqlstate(pool);
    histogram.oracle.readOnlySqlstate = sqlstate;
    expect(sqlstate, `TEST BUG: expected SQLSTATE 25006, got ${sqlstate || "no code"}`).toBe(
      "25006",
    );

    const ws = await resolveWorkspaceSchema(pool, twentySubdomainFromEnv());
    histogram.oracle.workspaceSchema = ws.schema;

    // 3. Session auth proof: signIn, exchange, currentUser, one REST read. Never a 429 pass.
    const session = await signInWorkspace({
      baseUrl: base,
      email: twentyEmailFromEnv(),
      password: twentyPasswordFromEnv(),
      workspaceName: twentyWorkspaceNameFromEnv(),
    });
    const email = await currentUserEmail(base, session.authorizationHeader);
    histogram.oracle.currentUserMatches = email === twentyEmailFromEnv();
    expect(
      histogram.oracle.currentUserMatches,
      "TEST BUG: currentUser.email differs from TWENTY_EMAIL",
    ).toBe(true);

    const rest = await fetch(`${base}/rest/people?limit=1`, {
      headers: { authorization: session.authorizationHeader },
    });
    await rest.text();
    histogram.oracle.restPeopleStatus = rest.status;
    expect(rest.status, `TEST BUG: GET /rest/people HTTP ${rest.status} (429 is not a pass)`).toBe(
      200,
    );

    passed = results.every((t) => t.ok);
  } finally {
    // Counted here so every run reports its 429s, pass or fail (D5).
    histogram.oracle.rateLimited429 = histogram.statusCounts["429"] ?? 0;
    histogram.finishedAt = new Date().toISOString();
    histogram.verdict = passed ? "pass" : "fail";
    await writeHistogram(histogram);
    await closePool(pool);
  }
  // No cleanup or leak check: this test writes nothing (D9).
  expect(passed).toBe(true);
});
```

Build note: copy the `verdict` line's style from `tests/documenso/races/documenso-self-test.spec.ts` if it differs. The
`waitForStable` import is used once here; `expect` is used on every step.

### 6.7 `scripts/seed-twenty.mjs` (NEW, step 3)

```js
// Seeds the Twenty stack through the harness adapter. Run after `npm run up:twenty`.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdapter } from "qa-portfolio-harness";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
// Same default as scripts/harness.mjs. Must be set before getAdapter(): the harness reads its config on the first call.
process.env.PRODUCTS_ROOT ||= path.resolve(repoRoot, "..", "products");

const seed = await getAdapter("twenty").seed();
console.log(`twenty seed: created=${seed.created} users=${seed.users.length}`);
```

### 6.8 `k6/smoke/twenty-health.js` (NEW, step 3)

```js
// Phase 2 Task 6 smoke: proves k6 can reach a harness-started Twenty. Not a performance number.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.TWENTY_BASE_URL || "http://127.0.0.1:3002").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/healthz`, { tags: { name: "GET /healthz" } });
  check(health, { "GET /healthz is 200": (r) => r.status === 200 });
}
```

### 6.9 `playwright.config.ts` (CHANGED, step 4)

Add the import and one project entry (the file already imports the other `src/*/env.ts` helpers):

```ts
import { twentyBaseUrlFromEnv } from "./src/twenty/env.ts";
// ...inside projects:
    {
      name: "twenty-race",
      testDir: "tests/twenty/races",
      retries: 0,
      use: { baseURL: twentyBaseUrlFromEnv() },
    },
```

### 6.10 `.env.example`, README (CHANGED, step 6)

`.env.example` gets names with empty values, under a `# Twenty (Phase 2 Task 6)` comment:
`TWENTY_BASE_URL=`, `P6_TWENTY_DATABASE_URL=`, `TWENTY_DB_URL=`, `TWENTY_EMAIL=`, `TWENTY_PASSWORD=`, `TWENTY_IMAGE_TAG=`,
`TWENTY_DOWN_VOLUMES=`, `TWENTY_WAIT_MS=`, `P6_TWENTY_SUBDOMAIN=`, `P6_TWENTY_WORKSPACE_NAME=`. Each comment says
"names only; the login is set in the environment, never here."

README section "Run Twenty": the commands (`npm run up:twenty`, `npm run seed:twenty`, `npm run smoke:twenty`,
`npm run race:twenty`, `npm run down:twenty`), the base URL and ports, the sign-in note (§4 D3), the rate-limit note
(§3.4, sessions not limited, API keys limited to 100 per 60 s), and **no timing claims**.

### 6.11 Tests: count per step

Unit tests: step 1a (pin) +0, step 1 (env) +6, step 2 (auth) +4, step 3 (oracle) +3, so **417 → 417 → 423 → 427 → 430**. The
spec (step 4) is a Playwright test, not a unit test, so it does not change the count.

## 7. Build steps (one commit each)

Each build step: `npx prettier --write <changed files>`, `npm run test:unit` (count below), then `npm run check` (exit 0),
`git add <paths>` (rule A2), `git commit`. No attribution line in any commit (rule A3, AGENTS.md).

**Step 0 (this docs commit, owner changes).** Files: `docs/plans/2026-10-23-p6-phase2-task6-twenty-stack.md`.
`git add docs/plans/2026-10-23-p6-phase2-task6-twenty-stack.md`;
`git commit -m "docs(plans): apply the owner decisions to the phase 2 task 6 twenty-stack plan"`; push the same commit to
`feat/2026-10-23-p6-twenty-stack` (`git push -u origin feat/2026-10-23-p6-twenty-stack`) and to
`plan/2026-10-23-p6-twenty-stack` (`git push origin HEAD:refs/heads/plan/2026-10-23-p6-twenty-stack`). Unit count **417**.

**Step 1a (harness pin, owner decision 1).** Files: `package.json`, `package-lock.json`.
`package.json` dependency becomes `"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.12"`. Then
`npm install` (updates the lock). Check:
`node -e 'import("qa-portfolio-harness").then(m=>console.log(typeof m.TWENTY_DEFAULT_ADMIN_EMAIL, typeof m.TWENTY_DEV_SEED_PASSWORD))'`
prints `string string`. `npm run check` exit 0.
`git add package.json package-lock.json`;
`git commit -m "chore(deps): pin qa-portfolio-harness v0.2.12 for the twenty seed exports"`. Unit count **417**.

**Step 1 (env).** Files: `src/twenty/env.ts`, `tests/unit/twenty-env.test.ts` (§6.1, §6.2).
`git add src/twenty/env.ts tests/unit/twenty-env.test.ts`;
`git commit -m "feat(twenty): add the env helpers and their unit tests"`. Unit count **423**
(`# tests 423`, `# pass 423`, `# fail 0`).

**Step 2 (auth).** Files: `src/twenty/auth.ts`, `tests/unit/twenty-auth.test.ts` (§6.4, §6.5).
`git add src/twenty/auth.ts tests/unit/twenty-auth.test.ts`;
`git commit -m "feat(twenty): add the workspace sign-in and token exchange"`. Unit count **427**.

**Step 3 (oracle, seed, smoke, scripts).** Files: `src/twenty/oracle.ts`, `tests/unit/twenty-oracle.test.ts`,
`scripts/seed-twenty.mjs`, `k6/smoke/twenty-health.js`, `package.json`.
`package.json` scripts added (exact text):

```json
"up:twenty": "node scripts/harness.mjs up twenty",
"down:twenty": "node scripts/harness.mjs down twenty",
"seed:twenty": "node scripts/seed-twenty.mjs",
"smoke:twenty": "k6 run --summary-export results/twenty-health-summary.json k6/smoke/twenty-health.js",
```

Check: `npm run k6:inspect` prints `k6 inspect ok: k6/smoke/twenty-health.js`.
`git add src/twenty/oracle.ts tests/unit/twenty-oracle.test.ts scripts/seed-twenty.mjs k6/smoke/twenty-health.js package.json`;
`git commit -m "feat(twenty): add the read-only oracle, the health smoke and the harness scripts"`. Unit count **430**.

**Step 4 (self-test and project).** Files: `playwright.config.ts`, `tests/twenty/races/twenty-self-test.spec.ts`,
`package.json` (add `"race:twenty": "playwright test --project=twenty-race"`).
Check: `npm run typecheck` exit 0 (the spec is in `tsconfig.races.json`).
`git add playwright.config.ts tests/twenty/races/twenty-self-test.spec.ts package.json`;
`git commit -m "test(twenty): add the twenty-race project and the unmapped self-test"`. Unit count **430** (no change).

**Step 4b (local proof on this VM, no commit).** Run in order; record each exit code in the closeout:

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/bootstrap.sh twenty            # exit 0, "left as is" on the second run
npm run up:twenty                           # exit 0, about 2 min
npm run seed:twenty                         # exit 0, "twenty seed: created=true users=4" (harness default login, no env)
npm run smoke:twenty                        # k6: 5 iterations, checks 100 %, exit 0
npm run race:twenty                         # playwright: 1 passed, exit 0
TWENTY_DOWN_VOLUMES=1 npm run down:twenty   # exit 0
npm run down:twenty                         # exit 0 when nothing is running (checked here)
```

**Step 5 (CI job).** File: `.github/workflows/perf.yml` (§8.2). `npm run lint:actions` exit 0.
`git add .github/workflows/perf.yml`; `git commit -m "ci(perf): add the twenty-smoke job with the image pull retry"`.
Unit count **430**.

**Step 6 (docs and backlog).** Files: `README.md`, `.env.example`, `docs/BACKLOG.md`. Check: `npm run format:check` exit 0.
`git add README.md .env.example docs/BACKLOG.md`;
`git commit -m "docs(twenty): add the run section, the env names and the backlog entries"`. Unit count **430**.

**Stop.** Push the branch and open the PR (`gh pr create`, REST fallback). CI runs on the PR. The first CI read happens once
(rule 15).

## 8. CI changes and the time budget (O5)

### 8.1 What changes

One new job, `twenty-smoke`, independent of the other jobs (no `needs:`). The pull retry is in this job only (owner
request); the other jobs get it in a backlog PR. No change to any existing job, to the `MEDUSA_REF` / `CAL_REF` /
`DOCUMENSO_REF` pins, or to the harness.

### 8.2 Job skeleton (copy the layout of `documenso-smoke`, lines 1009 onward)

```yaml
twenty-smoke:
  name: twenty-smoke
  runs-on: ubuntu-24.04
  timeout-minutes: 20
  env:
    P6_WORKING_DIRECTORY: p6
    PRODUCTS_ROOT: ${{ github.workspace }}/products
    TWENTY_REF: 7cbdfec6f346b43715bc2056932f4fad5886f733
    TWENTY_IMAGE_TAG: v2.44.0
    TAG: v2.44.0
    TWENTY_BASE_URL: http://127.0.0.1:3002
    # Public harness default database URL (docker/twenty.compose.yml), not a secret.
    P6_TWENTY_DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5434/default
    # Removes the volumes on every run, so no state carries between runs.
    TWENTY_DOWN_VOLUMES: "1"
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      timeout-minutes: 5
      with:
        persist-credentials: false
        path: ${{ env.P6_WORKING_DIRECTORY }}

    - name: Verify TWENTY_REF matches bootstrap.sh
      timeout-minutes: 2
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        if ! grep -q "^TWENTY_REF=\"${TWENTY_REF}\"$" scripts/bootstrap.sh; then
          echo "::error::TWENTY_REF in perf.yml does not match scripts/bootstrap.sh"
          exit 1
        fi

    - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
      timeout-minutes: 5
      with:
        node-version-file: ${{ env.P6_WORKING_DIRECTORY }}/.nvmrc
        cache: npm
        cache-dependency-path: ${{ env.P6_WORKING_DIRECTORY }}/package-lock.json

    - name: Install P6 dependencies
      timeout-minutes: 10
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        npm ci

    - uses: grafana/setup-k6-action@43b9fc21641a76002687994433dd586f56e791b1 # v1.2.2
      timeout-minutes: 5
      with:
        k6-version: ${{ env.K6_VERSION }}

    - name: Prepare harness roots (Twenty fork at TWENTY_REF)
      timeout-minutes: 10
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      env:
        BOOTSTRAP_SKIP_INSTALL: "1"
      run: |
        set -euo pipefail
        bash scripts/bootstrap.sh twenty
        head="$(git -C "${PRODUCTS_ROOT}/twenty-CRM" rev-parse HEAD)"
        if [ "$head" != "${TWENTY_REF}" ]; then
          echo "::error::Twenty HEAD ${head} does not match TWENTY_REF ${TWENTY_REF}"
          exit 1
        fi

    - name: Pull Twenty images (3 tries, 15 s then 30 s)
      id: twenty_pull
      timeout-minutes: 14
      working-directory: ${{ env.PRODUCTS_ROOT }}/twenty-CRM/packages/twenty-docker
      env:
        OVERLAY: ${{ github.workspace }}/p6/node_modules/qa-portfolio-harness/docker/twenty.compose.yml
      run: |
        set -euo pipefail
        for attempt in 1 2 3; do
          if timeout 240 docker compose -p qa-harness-twenty -f docker-compose.yml -f "${OVERLAY}" pull; then
            exit 0
          fi
          [ "$attempt" -lt 3 ] || break
          echo "pull attempt ${attempt} failed; retrying"
          sleep $(( attempt == 1 ? 15 : 30 ))
        done
        echo "::error::docker compose pull failed after 3 attempts"
        exit 1

    - name: Start Twenty (harness up)
      id: twenty_up
      if: ${{ steps.twenty_pull.outcome == 'success' }}
      timeout-minutes: 12
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        npm run up:twenty

    - name: Seed Twenty (harness seed)
      id: twenty_seed
      if: ${{ steps.twenty_up.outcome == 'success' }}
      timeout-minutes: 10
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        npm run seed:twenty

    - name: k6 smoke (GET /healthz)
      if: ${{ steps.twenty_up.outcome == 'success' }}
      timeout-minutes: 3
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        npm run smoke:twenty

    - name: Twenty self-test (twenty-race)
      id: twenty_races
      if: ${{ steps.twenty_seed.outcome == 'success' }}
      timeout-minutes: 5
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      env:
        # Plan D6: 5 trials on PRs, the full count (50) on main, nightly and workflow_dispatch.
        RACE_TRIALS: ${{ github.event_name == 'pull_request' && '5' || '50' }}
        P6_PLAYWRIGHT_JSON: results/playwright/twenty-race.json
      run: |
        set -euo pipefail
        npm run race:twenty

    - name: Capture container logs (before the scan and the down)
      if: ${{ always() && steps.twenty_pull.outcome == 'success' }}
      timeout-minutes: 2
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        mkdir -p results/twenty
        docker compose -p qa-harness-twenty logs --no-color > results/twenty/containers.log 2>&1 || true

    - name: Check Twenty artefacts for tokens (values, not names)
      id: token_scan
      if: ${{ always() }}
      timeout-minutes: 3
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        value='Bearer [A-Za-z0-9._~+/=-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
        for f in results/twenty/containers.log results/harness/twenty-up.log; do
          [ -f "$f" ] || continue
          if grep -qE "$value" "$f"; then
            echo "::error::${f} contains a token value; not uploading"
            exit 1
          fi
        done
        if [ -d results/races ] && grep -rqE "$value" results/races; then
          echo "::error::race histograms contain a token value; not uploading"
          exit 1
        fi
        # Playwright's JSON config.metadata holds the repo's git diff: scan only suites and errors (Task 5 closeout).
        for f in results/playwright/*.json; do
          [ -f "$f" ] || continue
          results_json=$(jq -c '{suites, errors}' "$f")
          if grep -qE "$value" <<<"$results_json"; then
            echo "::error::$f: test results contain a token value; not uploading"
            exit 1
          fi
        done

    - name: Job summary (Playwright results, race table)
      if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
      timeout-minutes: 2
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        node scripts/write-ci-job-summary.ts

    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      timeout-minutes: 5
      if: ${{ always() && steps.token_scan.outcome == 'success' }}
      with:
        name: race-histograms-twenty
        path: ${{ env.P6_WORKING_DIRECTORY }}/results/races/
        if-no-files-found: warn
        retention-days: 14

    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      timeout-minutes: 5
      if: ${{ always() && steps.token_scan.outcome == 'success' }}
      with:
        name: twenty-container-log
        path: ${{ env.P6_WORKING_DIRECTORY }}/results/twenty/containers.log
        if-no-files-found: warn
        retention-days: 14

    - name: Stop Twenty (harness down, volumes removed)
      if: ${{ always() }}
      timeout-minutes: 5
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        npm run down:twenty
```

Notes on the skeleton:

- The login values are not in CI. `src/twenty/env.ts` uses the harness exports (pin v0.2.12, step 1a), so the job sets no
  secret (owner decision 1).
- The job summary step writes the summary only when the scan passed; a scan failure is a red step.
- The Stop step has no `|| true`: a failing down turns the job red. Build step 4b checks `down` with nothing running (exit 0).
- The pull step runs in the fork's compose folder, as the harness does (`cwd: dockerDir`), so compose reads the same project
  directory.
- Every step has `timeout-minutes` (owner rule), including checkout and both artefact uploads.

### 8.3 Time budget (worst measured value per row, owner decision 4)

| Part                                     | Time (worst) | Source                                                                                                                                       |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout, setup-node, `npm ci`, setup-k6 | 1.5 min      | **estimate** with slack. The Documenso job in run 39961527451 took 16 s for these steps (checkout 3 s, setup-node 7 s, `npm ci` 5 s, k6 1 s) |
| Bootstrap clone                          | 0.25 min     | **measured** 15 s (one sample)                                                                                                               |
| Cold pull (four images)                  | 0.57 min     | **measured** 34 s (one sample; the first boot below also includes a pull, so this is counted twice, on purpose)                              |
| First boot                               | 3.05 min     | **measured** 183 s (first run, images pulled inside `up`). Worst of 183, 135, 106, 140 s                                                     |
| Seed                                     | 1.28 min     | **measured** 77 s (worst of 70 and 77 s)                                                                                                     |
| Self-test at 50 trials                   | 1.0 min      | **estimate**, used as a ceiling; 150 parallel `/healthz` took 252 ms. The first CI run measures it                                           |
| k6 smoke, token scan, job summary        | 0.5 min      | **estimate**, used as a ceiling                                                                                                              |
| Down with volumes                        | 0.05 min     | **measured** 3 s (worst of 2 and 3 s)                                                                                                        |
| **Worst case, measured-based**           | **8.2 min**  | sum of the rows above                                                                                                                        |

**Job timeout 20 min.** Margin: 20 − 8.2 = **11.8 min**, which is at least the 10 minutes O5 requires. Estimated rows are
ceilings, so the real worst case is at most this sum. If the first CI run's measured numbers move the margin under 10 minutes,
the owner decides the new value (never a raised timeout to fit).

**Full trial count.** `RACE_TRIALS=50` on `main`, nightly and dispatch (D6). Each trial is one health burst, so the count changes
only the self-test time, not the cold start or the pull.

**Step caps are not the job time.** The step caps add up to more than the job timeout (pull 14, up 12, seed 10, and more). That
is deliberate: a step that hits its cap has failed. The job timeout is set from measured times (O5), never from the sum of caps.

### 8.4 Step timeouts and the reason for each

| Step                               | timeout-minutes | Reason                                                                                                                        |
| ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Checkout                           | 5               | the P6 repository, small                                                                                                      |
| Verify TWENTY_REF                  | 2               | grep only                                                                                                                     |
| setup-node                         | 5               | copied from `medusa-smoke`                                                                                                    |
| Install P6 dependencies (`npm ci`) | 10              | 5 s in the Documenso job; 10 min covers a slow runner                                                                         |
| setup-k6                           | 5               | downloads k6                                                                                                                  |
| Prepare harness roots (bootstrap)  | 10              | clone measured 15 s here; 10 min covers a slow runner                                                                         |
| Pull (3 tries)                     | 14              | 3 × 240 s per try + 15 s + 30 s = 765 s worst case (D11), rounded up to 840 s                                                 |
| Start (harness up)                 | 12              | measured 106 to 183 s; compose `--wait` fails by itself after about 300 s start period + 20 × 5 s, so a stuck boot ends first |
| Seed                               | 10              | measured 70 to 77 s; the adapter's own 40-minute cap is not used                                                              |
| k6 smoke                           | 3               | 5 iterations                                                                                                                  |
| Self-test                          | 5               | estimate about 1 min at 50 trials; the cap leaves room for slow runners                                                       |
| Capture logs                       | 2               | `docker compose logs`                                                                                                         |
| Token scan                         | 3               | grep and jq                                                                                                                   |
| Job summary                        | 2               | `write-ci-job-summary.ts`                                                                                                     |
| Upload artefacts (2 steps)         | 5 each          | owner rule: every step has a cap; uploads of a few small files                                                                |
| Stop (down)                        | 5               | measured 2 to 3 s                                                                                                             |

## 9. Test strategy (what each layer proves)

- **Unit (`tests/unit/twenty-*.test.ts`, 13 tests):** the env rules (defaults, precedence, env override, harness fallback, no
  printing), the origin order and pick rules of the sign-in path, the error text that never prints a body, and the schema name
  rule against two live schemas. No network.
- **Smoke (k6, 5 iterations):** the harness-started server answers `/healthz` with 200. Not a performance number.
- **Self-test (Playwright `twenty-race`):** health burst (no 429), read-only oracle (`SELECT 1` and SQLSTATE 25006), the workspace
  schema resolves, one session auth proof with `currentUser` and one REST read. It proves the stack and the access path, not a race.
- **Token scan (CI):** value patterns over the logs, the harness log, the histograms and the JSON suites and errors.
- **Local proof (step 4b):** the same commands on this VM, with exit codes recorded.

## 10. Test strategy notes (what this does not prove)

- No product claim (no race, no finding confirmed). The limiter facts are for the self-test design only.
- The suspected finding P6-OBS-TW-001 has no test. It is a recorded observation with three reproductions.

## 11. Risks

| Risk                                                       | Likelihood                                            | Mitigation in this plan                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Docker Hub registry 500 during the pull on a hosted runner | **Confirmed once** (run 39961527451 attempt 1, §3.10) | Three tries with 15 s and 30 s backoff, each try capped at 4 min (D11)                                     |
| First boot slower on a hosted runner than on this VM       | Medium                                                | Step cap 12 min; the compose healthcheck fails by itself after about 7 min                                 |
| Harness export missing in a future pin                     | Low                                                   | The pin is exact (`v0.2.12`); the unit test for the fallback fails if the export disappears                |
| Harness `authenticate()` used by mistake (agnostic token)  | Medium                                                | P6 never calls `authenticate()` for data; `src/twenty/auth.ts` is the one path (D3). Backlog H-twenty-auth |
| A future `TWENTY_API_KEY` run hits 100 per 60 s            | Low (not used)                                        | D5: self-test uses sessions; a 429 is a TEST BUG                                                           |
| Malformed bodies hang (P6-OBS-TW-001)                      | Known                                                 | The self-test sends only well-formed bodies (§3.5)                                                         |
| Token leakage through logs or Playwright JSON `config`     | Low                                                   | D7: value patterns, suites and errors only; the probe's log scan was clean (A10)                           |
| The shared scan's bare-name patterns (Task 5 class)        | Medium if the shared script is used                   | The job does not use it (D7); X6 later (O-T5)                                                              |
| `harness down` without `TWENTY_DOWN_VOLUMES` keeps state   | Low in CI                                             | The job sets the variable (§8.2)                                                                           |
| Port 8025 or 1025 used by a future product                 | Low                                                   | §3.7; one stack per job                                                                                    |
| `redis` image unpinned in the fork's compose               | Low                                                   | Accepted for now; §12 X2                                                                                   |
| Image tag `v2.44.0` re-pushed upstream                     | Low                                                   | Digest recorded (§3.9); §12 X1                                                                             |

## 12. Proposed extras (out of scope until the owner accepts them)

- **X1** Pin the four images by digest in the harness overlay (the harness owns that file, so this is a harness change).
- **X2** Pin `redis` (the fork's compose uses `image: redis`); a harness change, same as X1.
- **X3** A known-bug test for P6-OBS-TW-001 with `test.fail()` after an owner label (D14).
- **X4** An API-key limiter test (the 101st request in a window returns 429 with `retry-after`), in a separate project, once the owner wants limiter coverage.
- **X5** The pull retry for `medusa-smoke`, `medusa-order-races`, `medusa-cancel-extras`, `cal-smoke`, `cal-state-races` and `documenso-smoke` (backlog PR, owner request).
- **X6** Use the shared token scan with value patterns (a one-line change to `scripts/evidence-token-scan.mjs`), if the owner wants one scanner.

## 13. Open questions and owner answers (2026-10-23)

Every question is answered by the owner's decisions in §0. Routine choices are decided in §4 (D1 to D16).

- **O-T1 Branch names. Answered: both refs.** The plan commit is on `feat/2026-10-23-p6-twenty-stack` and on
  `plan/2026-10-23-p6-twenty-stack`.
- **O-T2 Where the seed login comes from. Answered: no repository secrets.** Harness `v0.2.12` exports
  `TWENTY_DEFAULT_ADMIN_EMAIL` and `TWENTY_DEV_SEED_PASSWORD`; `src/twenty/env.ts` uses them unless `TWENTY_EMAIL` /
  `TWENTY_PASSWORD` are set (D4). The CI skeleton has no secrets lines.
- **O-T3 The owner's limiter note. Answered: as proposed.** Confirmed for API keys (§3.4), not for sessions. The self-test stays
  on sessions (D5); the README section records the API-key facts.
- **O-T4 The registry 500 for run 39961527451. Answered: confirmed.** The raw attempt-1 logs show
  `Error received unexpected HTTP status: 500 Internal Server Error` for `postgres` in `documenso-smoke` (job `120440451056`,
  13:29:55Z) and `postgres_is_ready` in `cal-smoke` (job `120440451294`, 13:30:30Z). §3.10 has the details. The pull retry
  (D11) is the response.
- **O-T5 Token scanner. Answered: value-only scan in this job (D7).** X6 (the shared scanner with value patterns) is later.
- **O-T6 Suspected finding P6-OBS-TW-001. Answered: SUSPECTED in `docs/BACKLOG.md`; no test in Task 6; no label.**
- **O-T7 Digest pin. Answered: tag now (`v2.44.0`).** Digest as X1.
- **O-T8 Job timeout 20 min. Answered: as proposed.** Margin 11.8 min (§8.3).
- **O-T9 Cursor Cloud. Answered: no setup change now.** The first Cursor run confirms the Docker Hub pulls work.
- **O-T10 Pulls in the other jobs. Answered: X5, backlog.**

## 14. Contradictions with the roadmap

- **C1 Auth assumption (roadmap probe item 5).** The roadmap names the harness `authenticate()` as the auth path. In this
  pinned harness it returns the agnostic token, which cannot read data (§3.3). P6 does its own exchange (D3). Backlog
  H-twenty-auth.
- **C2 Seed logins (roadmap rule "never retype"). Resolved.** The harness v0.2.12 exports the dev defaults; P6 reads the
  exports only when no environment value is set (D4). No P6 literal and no secret.
- **C3 Token scan tool (roadmap scope).** The roadmap names `scripts/evidence-token-scan.mjs`. Its bare-name patterns match
  test titles and source text (the Task 5 failures). The job uses value patterns (D7).
- **C4 Owner's limiter note (owner instructions).** True for API keys; not observed for sessions (§3.4). Recorded, not a change
  to the roadmap's cases.
- **C5 D10 (sparse or full clone).** The probe shows the full clone is fast (15 s), so D10's condition for sparse is not met;
  full clone stays (D1).
- **C6 Roadmap "npm run up:twenty … down:twenty".** The scripts did not exist; the build adds them. The probe used the harness
  entry point directly.
- **C7 The registry 500 in run 39961527451. Resolved (confirmed).** The raw logs show the 500 (§3.10). The earlier read of
  the `--log` view that found no cause was incomplete.

## 15. Self-check (rule 20)

- **(a) Roadmap "Done when".**
  - Up, smoke, self-test and down work on a cloud VM: **met locally** by §3 (the smoke and self-test scripts are built in
    step 4b).
    _Gap:_ the self-test and the job run in the build (steps 4b and 5).
  - Up, smoke, self-test and down work in CI (green on the PR and once on `main`): **gap** until the PR's CI run. The main run follows the merge.
  - Token scan before every upload: **planned** (§8.2).
  - No secret in git: **met by design**: no secret, no literal login in P6 code (D4, §6.1), no secrets lines in CI (§8.2).
  - README "Run Twenty" has no timing claims: **planned** (§6.10).
  - Environment steps listed for both agents: **none needed** (owner decision 6; §1). Cursor's first run confirms the pulls.
  - `npm run check` green: **met** on the baseline (§3.1 row 13) and required after each step.
- **(b) Names and paths grep-checked.** The following names exist in the repo or in the pinned harness (the plan's new names are
  marked NEW in §5): `bootstrap.sh` (`twenty`, `TWENTY_REF`), `scripts/harness.mjs`, `src/oracles/pg.ts` (`createReadOnlyPool`,
  `selectRows`, `waitForStable`, `closePool`), `src/races/*` (`fireTogether`, `runTrials`, `recordTrial`, `createRerunRunner`,
  `spreadPolicyFromEnv`, `raceTrialsFromEnv`, `createHistogram`, `writeHistogram`), `src/races/types.ts` (`RaceProduct`
  includes `"twenty"`), `src/ci/playwright-json-summary.ts` (`ISSUE_ANNOTATION_TYPE`), `scripts/write-ci-job-summary.ts`,
  `scripts/evidence-token-scan.mjs`, `tests/documenso/races/documenso-self-test.spec.ts`, `.github/workflows/perf.yml`
  (`documenso-smoke`, `medusa-smoke`), `k6/smoke/documenso-health.js`, `playwright.config.ts`, `.env.example`,
  `docs/BACKLOG.md`. The harness v0.2.12 names (`getAdapter`, `seed`, `loadConfig`, `twentyComposeFilePaths`,
  `TWENTY_DEFAULT_ADMIN_EMAIL`, `TWENTY_DEV_SEED_PASSWORD`) were read in its source (`src/index.ts`, `src/adapters/twenty-env.ts`).
- **(c) CI time estimate.** §8.3 uses the worst measured value per row (first boot 183 s, seed 77 s); the worst case is
  **8.2 min** against a 20-minute timeout, a **11.8-minute margin** (at least 10 as required). The pull retry (three tries) is in
  the timeline, the seed too. Values match across §3.1, §8.3 and §8.4.
- **(d) Skeletons and commands.** Every new function and test has a skeleton (§6.1 to §6.8); every build step has `git add`
  paths, the commit command and the expected count. Every CI step has `timeout-minutes` (§8.2, §8.4).
- **(e) Owner answers.** Recorded in §0 (decisions 1 to 6) and §13. No answer is recorded beyond what the owner gave in this session.

## 16. Closeout notes (fill in before the PR merges)

- **Merge SHA:** _pending_ (the PR is opened after the build; the owner says "merge" to merge it).
- **CI runs:** _pending_. The first run is on the PR. The main run and the nightly run follow the merge.
- **Findings:** P6-OBS-TW-001 (SUSPECTED, §3.5; `docs/BACKLOG.md`): malformed `{}` and empty bodies on `/metadata` and
  `/graphql` get no response, reproduced three times.
- **Deviations from this plan so far:**
  - The owner's `up:twenty` / `down:twenty` scripts did not exist; the probe called `scripts/harness.mjs` directly (§3.1).
  - The probe's first `auth` run had a bug of its own: the probe truncated the response body to 300 characters before parsing
    it, so the sign-in looked empty. Fixed in the probe and re-run (`auth-warm.out`). No product data changed.
  - My earlier read of attempt 1 of run `39961527451` said the cause was unexplained. The raw logs (§3.10) show the registry 500. The earlier read used the `--log` view, which omits those lines.
  - The plan commit goes to two refs (O-T1, both accepted).
  - Step 1a (the pin bump) was added after the owner's approval, as its own commit before the env step.
  - **Review fixes on PR #44 (CodeRabbit, valid ones):** (a) the self-test `if` gets `!cancelled()`, so it still runs after a
    smoke failure; (b) the container-log capture passes the Compose files and no longer hides errors with `|| true`; (c)
    `twentyBaseUrlFromEnv` refuses cleartext `http://` to a non-loopback host, because credentials are sent to that URL. Fix (c)
    adds one env unit test, so the unit count is **431** from step 1 on (the plan's 423 / 427 / 430 are now 424 / 428 / 431).
    The skipped suggestion (none) is recorded here as nothing skipped.
  - **CI failure on the first PR run (fixed in `fix(ci)`):** `setup-node` in `twenty-smoke` had no `cache-dependency-path`, so it looked for
    the lockfile at the repository root and failed (`Dependencies lock file is not found`). `npm ci` never ran, so the Stop step's
    `down` found no `scripts/down.mjs`. The skeleton in §8.2 omitted the line that every other job has. Fixed in the workflow and in the skeleton.
- **Rule slips:** none recorded. The first `npm run up:twenty` and `down:twenty` calls used the harness directly (above).
