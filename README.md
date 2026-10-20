# k6-load-concurrency-suite

P6 of the QA portfolio: load, concurrency and performance tests with [k6](https://grafana.com/docs/k6/)
against self-hosted products started by
[qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `v0.2.11`.

Phase 0 proves the harness and k6 smoke. Phase 1 Task 1 adds the Playwright race framework
(API-only, no browser) and an unmapped Medusa self-test against `GET /health` plus a read-only
Postgres oracle.

## Run the smoke check locally

Needs Node 22.22+, Docker, pnpm 10.11.1 and k6.

```bash
npm ci
bash scripts/bootstrap.sh medusa   # clones the Medusa fork into ../products if it is missing
npm run up:medusa
npm run smoke:medusa
npm run down:medusa
```

`npm run check` runs Prettier, the TypeScript check, `k6 inspect` (skipped when k6 is missing),
and unit tests (`npm run test:unit`).

## Run a race locally

Needs Medusa up (same as the smoke check). Use Node 22.23+ on PATH (see AGENTS.md).

```bash
export PATH="/usr/local/bin:$PATH"
npm run test:unit
npm run up:medusa
RACE_TRIALS=3 npm run race:medusa
npm run down:medusa
```

The self-test writes `results/races/framework-self-test.json` (gitignored). Playwright race
projects use `retries: 0` and `workers: 1`; concurrency is inside the test via `fireTogether`.

CI runs this self-test (`RACE_TRIALS=3`) in the `medusa-smoke` job on every PR once Medusa starts, and uploads
`results/races/` as the `race-histograms-medusa` artifact.

`dispatchSpreadMs` is how far apart Node started the requests (max start minus min start, in ms).
It is not the time at which the server received them. A small spread means the client released
the burst together.

- `/health` not HTTP 200 with body `OK` → **PRODUCT BUG** (paste status and body).
- Spread ≥ `RACE_MAX_SPREAD_MS` (default 5) with successful responses → **TEST BUG** (barrier
  ran sequentially or was not a gate). Raise the env var on noisy CI runners; do not change the
  helper.
- Mapped oversell race `P6-MED-RACE-001` writes `results/races/P6-MED-RACE-001.json` when Medusa is
  up with admin credentials set (see below).

### Medusa oversell histogram (`P6-MED-RACE-001`)

Needs `MEDUSA_ADMIN_EMAIL` and `MEDUSA_ADMIN_PASSWORD` in the environment (CI generates the
password; locally copy names from `.env.example`). The oversell spec calls harness `seed()` in
`beforeAll` to create the admin user, then logs in with `POST /auth/user/emailpass`.

- `statusCounts["200"]` are cart completions that returned `{ type: "order" }`. On the mapped
  case, unique HTTP order ids must equal stock `S`. The same-cart extra may show many `200` rows
  that share one order id (idempotent complete).
- `statusCounts["400"]` with per-trial oracle `loserType=not_allowed` is a **clean refusal** (out of
  stock). That is an expected loser, not a failure.
- Any `"500"` or `"error"` count is a **PRODUCT BUG** (report status and body summary). Do not treat
  it as a stock loser.
- `dispatchSpreadMs` is still the Node start spread for the burst (see above).

## Run Cal

Needs Docker, Node 22.23+ on PATH (see AGENTS.md) and corepack. Corepack downloads the Yarn the Cal
fork pins from `repo.yarnpkg.com`, so that host must be reachable.

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/bootstrap.sh cal   # clones the pinned fork, yarn install, writes the Cal product .env
npm run up:cal                  # returns once Cal answers; the first run builds Next.js and is slow
npm run smoke:cal
RACE_TRIALS=3 npm run race:cal
npm run down:cal                # always; it also stops the Cal web process
```

`bootstrap.sh` generates the secrets in the Cal product `.env` (never printed or committed).
Later `up:cal` runs reuse the Next.js build. The self-test writes `results/races/cal-self-test.json`
(gitignored); the harness log is `results/harness/cal-up.log`.

- `GET /pro/30min` not HTTP 200 → **PRODUCT BUG** (paste status and body start).
- Spread ≥ `RACE_MAX_SPREAD_MS` with successful responses → **TEST BUG** (barrier).
- `up:cal` exits 1, out of memory, a blocked host, Docker or disk errors → **ENV** (paste the last
  40 lines of `cal-up.log`).
- The Cal database keeps its data between local runs (the harness keeps its Docker volume).

CI runs the same self-test (`RACE_TRIALS=3`) in the `cal-smoke` job and uploads
`race-histograms-cal`. `scripts/harness.mjs` starts Cal in its own process group and stops that
group on `down` (a temporary bridge until the harness does this itself).

### Cal identical-slot histogram (`P6-CAL-RACE-001`)

Each trial takes one free 30-minute slot of the seeded host `pro` and sends 20 identical
`POST /api/book/event` requests behind one start barrier. The database must then hold exactly one
`accepted` booking for that slot, and the single 2xx response's `uid` must be that booking.
`results/races/P6-CAL-RACE-001.json` (artefact `race-histograms-cal`) counts every HTTP status
across all trials (`P6-CAL-RACE-002`).

- **409** `no_available_users_found_error`: the loser's availability check already saw the winner.
- **400** `An error occurred while querying the database.`: the loser passed the availability check
  and its insert hit the unique `idempotencyKey` (Postgres 23505, Prisma P2002). Cal means to
  answer 409 `booking_conflict_error` here, but in production it redacts the Prisma error first, so
  the conflict comes back as a generic 400. This is a product bug in the error contract; it does
  not double-book. Finding **`P6-OBS-CAL-001`**: same code on upstream `calcom/cal.com` `main`
  (checked 2026-10-20 at `0f19cc4`). The `extra (unmapped): concurrent losers get 409` test records
  it with `test.fail()`.
- **5xx** or a second accepted booking: **PRODUCT BUG**, never an allowed loser.
- Any other 4xx: **TEST BUG** until a probe shows otherwise.

Pull requests run 5 trials; `main`, the nightly schedule and manual runs run 50.

| Run (GitHub Actions)                                                           | Trials | 200 | 400 | 409 | 5xx | Accepted per slot |
| ------------------------------------------------------------------------------ | ------ | --- | --- | --- | --- | ----------------- |
| _filled from the first `main` and nightly runs; links to the run and artefact_ |

## Rule for numbers

Published performance numbers come only from CI runs (GitHub Actions or a dedicated machine),
reported as the median of at least 3 runs. Local and cloud-agent runs only prove a test works.

The master plan is in [docs/master-plan.html](docs/master-plan.html).
