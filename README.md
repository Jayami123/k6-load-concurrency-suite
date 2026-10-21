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

### Cal overlap histogram (`P6-CAL-RACE-003`)

Each trial takes one free 60-minute window of the seeded host `pro` and books the 60-minute event
and an overlapping 30-minute event (same start on odd trials, second half on even trials) behind
one start barrier. The oracle looks for two ACCEPTED bookings of the trial that overlap
(`a.startTime < b.endTime AND b.startTime < a.endTime`); there must be none.
`results/races/P6-CAL-RACE-003.json` (artefact `race-histograms-cal`) has the status counts and the
overlapping pairs.

- Booked one after the other, Cal refuses the second booking with **409**
  `no_available_users_found_error` (the `extra (unmapped): sequential overlapping booking is
refused` test checks this on every run).
- Booked at the same moment, both are **ACCEPTED**: the host is double-booked. Cal checks
  availability before it inserts, without a lock, and the database only rejects identical windows
  (the unique `idempotencyKey`). Finding **`P6-OBS-CAL-002`**, severity **high** (a real double
  booking; same code on upstream `calcom/cal.com` `main`, checked 2026-10-20 at `0f19cc4`). The
  mapped test records it with `test.fail()`.
- How often it reproduces is in the histogram's `oracle`: `trialsDoubleBooked`, `trialsClean` and
  `doubleBookedByTrial` (pairs per trial). The CI step summary prints the same line, so a run where
  some trials came out clean is visible even though the step is green.
- A **400** `An error occurred while querying the database.` here would mean two identical windows
  were sent (test bug; see `P6-OBS-CAL-001` for that shape in `P6-CAL-RACE-001`).
- **5xx**: product bug. Any other 4xx: test bug until a probe shows otherwise.

Pull requests run 5 trials; `main`, the nightly schedule and manual runs run 30.

| Run (GitHub Actions)                                                           | Trials | Trials double-booked | Trials clean | 409 loser | 5xx | Overlapping pairs |
| ------------------------------------------------------------------------------ | ------ | -------------------- | ------------ | --------- | --- | ----------------- |
| _filled from the first `main` and nightly runs; links to the run and artefact_ |

## Run Documenso

