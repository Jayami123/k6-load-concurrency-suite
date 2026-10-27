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
| `P6-OBS-DOC-005`         | medium                                       | not filed (draft below)                                                                                                                                                                   | a retried completion of one recipient seals the envelope twice: 2 seal jobs, 2 `DOCUMENT_COMPLETED` rows and 2 completion emails per recipient                                        | `P6-DOC-LOAD-007` (`knownBugs` in `src/load/cases.ts`; gate in `src/load/known-bug-gate.ts`)                                                    | CI runs 40134262533, 40135722015 and 40137277800 (full profile, 31 envelopes each, 31 of 31 duplicated; control `P6-DOC-LOAD-002` one seal per envelope in the same runs). Local: 2 runs, same signature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
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

### P6-OBS-DOC-005 (known issue, expected failure)

- **What happens.** A retried completion of the same recipient seals the envelope twice. Under the retry storm of `P6-DOC-LOAD-007`
  (first request 25 ms, then three identical `recipient.completeDocumentWithToken` requests), every envelope gets two
  `internal.seal-document` jobs about 0.3 s apart, two `DOCUMENT_COMPLETED` audit rows and two completion-email jobs. The
  same stack with no retries (`P6-DOC-LOAD-002`) gives one seal per envelope. The first recipient's seal path is not reached.
- **Trigger.** Concurrent retried completions of one recipient, not different recipients completing in parallel (that is `P6-OBS-DOC-002`).
- **Evidence.** CI runs [40134262533](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40134262533),
  [40135722015](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40135722015) and
  [40137277800](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40137277800), full profile: 31 of 31 envelopes
  with more than one seal job, 31 with more than one `DOCUMENT_COMPLETED` row, 62 of 62 recipients with more than one completion
  email; 62 first requests timed out and 217 retries sent per run; 0 5xx. Control `P6-DOC-LOAD-002` in the same runs: one seal per
  envelope, 62 of 62 emails matched.
- **Suspected area (read-only, in the Documenso fork at the pin; no edits).** `packages/lib/server-only/document/complete-document-with-token.ts`,
  `completeDocumentWithToken`. The recipient write is a conditional `updateMany` inside a transaction, so only one request
  transitions the recipient. The `internal.seal-document` trigger after the transaction is not tied to that winner, and the
  router maps the losing request to `ALREADY_SIGNED` (`packages/trpc/server/recipient-router/router.ts`). Which request enqueues
  the second seal is not yet shown by the evidence.
- **Removal condition.** When the product seals each envelope once, the gate of `P6-DOC-LOAD-007` fails with "known bug P6-OBS-DOC-005 is
  not observed". Then remove `P6-OBS-DOC-005` from the case's `knownBugs`, this row and this section, in the same PR as the fix.
- **Gate.** The verdict of the case is the gate (`src/load/known-bug-gate.ts`): the duplicate seal, the completed audit row and the
  duplicate emails are KNOWN BUG when observed. The gate fails the case if the bug is not observed, if any other violation appears,
  or if the storm checks or `retry-audit.json` are missing.

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

## Phase 3 results

Functional load, not capacity. The LOAD cases show that each product completes its profile with its checks passing. Phase 3
does not measure how much load a product can take.

