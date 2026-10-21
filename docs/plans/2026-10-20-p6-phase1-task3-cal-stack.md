# P6 Phase 1 Task 3: Cal stack in P6 (plan only)

This is the implementation plan a weaker model will build from. Do not write code until the maintainer
approves this document.

Structure and depth follow
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md) and
[2026-10-18-p6-phase1-task1-race-framework.md](2026-10-18-p6-phase1-task1-race-framework.md). P1
UI-assertion and page-object rules do **not** apply. P6 asserts through HTTP status histograms and
a read-only database oracle.

The source of this task is
[2026-10-20-p6-phase1-roadmap.md](2026-10-20-p6-phase1-roadmap.md), section "Task 3: Cal stack in
P6", and its "Decisions (2026-10-20)".

## Context

- Repo: [Jayami123/k6-load-concurrency-suite](https://github.com/Jayami123/k6-load-concurrency-suite)
  (P6). Plan written on branch `feat/2026-10-20-p6-phase1-roadmap` from `main` at `bd2b068`.
- Harness: `qa-portfolio-harness#v0.2.11`. Its Cal adapter is
  `node_modules/qa-portfolio-harness/src/adapters/cal.adapter.ts`; its config is
  `node_modules/qa-portfolio-harness/src/config.ts`. Never edit the harness or the Cal fork.
  `scripts/harness.mjs` owns starting and stopping products.
- Cal fork: [Jayami123/cal](https://github.com/Jayami123/cal) (Cal.diy, Next.js 16.2.3, Yarn
  4.12.0, Prisma 6.16.1, Postgres 18).
- This task maps **no** case ID. It adds one unmapped self-test. Mapped Cal cases start in Task 4
  (`P6-CAL-RACE-001`, `P6-CAL-RACE-002`) and Task 5 (`P6-CAL-RACE-003`).
- PATH before every harness command: `export PATH="/usr/local/bin:$PATH"` (AGENTS.md).
- Probe status: done once on 2026-10-20 in a Claude Code cloud session (section 2). Probe scripts
  lived only in the session scratchpad and were not written to the repo, harness or fork. Cal was
  stopped at the end (no process, ports 3000 and 5450 closed, no Cal container).

## 1. Header

- Probe date: 2026-10-20. VM: 4 vCPU, 16093 MB RAM, no swap, 29 GB free disk. Docker 29.9.1.
  Node **v22.23.3** at `/usr/local/bin/node`. Yarn 4.12.0 (from the fork's `packageManager`).
- `PRODUCTS_ROOT=/home/user/products` (bootstrap default `../products`).
- The Cal fork's `scripts/seed.ts` and the seed log print demo passwords and a demo API key. They
  are public fork fixtures, not P6 secrets, but **no plan, README, test or report copies them**.
- Timings here prove the stack works. They are never published as performance numbers (AGENTS.md);
  published numbers come only from GitHub Actions (median of ≥ 3 runs).

## 2. Probe findings (required; no guessed values)

| #   | Question                     | Observed                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `CAL_REF`                    | P1 (`playwright-e2e-ci-framework` @ `1e0501c`, `.github/workflows/e2e.yml` line 71) pins `CAL_REF: main`, not a SHA. So the pin is the fork's `main` head: **`c2b7ac44c66f24ffef1662b276f0653988a609a3`** (2026-10-08, "Merge pull request #1 … windows-webpack-node-scheme").                                        |
| P2  | Install                      | `yarn install --immutable`: first try 207 s, exit 1 (root `postinstall` → `turbo run post-install` → corepack could not fetch Yarn, see P9). After `corepack install` from the npm registry: 40 s, exit 0. `node_modules` 3.5 GB.                                                                                     |
| P2  | Cold `up:cal`                | **370 s** to "Cal web is up". Phases: migrate + `yarn db-seed` 58.7 s; `@calcom/trpc` types build 86.8 s; `next build` compile 101 s + TypeScript 85 s + 88 static pages < 1 s; `next start` ready in 177 ms. `.next` 490 MB.                                                                                         |
| P2  | Cold peak memory             | **6898 MB used** (whole VM, `free -m` every 5 s) at +278 s, during `next build`. Baseline before up ≈ 950 MB. **No out-of-memory; swap not needed.**                                                                                                                                                                  |
| P2  | Warm `up:cal`                | **57 s** (second run 50 s). Log: "Cal production .next matches HEAD c2b7ac4…; skipping next build". Peak 1943 MB. Seed still re-runs (32.9 s), see harness finding H1.                                                                                                                                                |
| P3  | API v2                       | Not started by `up:cal`: `127.0.0.1:5555` connection refused. The harness `health()` falls back to `GET /`.                                                                                                                                                                                                           |
| P3  | Web routes                   | `GET /` → 307 to `/auth/login`. `GET /api/health` → 404. `GET /pro/30min` → **200** (booker page, ~360 KB). `GET /api/csrf` → 200.                                                                                                                                                                                    |
| P3  | Booking route                | The booker UI calls `createBooking` → `post("/api/book/event", data)` (`packages/features/bookings/lib/create-booking.ts`). One real anonymous booking on that route: **HTTP 200** in 0.31 s, `status: "ACCEPTED"` in the JSON body. No auth header, no cookie.                                                       |
| P4  | Seed                         | Host `pro` (`users.id` 4, time zone Europe/London) has event type **id 3 `30min` (30 min)** and **id 4 `60min` (60 min)**; both `minimumBookingNotice` 120, `periodType` unlimited, buffers 0, no seats, no confirmation. `ApiKey` has 1 row (value not recorded).                                                    |
| P4  | Free slots                   | `GET /api/trpc/slots/getSchedule?input=<json>` → 200. From 2026-10-21 for 14 days: **152** free 30-min slots and **72** free 60-min slots for `pro` (10 weekdays). `periodType` unlimited, so later windows add more.                                                                                                 |
| P5  | Same slot again (sequential) | **HTTP 409** `{"message":"no_available_users_found_error","data":{"traceId":"…"}}`, for a different attendee and for the same attendee. Sequential only; a race may fail on a different path (Task 4 probe).                                                                                                          |
| P6  | Oracle DB                    | `postgresql://postgres@127.0.0.1:5450/calendso` (trust auth, no password; fork `packages/prisma/docker-compose.yml`). Postgres 18.6. `default_transaction_read_only=on` accepted; `INSERT INTO "Booking"` rejected with **SQLSTATE `25006`**.                                                                         |
| P6  | `"Booking"` columns          | `id` int4, `uid` text not null, `status` enum `"BookingStatus"` = `cancelled, accepted, rejected, pending, awaiting_host` (**lowercase in the DB**), `startTime`/`endTime` `timestamp without time zone`, `userId` int4 null, `eventTypeId` int4 null, `idempotencyKey` text null.                                    |
| P6  | Unique indexes               | `Booking_idempotencyKey_key` UNIQUE (`idempotencyKey`), `Booking_uid_key`, `Booking_oneTimePassword_key`, `Booking_pkey`. Key = `uuidv5("<start>.<end>.<userId>")` (`packages/prisma/extensions/booking-idempotency-key.ts`): two attendees on one slot got the same key.                                             |
| P7  | Cleanup                      | `GET /api/csrf` (sets cookie `calcom.csrf_token`, returns `csrfToken`) then `POST /api/cancel` `{uid, cancellationReason, cancelledBy, csrfToken}` with that cookie → **200** `"Booking successfully cancelled."`. Row → `cancelled`, `idempotencyKey` → NULL. Same slot books again → 200. Without the cookie → 400. |
| P8  | `down:cal`                   | Exit 0 in 1 s: removes the Postgres container and network, **keeps volume `qa-harness-cal_db_data`**. It does **not** stop the web: `up.mjs`, `yarn … next start` and `next-server` stay alive and `:3000` stays bound (`GET /pro/30min` → 500 once the DB is gone). See H2, H3.                                      |
| P8  | Stop by process group        | `setsid node scripts/harness.mjs up cal`, then `down:cal`, then `kill -TERM -- -<pgid>`: 0 processes left in the group, `:3000` closed within 5 s. A second `up:cal` reused the build (P2 warm row).                                                                                                                  |
| P9  | Blocked hosts                | `repo.yarnpkg.com:443` → proxy 403 (policy). `telemetry.vercel.com:443` → 403 (Turbo/Next telemetry, harmless). No Prisma engine host was blocked.                                                                                                                                                                    |

### 2.1 Bring-up details

- Clone: `BOOTSTRAP_SKIP_INSTALL=1 bash scripts/bootstrap.sh cal` cloned `main` at depth 1 →
  `c2b7ac44c66f24ffef1662b276f0653988a609a3`.
- Product `.env`: the adapter refuses to start without `<cal>/.env` ("Copy .env.example → .env and
  set NEXTAUTH_SECRET + CALENDSO_ENCRYPTION_KEY"). The probe did what P1 CI does
  (`e2e.yml`, "Prepare Cal product .env"): copy `.env.example`, replace `http://localhost:3000`
  with `http://127.0.0.1:3000`, append `NEXTAUTH_SECRET=$(openssl rand -base64 32)` and
  `CALENDSO_ENCRYPTION_KEY=$(openssl rand -base64 24)`. `.env` is gitignored in the fork
  (`.gitignore:4`). Values were never printed. `UNKEY_ROOT_KEY` stays empty.
- Rate limiting: `/api/book/event` and `/api/cancel` call `checkRateLimitAndThrowError`, which is
  disabled when `UNKEY_ROOT_KEY` is unset (`packages/lib/rateLimit.ts`, "Disabled because the
  UNKEY_ROOT_KEY environment variable was not found"). No 429 was seen.
- `up:cal` never returns (H2): `scripts/up.mjs` awaits `adapter.up()`, which spawns
  `yarn workspace @calcom/web exec next start -H 127.0.0.1 -p 3000` as a non-detached child.

### 2.2 Booking request (P3, exact)

```http
POST http://127.0.0.1:3000/api/book/event
Content-Type: application/json

{"responses":{"name":"p6 probe","email":"p6-qa-probe-1@example.com","guests":[],
  "location":{"value":"integrations:daily","optionValue":""}},
 "user":"pro","start":"2026-10-27T10:00:00Z","end":"2026-10-27T10:30:00Z",
 "eventTypeId":3,"eventTypeSlug":"30min","timeZone":"UTC","language":"en",
 "metadata":{},"hasHashedBookingLink":false}
```

Response 200 (trimmed): `{"id":31,"uid":"7JTfJV9vPtx2KL9xFh78oh","idempotencyKey":"<uuid>",
"userId":4,"eventTypeId":3,"startTime":"2026-10-27T10:00:00.000Z",
"endTime":"2026-10-27T10:30:00.000Z","status":"ACCEPTED", … ,"attendees":[{"email":"p6-qa-probe-1@example.com", …}]}`.
The body shape follows `mapBookingToMutationInput`
(`packages/features/bookings/lib/client/booking-event-form/booking-to-mutation-input-mapper.tsx`).
Task 3 does **not** book; this is recorded for Task 4.

### 2.3 Slots request (P4, exact)

`GET /api/trpc/slots/getSchedule?input=` + URL-encoded

```json
{
  "json": {
    "eventTypeId": 3,
    "startTime": "2026-10-21T00:00:00.000Z",
    "endTime": "2026-11-04T00:00:00.000Z",
    "timeZone": "UTC",
    "isTeamEvent": false,
    "usernameList": ["pro"],
    "eventTypeSlug": "30min",
    "orgSlug": null
  }
}
```

Response: `{"result":{"data":{"json":{"slots":{"2026-10-21":[{"time":"2026-10-21T08:00:00.000Z"}, …]}}}}}`.
Per-day counts 14–16 for 30 min. Seeded `pro` bookings (2026-10-21 onward) already remove some slots.

### 2.4 Barrier on the chosen health URL

Gated burst (warm 20, then 20 behind one gate), 3 rounds each:

| URL              | Statuses | Client start spread | Slowest request |
| ---------------- | -------- | ------------------- | --------------- |
| `GET /pro/30min` | 20 × 200 | 0.90–1.32 ms        | 1178–1720 ms    |
| `GET /api/csrf`  | 20 × 200 | 0.93–1.46 ms        | 49–57 ms        |

Spread is well under the `RACE_MAX_SPREAD_MS` default of 5.

### 2.5 Harness findings (record; do not fix in the harness)

- **H1** Seed presence check queries `"User"`, but the table is `users` (`relation "User" does not
exist`), so every `up:cal` re-runs `yarn db-seed` (≈ 33 s warm). Harmless; costs time.
- **H2** `up:cal` does not return while Cal runs (foreground child).
- **H3** `down:cal` only runs `docker compose down`; the web process keeps `:3000`.
- **H4** `down` keeps the `qa-harness-cal_db_data` volume, so local DB state (bookings) survives a
  restart. CI is always fresh.

H2 and H3 are bridged in P6's own `scripts/harness.mjs` (D4) until the harness release in
section 19 fixes them. H1 is fixed in that release, not worked around in P6. H4 is harness
behaviour (local data survives `down`) and stays.

## 3. Resolved decisions

Lead with the industry-standard approach, then the rejected alternative.

- **D1 `CAL_REF = c2b7ac44c66f24ffef1662b276f0653988a609a3`.** P1 pins `main`, which is not
  reproducible; a 40-char SHA is the standard. Rejected: keeping `main` (cache keys and the harness
  build marker would drift silently).
- **D2 Booking route for Phase 1 = web `POST /api/book/event`.** It is the route the booker UI uses,
  it is anonymous, and it runs on the stack `up:cal` actually starts. Rejected: API v2
  `POST /v2/bookings` (API v2 is not started by the harness; starting it would mean a second
  product process the harness does not own). Task 3 does not call it; Task 4 does.
- **D3 Health URL = `GET /pro/30min` (200).** It renders the booker for the host and event type the
  races use, so it proves web + DB + seed. Rejected: `GET /` (307 to login), `/api/health` (404),
  API v2 `/health` (not running), `/api/csrf` (fast but proves no DB).
- **D4 `scripts/harness.mjs` runs Cal detached in its own process group and stops the group.**
  Standard for a foreground server in CI: start in background with a readiness wait and a stop
  handle. `up cal` spawns `up.mjs` with `detached: true`, writes the process-group id to
  `results/harness/cal.pgid`, streams `results/harness/cal-up.log` to stdout, and exits 0 when the
  log shows `Cal web is up at ` (exit 1 if the child exits first or after
  `HARNESS_UP_TIMEOUT_MS`, default 3 600 000). `down cal` runs harness `down.mjs`, then sends
  `SIGTERM` to the group, waits up to 30 s for `127.0.0.1:3000` to close, then `SIGKILL`s the group.
  Medusa keeps today's path unchanged. Rejected: `npm run up:cal &` in CI (no readiness, no stop
  handle); `pkill -f "next start"` (matches unrelated shells, proven to kill the caller during the
  probe); editing the harness (forbidden).
  **Temporary bridge** (answer 2, section 19): a test repo should not own product start/stop. A
  harness release will make `up` return once Cal is healthy and `down` stop the web server; then
  P6 bumps the harness and deletes the bridge (`LONG_RUNNING`, `upLongRunning`, `stopGroup`,
  `HARNESS_UP_TIMEOUT_MS`). Keep the bridge small and marked with a `TEMPORARY BRIDGE` comment.
- **D5 `bootstrap.sh` prepares Cal.** It pins `CAL_REF`, installs deps the normal way
  (`corepack yarn install --immutable`; corepack fetches the fork's Yarn 4.12.0 from
  `repo.yarnpkg.com`, which is allowed in the environment per answer 1), and creates `<cal>/.env` exactly as P1 CI does, with
  generated secrets, only when `.env` is missing. Values are never printed or committed. CI calls
  the same script with `BOOTSTRAP_SKIP_INSTALL=1` for the `.env`, so there is one source of truth.
  Rejected: committing a Cal `.env` (secrets), editing the fork's `.env.example` (fork edit),
  fetching Yarn from the npm registry via `COREPACK_NPM_REGISTRY` (the probe's workaround while
  `repo.yarnpkg.com` was blocked; it could break later).
- **D6 Env getters with 127.0.0.1 defaults.** `CAL_BASE_URL` (default `http://127.0.0.1:3000`) and
  a database URL resolved `P6_CAL_DATABASE_URL` → `CAL_DB_URL` (harness name) →
  `postgresql://postgres@127.0.0.1:5450/calendso`. That default is the fork's trust-auth local DB,
  not a secret. Rejected: the harness default `postgresql://postgres:@localhost:5450/calendso`
  (P6 rule: `127.0.0.1` only). Medusa getters and `createReadOnlyPool()`'s Medusa default stay
  unchanged; Cal callers pass `calDatabaseUrlFromEnv()` explicitly.
- **D7 CI build = production build cached on `CAL_REF` + harness version** (roadmap Decision 1).
  Cache key `${{ runner.os }}-cal-next-${{ env.CAL_REF }}-h0.2.11`. **No swap step**: the cold build
  peaked at 6.9 GB of 16 GB here, and this public repo's `ubuntu-24.04` runner has the same 16 GB /
  4 vCPU; P1 already builds the same fork on that runner. If a CI cold build is OOM-killed, add a
  swap step first, then a larger runner; `CAL_WEB_MODE=dev` is the last resort and must be labelled
  in README.
- **D8 Self-test = 20 gated `GET /pro/30min` per trial + oracle.** Oracle: `SELECT 1`, an
  `INSERT INTO "Booking"` that must fail with `25006`, and a leak check (`COUNT(*) FROM "Booking"`
  unchanged). Same shape as `tests/medusa/races/framework-self-test.spec.ts`.
- **D9 Trials.** CI runs the self-test with `RACE_TRIALS=3` (same as Medusa). Roadmap Decision 2
  (≈ 5 on PRs, full count on `main`/nightly/dispatch) applies to mapped cases from Task 4; the
  nightly `schedule` trigger is added in Task 4, not here.
- **D10 `cal-smoke` is a new, independent job.** It does not depend on or edit `medusa-smoke`. It is
  not made a required check in this task. It becomes a required check after two green runs on
  `main`, the same rule as `medusa-smoke` (answer 3).

## 4. Goal and scope

**In:**

- `CAL_REF` pinned; Cal deps install and product `.env` in `scripts/bootstrap.sh`
- `scripts/harness.mjs` long-running start/stop for `cal` (D4)
- Cal env getters in `src/races/env.ts` + unit tests
- `package.json`: `up:cal`, `down:cal`, `smoke:cal`, `race:cal`
- `k6/smoke/cal-health.js`
- `playwright.config.ts` project `cal-race`; `tests/cal/races/cal-self-test.spec.ts`
- `.github/workflows/perf.yml`: new job `cal-smoke`
- README "Run Cal" section; `.env.example` names

**Out:**

- Any booking, cancel or slot call from P6 code (Task 4)
- Mapped case IDs; API v2; API keys
- Nightly schedule, concurrency-group change (Task 4)
- Edits to `medusa-smoke`, the harness or the Cal fork
- Swap step (D7: not needed)

## 5. Test-case mapping

Task 3 has **no** mapped IDs.

- Name: **cal self-test (unmapped)**
- File: `tests/cal/races/cal-self-test.spec.ts`
- Project: `cal-race`
- Histogram `caseId`: `cal-self-test` → `results/races/cal-self-test.json`
- Oracle: `SELECT 1 AS ok`; `SELECT COUNT(*)::int AS n FROM "Booking"` before and after; INSERT
  probe → SQLSTATE `25006`

## 6. Extra risky checks (inside this task, required)

1. `up:cal` returns exit 0 and the web answers `GET /pro/30min` 200 afterwards (H2 handled).
2. `down:cal` leaves no process in the recorded group and `:3000` closed (H3 handled).
3. `up:cal` twice in a row: the second run prints "skipping next build" (marker reused).
4. A start that dies before readiness makes `up:cal` exit 1 with an `ENV:` line and the log path.
   Live check in Step 3: `CAL_SKIP_WEB_START=1 npm run up:cal` with Cal stopped (the harness throws
   "Cal web is not reachable … CAL_SKIP_WEB_START=1") must exit 1; then `npm run down:cal`.
5. The Medusa job is byte-for-byte unchanged (`git diff` on its section is empty).

## 7. Architecture (every file touched, one responsibility each)

| File                                    | Change | Responsibility                                                                       |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `scripts/bootstrap.sh`                  | edit   | Pin `CAL_REF`; `install_cal_deps`; `prepare_cal_env`                                 |
| `scripts/harness.mjs`                   | edit   | Long-running `up`/`down` for `cal` (D4); Medusa path unchanged                       |
| `src/races/env.ts`                      | edit   | `calBaseUrlFromEnv`, `calDatabaseUrlFromEnv`                                         |
| `tests/unit/env.test.ts`                | edit   | Two new `it` blocks for the Cal getters                                              |
| `package.json`                          | edit   | `up:cal`, `down:cal`, `smoke:cal`, `race:cal`                                        |
| `k6/smoke/cal-health.js`                | new    | k6 smoke `GET /pro/30min`                                                            |
| `playwright.config.ts`                  | edit   | Project `cal-race`                                                                   |
| `tests/cal/races/cal-self-test.spec.ts` | new    | Unmapped live self-test                                                              |
| `.github/workflows/perf.yml`            | edit   | New job `cal-smoke`                                                                  |
| `README.md`                             | edit   | "Run Cal" section                                                                    |
| `.env.example`                          | edit   | `CAL_BASE_URL`, `CAL_DB_URL`, `P6_CAL_DATABASE_URL`, `HARNESS_UP_TIMEOUT_MS` (names) |

No `src/cal/*` files yet (Task 4). No changes to `src/oracles/pg.ts`: `createReadOnlyPool(url)`
already takes a URL.

## 8. Histogram fields for the self-test

Standard `RaceHistogram` (`src/races/types.ts`) with: `caseId: "cal-self-test"`,
`title: "cal self-test (unmapped)"`, `product: "cal"`, `concurrency: 20`, `trials: RACE_TRIALS`.
`oracle` keys: `selectOne` (1), `readOnlySqlstate` (`"25006"`), `bookingCountBefore`,
`bookingCountAfter`. `verdict: "pass"` only if every trial has 20 × 200 with spread below the limit
and no invariant violation.

## 9. Oracle design

```sql
SELECT 1 AS ok;
SELECT COUNT(*)::int AS n FROM "Booking";
-- must fail with SQLSTATE 25006 on the read-only pool (never succeeds):
INSERT INTO "Booking" (uid, title, "startTime", "endTime") VALUES ('p6-ro-probe', 'x', now(), now());
```

`"Booking"` must be double-quoted (Prisma model name). Status values in the DB are lowercase
(`accepted`), while the HTTP body says `"ACCEPTED"`; Task 4 must use the lowercase value in SQL.

## 10. Test data, isolation, cleanup and leak check

- The self-test writes nothing. `GET /pro/30min` does not create bookings.
- Leak check: `COUNT(*) FROM "Booking"` before the first trial equals the count after the last. A
  change pushes `TEST BUG: Booking count <before> -> <after>` into `invariantViolations`, sets
  `verdict: "fail"`, then `expect` fails.
- Locally the DB volume persists across `down:cal` (H4); the leak check compares counts within one
  run, so earlier probe or Task 4 rows do not matter.

## 11. Known-bug handling

None expected. `test.fail()` is not used in Task 3. Labels:

- `GET /pro/30min` not 200 while `up:cal` reported ready → **PRODUCT BUG** (paste status and the
  first 200 chars of the body).
- Spread ≥ `RACE_MAX_SPREAD_MS` with 200s → **TEST BUG** (barrier).
- INSERT not `25006` → **TEST BUG** (read-only GUC missing).
- `up:cal` exits 1, OOM, a blocked host, Docker or disk errors → **ENV** (paste the last 40 lines of
  `results/harness/cal-up.log`).

## 12. CI (new job `cal-smoke`)

File `.github/workflows/perf.yml`. Add a top-level env `CAL_REF: c2b7ac44c66f24ffef1662b276f0653988a609a3`
next to `MEDUSA_REF`. New job `cal-smoke` (`runs-on: ubuntu-24.04`, `timeout-minutes: 60`). Do not
touch `medusa-smoke`. Steps are listed in Step 6 below.

Expected CI time (estimate from this VM, to be replaced by the first real run): cold ≈ 4 min
install + ≈ 6–7 min `up:cal`; warm (caches hit) ≈ 1–2 min `up:cal`.

## 13. Risks and unknowns

- **R1 Cold build on Actions.** Probe peak 6.9 GB of 16 GB. If the runner OOMs (exit 137 or
  "JavaScript heap out of memory" in `cal-up.log`): ENV; add a swap step (D7), rerun once.
- **R2 Build time vs job timeout.** Harness build limit is 45 min (`DEFAULT_NEXT_BUILD_TIMEOUT_MS`);
  job timeout 60 min. If a cold run exceeds it, ENV; report the phase times from the log.
- **R3 Yarn host.** Corepack downloads Yarn 4.12.0 from `repo.yarnpkg.com`. It was blocked in the
  Claude cloud environment during the probe (P9); answer 1 adds it to the allowed domains (Claude
  environment, and Cursor if its cloud environment restricts network access). If `yarn install`
  fails with `ENOTFOUND repo.yarnpkg.com` or a proxy 403, that is **ENV**: stop and report; do not
  switch to the npm-registry workaround.
- **R4 Turbo strips env.** `turbo run post-install` runs `yarn` in child processes without most
  env vars (probe), so any corepack env setting does not reach them. With the host allowed this
  needs no workaround.
- **R5 Process-group stop.** Only `results/harness/cal.pgid` is used to stop. Never `pkill -f`.
- **R6 Stale `.next` restore.** The harness compares `.next/harness-build.json` `gitSha` with HEAD;
  a restored cache for another SHA rebuilds (correct, slower).
- **R7 Seeded slot drift.** Seed bookings are relative to the seed date and DST changes the UTC
  hours; Task 4 must always ask `getSchedule` for free slots, never hard-code times.
- **R8 Seed log prints demo credentials** into CI logs. They are the fork's public fixtures; P6 never
  copies them. If the maintainer wants them out of logs, that is a harness change (section 19).

## 14. Build steps (repo root; PATH export first; on any differing output: stop and report, paste it)

Do not start until the maintainer approves this plan. Never `git add -A`. Never print secrets. Always finish
a session with `npm run down:cal`, even after a failure.

### Step 0. Branch and prerequisites

```bash
export PATH="/usr/local/bin:$PATH"
git fetch origin main
git switch -c feat/2026-10-xx-p6-cal-stack origin/main
node -v          # v22.23.x
docker info --format '{{.ServerVersion}}'
```

### Step 1 (a). `scripts/bootstrap.sh`: pin and prepare Cal

1. Change `CAL_REF="main"` to `CAL_REF="c2b7ac44c66f24ffef1662b276f0653988a609a3"` and its comment
   to say P1 pins `main`, P6 pins this SHA (probe 2026-10-20).
2. Add after `install_medusa_deps`:

```bash
install_cal_deps() {
  local dest="$1"
  if [ "${BOOTSTRAP_SKIP_INSTALL:-0}" = "1" ]; then
    log "BOOTSTRAP_SKIP_INSTALL=1; skipping Cal yarn install."
    return
  fi
  # Corepack fetches the fork's packageManager Yarn (4.12.0) from repo.yarnpkg.com.
  log "yarn install --immutable in $dest"
  (cd "$dest" && TURBO_TELEMETRY_DISABLED=1 COREPACK_ENABLE_STRICT=0 corepack yarn install --immutable)
}

# Same steps as P1 CI "Prepare Cal product .env". Never prints the generated values.
prepare_cal_env() {
  local dest="$1"
  if [ -f "$dest/.env" ]; then
    log "$dest/.env exists. Left as is."
    return
  fi
  cp "$dest/.env.example" "$dest/.env"
  sed -i 's|http://localhost:3000|http://127.0.0.1:3000|g' "$dest/.env"
  grep -v '^NEXTAUTH_SECRET=' "$dest/.env" | grep -v '^CALENDSO_ENCRYPTION_KEY=' > "$dest/.env.tmp"
  mv "$dest/.env.tmp" "$dest/.env"
  printf 'NEXTAUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> "$dest/.env"
  printf 'CALENDSO_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 24)" >> "$dest/.env"
  chmod 600 "$dest/.env"
  grep -qE '^NEXTAUTH_SECRET=.+' "$dest/.env" || { log "ERROR NEXTAUTH_SECRET empty"; exit 1; }
  grep -qE '^CALENDSO_ENCRYPTION_KEY=.+' "$dest/.env" || { log "ERROR CALENDSO_ENCRYPTION_KEY empty"; exit 1; }
  log "wrote $dest/.env (generated secrets, not printed)"
}
```

3. In `main()`, replace the `if [ "$p" = "medusa" ] … else … fi` block with:

```bash
    case "$p" in
      medusa) install_medusa_deps "$dest" ;;
      cal)
        install_cal_deps "$dest"
        prepare_cal_env "$dest"
        ;;
      *) log "$p: dependency install is not automated yet; see the product README." ;;
    esac
```

Note: `prepare_cal_env` runs even with `BOOTSTRAP_SKIP_INSTALL=1` (CI relies on that).

Run (Cal checkout already present from the probe is fine; it is left as is):

```bash
bash -n scripts/bootstrap.sh && echo syntax-ok
bash scripts/bootstrap.sh cal
```

Expected: `syntax-ok`; `[bootstrap] … already cloned (c2b7ac44c66f24ffef1662b276f0653988a609a3)`
(or `cloned c2b7ac4…` on a fresh machine); `yarn install` ends `Done` (warnings allowed; the
first run may print `Corepack is about to download …yarn.js`); then either
`.env exists. Left as is.` or `wrote …/.env (generated secrets, not printed)`; `[bootstrap] done`.

### Step 2 (b). Env getters + unit tests (no product)

Add to `src/races/env.ts` (below the Medusa getters; do not change them):

```ts
export function calBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CAL_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : "http://127.0.0.1:3000").replace(/\/$/, "");
}

export function calDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const p6 = env.P6_CAL_DATABASE_URL?.trim();
  if (p6) return p6;
  const harness = env.CAL_DB_URL?.trim();
  if (harness) return harness;
  return "postgresql://postgres@127.0.0.1:5450/calendso";
}
```

Add to `tests/unit/env.test.ts` (import the two functions; inside the existing `describe("env")`):

```ts
it("cal base URL fallback strips trailing slash", () => {
  assert.equal(calBaseUrlFromEnv({}), "http://127.0.0.1:3000");
  assert.equal(
    calBaseUrlFromEnv({ CAL_BASE_URL: "http://127.0.0.1:3000/" }),
    "http://127.0.0.1:3000",
  );
  assert.equal(calBaseUrlFromEnv({ CAL_BASE_URL: "   " }), "http://127.0.0.1:3000");
});

it("cal database URL fallback order", () => {
  assert.equal(calDatabaseUrlFromEnv({ P6_CAL_DATABASE_URL: "postgres://p6" }), "postgres://p6");
  assert.equal(calDatabaseUrlFromEnv({ CAL_DB_URL: "postgres://harness" }), "postgres://harness");
  assert.equal(calDatabaseUrlFromEnv({}), "postgresql://postgres@127.0.0.1:5450/calendso");
  assert.equal(
    calDatabaseUrlFromEnv({
      P6_CAL_DATABASE_URL: "postgres://p6",
      CAL_DB_URL: "postgres://harness",
    }),
    "postgres://p6",
  );
});
```

Run `npm run test:unit`. Expected: `# tests 67`, `# pass 67`, `# fail 0` (65 before + 2). The
existing Medusa tests must still pass unchanged.

### Step 3 (c). `scripts/harness.mjs` + `package.json`

Edit `scripts/harness.mjs` (keep the current Medusa behaviour exactly):

```js
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
// … existing setup unchanged up to `const script = …` and its existence check …

// Products whose harness up() keeps a server in the foreground (probe 2026-10-20: Cal's up.mjs
// never returns and its down() leaves next start on :3000). P6 runs them in their own process
// group, waits for the ready line, and stops the group on down.
const LONG_RUNNING = {
  // "already healthy/listening" is printed when Cal was already up; up.mjs then exits 0.
  cal: { ready: /Cal web is up at |Cal already (healthy|listening) at /, port: 3000 },
};
const stateDir = path.join(repoRoot, "results", "harness");
const pgidFile = path.join(stateDir, `${product}.pgid`);
const logFile = path.join(stateDir, `${product}-up.log`);

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function upLongRunning(spec) {
  mkdirSync(stateDir, { recursive: true });
  // A second up must not replace the pgid of the group that is still serving.
  if (existsSync(pgidFile) && (await portOpen(spec.port))) {
    console.log(`${product} already running (pgid ${readFileSync(pgidFile, "utf8").trim()})`);
    return 0;
  }
  const out = openSync(logFile, "w");
  const child = spawn(process.execPath, [script, product], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", out, out],
  });
  writeFileSync(pgidFile, `${child.pid}\n`);
  let exited = null;
  child.on("exit", (code) => (exited = code ?? 1));
  child.unref();
  const timeoutMs = Number(process.env.HARNESS_UP_TIMEOUT_MS || 3_600_000);
  const deadline = Date.now() + timeoutMs;
  let printed = 0;
  for (;;) {
    const text = readFileSync(logFile, "utf8");
    process.stdout.write(text.slice(printed));
    printed = text.length;
    if (spec.ready.test(text)) return 0;
    if (exited !== null) {
      console.error(`ENV: harness up ${product} exited ${exited} before ready (log ${logFile})`);
      return 1;
    }
    if (Date.now() > deadline) {
      console.error(`ENV: harness up ${product} not ready after ${timeoutMs} ms; stopping it`);
      await stopGroup(spec);
      return 1;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function stopGroup(spec) {
  if (!existsSync(pgidFile)) return;
  const pgid = Number(readFileSync(pgidFile, "utf8").trim());
  const signal = (sig) => {
    try {
      process.kill(-pgid, sig);
    } catch (err) {
      if (err.code !== "ESRCH") throw err;
    }
  };
  signal("SIGTERM");
  for (let i = 0; i < 30 && (await portOpen(spec.port)); i++) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (await portOpen(spec.port)) signal("SIGKILL");
  rmSync(pgidFile, { force: true });
}

console.log(`harness ${action} ${product} (PRODUCTS_ROOT=${process.env.PRODUCTS_ROOT})`);
const spec = LONG_RUNNING[product];
if (spec && action === "up") {
  process.exit(await upLongRunning(spec));
}
const result = spawnSync(process.execPath, [script, product], { cwd: repoRoot, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
}
if (spec && action === "down") {
  await stopGroup(spec);
}
process.exit(result.status ?? 1);
```

Add to `package.json` `scripts` (keep the Medusa ones):

```json
"up:cal": "node scripts/harness.mjs up cal",
"down:cal": "node scripts/harness.mjs down cal",
"smoke:cal": "k6 run --summary-export results/cal-health-summary.json k6/smoke/cal-health.js",
"race:cal": "playwright test --project=cal-race",
```

Live check:

```bash
SECONDS=0; npm run up:cal; echo "exit=$? wall=${SECONDS}s"
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/pro/30min
npm run up:cal | tail -3                     # already healthy path
npm run down:cal; echo "exit=$?"
lsof -iTCP:3000 -sTCP:LISTEN -nP | wc -l     # 0
ls results/harness/                          # cal-up.log only (no cal.pgid)
SECONDS=0; npm run up:cal; echo "exit=$? wall=${SECONDS}s"
grep -c 'skipping next build' results/harness/cal-up.log   # 1
npm run down:cal
```

Expected: first `exit=0` (cold about 6 min on a 4 vCPU / 16 GB VM; warm about 1 min); `200`;
second call prints `cal already running (pgid N)` and exits 0 without spawning; `down` exit 0;
`0` listeners; `skipping next build` count 1. Then the failure path (risky check 4):
`CAL_SKIP_WEB_START=1 npm run up:cal; echo "exit=$?"` → `ENV: harness up cal exited 1 before
ready …` and `exit=1`; finish with `npm run down:cal`.

### Step 4 (d). `k6/smoke/cal-health.js`

```js
// Phase 1 Task 3 smoke: proves k6 can reach a harness-started Cal booker. Not a performance number.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.CAL_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/pro/30min`, { tags: { name: "GET /pro/30min" } });
  check(res, { "GET /pro/30min is 200": (r) => r.status === 200 });
}
```

Run `npm run k6:inspect` → `k6 inspect ok: k6/smoke/cal-health.js` and `3 script(s) ok.` With Cal up:
`npm run smoke:cal` → `checks … 100.00%`, `http_req_failed … 0.00%`, exit 0.

### Step 5 (e). Playwright project and self-test

`playwright.config.ts`: import `calBaseUrlFromEnv` and add after `medusa-race`:

```ts
    {
      name: "cal-race",
      testDir: "tests/cal/races",
      retries: 0,
      use: { baseURL: calBaseUrlFromEnv() },
    },
```

`tests/cal/races/cal-self-test.spec.ts` (copy the structure of
`tests/medusa/races/framework-self-test.spec.ts`; differences only):

```ts
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { runTrials } from "../../../src/races/run-trials.ts";
import {
  aggregateDispatchSpread,
  createHistogram,
  mergeStatusCounts,
  writeHistogram,
} from "../../../src/races/histogram.ts";
import { recordTrial } from "../../../src/races/trial-record.ts";
import {
  calBaseUrlFromEnv,
  calDatabaseUrlFromEnv,
  raceMaxSpreadMsFromEnv,
  raceTrialsFromEnv,
} from "../../../src/races/env.ts";
import { closePool, createReadOnlyPool, selectRows } from "../../../src/oracles/pg.ts";
import type { RaceTrialResult } from "../../../src/races/types.ts";

const CONCURRENCY = 20;
// D3: the booker page for the host and event type the Cal races use.
const HEALTH_PATH = "/pro/30min";

async function bookingCount(pool: ReturnType<typeof createReadOnlyPool>): Promise<number> {
  const rows = await selectRows<{ n: number | string }>(
    pool,
    'SELECT COUNT(*)::int AS n FROM "Booking"',
  );
  return Number(rows[0]?.n);
}

test.describe.configure({ timeout: 120_000 });

test("cal self-test (unmapped): 20 concurrent GET /pro/30min plus oracle", async () => {
  const trials = raceTrialsFromEnv();
  const spreadLimit = raceMaxSpreadMsFromEnv();
  const base = calBaseUrlFromEnv();
  const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
  const histogram = createHistogram({
    caseId: "cal-self-test",
    title: "cal self-test (unmapped)",
    product: "cal",
    concurrency: CONCURRENCY,
    trials,
  });

  try {
    const one = await selectRows<{ ok: number }>(pool, "SELECT 1 AS ok");
    histogram.oracle.selectOne = Number(one[0]?.ok);
    const before = await bookingCount(pool);
    histogram.oracle.bookingCountBefore = before;
    const spreads: number[] = [];
    const perTrial: RaceTrialResult[] = [];

    const trialResults = await runTrials(trials, async (trial) => {
      const fired = await fireTogether(
        CONCURRENCY,
        async () => {
          const res = await fetch(`${base}${HEALTH_PATH}`);
          return { status: res.status, body: await res.text() };
        },
        { warm: async () => (await fetch(`${base}${HEALTH_PATH}`)).text() },
      );
      const record = recordTrial(trial, fired, () => {
        for (const req of fired.requests) {
          if (req.status !== 200) {
            throw new Error(
              `PRODUCT BUG: GET ${HEALTH_PATH} HTTP ${req.status} ${req.bodySummary}`,
            );
          }
        }
        if (fired.dispatchSpreadMs >= spreadLimit) {
          throw new Error(
            `TEST BUG: dispatch spread ${fired.dispatchSpreadMs} ms >= ${spreadLimit}`,
          );
        }
      });
      perTrial.push(record);
      spreads.push(fired.dispatchSpreadMs);
      if (!record.ok) throw new Error(record.error);
    });

    histogram.perTrial = perTrial;
    histogram.statusCounts = mergeStatusCounts(perTrial.map((t) => t.statusCounts));
    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);

    // Read-only proof: the same INSERT pattern as the Medusa self-test, on "Booking".
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO "Booking" (uid, title, "startTime", "endTime") VALUES ('p6-ro-probe', 'x', now(), now())`,
      );
      throw new Error("TEST BUG: read-only pool accepted INSERT");
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      histogram.oracle.readOnlySqlstate = code;
      if (code !== "25006")
        throw new Error(`TEST BUG: expected SQLSTATE 25006, got ${code || "no code"}`);
    } finally {
      client.release();
    }

    const after = await bookingCount(pool);
    histogram.oracle.bookingCountAfter = after;
    if (after !== before) {
      histogram.invariantViolations.push(`TEST BUG: Booking count ${before} -> ${after}`);
    }
    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(trialsOk).toBe(true);
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
    await closePool(pool);
  }

  const raw = JSON.parse(await readFile("results/races/cal-self-test.json", "utf8"));
  expect(raw.caseId).toBe("cal-self-test");
  expect(raw.product).toBe("cal");
  expect(raw.verdict).toBe("pass");
  expect(raw.trials).toBe(trials);
  expect(raw.oracle.readOnlySqlstate).toBe("25006");
});
```

Check the exact signatures of `mergeStatusCounts` and `aggregateDispatchSpread` in
`src/races/histogram.ts` and the trial loop in `framework-self-test.spec.ts`, and match them; if they
differ from the skeleton, follow the existing file, not this skeleton. Then:

```bash
npx playwright test --list --project=cal-race   # 1 test in 1 file
npm run typecheck                               # exit 0
npm run up:cal
RACE_TRIALS=3 npm run race:cal                  # 1 passed
node -e 'const h=require("./results/races/cal-self-test.json");console.log(h.verdict,h.statusCounts,h.oracle)'
npm run down:cal
```

Expected: `pass { '200': 60 } { selectOne: 1, bookingCountBefore: N, readOnlySqlstate: '25006', bookingCountAfter: N }`.

### Step 6 (f). `.github/workflows/perf.yml`: job `cal-smoke`

Add `CAL_REF: c2b7ac44c66f24ffef1662b276f0653988a609a3` to the top-level `env` (comment: "P1 pins
main; P6 pins this SHA, same as scripts/bootstrap.sh"). Add the job after `medusa-smoke`. Reuse the
exact action SHAs already in the file (`actions/checkout@3d3c42e…`, `setup-node@949feb2…`,
`setup-k6-action@43b9fc2…`, `cache/restore@55cc834…`, `cache/save@55cc834…`,
`upload-artifact@cf430e0…`).

Job env:

```yaml
env:
  P6_WORKING_DIRECTORY: p6
  PRODUCTS_ROOT: ${{ github.workspace }}/products
  CAL_CHECKOUT_PATH: products/cal
  CAL_BASE_URL: http://127.0.0.1:3000
  # Fork trust-auth local DB (no password). Not a secret.
  CAL_DB_URL: postgresql://postgres@127.0.0.1:5450/calendso
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  COREPACK_ENABLE_STRICT: "0"
  TURBO_TELEMETRY_DISABLED: "1"
  NEXT_TELEMETRY_DISABLED: "1"
```

Steps, in order (names exactly):

1. `actions/checkout` P6 into `p6` (`persist-credentials: false`).
2. `Checkout Cal fork`: `repository: Jayami123/cal`, `ref: ${{ env.CAL_REF }}`,
   `path: ${{ env.CAL_CHECKOUT_PATH }}`, `persist-credentials: false`.
3. `Verify Cal fork HEAD`: same shell as `Verify Medusa fork HEAD`, with `CAL_*` names.
4. `Verify CAL_REF matches bootstrap.sh`:
   `grep -q "^CAL_REF=\"${CAL_REF}\"$" "${P6_WORKING_DIRECTORY}/scripts/bootstrap.sh"` or
   `::error::` and exit 1.
5. `actions/setup-node` with `node-version-file: p6/.nvmrc`, npm cache on `p6/package-lock.json`.
6. `Install P6 dependencies`: `npm ci` in `p6`.
7. `grafana/setup-k6-action` with `K6_VERSION`.
8. `Enable corepack`: `corepack enable`, then in the Cal checkout assert `yarn --version` is
   `4.12.0` (corepack downloads it from `repo.yarnpkg.com`).
9. `Restore Cal Yarn cache` (`products/cal/.yarn/cache`, key `cal-yarn-${{ hashFiles('products/cal/yarn.lock') }}`).
10. `Restore Cal node_modules cache` (`products/cal/node_modules`, key
    `${{ runner.os }}-cal-nm-${{ env.CAL_REF }}-${{ hashFiles('products/cal/yarn.lock') }}`), id `cal_nm`.
11. `Install Cal dependencies` (if `cal_nm` miss): `yarn install --immutable` in the Cal checkout.
12. `Generate Cal Prisma client`: `yarn workspace @calcom/prisma prisma generate` (P1 does this after
    a cache restore).
13. `Prepare Cal product .env and harness roots`: in `p6`,
    `BOOTSTRAP_SKIP_INSTALL=1 bash scripts/bootstrap.sh cal` (writes `.env`, creates the other
    product folders; nothing printed).
14. `Restore Cal build cache` (`products/cal/apps/web/.next`, key
    `${{ runner.os }}-cal-next-${{ env.CAL_REF }}-h0.2.11`), id `cal_build`.
15. `Start Cal (harness up)`, id `cal_up`, in `p6`: `SECONDS=0; npm run up:cal; echo "### Cal harness up: ${SECONDS} s" >> "$GITHUB_STEP_SUMMARY"`.
16. `k6 smoke (GET /pro/30min)` if `cal_up` success: `npm run smoke:cal`.
17. Upload `results/cal-health-summary.json` as `k6-summary-cal-health` (`!cancelled() && cal_up success`).
18. `Race self-test (cal-race, 3 trials)` if `cal_up` success, env `RACE_TRIALS: "3"`: `npm run race:cal`.
19. Upload `p6/results/races/` as `race-histograms-cal` (`!cancelled() && cal_up success`).
20. Upload `p6/results/harness/cal-up.log` as `cal-harness-log` if `failure()`.
21. `Stop Cal (harness down)` with `if: ${{ always() }}`: `npm run down:cal || true`.
22. `Save Cal Yarn cache`, `Save Cal node_modules cache`: only
    `github.event_name == 'push' && github.ref == 'refs/heads/main'` and cache miss.
23. `Save Cal build cache`: same condition, plus
    `hashFiles('products/cal/apps/web/.next/harness-build.json') != ''`, `continue-on-error: true`.

No swap step (D7). `npm run check` is not repeated (it runs in `medusa-smoke`).

Validate locally: `npx --yes prettier --check .github/workflows/perf.yml` and
`git diff origin/main -- .github/workflows/perf.yml` must show **no** removed lines inside
`medusa-smoke`.

### Step 7 (g). README and `.env.example`

README: add "## Run Cal" after the Medusa race section:

- Needs Docker, Node 22.23+ (PATH export), corepack. `bash scripts/bootstrap.sh cal` clones the
  pinned fork, installs Yarn deps and writes the Cal product `.env` (generated secrets).
- `npm run up:cal` → returns when Cal answers (the first run builds Next.js and is slow; later runs
  reuse the build). `npm run smoke:cal`, `RACE_TRIALS=3 npm run race:cal`, `npm run down:cal`
  (always; it also stops the Cal web process).
- `results/races/cal-self-test.json`; `GET /pro/30min` not 200 → PRODUCT BUG; spread → TEST BUG.
- The Cal DB keeps its data between local runs (harness keeps the Docker volume).
- **No timings** in README.

`.env.example`, names only with one comment each:

```
# Cal web URL. 127.0.0.1 only. Default when unset: http://127.0.0.1:3000
CAL_BASE_URL=
# Harness Cal DB URL (also read by P6). P6 default when unset: the fork's local trust-auth DB on 127.0.0.1:5450
CAL_DB_URL=
# Override CAL_DB_URL for the P6 oracle only.
P6_CAL_DATABASE_URL=
# Max wait for a long-running harness up (Cal), in ms. Default 3600000.
HARNESS_UP_TIMEOUT_MS=
```

## 15. Verification gate (hard gate before any implementation push; paste real output)

| Check                                                  | Must show                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                        | Prettier "All matched files use Prettier code style!", typecheck exit 0, `3 script(s) ok.`, `# tests 67`, `# fail 0` |
| `bash scripts/bootstrap.sh cal`                        | pinned SHA, `.env` line, `[bootstrap] done`                                                                          |
| `npm run up:cal` (cloud VM)                            | exit 0, `Cal web is up at http://127.0.0.1:3000/`                                                                    |
| `npm run smoke:cal`                                    | checks 100 %, exit 0                                                                                                 |
| `RACE_TRIALS=3 npm run race:cal`                       | `1 passed`; histogram `verdict: "pass"`, `readOnlySqlstate: "25006"`                                                 |
| `npm run down:cal` then `lsof -iTCP:3000 -sTCP:LISTEN` | exit 0; no listener; `results/harness/cal.pgid` absent                                                               |
| second `npm run up:cal`                                | `skipping next build` in `results/harness/cal-up.log`                                                                |
| CI on the PR                                           | `cal-smoke` green, artefacts `race-histograms-cal`, `k6-summary-cal-health`; `medusa-smoke` still green              |
| CI on `main` after merge                               | `cal-smoke` green once; build cache saved                                                                            |

## 16. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

1. `build(cal): pin cal ref and prepare cal in bootstrap` — `scripts/bootstrap.sh`
2. `feat(races): add cal env getters` — `src/races/env.ts`, `tests/unit/env.test.ts`
3. `feat(harness): run cal in its own process group` — `scripts/harness.mjs`, `package.json`
4. `test(cal): add k6 smoke and cal self-test` — `k6/smoke/cal-health.js`,
   `playwright.config.ts`, `tests/cal/races/cal-self-test.spec.ts`
5. `ci(cal): add cal-smoke job` — `.github/workflows/perf.yml`
6. `docs(cal): document running cal` — `README.md`, `.env.example`

No Co-Authored-By, no "Generated with", no attribution lines. Push the branch; the maintainer opens the PR.

## 17. Docs

This plan; README "Run Cal"; `.env.example` names. No master-plan edits.

## 18. Will NOT do

- No booking, cancel or slots calls; no mapped case IDs (Task 4/5)
- No API v2, no API key use
- No harness or fork edits; no `next start` by hand; no `pkill -f`
- No swap step, no larger runner, no `CAL_WEB_MODE=dev` (D7)
- No nightly schedule or concurrency-group change (Task 4)
- No edits to `medusa-smoke`
- No committed `.env`, secrets, demo passwords or API keys; no printing of generated secrets
- No published timings; README cites none
- No `test.fail()`, retries, `workers` > 1, browsers or page objects

## 19. Answers from the maintainer (2026-10-20)

1. **Yarn host: allowed.** `repo.yarnpkg.com` is added to the allowed domains of the
   k6-load-concurrency-suite environment in Claude, and in Cursor if its cloud environment
   restricts network access. Nothing in the repo changes for that. D5 uses the normal corepack path.
2. **Harness bugs: fixed in the harness; P6's process-group stop is a temporary bridge.** Task 3
   ships with the bridge (D4). A separate small `qa-portfolio-harness` release makes `up` return
   once Cal is healthy, makes `down` stop the web server, fixes the seed presence check to use the
   `users` table, and stops printing seed credentials. Then P6 bumps the harness and deletes the
   bridge. The maintainer tracks this in the backlog (P1 likely has the same problems).
3. **`cal-smoke` becomes a required check after two green runs on `main`**, the same rule as
   `medusa-smoke`.

Probe is done. Building waits on approval of this plan.
