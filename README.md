# k6-load-concurrency-suite

P6 of the QA portfolio: load, concurrency and performance tests with [k6](https://grafana.com/docs/k6/)
against self-hosted products started by
[qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `v0.2.11`.

Phase 0 proved the harness and k6 smoke. Phase 1 is done: the race framework and the six race cases for
Medusa, Cal and Documenso (see "Phase 1 results" below). Every published number comes from a GitHub Actions run
on `main` (push, schedule or `workflow_dispatch`).

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
- Limits stop a runner that is too noisy. Reaching the per-trial cap, or spending the per-case budget, fails the case
  as **TEST BUG: runner too noisy**, with every attempt kept. The budget is
  `max(RACE_MIN_INVALID_BUDGET, ceil(trials × RACE_MAX_INVALID_SHARE_PCT / 100))` invalid attempts.

| Variable                     | Default | Meaning                                                                                              |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `RACE_MAX_SPREAD_MS`         | 5       | Largest spread, in ms, of a valid burst. Whole number, at least 1.                                   |
| `RACE_MAX_SPREAD_RERUNS`     | 3       | Reruns allowed per trial index (at most 4 bursts for one index). Whole number, at least 1.           |
| `RACE_MAX_INVALID_SHARE_PCT` | 20      | Invalid attempts allowed per case, in whole percent of `trials`, rounded up. Whole number, 0 to 100. |
| `RACE_MIN_INVALID_BUDGET`    | 2       | The budget never falls below this many invalid attempts. Whole number, at least 0.                   |

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
npm run smoke:cal
RACE_TRIALS=3 npm run race:cal
npm run down:cal                # always; it also stops the Cal web process
```

`bootstrap.sh` generates the secrets in the Cal product `.env` (never printed or committed).
Later `up:cal` runs reuse the Next.js build. The self-test writes `results/races/cal-self-test.json`
(gitignored); the harness log is `results/harness/cal-up.log`.

- `GET /pro/30min` not HTTP 200 → **PRODUCT BUG** (paste status and body start).
- A burst above `RACE_MAX_SPREAD_MS` is invalid and rerun (see "Rerun on spread"); too many → **TEST BUG**
  (runner too noisy).
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

### Known product bugs

Each bug is listed with its evidence. Where a `test.fail()` test exists, it turns red
("expected to fail but passed") once the bug is fixed, and is then removed.

| ID               | Severity | Upstream                                                                                                                                                                                  | What happens                                                                                                                                                                      | Test                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-CAL-001` | low      | [calcom/cal.diy#30375](https://github.com/calcom/cal.diy/issues/30375)                                                                                                                    | Concurrent identical-slot losers get 400 "An error occurred while querying the database." (Prisma `P2002` on the idempotency key, redacted) instead of 409                        | `cal-race-001-identical-slot.spec.ts`: `test.fail()` on the loser contract | [p6-39561220290-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39561220290-evidence.zip): `race-histograms-cal/P6-CAL-RACE-001.json` and `extra-loser-contract.json`                                                                                                                                                                                                                                                               |
| `P6-OBS-CAL-002` | high     | [calcom/cal.diy#30374](https://github.com/calcom/cal.diy/issues/30374)                                                                                                                    | Two overlapping bookings on one host are both ACCEPTED                                                                                                                            | `cal-race-003-overlap.spec.ts`: `test.fail()`                              | [p6-39563393657-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39563393657-evidence.zip): `race-histograms-cal/P6-CAL-RACE-003.json`                                                                                                                                                                                                                                                                                               |
| `P6-OBS-CAL-003` | low      | [calcom/cal.diy#30376](https://github.com/calcom/cal.diy/issues/30376)                                                                                                                    | A same-host, same-start request pair in the same millisecond collides on the booking `uid` (`Booking_uid_key`); the loser gets the redacted 400 instead of 409. No double booking | none (no `test.fail()`)                                                    | [p6-39563393657-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39563393657-evidence.zip): `cal-web-log/cal-web.log` (the `P2002` line) and `race-histograms-cal/P6-CAL-RACE-003.json` (`refusedTraceIds`); code: [`RegularBookingService.ts` L1267–1268 at `c2b7ac44`](https://github.com/Jayami123/cal/blob/c2b7ac44c66f24ffef1662b276f0653988a609a3/packages/features/bookings/lib/service/RegularBookingService.ts#L1267-L1268) |
| `P6-OBS-DOC-001` | low      | not filed (Phase 2)                                                                                                                                                                       | A wrong password or CSRF token on sign-in returns 500                                                                                                                             | none in CI yet (Phase 2 backlog)                                           | **Probe + code path.** Not a CI artefact. The Task 6 probe is the evidence until the Phase 2 CI test lands                                                                                                                                                                                                                                                                                                                                                                              |
| `P6-OBS-DOC-002` | medium   | [documenso/documenso#3187](https://github.com/documenso/documenso/issues/3187) (existing report; [our repro](https://github.com/documenso/documenso/issues/3187#issuecomment-6318151560)) | Two last recipients complete in parallel: double seal                                                                                                                             | `doc-race-001-last-recipients.spec.ts`: `test.fail()`                      | [p6-39563393657-evidence.zip](https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase1/p6-39563393657-evidence.zip): `race-histograms-documenso/P6-DOC-RACE-001.json`                                                                                                                                                                                                                                                                                         |

### Phase 1 status

Phase 1 of the master plan is **done**. The six cases are evidenced from `main` runs: `P6-MED-RACE-001`,
`P6-CAL-RACE-001`, `P6-CAL-RACE-002`, `P6-CAL-RACE-003`, `P6-DOC-RACE-001`, `P6-DOC-RACE-002`. Closeout runs:
[39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) and [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937). Open product bugs: the five above.

## Rule for numbers

Published performance numbers come only from CI runs (GitHub Actions or a dedicated machine),
reported as the median of at least 3 runs. Local and cloud-agent runs only prove a test works.

The master plan is in [docs/master-plan.html](docs/master-plan.html).