The numbers are medians from three `main` dispatches per case, with one selected VALID attempt per case, all on `0b07594`
(the merge of #64):
[40177412186](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40177412186), [40178773022](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40178773022) and
[40180625279](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40180625279). Every selected attempt is PASS and VALID, and no iteration is dropped.
The `run-meta` links point at the release zip of run 40177412186; the zips of the other two runs are listed in the release
notes. The `p6-phase3` release is dispatched after this PR merges, so the links become valid then.

### Cal

| Case              | Runs (median of)          | Requests (median) | Dropped iterations | http p95 ms (median) | Label                         | run-meta                                                                                                                   |
| ----------------- | ------------------------- | ----------------- | ------------------ | -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `P6-CAL-LOAD-001` | 3 selected VALID attempts | 124               | 0                  | 77.12                | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |
| `P6-CAL-LOAD-007` | 3 selected VALID attempts | 152               | 0                  | 66.97                | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |
| `P6-CAL-LOAD-009` | 3 selected VALID attempts | 157               | 0                  | 120.30               | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |

### Medusa

| Case              | Runs (median of)          | Requests (median) | Dropped iterations | http p95 ms (median) | Label                         | run-meta                                                                                                                   |
| ----------------- | ------------------------- | ----------------- | ------------------ | -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `P6-MED-LOAD-001` | 3 selected VALID attempts | 272               | 0                  | 171.60               | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |
| `P6-MED-LOAD-002` | 3 selected VALID attempts | 185               | 0                  | 165.09               | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |
| `P6-MED-LOAD-006` | 3 selected VALID attempts | 343               | 0                  | 217.80               | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |

### Documenso

| Case              | Runs (median of)          | Requests (median) | Dropped iterations | http p95 ms (median) | Label                         | run-meta                                                                                                                   |
| ----------------- | ------------------------- | ----------------- | ------------------ | -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `P6-DOC-LOAD-001` | 3 selected VALID attempts | 281               | 0                  | 233.13               | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |
| `P6-DOC-LOAD-002` | 3 selected VALID attempts | 281               | 0                  | 230.11               | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |
| `P6-DOC-LOAD-007` | 3 selected VALID attempts | 467               | 0                  | 88.25                | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |
| `P6-DOC-LOAD-008` | 3 selected VALID attempts | 281               | 0                  | 232.38               | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase3/p6-40177412186-evidence.zip) |

Footnotes to the Medusa rows: in run 40178773022, `P6-MED-LOAD-001`, `P6-MED-LOAD-002` and `P6-MED-LOAD-006` each ran twice.
The first attempts of `-001` and `-002` PASSED and are used. The first attempt of `-006` FAILED with a TEST BUG (the retry
storm did not reach its threshold: 3 of 30 first attempts timed out); its second attempt PASSED and is used, by the owner's
decision. The excluded attempts are listed in the release notes.

The journey smoke medians in `k6/thresholds/smoke-p95.json` are the p95 values of `P6-CAL-LOAD-001` (77.12 ms),
`P6-MED-LOAD-001` (171.60 ms) and `P6-DOC-LOAD-001` (233.13 ms), from the same three runs.

Phase 3 replaced the master-plan Phase 3 ("k6 smoke and ramp for all products; `baseline.json`") with foundations and
correctness under load, and redefined the IDs as the Phase 3 roadmap (Note 5) describes.

### Carried into Phase 4: two Medusa backends

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

### Phase 4 (next)

The next phase is in [the Phase 4 roadmap](docs/plans/2026-10-22-p6-phase4-roadmap.md).

## Phase 4a results

Knee ranges, steady baselines and spike recovery, measured in CI. These are knee ranges on the runners of these runs: each
range is where the stop rule fired, not a figure a product can be promised. The full notes are in
[docs/releases/p6-phase4a.md](docs/releases/p6-phase4a.md), and the evidence is on the
[`p6-phase4a` release](https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase4a) (nine zips and `SHA256SUMS.txt`).

