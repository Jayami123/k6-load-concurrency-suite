# k6-load-concurrency-suite

P6 of the QA portfolio: load, concurrency and performance tests with [k6](https://grafana.com/docs/k6/)
against self-hosted products started by
[qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `v0.2.15`.

Phase 0 proved the harness and k6 smoke. Phase 1 is done: the race framework and the six race cases for Medusa, Cal and
Documenso (see "Phase 1 results"). Phase 2 is done: concurrency races for Medusa, Cal and Twenty and two error-contract
checks (see "Phase 2 results"). Every published number comes from a GitHub Actions run on `main` (push, schedule or
`workflow_dispatch`).

## Run the smoke check locally

Needs Node 22.22+, Docker, pnpm 10.11.1 and k6.

```bash
npm ci
bash scripts/bootstrap.sh medusa   # clones the Medusa fork into ../products if it is missing
npm run up:medusa
npm run load:medusa -- --profile pr   # the Medusa journey smoke (P6-MED-LOAD-001)
npm run down:medusa
```

`npm run check` runs Prettier, the TypeScript check, `k6 inspect` (skipped when k6 is missing),
and unit tests (`npm run test:unit`). It also runs actionlint 1.7.12 on `.github/workflows`; the binary is downloaded and checksum-verified on first use. actionlint also runs shellcheck when it is installed, and CI has it, so install shellcheck locally for the same result.

## Run a race locally

Needs Medusa up (same as the smoke check). Use Node 22.23+ on PATH (see AGENTS.md).

```bash
export PATH="/usr/local/bin:$PATH"
npm run test:unit
npm run up:medusa
npm run clean:results
RACE_TRIALS=3 npm run race:medusa
npm run down:medusa
```

The self-test writes `results/races/framework-self-test.json` (gitignored). Playwright race
projects use `retries: 0` and `workers: 1`; concurrency is inside the test via `fireTogether`. Run `npm run clean:results` before a local race so the job summary only reads this run's reports.

CI runs this self-test (`RACE_TRIALS=3`) in the `medusa-smoke` job on every PR once Medusa starts, and uploads
`results/races/` as the `race-histograms-medusa` artifact.

`dispatchSpreadMs` is how far apart Node started the requests (max start minus min start, in ms).
It is not the time at which the server received them. A small spread means the client released
the burst together.

- `/health` not HTTP 200 with body `OK` → **PRODUCT BUG** (paste status and body).
- A burst whose spread is above `RACE_MAX_SPREAD_MS` (default 5) is **invalid** and is rerun, not failed
  (see "Rerun on spread" below). Too many invalid bursts → **TEST BUG** (runner too noisy).
- Mapped oversell race `P6-MED-RACE-001` writes `results/races/P6-MED-RACE-001.json` when Medusa is
  up with admin credentials set (see below).
- Money races `P6-MED-RACE-007`, `P6-MED-RACE-011` and `P6-MED-RACE-010` write
  `results/races/<case>.json` the same way (see "Medusa money races" below).

### Rerun on spread (all products)

`dispatchSpreadMs` only says how far apart Node started the requests, not when the server received them. A race
verdict should rest on bursts that really went out together, so the spread is a precondition of a trial, not a
product check:

- A burst is **valid** when `dispatchSpreadMs <= RACE_MAX_SPREAD_MS` (default 5) and **invalid** when it is above.
  One function, `isSpreadValid` in `src/races/rerun-on-spread.ts`, makes this decision for every product.
- An invalid burst is kept in the histogram (`attempts[]`, with `attempt` and `valid: false`) and the trial is run
  again from scratch (new cart, slot or document, new burst) under the same trial index. A rerun is a new attempt
  of the same trial, not a retry of a failed assertion.
- Only the spread makes an attempt invalid. The product oracle runs on every attempt. A product violation in any
  attempt, valid or invalid, is recorded and fails the case (or counts towards an expected-failure proof). Data of
  every attempt is cleaned up and leak-checked.
- Histogram shape: `trialsRequested` is the number of valid trials asked for; `trials[]` has one entry per trial
  index (`attempts`, `finalAttempt`, `outcome`: `valid`, `invalid-after-cap`, `failed` or `not-run`, and `ok`);
  `attempts[]` has every burst with its trial index, attempt number, spread and `valid`. Top-level `statusCounts` and
  `dispatchSpreadMs` count valid attempts only; `invalidDispatchSpreadMs`, `invalidTrials` (attempts rejected for
  spread) and `reruns` (attempts after the first) report the rest. Counters that decide a bug (double seal, double
  booking, oversell, 5xx) use every attempt.
- **Warm-up.** The first burst of a run is the slowest: on `P6-CAL-RACE-001` 9 of 13 slow bursts were trial 1 (plan
  §2.3). Before trial 1 each case fires `RACE_WARMUP_BURSTS` (default 1) untimed warm-up burst(s): trial index 0,
  its own fresh setup and cleanup exactly like a trial, never rerun. A warm-up is **not** a trial: its spread and
  status counts are left out of `statusCounts`, the spread aggregates, `trials[]`, `attempts[]` and the invalid budget,
  and the spread never makes it invalid. The evidence keeps it in `warmup[]` (attempt, `dispatchSpreadMs`,
  `statusCounts`, `ok`, violations). **A product invariant violation seen in a warm-up fails the case**: each line is
  added to the top-level `invariantViolations`, tagged `[warmup N]` after its label (for example
  `PRODUCT BUG: ... [warmup 1]`). A warm-up whose setup throws also fails the case, as a TEST BUG. The sequential
  controls (`extra-overlap-sequential`, `extra-doc-sequential-control`) fire no burst and have no warm-up.
  Rerun-on-spread stays as the backstop for a trial that is still too wide.
- Limits stop a runner that is too noisy. Reaching the per-trial cap, or exceeding the per-case budget, fails the case
  as **TEST BUG: runner too noisy**, with every attempt kept. The budget is
  `max(RACE_MIN_INVALID_BUDGET, ceil(trials × RACE_MAX_INVALID_SHARE_PCT / 100))` invalid attempts.

| Variable                     | Default | Meaning                                                                                              |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `RACE_MAX_SPREAD_MS`         | 5       | Largest spread, in ms, of a valid burst. Whole number, at least 1.                                   |
| `RACE_MAX_SPREAD_RERUNS`     | 3       | Reruns allowed per trial index (at most 4 bursts for one index). Whole number, at least 1.           |
| `RACE_MAX_INVALID_SHARE_PCT` | 20      | Invalid attempts allowed per case, in whole percent of `trials`, rounded up. Whole number, 0 to 100. |
| `RACE_MIN_INVALID_BUDGET`    | 2       | The budget never falls below this many invalid attempts. Whole number, at least 0.                   |
| `RACE_WARMUP_BURSTS`         | 1       | Untimed warm-up bursts before trial 1; `0` disables. Whole number, at least 0.                       |

Negatives, fractions, exponents and junk fail the run with a TEST BUG. The job summary and the race table have an
`Invalid / reruns` column for each case (zero is a valid result; `n/a` for a histogram from before this feature). CI
uses the defaults. Evidence for the defaults: `docs/plans/2026-10-22-p6-phase2-task1-rerun-on-spread.md`.

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
- `dispatchSpreadMs` is still the Node start spread for the burst (see above). `statusCounts` count valid
  attempts only (see "Rerun on spread").
- Trial count: pull requests run 3 trials; `main` (push, schedule or `workflow_dispatch`) runs 50. The extras run 3.

## Run Cal

Needs Docker, Node 22.23+ on PATH (see AGENTS.md) and corepack. Corepack downloads the Yarn the Cal
fork pins from `repo.yarnpkg.com`, so that host must be reachable.

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/bootstrap.sh cal   # clones the pinned fork, yarn install, writes the Cal product .env
npm run up:cal                  # returns once Cal answers; the first run builds Next.js and is slow
npm run load:cal -- --profile pr     # the Cal journey smoke (P6-CAL-LOAD-001)
RACE_TRIALS=3 npm run race:cal
npm run down:cal                # always; it also stops the Cal web process
```

`bootstrap.sh` generates the secrets in the Cal product `.env` (never printed or committed).
Later `up:cal` runs reuse the Next.js build. The self-test writes `results/races/cal-self-test.json`
(gitignored); the Cal web server log is `node_modules/qa-portfolio-harness/.harness/cal-web.log`.

- `GET /pro/30min` not HTTP 200 → **PRODUCT BUG** (paste status and body start).
- A burst above `RACE_MAX_SPREAD_MS` is invalid and rerun (see "Rerun on spread"); too many → **TEST BUG**
  (runner too noisy).
- `up:cal` exits 1, out of memory, a blocked host, Docker or disk errors → **ENV** (paste the last
  40 lines of the `up:cal` output).
- The Cal database keeps its data between local runs (the harness keeps its Docker volume).

CI runs the same self-test (`RACE_TRIALS=3`) in the `cal-smoke` job and uploads
`race-histograms-cal`.

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
  not double-book. Finding **`P6-OBS-CAL-001`**: same code on upstream `calcom/cal.com` (now `calcom/cal.diy`) `main`
  (checked 2026-10-20 at `0f19cc4`). The `extra (unmapped): concurrent losers get 409` test records
  it with `test.fail()`.
- **5xx** or a second accepted booking: **PRODUCT BUG**, never an allowed loser.
- Any other 4xx: **TEST BUG** until a probe shows otherwise.

Pull requests run 5 trials; `main`, the nightly schedule and manual runs run 50. The per-run values are in
[Phase 1 results](#phase-1-results).

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

Pull requests run 5 trials; `main`, the nightly schedule and manual runs run 30. The per-run values are in
[Phase 1 results](#phase-1-results).

## Run Documenso

Needs Docker, Node 24 at `/opt/node24` (the commands find it by themselves; `/usr/local/bin` stays
first, so Medusa and Cal keep Node 22.23) and the hosts entry `127.0.0.1 p6-webhook.test`.

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/bootstrap.sh documenso    # clones the pinned fork and runs npm ci under Node 24 (once)
npm run up:documenso                   # the first run builds the web app; later runs reuse the build
npm run load:documenso -- --profile pr   # the Documenso journey smoke (P6-DOC-LOAD-001)
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
| **TEST**    | Runner too noisy (rerun cap or invalid-share budget used up); SQLSTATE not 25006; leak or cleanup failure                                                                                                     |
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
upload, and a log that contains one fails the job and is not uploaded. Timings are in [Phase 1 results](#phase-1-results);
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
because the `DocumentData` count is a per-attempt delta (the baseline is read again at the start of every attempt,
so the rows of an invalid attempt are never counted in the next one). CI runs one job with `workers: 1` and a fresh
database. Locally, run no other Documenso work while the race runs.

Residue is reported, never asserted and never cleaned via SQL: `softDeletedEnvelopes` and
`documentDataResidue` appear in the histogram. Leak checks count live envelopes by title prefix (not by
team or user, because account deletion re-owns completed envelopes).

Labels: **PRODUCT BUG** (a completion 4xx or 5xx, a seal or audit count that is not 1, a delta that is not
2, a duplicate e-mail or webhook, a `WebhookCall` that is not SUCCESS 200); **TEST BUG** (setup, runner too
noisy, cleanup, leak, histogram); **ENV** (a blocked webhook host, a 429, a missing fixture, a stack that is down);
**TEST BUG (control)** (the sequential control failed). Paste the evidence (status, counts, the violation
line); never a token.

Known product finding **`P6-OBS-DOC-002`** (medium, known bug; the reproduction is `P6-DOC-RACE-001`, an
expected failure):

> **P6-OBS-DOC-002 (medium, known bug).** When the last two recipients of a document complete at the same moment, Documenso seals the document twice. Effects: integrators that receive `DOCUMENT_COMPLETED` webhooks get **two deliveries** for that document, so a consumer that does not de-duplicate may process the event twice; each recipient receives the **completed e-mail twice**; the audit trail holds **two `DOCUMENT_COMPLETED` rows**. The **final PDF is correct** and the envelope ends COMPLETED once. Sequential completion is not affected. Evidence and cause: plan `docs/plans/2026-10-21-p6-phase1-task7-doc-races.md` §2.8 and §2.10; the reproduction is `P6-DOC-RACE-001` (expected failure).

Plan and evidence: `docs/plans/2026-10-21-p6-phase1-task7-doc-races.md` §2 and §10. Timings are in
[Phase 1 results](#phase-1-results); numbers come only from GitHub Actions runs (median of at least 3).

## Run Twenty

Needs Docker and these harness ports: 3002 (app), 5434 (Postgres), 8025 and 1025 (Mailpit). Node 22 (`.nvmrc`), as for the other products.

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/bootstrap.sh twenty   # clones the pinned fork (once)
npm run up:twenty                  # starts the stack and returns when the app is healthy
npm run seed:twenty                # seeds the dev workspace (once per fresh database)
npm run smoke:twenty               # k6: GET /healthz
npm run race:twenty                # the unmapped self-test
npm run race:twenty-tw           # the Task 7 race cases (tests/twenty/tw-races)
npm run test:twenty-obs            # the P6-OBS-TW-001 empty-body spec (tests/twenty/tw-obs)
npm run down:twenty                # always; TWENTY_DOWN_VOLUMES=1 also removes the volumes
```

- **Login.** P6 reads `TWENTY_EMAIL` and `TWENTY_PASSWORD` when they are set. Otherwise it uses the dev-seed login that
  `qa-portfolio-harness` (v0.2.12) exports. The password is never printed.
- **Sign-in.** The harness `authenticate()` returns a workspace-agnostic token, which cannot read data. P6 signs in,
  picks the workspace and exchanges the login token itself (`src/twenty/auth.ts`).
- **Rate limit.** Twenty limits API keys to 100 requests per second and 100 per 60 seconds. The self-test uses a login
  session, which the limiter does not count, and P6 creates no API key. A 429 is never a pass.

CI runs the self-test in the `twenty-smoke` job, which uses a pull retry, a token scan before upload and a
`down` that removes the volumes. Timings are not published here; numbers come only from GitHub Actions runs (median
of at least 3).

### Twenty races

Cases in `tests/twenty/tw-races/` (project `twenty-tw-races`), run by the `twenty-races` job on every push to `main`, nightly and on
dispatch with 50 trials, and on pull requests with 5:

| Case             | What it checks                                                      | Status                                           |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| `P6-TW-RACE-001` | two PATCH of one name end on one of the two values, no 5xx          | passes in the probe                              |
| `P6-TW-RACE-005` | PATCH of name and PATCH of another field both persist               | passes in the probe                              |
| `P6-TW-RACE-002` | two PATCH of one task's position end on one of the two values       | passes in the probe                              |
| `P6-TW-RACE-003` | two parallel merges of one pair leave one live row and one survivor | passes in the probe                              |
| `P6-TW-RACE-006` | a replayed reset token is refused and changes nothing               | passes in the probe                              |
| `P6-TW-RACE-004` | ten parallel redemptions of one reset token admit exactly one       | **PRODUCT BUG** (`test.fail()` after the guards) |

Every parallel case asserts that its requests overlapped, that every trial's setup ran, and that no company row with the run
prefix is left. Throwaway members are created through the invitation flow and are not removed (CI removes the volumes).
Timings are not published here; numbers come only from GitHub Actions runs.

### Twenty empty-body spec

Cases in `tests/twenty/tw-obs/` (project `twenty-tw-obs`), run by the `twenty-obs` job. Each hang test first asserts that a valid query answers 200
and `{"foo":1}` answers 400, each under one second, then expects a 4xx within a 5-second client timeout. Every hung request is aborted in `finally`
and the test asserts that no socket is left open. The spec writes no records.

| Case                                               | What it checks                                                                                              | Status                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `P6-OBS-TW-001` (4 tests, authenticated)           | `POST /metadata` and `POST /graphql` with an empty body or `{}` get a 4xx within 5 s                        | **PRODUCT BUG** (`test.fail()` after the guards)      |
| `P6-OBS-TW-001` (4 tests, without `Authorization`) | the same four requests without credentials                                                                  | **PRODUCT BUG**, wider precondition (owner-confirmed) |
| `P6-OBS-TW-001` resource (2 tests)                 | ten hung empty-body requests do not stop a valid query (200 under 1 s); aborting them leaves no open socket | passes in the probe                                   |

Timings are not published here; numbers come only from GitHub Actions runs.

## Phase 1 results

Every number here comes from a GitHub Actions run on `main` (push, schedule or `workflow_dispatch`). No number
comes from a cloud VM or a laptop. A timing is a median of at least 3 runs **with the same trial count**; timings
at different trial counts are shown as separate series, never pooled. Per-trial time is the run's wall-clock time
from `startedAt` to `finishedAt`, divided by its trials.

Each run links to its run page. The histograms of each run are in the
[`p6-phase1` release](https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase1) as one zip per
run (`p6-<run-id>-evidence.zip`). The release does not expire; the Actions artefacts do (14 days).

Closeout runs (the two runs that hold all three product jobs at full count):
[39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) (push to `main`, `4aecc2d`) and [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) (`workflow_dispatch` on `main`, `4aecc2d`).

### Medusa oversell (`P6-MED-RACE-001`)

Stock S = 5. Pull requests run 3 trials. `main` (push, schedule or `workflow_dispatch`) runs 50. The extras run
3 trials in every event.

**3-trial series (before the count change):**

| Run                                                                                            | Event    | Trials | Accepted per trial | Oversell | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ------ | ------------------ | -------- | ------------------ |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298) | push     | 3      | 5                  | 0        | 12.52              |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push     | 3      | 5                  | 0        | 10.39              |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 3      | 5                  | 0        | 16.51              |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 3      | 5                  | 0        | 14.28              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 3      | 5                  | 0        | 14.68              |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 3      | 5                  | 0        | 9.77               |

3-trial median per trial: **13.40 s** (n = 6 runs, 3 trials each).

**50-trial series (the closeout runs; each run shown on its own):**

| Run                                                                                            | Event    | Trials | Accepted per trial | Oversell | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ------ | ------------------ | -------- | ------------------ |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | 50     | 5                  | 0        | 14.40              |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | 50     | 5                  | 0        | 11.52              |

A median of the 50-trial series is not published: it has 2 runs, and the rule needs 3. The 400 rows are
out-of-stock refusals (`not_allowed`), which are expected: 750 in each closeout run, 15 per trial.

### Cal identical slot (`P6-CAL-RACE-001`)

Pull requests run 5 trials. `main` runs 50. Per trial: 1 ACCEPTED, the rest refused.

| Run                                                                                            | Event    | Trials | Accepted per trial | Redacted 400 (of 1000 requests) | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ------ | ------------------ | ------------------------------- | ------------------ |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push     | 50     | 1                  | 950                             | 1.035              |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 50     | 1                  | 950                             | 0.761              |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 50     | 1                  | 950                             | 1.009              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 50     | 1                  | 950                             | 0.965              |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 50     | 1                  | 950                             | 0.647              |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | 50     | 1                  | 950                             | 1.052              |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | 50     | 1                  | 950                             | 0.788              |

Median per-trial time (50 trials, all runs): 0.965 s (n = 7). The 950 redacted 400s per run are
`P6-OBS-CAL-001` (see Known product bugs).

### Cal overlap (`P6-CAL-RACE-003`)

Pull requests run 5 trials. `main` runs 30 (the case cap). A double-booked trial has both legs ACCEPTED on
overlapping windows. A refused leg is counted in its trial, and that trial is clean.

| Run                                                                                            | Event    | Trials | Double-booked | Clean | Refused legs | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ------ | ------------- | ----- | ------------ | ------------------ |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 30     | 28            | 2     | 2            | 0.302              |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 30     | 29            | 1     | 1            | 0.353              |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 30     | 29            | 1     | 1            | 0.345              |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 30     | 24            | 6     | 6            | 0.268              |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | 30     | 30            | 0     | 0            | 0.374              |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | 30     | 25            | 5     | 5            | 0.318              |

Pooled over all runs: 165 of 180 trials double-booked (91.7%). Median per-trial time (30 trials, all runs):
0.332 s (n = 6). `P6-OBS-CAL-002` is the product bug (high). The refused legs are `P6-OBS-CAL-003` (low).

**Pending bookings count as busy.** The allocator treats any booking that is not cancelled or rejected, including
`PENDING`, as busy. So it skipped windows over pending seed bookings: runs A and B each skipped 2 windows, and their
`skippedWindowEvidence` names booking ids 2 and 14, both `pending`.

### Cal histogram publication (`P6-CAL-RACE-002`)

`P6-CAL-RACE-002` (histogram publication) is evidenced by the `race-histograms-cal` artefact of the cited `main` runs:
`P6-CAL-RACE-001.json` is present from run `39434721131` on, and `P6-CAL-RACE-003.json` from run `39449102426` on. The
same files are in the matching `p6-phase1` release zips. This subsection adds no numbers; the Cal numbers are in the
sections above.

### Documenso completion races (`P6-DOC-RACE-001`, `P6-DOC-RACE-002`, control)

Pull requests run 5 trials. `main` runs 50, and the control 5.

In plain terms: when the last two recipients of a document sign at the same moment, Documenso completes the document
twice. Each trial of that race shows **8 invariant violations**: six duplicate side effects (a second seal, a second
`DOCUMENT_COMPLETED` record, a second set of completion e-mails, a second set of webhook deliveries and `WebhookCall`
rows, and a second document-data write), plus two duplicate `Signing Complete!` lines. Over 50 trials each run shows
**400 violations**. The sequential control shows none.

| Run                                                                                            | Event    | Case              | Trials | Result                                                     | Per-trial time (s) |
| ---------------------------------------------------------------------------------------------- | -------- | ----------------- | ------ | ---------------------------------------------------------- | ------------------ |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed (`P6-OBS-DOC-002`)                  | 2.50               |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | `P6-DOC-RACE-002` | 50     | 50 of 50 single seal; 50 SIGNED, 450 ALREADY_SIGNED; 0 5xx | 1.44               |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | control           | 5      | 5 of 5 single seal                                         | 2.66               |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed (`P6-OBS-DOC-002`)                  | 2.23               |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | `P6-DOC-RACE-002` | 50     | 50 of 50 single seal; 50 SIGNED, 450 ALREADY_SIGNED; 0 5xx | 1.34               |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | control           | 5      | 5 of 5 single seal                                         | 2.58               |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed (`P6-OBS-DOC-002`)                  | 2.56               |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | `P6-DOC-RACE-002` | 50     | 50 of 50 single seal; 50 SIGNED, 450 ALREADY_SIGNED; 0 5xx | 1.47               |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | control           | 5      | 5 of 5 single seal                                         | 2.69               |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | `P6-DOC-RACE-001` | 50     | 50 of 50 double-sealed (`P6-OBS-DOC-002`)                  | 2.49               |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | `P6-DOC-RACE-002` | 50     | 50 of 50 single seal; 50 SIGNED, 450 ALREADY_SIGNED; 0 5xx | 1.46               |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | control           | 5      | 5 of 5 single seal                                         | 2.70               |

Per-trial medians (n = 4 runs at 50 trials): `P6-DOC-RACE-001` 2.49 s, `P6-DOC-RACE-002` 1.45 s. Published because
n ≥ 3.

### Medusa money races (Phase 2)

Three cases against one captured or authorised payment: `P6-MED-RACE-007` (N parallel refunds of X, one may succeed),
`P6-MED-RACE-011` (N parallel refunds of X/2, two may succeed) and `P6-MED-RACE-010` (N parallel captures of X on one
authorised payment, one may succeed). The database invariants are asserted: refunds never exceed the captured amount,
captures never exceed the authorised amount. Every attempt cleans up its order (confirm a pending change, refund the
rest to zero, cancel, archive, delete the product). A stuck order is reported as leaked data, not a failure.

`P6-MED-RACE-011` has a **suspected product bug** (not a `test.fail()`, see "Known product bugs"): the refunds
committed match the captured amount, but the HTTP side shows one success where two are expected.

**`P6-MED-RACE-006` (gift card) is in "Later".** Medusa at the pinned ref (`MEDUSA_REF` `f677db43`) has no gift-card or
store-credit route (`GET` on `/admin/gift-cards`, `/store/gift-cards`, `/admin/store-credits`, `/store/store-credits`
returns 404), and the database has no gift-card table. P6 never changes the Medusa fork (D5, D34).

### Medusa budget and order-state races (Phase 2)

Plan: [2026-10-22-p6-phase2-task3-med-budget-order-races.md](docs/plans/2026-10-22-p6-phase2-task3-med-budget-order-races.md).

| Case              | Burst                                                       | Asserted (fails the case)                                         | Labelled bugs (plan D67 to D70)                                    | CI job                 |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `P6-MED-RACE-005` | N=10 carts complete with a promotion in a usage budget K=3  | budget `used ≤ K`, HTTP 200s `≤ K`, losers 4xx, setup, cleanup    | F-M2 (annotation)                                                  | `medusa-order-races`   |
| `P6-MED-RACE-012` | N=10 carts complete with a promotion with a usage limit L=3 | `promotion.used ≤ L`, HTTP 200s `≤ L`, losers 4xx, setup, cleanup | F-M2 (annotation)                                                  | `medusa-order-races`   |
| `P6-MED-RACE-008` | two parallel cancels of one order (P1 X04)                  | no 5xx, setup, cleanup                                            | X04, F-M3 (`test.fail()`)                                          | `medusa-smoke`         |
| `P6-MED-RACE-009` | one cancel ‖ one fulfil of one order (P1 X05)               | no 5xx, setup, cleanup                                            | X05, F-M3 (`test.fail()`)                                          | `medusa-smoke`         |
| `P6-MED-RACE-013` | ten parallel cancels of one order (authorised)              | no 5xx, setup, cleanup                                            | product-bug: X04, F-M3 (D67, D68)                                  | `medusa-cancel-extras` |
| `P6-MED-RACE-014` | ten parallel cancels of one captured order                  | refunds ≤ captured; no 5xx, setup, cleanup                        | product-bug: X04, F-M3 (D67, D68); product-bug: F-M4 (owner label) | `medusa-cancel-extras` |

**Product bugs (labelled by the owner on 2026-10-23 after three full-count runs: [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959); plan D67 to D70).** X04,
X05 and F-M3 are under `test.fail()`; F-M2 is a labelled annotation (see "Known product bugs"). Each spec of `-008` and
`-009` has two tests: one asserts the guards (counters, 5xx, setup, cleanup) and must pass, the other is the
`test.fail()` for the labelled bugs. `-009` runs 13 trials on PRs so a PR run misses its bugs under 1 % (plan D69; the later `main` runs measure 2.3 %, see
`docs/BACKLOG.md`). F-M4 (parallel cancels of a captured order double the order's `refunded_total` while the payment holds
one refund) is a PRODUCT BUG (medium, owner label 2026-10-23, Phase 2 closeout); its `test.fail()` comes in a follow-up PR.

**Leaked data.** A product whose `reserved_quantity` was left above its reservations (F-M3) cannot be deleted through
the admin API, and an open fulfillment on a canceled order (X05) cannot be canceled. Both are reported as leaked data in
the histogram and the test annotations, never as a failure (plan D49). Locally, `npm run down:medusa` keeps the
database volume, so such rows stay until the volume is removed.

### Cal state races (Phase 2)

Plan: [2026-10-23-p6-phase2-task4-cal-state-races.md](docs/plans/2026-10-23-p6-phase2-task4-cal-state-races.md).
Job: `cal-state-races` (its own timeout; `cal-smoke` is unchanged). Full count (50 trials) on `main`, nightly and dispatch;
5 trials on PRs.

| Case              | Burst                                                   | Asserted (fails the case)                                         | Labelled product bug (known-bug test under `test.fail()`) |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `P6-CAL-RACE-006` | N=10 bookings through a private link, `maxUsageCount` 1 | setup, no thrown request, cleanup, leak check                     | PRODUCT BUG F-C1: accepted > 1, counter ≠ 1               |
| `P6-CAL-RACE-008` | N=10 bookings through a private link, `maxUsageCount` 3 | setup, no thrown request, cleanup, leak check                     | PRODUCT BUG F-C1: accepted > 3, counter ≠ 3               |
| `P6-CAL-RACE-007` | confirm ‖ cancel of one PENDING `tennis-class` booking  | setup, no thrown request, webhook signatures, cleanup, leak check | PRODUCT BUG F-C2: both side-effect sets fire              |
| `P6-CAL-RACE-009` | confirm ‖ confirm of one PENDING `tennis-class` booking | setup, no thrown request, webhook signatures, cleanup, leak check | PRODUCT BUG F-C3: two `BOOKING_CREATED`                   |

The webhook receiver moved to `src/receivers/webhook-receiver.ts`. Each caller passes its secret check: Documenso
(`x-documenso-secret`) and Cal (`x-cal-signature-256`, HMAC-SHA256 of the raw body, verified per delivery).

The owner labelled F-C1, F-C2 and F-C3 **PRODUCT BUG** on 2026-10-23 (O6), after three full-count runs that reproduced
them in 150 of 150 attempts. Each case keeps its guards test (counters, setup, cleanup, leak check: must pass) and adds a
known-bug test under `test.fail()`, the same pattern as the Medusa X04 and F-M3 tests. When a fix ships, the known-bug test
turns red ("expected to fail but passed") and the `test.fail()` and the label are removed.

**Email is not observed.** The harness runs no mail catcher for Cal, so the email half of `P6-CAL-RACE-007` is not
asserted (plan D9). The histogram records `emailObservable: false`.

### Documenso sign-in errors (Phase 2)

Plan: [2026-10-23-p6-phase2-task5-doc-obs-001.md](docs/plans/2026-10-23-p6-phase2-task5-doc-obs-001.md).
Job: `documenso-smoke`, step "Documenso sign-in error contract (documenso-api)", after the races and before the token scan.
Project `documenso-api` (no browser). No trial count: one deterministic test, run on every event.

| Test                                                 | Asserts                                          | Known bug under `test.fail()`          |
| ---------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `setup: a correct sign-in is 201 and sets sessionId` | 201 and a `sessionId` cookie (must pass)         | none                                   |
| `P6-OBS-DOC-001: wrong password is 401, never 5xx`   | guard: `INVALID_CREDENTIALS`; then status 401    | PRODUCT BUG: 500 `INVALID_CREDENTIALS` |
| `P6-OBS-DOC-001: bad CSRF is 400 or 403, never 5xx`  | guard: `INVALID_REQUEST`; then status 400 or 403 | PRODUCT BUG: 500 `INVALID_REQUEST`     |

The throwaway user is deleted in `afterAll`; a failed deletion fails the run with a `CLEANUP:` error. A guard that sees a
different contract (for example a wrong password that succeeds) fails the test as a real failure, never as an expected one.
When the handler returns a 4xx, the known-bug tests turn red ("expected to fail but passed"). Then remove the two
`test.fail()` lines and update the row above.

### Known product bugs

Each bug is listed with its evidence. Where a `test.fail()` test exists, it turns red
("expected to fail but passed") once the bug is fixed, and is then removed.

| ID                       | Severity                                     | Upstream                                                                                                                                                                                  | What happens                                                                                                                                                                          | Test                                                                                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-CAL-001`         | low                                          | [calcom/cal.diy#30375](https://github.com/calcom/cal.diy/issues/30375)                                                                                                                    | Concurrent identical-slot losers get 400 "An error occurred while querying the database." (Prisma `P2002` on the idempotency key, redacted) instead of 409                            | `cal-race-001-identical-slot.spec.ts`: `test.fail()` on the loser contract                                                                      | [p6-39561220290-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39561220290-evidence.zip): `race-histograms-cal/P6-CAL-RACE-001.json` and `extra-loser-contract.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `P6-OBS-CAL-002`         | high                                         | [calcom/cal.diy#30374](https://github.com/calcom/cal.diy/issues/30374)                                                                                                                    | Two overlapping bookings on one host are both ACCEPTED                                                                                                                                | `cal-race-003-overlap.spec.ts`: `test.fail()`                                                                                                   | [p6-39563393657-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39563393657-evidence.zip): `race-histograms-cal/P6-CAL-RACE-003.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `P6-OBS-CAL-003`         | low                                          | [calcom/cal.diy#30376](https://github.com/calcom/cal.diy/issues/30376)                                                                                                                    | A same-host, same-start request pair in the same millisecond collides on the booking `uid` (`Booking_uid_key`); the loser gets the redacted 400 instead of 409. No double booking     | none (no `test.fail()`)                                                                                                                         | [p6-39563393657-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39563393657-evidence.zip): `cal-web-log/cal-web.log` (the `P2002` line) and `race-histograms-cal/P6-CAL-RACE-003.json` (`refusedTraceIds`); code: [`RegularBookingService.ts` L1267–1268 at `c2b7ac44`](https://github.com/Jayami123/cal/blob/c2b7ac44c66f24ffef1662b276f0653988a609a3/packages/features/bookings/lib/service/RegularBookingService.ts#L1267-L1268)                                                                                                                                                                                                                                                                                                                                                                                                        |
| `P6-OBS-DOC-001`         | low                                          | not filed (draft: Task 9 plan Appendix E)                                                                                                                                                 | A wrong password returns 500 `INVALID_CREDENTIALS` (not 401); a bad CSRF token returns 500 `INVALID_REQUEST` (not 400 or 403)                                                         | `tests/documenso/api/doc-obs-001-signin-errors.spec.ts`: `test.fail()` on both negative tests                                                   | PRODUCT BUG (owner label, 2026-10-23). Probe at fork `f4105e47` and read-only check of upstream `8707e33c`: unchanged. CI `documenso-smoke` (both negative tests expected failures): PR #41 head [4671661](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39956188035/job/120422695905), PR #41 head [b0937e0](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39959840802/job/120434768132), and `main` [39961527451](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451/job/120451886357) (attempt 2); `main`: both tests expected failures in every green `documenso-smoke` since `39961527451`, including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021) |
| `P6-OBS-DOC-002`         | medium                                       | [documenso/documenso#3187](https://github.com/documenso/documenso/issues/3187) (existing report; [our repro](https://github.com/documenso/documenso/issues/3187#issuecomment-6318151560)) | Two last recipients complete in parallel: double seal                                                                                                                                 | `doc-race-001-last-recipients.spec.ts`: `test.fail()`                                                                                           | [p6-39563393657-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39563393657-evidence.zip): `race-histograms-documenso/P6-DOC-RACE-001.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `P6-MED-RACE-011` (F-M1) | suspected (D40)                              | not filed                                                                                                                                                                                 | Concurrent refunds of X/2: the refund rows sum to X, but one request returns 200 and one returns 400 "already has an existing active order change" after its refund row was written   | `med-race-011-partial-refunds.spec.ts`: annotation only (no `test.fail()`)                                                                      | Live probe 2026-10-22: 40 of 50 trials at full count show one HTTP success where two are expected; the PRODUCT BUG label waits for full-count CI runs (D40); `main`: 705 of 1000 attempts in green full-count runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `P6-MED-RACE-008` (X04)  | medium (proposed)                            | not filed (draft: Task 9 plan Appendix B1)                                                                                                                                                | Two parallel cancels of one order both return 200; a second `credit_line` order change stays `pending` and cannot be confirmed                                                        | `med-race-008-double-cancel.spec.ts`: `test.fail()`                                                                                             | Label evidence: 113 of 150 trials in [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959); P1 X04; `main`: 653 of 900 attempts, including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021)                                                                                                                                                                                                                                                                                                 |
| `P6-MED-RACE-009` (X05)  | high (proposed)                              | not filed (draft: Task 9 plan Appendix B2)                                                                                                                                                | Cancel ‖ fulfil: the order ends `canceled` with an open fulfillment that can no longer be canceled                                                                                    | `med-race-009-cancel-vs-fulfil.spec.ts`: `test.fail()` (13 PR trials)                                                                           | Label evidence: 50 of 150 trials in [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959); P1 X05; `main`: 259 of 900 attempts, including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021)                                                                                                                                                                                                                                                                                                  |
| F-M3 (`-008`, `-009`)    | medium (proposed)                            | not filed (draft: Task 9 plan Appendix B1)                                                                                                                                                | A losing cancel or fulfil rolls back and restores the reservation of a canceled order (core-flows 2.21.2 `delete-reservations-by-line-items.js` L10–29, `delete-reservations.js` L28) | `-008` and `-009`: `test.fail()`                                                                                                                | Label evidence: 37 of 150 (`-008`) and 7 of 150 (`-009`) trials in [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959); `main`: `-008` 247 of 900, `-009` 40 of 900, `-013` 945 of 950, `-014` 950 of 953 attempts                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| F-M2 (`-012`, `-005`)    | medium (proposed)                            | not filed (draft: Task 9 plan Appendix B3)                                                                                                                                                | A checkout that returns 400 leaves an unpaid order carrying the promotion, so live orders exceed the promotion limit; the usage counter stays at the limit                            | annotation only (`product-bug`); no `test.fail()` (plan D70, `docs/BACKLOG.md`)                                                                 | Label evidence: 32 of 150 (`-012`) and 1 of 150 (`-005`) trials in [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959); `main`: `-012` 209 of 1050, `-005` 12 of 1051 attempts                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| F-M4 (`-014`)            | PRODUCT BUG, medium (owner label 2026-10-23) | not filed (draft: Task 9 plan Appendix B1)                                                                                                                                                | Ten parallel cancels of one captured order: the payment holds one refund, but the order's `order_summary.totals.refunded_total` is twice the refund rows                              | `med-race-014-captured-cancels.spec.ts`: annotation; `test.fail()` in a follow-up PR (5 PR trials)                                              | `main`: 684 of 953 attempts in 19 green full-count runs (31 to 43 of 50 each), including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `P6-CAL-RACE-006` (F-C1) | PRODUCT BUG (owner label, O6)                | [calcom/cal.diy#29815](https://github.com/calcom/cal.diy/issues/29815) (existing issue; comment drafted in the Task 9 plan, Appendix C1)                                                  | Private link with cap 1 accepts every one of 10 parallel bookings; the counter stops at 1                                                                                             | `cal-race-006-private-link.spec.ts`: known-bug test under `test.fail()`                                                                         | Label evidence: 150 of 150 attempts in [39932990882](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39932990882), [39935674101](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935674101), [39938126238](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39938126238); `main`: 600 of 600 attempts, including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021)                                                                                                                                                                                                                                                                                                       |
| `P6-CAL-RACE-008` (F-C1) | PRODUCT BUG (owner label, O6)                | [calcom/cal.diy#29815](https://github.com/calcom/cal.diy/issues/29815) (as `-006`)                                                                                                        | Private link with cap 3 accepts all 10 parallel bookings; the counter stops at 3                                                                                                      | `cal-race-008-private-link-cap.spec.ts`: known-bug test under `test.fail()`                                                                     | Same three runs as `P6-CAL-RACE-006`; `main`: 600 of 600 attempts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `P6-CAL-RACE-007` (F-C2) | PRODUCT BUG (owner label, O6)                | not filed (draft: Task 9 plan Appendix C2)                                                                                                                                                | Confirm ‖ cancel: both succeed, the booking ends accepted, and both webhooks fire                                                                                                     | `cal-race-007-confirm-vs-cancel.spec.ts`: known-bug test under `test.fail()`                                                                    | Same three runs as `P6-CAL-RACE-006`; `main`: 600 of 600 attempts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `P6-CAL-RACE-009` (F-C3) | PRODUCT BUG (owner label, O6)                | not filed (draft: Task 9 plan Appendix C3)                                                                                                                                                | Confirm ‖ confirm: both succeed and two confirmation webhooks fire                                                                                                                    | `cal-race-009-double-confirm.spec.ts`: known-bug test under `test.fail()`                                                                       | Same three runs as `P6-CAL-RACE-006`; `main`: 600 of 600 attempts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `P6-OBS-TW-001`          | PRODUCT BUG (owner label)                    | not filed publicly: Twenty's security policy asks for a private report, drafted for the owner to send                                                                                     | `POST /metadata` and `POST /graphql` with an empty body or `{}` get no response, with or without `Authorization`; the server never closes the socket (0 of 20 in 400 s)               | `tw-obs-001-empty-body-hang.spec.ts`: 8 tests under `test.fail()` after the guards; `tw-obs-001-hung-requests-resource.spec.ts`: resource check | 24 of 24 hangs in the 2026-10-23 probe (`docs/plans/2026-10-24-p6-x8-twenty-empty-body.md` §3.1, §3.2, §3.4); 12 of 12 in the Task 7 repro; `main`: 8 of 8 hang tests expected failures in runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `P6-TW-RACE-004`         | PRODUCT BUG (owner label)                    | not filed publicly: Twenty's security policy asks for a private report, drafted for the owner to send                                                                                     | Ten parallel redemptions of one password-reset token all succeed (check-then-act in `updatePasswordViaResetToken`, no lock)                                                           | `tw-race-004-reset-token.spec.ts`: `test.fail()` after the guards                                                                               | 50 of 50 requests in the Task 7 probe (5 trials, `docs/plans/2026-10-23-p6-phase2-task7-twenty-races.md` §3.7); the `twenty-races` job is green on `main` with the expected failure; `main`: 250 of 250 attempts with more than one success, including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021)                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Phase 1 status

Phase 1 of the master plan is **done**. The six cases are evidenced from `main` runs: `P6-MED-RACE-001`,
`P6-CAL-RACE-001`, `P6-CAL-RACE-002`, `P6-CAL-RACE-003`, `P6-DOC-RACE-001`, `P6-DOC-RACE-002`. Closeout runs:
[39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) and [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937). Open product bugs at the end of Phase 1: the five `P6-OBS-*` rows above.

## Phase 2 results

Phase 2 tests concurrency races and two error contracts; k6 load testing is planned for Phases 3 to 5.

Every number here comes from a GitHub Actions run on `main` (push, schedule or `workflow_dispatch`) whose job ended green. A
timing is a median of at least 3 runs at the same trial count (50 in every row). Per-trial time is the histogram's wall-clock
time from `startedAt` to `finishedAt`, divided by its trials. "Signals" counts the attempts that showed the tag, valid and
invalid (Task 1, D3).

Closeout runs: [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) (A, push to
`main`, `a82521a`) and [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021) (B,
`workflow_dispatch` on `main`, `a82521a`). Their histograms and logs are in the
[`p6-phase2` release](https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase2), one zip per run.

| Case              | Job                    | Runs | Median per-trial (s) | Range (s)     | Invalid trials / reruns | Signals (attempts)                               | Run A (time; signals) | Run B (time; signals) |
| ----------------- | ---------------------- | ---- | -------------------- | ------------- | ----------------------- | ------------------------------------------------ | --------------------- | --------------------- |
| `P6-MED-RACE-007` | `medusa-smoke`         | 20   | 1.37                 | 0.84 to 1.58  | 0 / 0                   | none                                             | 1.38 s                | 1.39 s                |
| `P6-MED-RACE-010` | `medusa-smoke`         | 20   | 1.28                 | 0.79 to 1.48  | 0 / 0                   | none                                             | 1.30 s                | 1.31 s                |
| `P6-MED-RACE-011` | `medusa-smoke`         | 20   | 1.46                 | 0.90 to 1.65  | 0 / 0                   | F-M1 705 of 1000                                 | 1.50 s; 31            | 1.49 s; 39            |
| `P6-MED-RACE-008` | `medusa-smoke`         | 18   | 1.16                 | 0.72 to 1.33  | 0 / 0                   | X04 653 of 900; F-M3 247 of 900                  | 1.20 s; 42; 8         | 1.20 s; 43; 7         |
| `P6-MED-RACE-009` | `medusa-smoke`         | 18   | 1.12                 | 0.70 to 1.33  | 0 / 0                   | X05 259 of 900; F-M3 40 of 900                   | 1.13 s; 11; 4         | 1.15 s; 11; 3         |
| `P6-MED-RACE-005` | `medusa-order-races`   | 21   | 8.28                 | 4.91 to 9.72  | 1 / 1                   | F-M2 12 of 1051                                  | 8.57 s; 2             | 5.52 s; 0             |
| `P6-MED-RACE-012` | `medusa-order-races`   | 21   | 8.16                 | 4.86 to 10.28 | 0 / 0                   | F-M2 209 of 1050                                 | 8.50 s; 10            | 5.01 s; 2             |
| `P6-MED-RACE-013` | `medusa-cancel-extras` | 19   | 1.68                 | 1.11 to 3.29  | 0 / 0                   | X04 948 of 950; F-M3 945 of 950                  | 3.29 s; 50; 46        | 1.40 s; 50; 50        |
| `P6-MED-RACE-014` | `medusa-cancel-extras` | 19   | 1.80                 | 1.19 to 2.75  | 3 / 3                   | X04 949 of 953; F-M3 950 of 953; F-M4 684 of 953 | 2.75 s; 49; 48; 43    | 1.55 s; 50; 50; 36    |
| `P6-CAL-RACE-006` | `cal-state-races`      | 12   | 2.09                 | 1.23 to 2.24  | 0 / 0                   | accepted above the cap 600 of 600                | 2.24 s; 50            | 2.19 s; 50            |
| `P6-CAL-RACE-008` | `cal-state-races`      | 12   | 1.98                 | 1.19 to 2.10  | 0 / 0                   | accepted above the cap 600 of 600                | 2.10 s; 50            | 2.10 s; 50            |
| `P6-CAL-RACE-007` | `cal-state-races`      | 12   | 1.81                 | 1.70 to 1.82  | 0 / 0                   | both side-effect sets 600 of 600                 | 1.82 s; 50            | 1.81 s; 50            |
| `P6-CAL-RACE-009` | `cal-state-races`      | 12   | 1.81                 | 1.72 to 1.85  | 0 / 0                   | two BOOKING_CREATED 600 of 600                   | 1.85 s; 50            | 1.84 s; 50            |
| `P6-TW-RACE-001`  | `twenty-races`         | 5    | 0.06                 | 0.05 to 0.06  | 0 / 0                   | none                                             | 0.06 s                | 0.06 s                |
| `P6-TW-RACE-002`  | `twenty-races`         | 5    | 0.04                 | 0.04 to 0.05  | 0 / 0                   | none                                             | 0.04 s                | 0.04 s                |
| `P6-TW-RACE-003`  | `twenty-races`         | 5    | 0.10                 | 0.08 to 0.10  | 0 / 0                   | none                                             | 0.09 s                | 0.10 s                |
| `P6-TW-RACE-004`  | `twenty-races`         | 5    | 1.45                 | 1.35 to 1.46  | 0 / 0                   | more than one success 250 of 250                 | 1.35 s; 50            | 1.46 s; 50            |
| `P6-TW-RACE-005`  | `twenty-races`         | 5    | 0.05                 | 0.04 to 0.06  | 0 / 0                   | none                                             | 0.06 s                | 0.04 s                |
| `P6-TW-RACE-006`  | `twenty-races`         | 5    | 1.02                 | 0.95 to 1.06  | 0 / 0                   | none                                             | 1.05 s                | 1.01 s                |

Runs counted: [39829474241](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39829474241), [39845479090](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845479090), [39914092582](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39914092582), [39917207104](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39917207104), [39918269577](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39918269577), [39923528658](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39923528658), [39926461664](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39926461664), [39927945708](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39927945708), [39930717584](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39930717584), [39934300578](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39934300578), [39935736478](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935736478), [39941365044](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39941365044), [39941942658](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39941942658), [39948384170](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39948384170), [39951483517](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39951483517), [39961527451](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451), [39969241809](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39969241809), [39979511916](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39979511916), [39993081595](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39993081595), [39996805900](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39996805900), [40006260061](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40006260061), [40014093546](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40014093546), [40033135757](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40033135757), [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173), [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021) (25 runs; a case counts only the runs in which it existed. `39917207104`, `39923528658` are red and `39926461664`, `39934300578`, `39941365044` were cancelled as a whole: only their jobs that ended green count, plan D72).

Invalid trials and reruns (Task 1): `P6-MED-RACE-005` 1 invalid trial, 1 rerun; `P6-MED-RACE-014` 3 invalid trials, 3 reruns; every other Phase 2 case 0, and runs A and B 0. The Twenty histograms record `verdict: "fail"` because the Twenty runner
never sets the field (follow-up X9); the tests read the trials, and the jobs are green.

Error-contract tests (no trial count; one deterministic run per job):

| Test                                             | Job               | Runs A and B                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-DOC-001` (2 tests)                       | `documenso-smoke` | both expected failures in A ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173/job/120699991412)) and B ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021/job/120706503810))           |
| `P6-OBS-TW-001` (8 hang tests, 2 resource tests) | `twenty-obs`      | 8 expected failures and 2 passes in A ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173/job/120699991564)) and B ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021/job/120706503795)) |

### Phase 2 status

Phase 2 of the master plan is **done**. The cases are evidenced from `main` runs; the closeout runs are A and B above.
`P6-MED-RACE-006` is in "Later" (no gift-card route at the pinned Medusa). Open product bugs: the Phase 2 rows of "Known
product bugs".

## Phase 3 (next)

1. `P6-MED-RACE-002` and `P6-MED-RACE-003`: two Medusa backends on one database. `-002` uses a Redis lock; `-003`
   characterizes the in-memory lock. The harness `v0.2.14` starts and stops a second Medusa backend
   (`MEDUSA_SECOND_BASE_URL`) and registers a Redis lock (`MEDUSA_LOCK=redis`); the races are Task 2. The input spec is in
   the [Task 8 probe report](docs/plans/2026-10-24-p6-phase2-task8-med-multi-instance.md) §5 (harness proposal H3). Not run
   in Phase 2.

   `-003` is a **characterization**, not a product bug: the in-memory lock is expected to oversell across two backends,
   and the case records that and asserts the hard invariants. The CI job `medusa-multi-instance` runs one leg per lock
   (`redis` for `-002`, `memory` for `-003`).

   Run two Medusa backends locally (timings on a cloud VM prove the test works; they are never published):

   ```bash
   export PATH="/usr/local/bin:$PATH"
   MEDUSA_REDIS=1 MEDUSA_LOCK=redis MEDUSA_SECOND_BASE_URL=http://127.0.0.1:9001 npm run up:medusa
   npm run race:medusa -- --grep "P6-MED-RACE-002"
   npm run down:medusa   # always; switching the lock mode needs a down first
   ```

## How to read a LOAD run

A LOAD run (`P6-X-LOAD-*`) writes `results/load/<case>/<run id>/` with one `k6-<label>-summary.json`, one `k6-<label>.json.gz`
(points) and `k6-<label>.log` per k6 process, the `k6-config.json` the run used (no secrets), and `verdict.json` (schema 1).
Every LOAD run is labelled **functional load, not capacity** (D1): the rate is small, fixed and chosen by its probe; no latency
number from it is a published result; the label above applies.

The outcome is one of four words: `PASS`, `FAIL` (a product or test bug, or a k6 exit code that differs from the expected one),
`INVALID` (the run is not a measurement; a reason is listed) or `ENV` (setup failed before any load). Exit codes are 0, 1, 2 and 3
in the same order. An INVALID run never hides a FAIL.

The self-test `P6-X-LOAD-001` runs three k6 processes against one stub: an open model at the planned rate, a closed model and an
under-sized open model. Six relations (R1 to R6) must hold; they show the coordinated omission the open model avoids. Its margins
are in `src/load/co-relations.ts`.

A run is **VALID** or **INVALID** before any pass or fail is read. It is INVALID when the measuring tool or the runner was the bottleneck:
iterations were dropped, the VUs were exhausted, k6 used more than half the cores, the runner was over 85 % busy or memory fell
under 10 %, the telemetry had a gap, or the clocks drifted (the reason codes are listed in `verdict.json`). INVALID is not a pass and
not a fail, and it never hides a correctness failure. Each run also writes `run-meta.json` (where and with what it ran); only a
GitHub Actions run on `main` with a known image may be published, and INVALID runs are excluded from medians (P6-RULE-005).
The self-test `P6-X-LOAD-004` checks both sides: a normal run must be VALID and a saturated run must be INVALID with the expected codes.

Each k6 run also has a sampler outside the generator (one row per second: the application process group's CPU, RSS and fds, and
the sampler's own cost) and a clock marker. `chart-<label>.html` is one self-contained page per run: requests per second, p95 (info
only, not a result; no latency gate in Phase 3), the generator and app-group CPU, memory, fds, the sampler cost and the gaps. A gap
longer than two intervals or a clock skew beyond 100 ms makes the run INVALID (`telemetry_gap`, `clock_skew`). Database, container
and log sources are not part of this build: the stub has none, and they are added with the product cases.

Standalone commands (not in CI):

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/install-k6.sh                  # the pinned k6 (.k6-version), checksum-verified
npm run load:selftest                       # P6-X-LOAD-001, PR profile, about 1.5 min
npm run load:validity-selftest              # P6-X-LOAD-004, about 1 min
npm run load:telemetry-selftest             # P6-X-LOAD-002, about 1.5 min
npm run load:overhead-selftest              # P6-X-LOAD-006, about 3 min
npm run load:medusa-conservation -- --profile pr   # P6-MED-LOAD-002, inventory conservation (stock runs out), about 1.5 min, needs the Medusa stack up
node scripts/load/run-load.ts --case P6-X-LOAD-001 --profile full --out results/load
node src/load/stub-server.ts 18080 25 1500 10000   # a stub by hand: port, serviceMs, stallMs, periodMs
```

Numbers from a cloud session or a laptop only prove that a test works. Published numbers come from GitHub Actions only (median of
at least 3 valid runs, P6-RULE-005), each with its `run-meta.json` (P6-RULE-003, Task 4).

## Rule for numbers

Published performance numbers come only from CI runs (GitHub Actions or a dedicated machine),
reported as the median of at least 3 runs. Local and cloud-agent runs only prove a test works.

The master plan is in [docs/master-plan.html](docs/master-plan.html).