Needs Docker, Node 24 at `/opt/node24` (the commands find it by themselves; `/usr/local/bin` stays
first, so Medusa and Cal keep Node 22.23) and the hosts entry `127.0.0.1 p6-webhook.test`.

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/bootstrap.sh documenso    # clones the pinned fork and runs npm ci under Node 24 (once)
npm run up:documenso                   # the first run builds the web app; later runs reuse the build
npm run smoke:documenso
RACE_TRIALS=3 npm run race:documenso
npm run down:documenso                 # always; it also stops the Documenso web process
```

The self-test signs up a throwaway user per run (the password is generated in memory), mints an API
token through Documenso's own API, reads the confirmation email from Inbucket and receives one
webhook. Everything it created is deleted at the end, and a leak check counts what is left.
`results/races/documenso-self-test.json` (gitignored) holds the histogram; the web log is
`node_modules/qa-portfolio-harness/.harness/documenso-web.log`.

Test environment: `scripts/harness.mjs` sets `DANGEROUS_BYPASS_RATE_LIMITS=true` (so the parallel
burst is not limited to 429) and `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p6-webhook.test` (the one
host the webhook receiver is allowed on). SSRF protection stays on for every other host.

| Label       | When                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PRODUCT** | Health burst not 200; signup not 201; verify not `VERIFIED`; token or API v1 not 200; no confirmation email; webhook delivered not once, secret differs, `WebhookCall` not one `SUCCESS` 200, or body differs |
| **TEST**    | Spread at or over `RACE_MAX_SPREAD_MS`; SQLSTATE not 25006; leak or cleanup failure                                                                                                                           |
| **ENV**     | `up` exits 1, Node below 24, out of memory, Docker or disk errors, a missing hosts entry or bypass host (webhook `FAILED` with `responseCode` 0), a 429, or Inbucket API drift                                |

The first two labels need the evidence pasted (HTTP status, body start, counts, SQLSTATE). For ENV,
paste the last 40 lines of the harness log or the web log.

Known product finding **`P6-OBS-DOC-001`** (severity low, recorded here only; no test in this task):
a wrong password or a wrong CSRF token on `POST /api/auth/email-password/authorize` returns HTTP 500
(`INVALID_CREDENTIALS` / `INVALID_REQUEST`) instead of a 4xx. The cause is that the handler's errors
have no `statusCode`, so `auth.onError` falls back to 500. P1 already records the same handler and
root cause as `P7-OBS-DOC-2FA-003` (a wrong TOTP returns 500) in
[documenso-2fa-known-issues.md](https://github.com/Jayami123/playwright-e2e-ci-framework/blob/main/docs/observations/documenso-2fa-known-issues.md).
The self-test does not log in with a password, so it never reaches this path.

CI runs the `documenso-race` project (5 trials on pull requests, 50 on `main`) in the `documenso-smoke` job and
uploads `race-histograms-documenso` and `documenso-web-log`. The web log is scanned for token patterns before
upload, and a log that contains one fails the job and is not uploaded. No timings are published here;
numbers come only from GitHub Actions runs (median of at least 3).

### Documenso completion races

Three completion cases share one histogram each. The self-test (above) runs in the same project.

- **`P6-DOC-RACE-001`**, two last recipients complete in parallel. It proves that a parallel last-recipient
  completion seals the document once. Today it reproduces `P6-OBS-DOC-002`: the test is an expected
  failure under `test.fail()`, the histogram verdict is `fail`, and the Playwright run is green.
- **`P6-DOC-RACE-002`**, one recipient, ten parallel completions. Every response is HTTP 200, with exactly
  one `SIGNED` and nine `ALREADY_SIGNED` per trial (a duplicate is 200 by design, not a 4xx), and one seal,
  one completed e-mail per recipient and one webhook.
- **Extra (unmapped): sequential control for `P6-DOC-RACE-001`.** The same two completions, one after
  another. It must be clean. A failing control is labelled `TEST BUG (control)` until a repro proves a
  product bug.

Trial counts: 5 on pull requests, 50 on `main`, nightly and `workflow_dispatch`. Run locally with
`RACE_TRIALS=5 npm run race:documenso` after `npm run up:documenso`.

The completion races need a serial database: no other write may reach the Documenso database during the run,
because the `DocumentData` count is a per-trial delta. CI runs one job with `workers: 1` and a fresh
database. Locally, run no other Documenso work while the race runs.

Residue is reported, never asserted and never cleaned via SQL: `softDeletedEnvelopes` and
`documentDataResidue` appear in the histogram. Leak checks count live envelopes by title prefix (not by
team or user, because account deletion re-owns completed envelopes).

Labels: **PRODUCT BUG** (a completion 4xx or 5xx, a seal or audit count that is not 1, a delta that is not
2, a duplicate e-mail or webhook, a `WebhookCall` that is not SUCCESS 200); **TEST BUG** (setup, spread,
cleanup, leak, histogram); **ENV** (a blocked webhook host, a 429, a missing fixture, a stack that is down);
**TEST BUG (control)** (the sequential control failed). Paste the evidence (status, counts, the violation
line); never a token.

Known product finding **`P6-OBS-DOC-002`** (medium, known bug; the reproduction is `P6-DOC-RACE-001`, an
expected failure):

> **P6-OBS-DOC-002 (medium, known bug).** When the last two recipients of a document complete at the same moment, Documenso seals the document twice. Effects: integrators that receive `DOCUMENT_COMPLETED` webhooks get **two deliveries** for that document, so a consumer that does not de-duplicate may process the event twice; each recipient receives the **completed e-mail twice**; the audit trail holds **two `DOCUMENT_COMPLETED` rows**. The **final PDF is correct** and the envelope ends COMPLETED once. Sequential completion is not affected. Evidence and cause: plan `docs/plans/2026-10-21-p6-phase1-task7-doc-races.md` §2.8 and §2.10; the reproduction is `P6-DOC-RACE-001` (expected failure).

Plan and evidence: `docs/plans/2026-10-21-p6-phase1-task7-doc-races.md` §2 and §10. No timings are published
here; numbers come only from GitHub Actions runs (median of at least 3).

## Rule for numbers

Published performance numbers come only from CI runs (GitHub Actions or a dedicated machine),
reported as the median of at least 3 runs. Local and cloud-agent runs only prove a test works.

The master plan is in [docs/master-plan.html](docs/master-plan.html).