All nine runs are `knee.yml` dispatches on `main` at `efc2f7b` (the merge of PR #85), and each concluded `success`. Every case
verdict is VALID.

| Mode   | Runs                                                                                                                                                                                                                                                                                           | Cases                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| knee   | [40290101719](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40290101719), [40291101493](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40291101493), [40291950598](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40291950598) | `P6-CAL-LOAD-005`, `P6-MED-LOAD-004`, `P6-DOC-LOAD-005`                                             |
| spike  | [40293082174](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40293082174), [40294541228](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40294541228), [40295754821](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40295754821) | `P6-CAL-LOAD-004`, `P6-MED-LOAD-003` (with `P6-MED-LOAD-010`), `P6-DOC-LOAD-004`, `P6-DOC-LOAD-009` |
| steady | [40296658253](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40296658253), [40296661816](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40296661816), [40296665884](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40296665884) | `P6-CAL-LOAD-003`, `P6-MED-LOAD-002`                                                                |

**Knee ranges** (iterations per second, one row per run): Cal 8 to 10, 8 to 10 and 12 to 14; Medusa 1.5 to 2 in all three; Documenso
4 to 5 in all three. The Cal and Medusa ranges fall inside their committed bounds in `k6/thresholds/knee-bounds.json`. Documenso has
no committed bound in this release.

**Steady p95** (ms, three runs): `P6-CAL-LOAD-003` 92.7, 81.4 and 60.9 against a band of 54.1 to 82.6; `P6-MED-LOAD-002` 236.3, 242.7
and 236.4 against a band of 214.5 to 220.8. The Medusa shift is repeatable; its cause is not established.

**Spike recovery** (seconds): `P6-CAL-LOAD-004` 48, 28 and 28; `P6-MED-LOAD-003` 58, 38 and 58; `P6-DOC-LOAD-004` not reached in the
watch period in run 1, then 140 and 169. `P6-DOC-LOAD-009` passes in all three runs.

The knee stop rule is a property of the run's environment, not a gate on the product. Limitations (fast stop, first saturated
resource before the stop, the 5 s spike start guard, and harness state under `results/harness`) are listed in the release notes.

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
npm run load:documenso-pipeline -- --profile pr   # P6-DOC-LOAD-002, pipeline lag: every stage once, within 30 s, needs the Documenso stack up
npm run load:documenso-webhook-retry -- --profile pr   # P6-DOC-LOAD-008, the receiver answers 500 once per event; Documenso must retry
npm run load:cal-retry -- --profile pr   # P6-CAL-LOAD-007, a booking retried after a 35 ms client timeout, needs the Cal stack up
npm run load:cal-link-retry -- --profile pr   # P6-CAL-LOAD-009, the same retries with one cap-1 private link per intent (the prior links are restored)
npm run load:medusa-retry -- --profile pr   # P6-MED-LOAD-006, the complete request retried after a 100 ms timeout, needs the Medusa stack up
npm run load:documenso-retry -- --profile pr   # P6-DOC-LOAD-007, the completion retried in parallel after a 25 ms timeout, needs the Documenso stack up
node scripts/load/run-load.ts --case P6-X-LOAD-001 --profile full --out results/load
node src/load/stub-server.ts 18080 25 1500 10000   # a stub by hand: port, serviceMs, stallMs, periodMs
```

**How the Documenso pipeline check matches emails (P6-DOC-LOAD-002).** Each completed document must produce one completion email per
recipient. The signing request carries the header `X-Documenso-Envelope-Id`, but the completion email has no envelope header. Its link
is `/sign/<token>/complete`, and the token is the recipient's own (`Recipient.token`). The stage reads each recipient mailbox in
Inbucket, takes the token from the completion link, and joins it through `Recipient.token` to the envelope. Only messages whose token
belongs to a run recipient count. A missing or duplicated completion email is a PRODUCT BUG. The evidence of the join is in
`docs/handoff/2026-10-24-documenso-email-fields.md`. Tokens are used in memory only and never written.

**Retry storms (P6-CAL-LOAD-007, P6-CAL-LOAD-009, P6-MED-LOAD-006, P6-DOC-LOAD-007).** One intent is one logical request. The client
gives up after a short timeout (`k6/lib/retry.js`), so the server finishes a request the client never sees, and the same body is sent
again. Each case then checks that the storm happened (at least half of the first attempts timed out, `src/load/retry-validity.ts`) and
that the side effects happened once per intent: one accepted Cal booking (one cap-1 link per booking in `-009`), one Medusa order with
one payment and stock taken once, one Documenso seal, one `DOCUMENT_COMPLETED` row and one completion email per recipient. A Cal
redacted 400 (`P6-OBS-CAL-001`) and a 409 are counted, not failures. The retry audit is written to `retry-audit.json` of each run (the reconcile audit keeps `audit.json`).

Numbers from a cloud session or a laptop only prove that a test works. Published numbers come from GitHub Actions only (median of
at least 3 valid runs, P6-RULE-005), each with its `run-meta.json` (P6-RULE-003, Task 4).

## Run a Cal knee

`npm run load:cal-knee -- --profile full` runs P6-CAL-LOAD-005, the Cal booking knee, against a Cal stack that the harness starts
(`npm run up:cal`, stopped with `npm run down:cal`). Setup reads the free slots once: a supply shorter than the plan needs stops the run
before any load, as a TEST BUG. The plan comes from environment variables, and empty means the profile's default: `full` is 2 iterations
per second, +2 per step, 30 s holds, 9 steps; `pr` is 2, +2, 12 s holds, 3 steps. The ramp before each hold is 2 s. Rates are iterations
per second with one decimal, at most 100; the planned iterations are at most 5,000.

The GitHub Actions job is `knee.yml`, dispatch only, and it must be dispatched from `main`. Its inputs are `start_rate`, `step_rate`,
`hold_sec` and `max_steps`; each one left empty takes the default above. The run's results are uploaded as the `knee-cal` artifact:
the knee table in the job summary, `knee-report-<label>.json` and `.md`, and the run's `run-meta.json`. A stop is a result, not a
failure: exit 0 and exit 99 both pass the run. The knee range is a property of the environment that ran it, so the report carries that
label with the range.

## Run a Medusa knee

`npm run load:medusa-knee -- --profile full` runs P6-MED-LOAD-004, the Medusa checkout knee, against a Medusa stack that the harness
starts (`npm run up:medusa`, stopped with `npm run down:medusa`). The journey is the checkout of P6-MED-LOAD-001: browse, cart, line item,
address, shipping, payment, complete. The stock is sized from the plan, so a stock-out never ends a run, and a refusal is never read as
saturation. The plan comes from the environment, and empty means the profile's default: `full` is 0.5 orders per second, +0.5 per step,
30 s holds, 8 steps; `pr` is 0.5, +0.5, 10 s holds, 3 steps. The ramp before each hold is 2 s. The stop limit is ten times the
P6-MED-LOAD-001 p95 reference from `k6/thresholds/smoke-p95.json`.

The GitHub Actions job is `medusa-knee` in `knee.yml`, dispatch only, and it must be dispatched from `main`. It runs the production build
with the in-memory lock and the fake Redis, one backend, which the report's environment line states. Its results are uploaded as the
`knee-medusa` artifact, staged under `load-medusa/` so the release scan allows the publishable key there.

## Run a Documenso knee

`npm run load:documenso-knee -- --profile full` runs P6-DOC-LOAD-005, the Documenso signing knee, against a Documenso stack that the
harness starts (`npm run up:documenso`, stopped with `npm run down:documenso`). Each iteration creates an envelope with two signers,
signs and completes it. Its seal lag is measured per hold window: a completed document is placed in the step of its last signature,
and the table gives the seal lag percentiles of each step beside the HTTP stop. A document still unfinished at the end is judged per
intent, not as a missing seal. The plan comes from the environment, and empty means the profile's default: `full` is 1 signing
journey per second, +1 per step, 30 s holds, 8 steps; `pr` is 1, +1, 12 s holds, 3 steps. The stop limit is ten times the
P6-DOC-LOAD-001 p95 reference from `k6/thresholds/smoke-p95.json`.

The GitHub Actions job is `documenso-knee` in `knee.yml`, dispatch only, and it must be dispatched from `main`. The job runs the
"Documenso production build, jobs in the web process, rate limits bypassed" environment. Its results are uploaded as the
`knee-documenso` artifact, with the pipeline lag file and the audit beside the knee report.

## Steady baselines

`npm run load:cal-steady` and `npm run load:medusa-steady` run the steady cases (`P6-CAL-LOAD-003`, `P6-MED-LOAD-002`) at 50 % of the
knee lower bound in `k6/thresholds/knee-bounds.json`, for 120 s. A missing bounds file ends the run with ENV (exit 2). The steady
runs are dispatched from `main` with `knee.yml` and `mode: steady`; the results are the `steady-cal` and `steady-medusa` artifacts.

The band in `k6/thresholds/baseline-band.json` is the spread over the VALID steady runs (min, median and max). It is a record, not
a gate: no k6 script reads it. The window p95 is taken over 10-second windows of the hold that have at least 40 requests, from the
per-second p95s of the points file. A window max can come from one slow second.

| Product         | Rate (iter/s) | Runs | p95 ms (min / median / max) | Window p95 ms (min / median / max) | Error rate | HTTP req/s (median) | Environment                     | Run ids                               |
| --------------- | ------------- | ---- | --------------------------- | ---------------------------------- | ---------- | ------------------- | ------------------------------- | ------------------------------------- |
| P6-CAL-LOAD-003 | 4             | 3    | 54.1 / 79.8 / 82.6          | 49.8 / 80.9 / 234.3 (33 windows)   | 0          | 8.0                 | ubuntu24 20261023.334.3, 4 vCPU | 40242002499, 40242007346, 40242009224 |
| P6-MED-LOAD-002 | 0.7           | 3    | 214.5 / 220.6 / 220.8       | 217.6 / 228.7 / 314.2 (15 windows) | 0          | 4.2                 | ubuntu24 20261023.334.3, 4 vCPU | 40242002499, 40242007346, 40242009224 |

## A/A noise and the tolerance

An A/A set measures how much a product's steady numbers move on the same runner with the same code. `gate.yml` (dispatch only, from
`main`, input `product`: `cal`, `medusa` or `all`) runs one discarded warm-up arm and three counted arms per product, all on one
stack, each the 120 s steady case (`P6-CAL-LOAD-003`, `P6-MED-LOAD-002`) at the rate of `steadyRateFor`. The results are the
`aa-cal` and `aa-medusa` artifacts. An arm that is INVALID is shown in the job summary and is not counted.

Per product and metric (`p50Ms`, `p95Ms`, `requestsPerSec`) the rule takes the run-level values of the three counted arms and
computes the relative spread `S = (max − min) / median`. The tolerance is `T = max(0.10, 2 × S)`: the floor of 10 % stops a lucky
set from making the gate hair-trigger, and the factor of 2 is the margin for the sampling error of a range of three. A regression
is called only above `T`. Only the steady profile sets a tolerance; a knee arm or a wrong-rate arm is refused.

`scripts/write-tolerance.ts` writes `k6/thresholds/tolerance.json` from the downloaded counted arm folders, one folder per arm:

```text
node scripts/write-tolerance.ts --release p6-phase4b --out k6/thresholds/tolerance.json \
  cal=<dir>,<dir>,<dir> medusa=<dir>,<dir>,<dir>
```

It exits 2 when a product has fewer than three VALID steady arms, and it writes nothing. The tolerance file is written and committed
by its own pull request after the A/A dispatches, with its run ids. Until that file exists, no gate may name a tolerance: the
`P6-RULE-004` tests in `tests/unit/gate-rule-004.test.ts` fail if a workflow does.

## Soaks

`soak.yml` runs the soak cases `P6-CAL-LOAD-008`, `P6-MED-LOAD-005` and `P6-DOC-LOAD-006` at the steady rate of each product's
knee lower bound, for `duration_min` minutes (30 or 120). It is dispatch-only and must be dispatched from `main`. The job of each
product sets up its stack, runs the case with `--profile soak`, and uploads the results as `soak-<product>-<minutes>` (kept 90 days).
A run without `SOAK_DURATION_MIN` of 30 or 120 ends with ENV (exit 2) before setup.

Each run writes `soak.json` next to `verdict.json`. It holds the statistics of RSS, open fds and pg connections over the telemetry
after warm-up (the warm-up is the larger of 300 s and 20 % of the soak): the least-squares slope, the Theil–Sen slope, the number of
steps, and the plateau ratio (last third against middle third). The points are not published.

The soak verdict has this precedence: TEST BUG (setup or slots ran out), INVALID (a telemetry gap or dropped iterations), FAIL (the
audit, or a threshold in `k6/thresholds/soak-bounds.json`), NO THRESHOLD YET (no entry for the product yet), then PASS. Growth counts
as a FAIL only when both slopes are positive, so one step cannot make a leak.

## Cal invariants under load

`perf.yml` job `cal-invariants` (schedule, and a full dispatch) runs two Cal invariants on a live stack: `P6-CAL-LOAD-002` (one free slot,
N = 8 simultaneous bookings, fired inside a steady stream at 40 s) and `P6-CAL-LOAD-006` (one booking, then `getSchedule` polled every
2 s for 60 s). Each run writes `burst.json` or `stale.json` next to `verdict.json`.

The burst passes only with exactly one ACCEPTED on the slot. Two or more, or any 5xx, is a FAIL (PRODUCT BUG, suspected until repeated).
Any dropped iteration, a request-start spread above 100 ms, or a missing attempt is INVALID. Redacted 400 responses are counted under
`P6-OBS-CAL-001`, not failures.

The stale read uses the contract "never offered again after commit": the cache is inactive in CI, so the verdict reads
`PASS (sampled, 2 s)` when no poll after the commit offers the slot. A 2 s poll is a sample; the verdict does not claim full coverage.

## Documenso exactly-once under load

`perf.yml` job `documenso-invariants` (schedule, and a full dispatch) runs `P6-DOC-LOAD-003` on a live Documenso stack: a sequential
stream at 2 signings per second (50 % of the committed Documenso knee lower bound), and a concurrent pair stream at 0.2 per second
(`pairShare` 0.1, in addition). In a pair, the last two recipients of one document complete in one batch, at the same moment.

The sequential share must be exact on every document: one completed seal job, one completion audit row, one webhook call with the
document's payload, and one completion email per recipient. Any other count is a FAIL (PRODUCT BUG, suspected until repeated). The
pair share is counted, not hidden: a document with a duplicate seal or audit row is counted under `P6-OBS-DOC-002` by its pair key
(`<document id>:<pair index>`), and the run reads `PASS (P6-OBS-DOC-002 counted)` when only that known race appears. Webhook exactness
is checked on the sequential share only; a pair's webhook calls are not in the accounting.

Any dropped iteration, a missing iteration row, or an unmatched completion token is INVALID. A setup or drain failure is a TEST BUG.

**Not built yet:** the exactly-once verdict (`classifyExactlyOnce`, `src/load/doc/exactly-once.ts`) has no caller. The job runs the
case, which reconciles with the pipeline check of `P6-DOC-LOAD-002` until the reads that feed the verdict are wired. Until then the job
does not report an exactly-once verdict, and the pair counts are not in its summary.

## Medusa invariants under load

Three Medusa cases check the invariants of the steady checkout stream at 0.7 orders per second (`rate` 7 per 10 s, the
`timeUnitSec: 10` form of the open model). Each one is a k6 script with a config file; the verdicts are written by the runner.

- `P6-MED-LOAD-007` (`k6/cases/med-load-007.js`): two Medusa instances on one database and one Redis lock. Checkouts alternate between
  the two by iteration parity (`k6/lib/pure/instance.js`), and every request carries an `instance` tag. The conservation audit reads
  the database, not the instances: orders at most stock, one order per cart, reservations equal live orders, one payment per order, and
  both instances served requests. A zero count for one instance is a TEST BUG.
- `P6-MED-LOAD-008` (`k6/cases/med-load-008.js`): a promotion on a deterministic share of carts (`promoShare`, 0.5, by `shareHit`). The
  ledger clauses are redemptions within the budget, balances at zero or more, and debits equal the balance change. The gift-card clause
  stays PENDING (no route at the pinned Medusa ref).
- `P6-MED-LOAD-009` (`k6/cases/med-load-009.js`): every 10th order gets a second cancel and every 20th a cancel and a fulfilment at the
  same moment, both sent with `http.batch` (`raceFor`). Exactly one terminal transition per order is expected. The known double-terminal
  states are counted as X04 (a double cancel with more than one cancel effect) and X05 (a cancel against an open fulfilment), and any
  other double terminal state is a FAIL (PRODUCT BUG).

The admin token for `-009` arrives in the environment (`MEDUSA_ADMIN_TOKEN`), never in the config file.

Status: the three cases are registered in `src/load/cases.ts` with their verdict stages (`src/load/med/invariant-stages.ts`). They run
in the `medusa-invariants` job of `perf.yml` (schedule and full dispatch only). The stages read the stored state after the drain and
judge it with the pure checks. The first live dispatch is the probe of record for their SQL (decisions D40 to D43 in the progress log).

## How to read a knee

A knee run (`P6-X-LOAD-*` with a `knee` plan) holds a set of steps. Step i runs at a fixed rate for a fixed hold, with a short ramp
before each hold, and k6 stops the run as soon as a step trips the stop rule: the non-conflict error rate above 1 % or the step's
p95 at or above 10 times the journey-smoke p95 (D2). The rates are iterations per second with one decimal.

The verdict is one of three words:

- **KNEE**: a stop step exists and nothing invalidated the run. The knee is **between step s and step s+1**, where s is the last clean
  step, and the report prints both rates (for example "between 171 and 191 iterations/s").
- **NO_KNEE**: the plan ended without a stop. The knee is above the last step; the report prints that step as a lower bound
  ("no knee up to step N (rate R)"), and the run is INVALID for the knee (`no_knee`).
- **INVALID**: a clean step fell short of its plan by more than max(2, 3 %) of the planned iterations (`dropped_iterations`), the
  generator was the limit, or the run was not measured as planned. A stop at step 0 is a plan error (the start rate is too high), not a range.

The **first saturated resource** names the limit that the telemetry shows first, by a fixed rule (`src/load/knee/first-saturated.ts`):
the application process group's CPU (judged per step against the run's peak, and at least 0.9 cores), the host CPU, database waiting
sessions and connections, database CPU, application file descriptors, or a probe that slows ten-fold. A resource that the telemetry
cannot read is listed as absent and is never named. `none_observed` means no listed resource saturated; it is not a claim about the
product.

**Known limitation.** The stop step may have no telemetry sample after the 2-second edge trim, when the stop comes less than 2 s into the
hold. The first saturated resource is then taken from the steps observed before the stop, and the report must say so.

The stop rule is **not a gate**. It finds the range; it never passes or fails a product. A knee range is a property of the run's
environment (`label: knee range, environment-bound`). The published form states the range, the stop rule that tripped, the first
saturated resource, and the environment, with the run's `run-meta.json` link; it is only written for a KNEE on `main` in GitHub Actions.
The words "not capacity" apply to every LOAD run, and a knee range is also not capacity.

Commands (not in CI for the product knees yet):

```bash
npm run load:knee-selftest -- --profile pr   # P6-X-LOAD-021, stub only, about 3 min; checks the range and the first saturated resource
```

The self-test runs three k6 processes against two stubs (a 5 ms CPU-bound stub and a delay stub): the knee, an under-sized
generator (INVALID with `dropped_iterations`) and a plan without a stop (INVALID with `no_knee`). Its expected range is the measured
one in `src/load/cases.ts` (`expect`), with the reasoning in the Task 1 plan, section 9A.

## Dashboard

The evidence is shown on a static page built from the release artefacts (`scripts/dashboard/build-site.ts`, published by `.github/workflows/pages.yml` after each evidence release). Each showcase states what it proves.

- **Knee chart with the first saturated resource.** This shows where each product's knee range sits and which resource gave first (rule in src/load/knee/first-saturated.ts). It proves the stop rule finds a range, not a single maximum: the range and the run IDs are the evidence, and the label is 'knee range, environment-bound'.
- **Soak leak check.** This shows the RSS, fds and connection slope after warm-up and the plateau verdict, with the DB growth reported separately. It proves that growth which does not plateau is flagged and that data growth is not read as a leak.
- **Two-instance Medusa conservation.** This shows that two Medusa backends on one database and one Redis lock sell no more units than stock, and that no cart becomes two orders (P6-MED-RACE-002 and P6-MED-LOAD-007). It proves the lock holds under two instances.

A showcase without its data is shown as pending, with the reason. INVALID runs are listed and never plotted.

## Rule for numbers

Published performance numbers come only from CI runs (GitHub Actions or a dedicated machine),
reported as the median of at least 3 runs. Local and cloud-agent runs only prove a test works.

The master plan is in [docs/master-plan.html](docs/master-plan.html).
