# P6 Phase 2 Task 4: Cal state races (`P6-CAL-RACE-006` to `-009`) + shared webhook receiver

Junior-engineer guide. Source: the roadmap's Task 4 section ([2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md),
"Task 4", D6, D7, D9, D12), the Task 3b plan as the structural model ([2026-10-23-p6-phase2-task3b-med-order-extras.md](2026-10-23-p6-phase2-task3b-med-order-extras.md)),
and [docs/BACKLOG.md](../BACKLOG.md) (no Cal item; the Task 3 Medusa item F-M2 is not this task). Branch:
`feat/2026-10-23-p6-cal-state-races`, cut from `origin/main` at `73db10f`. Rules: [agent-rules.md](../agent-rules.md).

Everything below marked **probe** comes from the live Cal web app on 2026-10-23 (section 3), pinned `CAL_REF` as built
by `scripts/bootstrap.sh`. Cloud timings prove a test works and are never published (roadmap, "Rules that hold for every
task below"); the CI numbers are the only published ones.

**Status of this plan.** First version: the plan commit `5ec8786`, stopped for review under rule 10. This version
records the owner's answers (section 0) and the step-0 probe (section 3.7), and is the one the build follows. The build
stops again after the first full-count CI runs, for the owner's labels (section 0, O6).

## 0. Owner answers (2026-10-23)

Recorded as given by the owner for this task. Each one is also listed with its section in section 14.

- **O1 (payload uid): answered by probe.** Confirmed by the step-0 probe (section 3.7): the booking uid is `payload.uid`
  in every delivery. No top-level `uid` exists.
- **O2 (increment timing): answered by probe, with one limit.** The booking row exists before the response, the usage
  counter already reads at its cap in every response, and a booking through an already-full link is still written (section
  3.7). So the counter does not gate the write. The exact order inside one request is not observable from outside; the code
  path says the increment runs after the row is written. Recorded as such.
- **O3 (signature): answered by probe.** With a secret set, Cal sends `x-cal-signature-256` = lower-case hex
  HMAC-SHA256 of the raw body keyed by the secret, with no `sha256=` prefix. The receiver must verify it (section 7.1).
- **O4 (password source): agreed.** Read from the fork's seed file at run time. Never printed, never committed.
- **O5 (job split and timeouts): decided.** No 90-minute timeout. The new cases run in a separate job,
  `cal-state-races`, following the Medusa precedent (`medusa-order-races`, `medusa-cancel-extras`): the same pins as
  `cal-smoke`, caches restored and never saved, its own `timeout-minutes`. `cal-smoke` gets no new steps and keeps its
  60-minute timeout. Time budget at 50 trials with reruns and setup for both jobs is in section 9. Each job must sit at
  least 10 minutes under its timeout.
- **O6 (labels): agreed.** F-C1, F-C2 and F-C3 stay SUSPECTED until **3 full-count CI runs** reproduce them. The owner then
  labels them. The build stops after those runs, for that decision. No `test.fail()` before then.
- **O7 (branch name): agreed.** `feat/2026-10-23-p6-cal-state-races`.
- **O8 (priorities): agreed.** `-008` P2, `-009` P1.
- **O9 (email gap): agreed.** Record the gap (D9); no harness change in this task.

## 1. Goal, scope and the cases covered

**Goal.** Prove two primitives on Cal:

- **Token single use** (`P6-CAL-RACE-006`, P1; `-008`, extra): a private link with `maxUsageCount = 1` admits one booking
  under N = 10 parallel bookings. `-008` is the same with a cap of 3 (the boundary above 1).
- **State-transition exclusivity with side-effect exactly-once** (`P6-CAL-RACE-007`, P1; `-009`, extra): confirm ‖ cancel
  on one PENDING booking ends in one state with one set of webhook side effects; confirm ‖ confirm gives one ACCEPTED
  booking and one confirmation webhook.

**In scope.**

1. Shared webhook receiver moved to `src/receivers/webhook-receiver.ts` with a pluggable secret check (its own commit,
   pure refactor). Documenso's behaviour and tests stay the same.
2. A Cal oracle (`src/cal/state-oracle.ts`), pure invariants (`src/cal/state-invariants.ts`), the Cal HMAC check, and
   unit tests.
3. Host session and private-link helpers (`src/cal/session.ts`, `src/cal/private-link.ts`) and unit tests.
4. A runner module for the four cases (`src/cal/run-state-case.ts`), so `src/cal/run-case.ts` (549 lines today) does not
   grow. Four Playwright specs under `tests/cal/races/`.
5. CI: a new job `cal-state-races` with the four cases, its own webhook host mapping and its own timeout. `cal-smoke` is
   unchanged (section 9, O5).
6. README rows and `docs/BACKLOG.md` items for the three SUSPECTED findings (section 4 D-C7).

**Out of scope.** Changing the Documenso run-case logic (only the import and the constructor call move), the
`P6-CAL-RACE-001`/`-003` specs, `MEDUSA_REF`, `CAL_REF`, the harness pin (`qa-portfolio-harness#v0.2.11`), the product
fork, the email half of `-007` (D9), and any `test.fail()` or PRODUCT BUG label (rule 13; section 4 D-C7).

**Cases and priorities.**

| Case ID           | Source                 | What it asserts (test) / what it records (suspected)                                                                          | Pri           |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `P6-CAL-RACE-006` | CAL06                  | 10 parallel bookings through a cap-1 link on distinct slots: suspected if accepted > 1 or usage ≠ 1                           | P1            |
| `P6-CAL-RACE-007` | CAL18                  | confirm ‖ cancel on a PENDING booking: suspected if the final state is not one terminal state, or both side-effect sets fired | P1            |
| `P6-CAL-RACE-008` | CAL06 (accepted extra) | the `-006` setup with cap 3: suspected if accepted > 3 or usage ≠ 3                                                           | P2 (proposed) |
| `P6-CAL-RACE-009` | CAL18 (accepted extra) | confirm ‖ confirm on a PENDING booking: suspected if the final state is not ACCEPTED or ≠ 1 `BOOKING_CREATED` webhook         | P1 (proposed) |

The priorities of `-008` and `-009` are proposals (roadmap: "their task plan proposes a priority"). `-009` is P1 because a
duplicated confirmation notification is the side-effect exactly-once primitive from the roadmap's primitive bar.

## 2. Assumptions the build depends on

Each assumption was checked on the live app in section 3. If one is false when the build runs, stop and report it (rule 9).

| #   | Assumption                                                                                                                      | Probe result                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | A private link can be created with a logged-in session and no DB write (tRPC `eventTypesHeavy/update`)                          | Yes: 200 in 1 of 1 creates; `HashedLink` row read back with `maxUsageCount` 1, `usageCount` 0 (section 3.2)                                                               |
| A2  | A booking uses the link only when the body also sets `hasHashedBookingLink: true`                                               | Yes: without the flag, 10 of 10 accepted and `usageCount` stayed 0; with the flag, `usageCount` reached 1 in 5 of 5 runs (section 3.3)                                    |
| A3  | Burst of 10 parallel bookings through a cap-1 link: exactly 1 accepted                                                          | **No** (the case's premise fails): 10 of 10 accepted in 5 of 5 runs, `usageCount` 1 (section 3.3). Suspected finding F-C1                                                 |
| A4  | Burst through a cap-3 link: exactly 3 accepted                                                                                  | **No**: 10 of 10 accepted, `usageCount` 3 (1 run, section 3.3). Suspected finding F-C1                                                                                    |
| A5  | The link's usage counter does not overshoot its cap                                                                             | Yes: `usageCount` ended at the cap in every run (1 and 3)                                                                                                                 |
| A6  | A booking with a link that does not exist is accepted (the link is ignored)                                                     | Yes, observed in the first probe run: 10 of 10 accepted with no link row (section 3.3, probe error note)                                                                  |
| A7  | Confirm of a PENDING booking: `POST` tRPC `bookings/confirm` by the host returns 200 and ACCEPTED                               | Yes: 200 `{"message":"Booking confirmed","status":"ACCEPTED"}`                                                                                                            |
| A8  | A second confirm of an ACCEPTED booking (sequential) is refused                                                                 | Yes: 400 `BAD_REQUEST`, "Booking already confirmed", no webhook                                                                                                           |
| A9  | Cancel of a PENDING booking via `POST /api/cancel` (csrf cookie + token) returns 200 and CANCELLED                              | Yes: 200 (2 of 2 runs); row `cancelled`                                                                                                                                   |
| A10 | Confirm ‖ cancel on one PENDING booking ends in one state with one side-effect set                                              | **No**: both calls 200 in 4 of 4 rounds, final `accepted`, and both `BOOKING_CREATED` and `BOOKING_CANCELLED` delivered (section 3.4). Suspected finding F-C2             |
| A11 | Confirm ‖ confirm on one PENDING booking yields one `BOOKING_CREATED` webhook                                                   | **No**: both 200 in 4 of 4 rounds, two `BOOKING_CREATED` deliveries. Suspected finding F-C3                                                                               |
| A12 | Webhook subscriptions can be created by the host session and deliver to `p6-webhook.test`, with no SSRF bypass env              | Yes: subscription 200; deliveries reached `p6-webhook.test:<port>` in every run (the Cal web process had no bypass variable)                                              |
| A13 | Trigger names: acceptance fires `BOOKING_CREATED`, pending creation fires `BOOKING_REQUESTED`, cancel fires `BOOKING_CANCELLED` | Yes (observed order in the sequential run, section 3.4). `BOOKING_CONFIRMED` is **not** a trigger in the enum (roadmap assumed it; contradiction C1)                      |
| A14 | No email is observable from the harness                                                                                         | Yes: only `qa-harness-cal-postgres-1` runs (`docker ps`). No mail catcher. The email half of `-007` is a recorded gap (D9)                                                |
| A15 | Free-slot supply for N = 10 distinct slots per trial × 50 trials                                                                | Yes: 317 free 30-minute slots in one 28-day window; 78 free 60-minute `tennis-class` slots in 14 days (section 3.5)                                                       |
| A16 | `up:cal` starts on this VM with the harness's own heap default                                                                  | **Not as shipped in this sandbox**: the first run exited 1 with a heap OOM (section 3.1). With a larger `NODE_OPTIONS` it exits 0. Environment finding, not a product bug |

## 3. Probe results (2026-10-23, live app)

### 3.1 Commands and exit codes

The probe scripts are not committed. They live in the session scratchpad (outside the repo) at
`/tmp/claude-0/-home-user-k6-load-concurrency-suite/b9275b5a-0827-55a9-a95a-887f382521a1/scratchpad/`
(`probe-cal-links.mjs`, `probe-cal-links-max3.mjs`, `probe-cal-confirm.mjs`, `probe-cal-race-rounds.mjs`, `probe-slots.mjs`).
They import the repo's helpers in `src/cal/` and `src/oracles/pg.ts`, and read the seeded host password from the fork's
seed file at run time; the value was never printed or written to the repo or this plan.

| Step                                                                                      | Exit code     | Note                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run up:cal` (attempt 1, `PATH` = `/usr/local/bin` first)                             | **1**         | ENV. The Next.js production build died with `FATAL ERROR: Ineffective mark-compacts near heap limit ... JavaScript heap out of memory` (`results/harness/cal-up.log`). Cause: section 3.1.1 |
| `npm run up:cal` (attempt 2, `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"`) | **0**         | "Cal web is up at http://127.0.0.1:3000/". Not timed.                                                                                                                                       |
| `GET /pro/30min`, `GET /api/csrf`                                                         | HTTP 200, 200 | 0.61 s for the page. csrf body `{"csrfToken":"<64 hex>"}` (value not recorded)                                                                                                              |
| Probe `probe-cal-links.mjs` (runs 1 to 5, see 3.3)                                        | 0, 0, 0, 0, 0 | Run 1 had the probe bug in section 3.3 and is kept as the first row of the table there                                                                                                      |
| Probe `probe-cal-links-max3.mjs`                                                          | 0             | cap 3 run                                                                                                                                                                                   |
| Probe `probe-cal-confirm.mjs`                                                             | 0 (2 runs)    | sequential confirm/cancel and webhook trigger names                                                                                                                                         |
| Probe `probe-cal-race-rounds.mjs` (`ROUNDS=4`)                                            | 0             | concurrent confirm‖cancel and confirm‖confirm                                                                                                                                               |
| Probe `probe-slots.mjs`                                                                   | 0             | slot supply                                                                                                                                                                                 |
| `docker ps` after the probes                                                              | —             | `qa-harness-cal-postgres-1 postgres:18` only                                                                                                                                                |
| `npm run down:cal`                                                                        | **0**         | Container and network removed. Afterwards `GET /pro/30min` returned HTTP 000 (no answer)                                                                                                    |

#### 3.1.1 The first `up:cal` failure (ENV, fixed in the shell only)

The sandbox sets `NODE_OPTIONS=--use-openssl-ca` (needed by the proxy CA). The harness adapter only applies its 8 GB heap
default when `NODE_OPTIONS` is unset (`node_modules/qa-portfolio-harness/dist/adapters/cal.adapter.js:67`:
`process.env.NODE_OPTIONS?.trim() || "--max-old-space-size=8192"`). So the sandbox lost the heap default and the build ran
out of memory at about 2 GB. The retry set `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"` in the shell. The
repo was not changed. CI does not set `NODE_OPTIONS`, so CI gets the 8 GB default. The harness behaviour is a harness
follow-up (H-heap, section 13), not a change in this task.

### 3.2 Routes, real statuses and bodies (one sample each)

- **Login** (NextAuth credentials, `POST /api/auth/callback/credentials`, form fields `csrfToken`, `email`, `password`,
  `json=true`): 200, body `{"url":"http://127.0.0.1:3000"}`, a session cookie set. `GET /api/auth/session` 200 with a user.
- **Create a link** (`POST /api/trpc/eventTypesHeavy/update?batch=1`, body `{"0":{"json":{"id":3,"multiplePrivateLinks":[{"link":"p6probe9b2f3403e710","maxUsageCount":1}]}}}`):
  200, body `[{"result":{"data":{"json":{"eventType":{"title":"30min", ...}}}}}]`. Row read back: `link` as sent,
  `maxUsageCount` 1, `usageCount` 0, `expiresAt` null.
- **Wrong path** `POST /api/trpc/viewer.eventTypes.update?batch=1`: 404 with an HTML page. The router is mounted per
  endpoint (`packages/trpc/react/shared.ts` `ENDPOINTS`); `update` lives in the heavy router, so the URL is
  `eventTypesHeavy/update`. (A probe mistake, corrected; kept as a learned fact.)
- **Delete all links** (same route, `multiplePrivateLinks: []`): 200. Row count afterwards 0.
- **Book through a link** (`POST /api/book/event`, body from `bookingBody` plus `"hashedLink": "<link>"` and
  `"hasHashedBookingLink": true`): 200, body starts `{"id":51,"uid":"eaU91PZWHfjpnm3H514NFT","idempotencyKey":"...","userId":4,"userPrimaryEmail":"pro@example.com", ...}`.
- **Cancel a booking** (`POST /api/cancel`, csrf cookie + token, `uid`): 200 (accepted and pending bookings).
- **Confirm** (tRPC `POST /api/trpc/bookings/confirm?batch=1`, body `{"0":{"json":{"bookingId":101,"confirmed":true,"emailsEnabled":false}}}`):
  first call 200, body `[{"result":{"data":{"json":{"message":"Booking confirmed","status":"ACCEPTED"}}}}]`; second call
  400, body `[{"error":{"json":{"message":"Booking already confirmed","code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,"path":"confirm"}}}}]`.
- **Webhook subscription** (tRPC `POST /api/trpc/webhook/create?batch=1`, `eventTypeId` 12 (`tennis-class`),
  `subscriberUrl` `http://p6-webhook.test:<port>/hook`, `eventTriggers` list, `active: true`, `payloadTemplate: null`,
  `secret: null`): 200, `id` a UUID. Delete (`webhook/delete` with `{"id": ...}`): 200.

### 3.3 Link bursts (N = 10 parallel bookings through one link, distinct free 30-minute slots)

| Run                         | Cap | Link on booking (`hasHashedBookingLink`) | Statuses (count of 200) | Accepted (DB) | `usageCount` after burst | Burst wall time                 |
| --------------------------- | --- | ---------------------------------------- | ----------------------- | ------------- | ------------------------ | ------------------------------- |
| 1 (probe bug: flag missing) | 1   | no                                       | 10 × 200                | 10            | 0                        | 1.31 s                          |
| 1 (flag set)                | 1   | yes                                      | 10 × 200                | 10            | 1                        | 1.12 s                          |
| 2                           | 1   | yes                                      | 10 × 200                | 10            | 1                        | 0.88 s                          |
| 3                           | 1   | yes                                      | 10 × 200                | 10            | 1                        | 0.99 s                          |
| 4                           | 1   | yes                                      | 10 × 200                | 10            | 1                        | 1.10 s                          |
| 5                           | 1   | yes                                      | 10 × 200                | 10            | 1                        | 1.02 s                          |
| 1                           | 3   | yes                                      | 10 × 200                | 10            | 3                        | 1.06 s (`probe-cal-links-max3`) |

What the probe proves: the link is enforced only by the counter. Every booking succeeded, the counter stopped at the cap,
and no loser response ever appeared (no 4xx). So the product accepts the 10 requests, then records the single use. The
probe does not show the order of the increment against the booking row. Code path (read, not run): the booking is
created, then `onBookingCreated` runs `updatePrivateLinkUsage` (`BookingEventHandlerService.ts:46`, method at `:58`);
it awaits `validateAndIncrementUsage`, whose failure is caught and logged there (`Promise.allSettled`), so it never
reaches the client. Open point O2 is answered in section 3.7 (the row is written before the response; a full link still writes).

The probe bug (run 1 with the flag missing) is kept on purpose: it shows the link is ignored without the flag (A2, A6),
and it is why the build must set `hasHashedBookingLink: true` (skeleton 7.4).

### 3.4 Confirm and cancel (PENDING bookings of `tennis-class`, event type 12, owner `pro`)

Sequential run (`probe-cal-confirm.mjs`): creating a pending booking returned 200 with status `pending`; confirm 200 and
`accepted`; second confirm 400 (no webhook); a second pending booking cancelled with `POST /api/cancel` 200 and `cancelled`.
Webhook deliveries in arrival order (one run, `trigger` from `body.triggerEvent`, body keys `triggerEvent, createdAt, payload`):

| Order | Action                    | Trigger received    |
| ----- | ------------------------- | ------------------- |
| 1     | create pending booking #1 | `BOOKING_REQUESTED` |
| 2     | confirm #1 (200)          | `BOOKING_CREATED`   |
| 3     | create pending booking #2 | `BOOKING_REQUESTED` |
| 4     | cancel #2 (200)           | `BOOKING_CANCELLED` |

The second confirm (400) fired no webhook.

Concurrent rounds (`probe-cal-race-rounds.mjs`, `ROUNDS=4`, each round a fresh pending booking, both calls fired together):

| Kind              | Responses (per call)       | Final status | Webhooks received per round            | Rounds |
| ----------------- | -------------------------- | ------------ | -------------------------------------- | ------ |
| confirm ‖ cancel  | confirm 200, cancel 200    | `accepted`   | `BOOKING_CANCELLED`, `BOOKING_CREATED` | 4 of 4 |
| confirm ‖ confirm | confirmA 200, confirmB 200 | `accepted`   | `BOOKING_CREATED`, `BOOKING_CREATED`   | 4 of 4 |

What the probe proves: the concurrent outcomes in the table happened in 8 of 8 rounds (the two kinds together). That is
SUSPECTED evidence, not CI evidence (rule 13). The delivery order is arrival order, not proven causal order, so the
oracle counts triggers and never relies on their order. The email half is not observable (A14).

### 3.5 Slot supply and timings (cloud VM, proof only; not published)

- Free 30-minute slots of `pro/30min` (event type 3), 28-day window from 2 days ahead: **317**.
- Free 60-minute slots of `pro/tennis-class` (event type 12), 14-day window: **78**.
- Probe timings: one 10-request burst 0.88 to 1.31 s; one `confirm`+`cancel` round not timed; `up:cal` second start not timed.
- The unit-test baseline on this branch: `npm run test:unit` = 391 tests, 391 pass, 0 fail (`# tests 391`, `# pass 391`).
- `npm run check` on this branch before the plan: exit 0 (format, actionlint, typecheck, k6 inspect, unit tests).

### 3.6 What the probe proves, and what it does not

- Proves: A1 to A16 (section 2) at the stated runs. Routes, bodies and statuses are real.
- Does not prove (after the step-0 probe, section 3.7): the per-trial time budget (section 9.2 uses planning assumptions,
  marked as such), the rates a CI trial count depends on (rule 13: full-count CI runs, section 9.4), and whether any finding is a
  PRODUCT BUG (all three stay SUSPECTED; section 4 D-C7).
- Does not prove: that any finding is a PRODUCT BUG. All of F-C1, F-C2, F-C3 stay SUSPECTED (section 4 D-C7).

### 3.7 Step-0 probe (owner O1 to O3, run before the build; 2026-10-23)

Script: `probe-cal-step0.mjs` in the scratchpad (outside the repo). It starts its own raw receiver that keeps each delivery's
headers and exact raw body, creates a webhook **with a random secret** (never printed), and records only booleans, value
shapes and lengths. Exit codes: `npm run up:cal` **0** (second start, with the heap value in the shell, section 3.1.1),
probe **0**, `npm run down:cal` **0** (`GET /pro/30min` afterwards: HTTP 000). A first version of the script contained a
stray booking call; it was removed before the run. No booking from that version reached the database.

| Check                                                                | Result (one run)                                                                                                                                                              | What it proves                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Webhook subscription with `secret`                                   | create 200, `id` found                                                                                                                                                        | a secret subscription is accepted                                                              |
| Deliveries received                                                  | 2: `BOOKING_REQUESTED` (pending create), `BOOKING_CREATED` (confirm 200)                                                                                                      | both triggers carry signatures                                                                 |
| O1: `payload.uid`                                                    | equals the booking uid in 2 of 2 deliveries; no top-level `uid`                                                                                                               | the oracle filters on `body.payload.uid`                                                       |
| O3: signature header                                                 | name `x-cal-signature-256` in 2 of 2; value 64 lower-case hex; equals hex HMAC-SHA256 of the raw body with the secret in 2 of 2; equals the `sha256=`-prefixed form in 0 of 2 | the receiver verifies `hmacSignatureCheck` as written (7.1), no prefix                         |
| Link create                                                          | 200                                                                                                                                                                           | A1 unchanged                                                                                   |
| O2 burst: 10 parallel bookings, cap 1                                | 10 of 10 HTTP 200; the booking row existed before the response in 10 of 10; the usage counter read **1** at each of the 10 responses                                          | the counter reaches its cap before any response is returned; the rows are written first        |
| O2 full link: one more booking after the burst (link already at cap) | HTTP 200, row written (`pending`), usage stays 1                                                                                                                              | the increment cannot gate the booking write: the booking is written even when the link is full |
| Cleanup                                                              | 12 live bookings of the run prefix cancelled, 0 errors; link cleared (200); webhook deleted (200)                                                                             | leak-check and cleanup routes work                                                             |

Notes that matter for the build:

- The burst in this probe used `tennis-class`, which requires confirmation, so its rows stayed `pending`. The `-006` and
  `-008` cases use `30min` (no confirmation), where section 3.3 showed `accepted`.
- O2 "timing": from outside the request the order inside one request is not observable. What is proven: the row is written
  before the response, the counter is at its cap before any response, and a full link does not stop a write. The code path
  (section 3.3) says the increment runs after the row. The cases do not depend on the exact order.

## 4. Design and decisions

Each decision gives the reason. "D-C" numbers are local to this plan (the roadmap's D numbers are global).

- **D-C1. Shared receiver first, as its own commit, as a pure refactor.** The roadmap asks for it, and the Cal CI job needs it
  before any Cal webhook case. A separate commit lets the Documenso smoke check see the move alone. The module moves with
  `git mv` so history follows the file. The test file is renamed to `tests/unit/receivers-webhook-receiver.test.ts`, so
  `tests/unit/` names follow the module path (the roadmap left this to the plan).
- **D-C2. The secret check is injected, not hard-coded.** `parseDelivery` takes a `SecretCheck` function, with two
  products' checks: `headerSecretCheck("x-documenso-secret", expected)` (current Documenso behaviour, unchanged) and
  `hmacSignatureCheck(secret)` for Cal (`x-cal-signature-256`, hex HMAC-SHA256 of the raw body, per the roadmap's pointer to
  `sendPayload.ts:316`). The reason: one receiver for two products without a product `if` inside the shared module.
- **D-C3. New cases run in their own module, `src/cal/run-state-case.ts`.** `src/cal/run-case.ts` is 549 lines, and the
  roadmap says the new cases should not grow it. The new file reuses the shared race helpers (rerun-on-spread, histogram,
  prefix, leak check) so the four cases keep the same histogram shape as Phase 1.
- **D-C4. Two runner shapes, one per product action.** `runLinkBurstCase` (cap parameter, serves `-006` and `-008`) and
  `runPendingRaceCase` (mode `confirm-cancel` or `confirm-confirm`, serves `-007` and `-009`). The reason: each case
  differs only in its setup and its oracle; the burst and the cleanup code are shared.
- **D-C5. Link creation uses the host session, not a DB write.** The probe proved a session-only tRPC route works (A1), and
  the roadmap requires "no DB writes" for setup. Reads still go through the read-only pool (rule: the oracle is read-only).
  Each attempt sets its own link and clears all links of the event type afterwards (`multiplePrivateLinks: []`), because the
  update call replaces the whole link list.
- **D-C6. The host password is read from the fork's seed file at run time.** The harness adapter already does this for the
  seeded API key (`cal.adapter.ts`, the comment "Recover it from scripts/seed.ts if skipped"). The reason: no new secret in
  CI, and nothing copied into the repo, the plan or a histogram. Alternative rejected: a `CAL_HOST_PASSWORD` CI secret
  (more moving parts; open question O4).
- **D-C7. The four cases record SUSPECTED lines and never fail CI in this task.** The probe reproduced the three behaviours
  (F-C1, F-C2, F-C3) in 5 of 5, 4 of 4 and 4 of 4 rounds, which is strong but not CI evidence. Rule 13 says SUSPECTED until
  repeated full-count CI runs reproduce it, then PRODUCT BUG. So: each case asserts only **test** guards (counters, setup,
  leak check, no thrown requests, no 5xx); product lines are returned as `SUSPECTED PRODUCT BUG: ... (F-C<n>)` and
  annotated `suspected-bug` (the Medusa pattern, `tests/medusa/races/med-race-013-cancel-burst.spec.ts`). A `labelled`
  array per spec starts empty. The owner labels a tag after 3 full-count CI runs (O6); then the line becomes an assertion (D54
  pattern). No `test.fail()` and no PRODUCT BUG label in this task.
- **D-C8. Expected behaviour is written down as the oracle, even though it is not yet asserted.** The oracle says what a
  correct product does (one accepted booking, one side-effect set). The suspected line says the observed value. When the
  owner labels the tag, the assertion is already written.
- **D-C9. Webhook counts are per booking, and only counts are asserted.** The receiver keeps every delivery; the oracle
  keeps those whose payload uid matches the booking's uid (O1), and counts triggers. Order is never asserted (section 3.4).
  Waiting: a quiet window of 1.5 s after the last delivery, capped at 8 s (`waitQuiet`, skeleton 7.5).
- **D-C10. Email is a recorded gap, not a workaround.** D9 applies: no mail catcher exists, so `-007` asserts webhook and DB
  only. The gap is written into the histogram's `oracle` record (`emailObservable: false`) and into README (step 7).
- **D-C11. Trials: 5 on PRs, 50 on main, nightly and dispatch** (roadmap D6, the same values as `-001`/`-003`). Rerun-on-spread
  uses the shared policy from `src/races/rerun-on-spread.ts` (Task 1), so no Cal-specific spread rule.
- **D-C12. Cleanup.** Each attempt cancels its own bookings (accepted or pending) with `cancelBooking` (proven: 200 for both
  states), clears its links, and the spec deletes its webhook subscription in `afterAll`. The leak check counts live
  bookings of the run prefix at the end (`caseLiveBookings`, the same as `-001`).
- **D-C13. No change to `CAL_REF`, the harness pin, or any product fork.** The probe ran on the built `CAL_REF`.
- **D-C14. The branch is `feat/2026-10-23-p6-cal-state-races`, as the owner asked, not `plan/...`.** Rules 1 and 10 name a
  `plan/` branch for the plan commit; the owner's instruction set the `feat/` name. Same decision as Task 3b (D3b-11).
  Recorded as a deviation in the closeout (section 16).

## 5. Oracle definitions (exact)

All are read-only queries through `createReadOnlyPool` (`default_transaction_read_only=on`).

- **Link state.** Row of `"HashedLink"` for `eventTypeId` and `link`: `usageCount`, `maxUsageCount`. Missing row = TEST BUG
  (the link was not created).
- **Accepted via this case.** Count of `"Booking"` rows with `status = 'accepted'` whose attendee email matches the case's
  attendee LIKE pattern (`caseLeakPattern`, so the case's own bookings only).
- **Booking status.** `"Booking".status` by id (`pending`, `accepted`, `cancelled`, ...).
- **Webhook side effects.** From the receiver: the deliveries whose `body.payload.uid` equals the booking's uid, counted by
  `body.triggerEvent` (O1, answered: `payload.uid`).
- **Loser statuses.** Every non-200 is a clean 4xx; a 5xx is a PRODUCT line (SUSPECTED, "5xx"); a `null` (thrown request) is a
  TEST BUG.

### 5.1 The four checks (pure, `src/cal/state-invariants.ts`)

- `checkLinkCap({ cap, accepted, usageCount })`: suspected F-C1 when `accepted > cap` or `usageCount !== cap` when
  `accepted >= cap` (the counter should reach the cap when the cap is reached) or `usageCount > cap`; test guard when
  `usageCount` is not a non-negative integer.
- `checkConfirmCancel({ finalStatus, createdCount, cancelledCount })`: suspected F-C2 when the final status is not
  `accepted` or `cancelled`, or when both side-effect sets fired (`createdCount > 0 && cancelledCount > 0`), or when the
  side effects do not match the final state (accepted with 0 `BOOKING_CREATED`, or cancelled with 0 `BOOKING_CANCELLED`).
- `checkConfirmConfirm({ finalStatus, createdCount, statuses })`: suspected F-C3 when `createdCount !== 1` (the roadmap's
  "one webhook delivery") or the final status is not `accepted`; test guard when a status is `null`.
- `checkStatusNotNull(statuses)`: test guard for `null` (thrown) requests, and a product line for any 5xx.
- `checkSignedDeliveries(deliveries)`: test guard. Every delivery must have `secretMatches` true (the Cal receiver verifies
  `x-cal-signature-256` with a per-run secret, 7.1). A delivery that fails the check is a TEST BUG line, not a product finding.
  Step-0 evidence: the signature matched in 2 of 2 deliveries (section 3.7).

## 6. Files

| Path                                                       | Change                                                                      | Purpose                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/documenso/webhook-receiver.ts`                        | **moved** to `src/receivers/webhook-receiver.ts`                            | Pluggable `SecretCheck` (7.1)                                                                                   |
| `src/receivers/webhook-receiver.ts`                        | **NEW (moved)**                                                             | `headerSecretCheck`, `hmacSignatureCheck`, `parseDelivery`, `startWebhookReceiver` (7.1)                        |
| `src/documenso/run-case.ts`                                | edit                                                                        | Import path (line 74) and `startWebhookReceiver` call: `check: headerSecretCheck("x-documenso-secret", secret)` |
| `tests/documenso/races/documenso-self-test.spec.ts`        | edit                                                                        | Import path (line 25 today; the roadmap says 29) and the constructor call (same rule)                           |
| `tests/unit/webhook-receiver.test.ts`                      | **moved** to `tests/unit/receivers-webhook-receiver.test.ts`                | Existing tests, new import path, `check` argument; +2 HMAC tests in step 2                                      |
| `src/cal/state-oracle.ts`                                  | **NEW**                                                                     | SQL constants and readers (7.2)                                                                                 |
| `src/cal/state-invariants.ts`                              | **NEW**                                                                     | Pure checks (5.1, 7.3)                                                                                          |
| `src/cal/session.ts`                                       | **NEW**                                                                     | `extractHostPassword` (pure) and `loginAsHost` (7.4)                                                            |
| `src/cal/private-link.ts`                                  | **NEW**                                                                     | `privateLinkId`, `multiplePrivateLinksBody`, `setPrivateLinks`, `clearPrivateLinks` (7.4)                       |
| `src/cal/run-state-case.ts`                                | **NEW**                                                                     | `runLinkBurstCase`, `runPendingRaceCase`, `waitQuiet` (7.5)                                                     |
| `tests/cal/races/cal-race-006-private-link.spec.ts`        | **NEW**                                                                     | `P6-CAL-RACE-006` (7.6)                                                                                         |
| `tests/cal/races/cal-race-007-confirm-vs-cancel.spec.ts`   | **NEW**                                                                     | `P6-CAL-RACE-007` (7.6)                                                                                         |
| `tests/cal/races/cal-race-008-private-link-cap.spec.ts`    | **NEW**                                                                     | `P6-CAL-RACE-008` (7.6)                                                                                         |
| `tests/cal/races/cal-race-009-double-confirm.spec.ts`      | **NEW**                                                                     | `P6-CAL-RACE-009` (7.6)                                                                                         |
| `tests/unit/receivers-webhook-receiver.test.ts`            | edit                                                                        | +2 tests for `hmacSignatureCheck` (7.7)                                                                         |
| `tests/unit/cal-state-invariants.test.ts`                  | **NEW**                                                                     | 7 tests for the four checks and the signed-delivery guard (7.7)                                                 |
| `tests/unit/cal-state-oracle.test.ts`                      | **NEW**                                                                     | 1 test: SQL constants are read-only (7.7)                                                                       |
| `tests/unit/cal-session.test.ts`                           | **NEW**                                                                     | 2 tests for `extractHostPassword` (7.7)                                                                         |
| `tests/unit/cal-private-link.test.ts`                      | **NEW**                                                                     | 2 tests for `privateLinkId` and `multiplePrivateLinksBody` (7.7)                                                |
| `.github/workflows/perf.yml`                               | edit (step 6): new job `cal-state-races` (section 9); `cal-smoke` unchanged | `cal-state-races` job, its artifacts and four race steps (9.1)                                                  |
| `README.md`                                                | edit (step 7)                                                               | Rows for the four cases, the receiver move, the suspected findings, the email gap                               |
| `docs/BACKLOG.md`                                          | edit (step 7)                                                               | Three items: F-C1, F-C2, F-C3 (labels and `test.fail()` after full-count CI)                                    |
| `docs/plans/2026-10-23-p6-phase2-task4-cal-state-races.md` | **NEW** (this file)                                                         | Plan, closeout notes at the end                                                                                 |

Not touched: `src/cal/run-case.ts`, `src/cal/api.ts`, `src/cal/oracle.ts`, `src/cal/payloads.ts`, `src/cal/invariants.ts`,
`tests/cal/races/cal-race-001-*.spec.ts`, `cal-race-003-*.spec.ts`, `scripts/`, `package.json`, `.env.example` (no new
variable: the password comes from the seed file, D-C6).

## 7. Code skeletons and build steps

Skeletons are the shape to write, not finished code: a junior engineer fills in the bodies and matches the surrounding
style (comment density, naming, `TEST BUG:` prefixes, `import type`). Each skeleton names the existing helpers it uses;
their paths were checked in this session (section 15 (b)).

### 7.1 `src/receivers/webhook-receiver.ts` (step 1, moved from `src/documenso/webhook-receiver.ts`)

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import http, { type IncomingHttpHeaders } from "node:http";

export type WebhookDelivery = {
  receivedAt: number;
  path: string;
  host: string;
  event: string | null;
  body: unknown;
  secretMatches: boolean;
};

/** Decides whether a delivery carries the subscriber secret. Pure. Never returns or logs the secret. */
export type SecretCheck = (headers: IncomingHttpHeaders, rawBody: string) => boolean;

/** Documenso: the secret comes back verbatim in one header. `null` expected means "no header". */
export function headerSecretCheck(header: string, expectedSecret: string | null): SecretCheck {
  return (headers) => {
    const got = headers[header];
    return expectedSecret === null ? got === undefined : got === expectedSecret;
  };
}

/** Cal: `x-cal-signature-256` is the hex HMAC-SHA256 of the raw body with the subscriber secret. */
export function hmacSignatureCheck(secret: string): SecretCheck {
  return (headers, rawBody) => {
    const got = headers["x-cal-signature-256"];
    if (typeof got !== "string") return false;
    const want = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
    const have = Buffer.from(got);
    return have.length === want.length && timingSafeEqual(have, want);
  };
}

/** Pure. */
export function parseDelivery(input: {
  headers: IncomingHttpHeaders;
  rawBody: string;
  check: SecretCheck;
  receivedAt: number;
  path: string;
}): WebhookDelivery {
  // body and event parsing: unchanged from src/documenso/webhook-receiver.ts
  // ...
  return {
    receivedAt: input.receivedAt,
    path: input.path,
    host: String(input.headers.host ?? ""),
    event,
    body,
    secretMatches: input.check(input.headers, input.rawBody),
  };
}

export async function startWebhookReceiver(opts: { publicHost: string; check: SecretCheck }) {
  const deliveries: WebhookDelivery[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      deliveries.push(
        parseDelivery({
          headers: req.headers,
          rawBody: raw,
          check: opts.check,
          receivedAt: Date.now(),
          path: req.url ?? "",
        }),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  // listen on 127.0.0.1:0, return { port, url, deliveries, waitForDeliveries, close } exactly as today
}
```

Step 1 commands: `git mv src/documenso/webhook-receiver.ts src/receivers/webhook-receiver.ts`,
`git mv tests/unit/webhook-receiver.test.ts tests/unit/receivers-webhook-receiver.test.ts`, then the two importers and the
moved test (its `parseDelivery` calls take `check: headerSecretCheck("x-documenso-secret", expectedSecret)`).

### 7.2 `src/cal/state-oracle.ts` (NEW, step 2)

```ts
import type pg from "pg";
import { selectRows } from "../oracles/pg.ts";

/** Link row of this event type. `link` is the case's own id, so no other row matches. */
export const LINK_STATE_SQL = `
SELECT "usageCount", "maxUsageCount"
FROM "HashedLink"
WHERE "eventTypeId" = $1 AND link = $2
`;

/** Accepted bookings whose attendee email matches the case pattern (LIKE). */
export const CASE_ACCEPTED_SQL = `
SELECT count(DISTINCT b.id)::int AS n
FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id
WHERE a.email LIKE $1 AND b.status = 'accepted'
`;

/** Status of one booking by id. */
export const BOOKING_STATUS_SQL = `
SELECT status::text AS status FROM "Booking" WHERE id = $1
`;

export async function readLinkState(pool: pg.Pool, eventTypeId: number, link: string) {
  // selectRows(...); return the single row or throw "TEST BUG: link row missing"
}
export async function readCaseAccepted(pool: pg.Pool, likePattern: string): Promise<number> {
  /* ... */
}
export async function readBookingStatus(pool: pg.Pool, bookingId: number): Promise<string> {
  /* ... */
}
```

### 7.3 `src/cal/state-invariants.ts` (NEW, step 2)

```ts
export type Findings = { testGuards: string[]; suspected: string[] };

/** Pure. F-C1: a cap-N link admits exactly N bookings and its counter ends at N. */
export function checkLinkCap(input: {
  cap: number;
  accepted: number;
  usageCount: number;
  statuses: Array<number | null>;
}): Findings {
  const testGuards = checkStatusNotNull(input.statuses);
  const suspected: string[] = [];
  if (input.accepted > input.cap) {
    suspected.push(
      `SUSPECTED PRODUCT BUG: link maxUsageCount ${input.cap}: ${input.accepted} bookings accepted through it (F-C1)`,
    );
  }
  if (input.usageCount > input.cap) {
    suspected.push(
      `SUSPECTED PRODUCT BUG: usageCount ${input.usageCount} above maxUsageCount ${input.cap} (F-C1)`,
    );
  }
  if (input.accepted >= input.cap && input.usageCount !== input.cap) {
    suspected.push(
      `SUSPECTED PRODUCT BUG: usageCount ${input.usageCount}, expected ${input.cap} (F-C1)`,
    );
  }
  return { testGuards, suspected };
}

/** Pure. F-C2: one terminal state, one side-effect set. */
export function checkConfirmCancel(input: {
  finalStatus: string;
  createdCount: number;
  cancelledCount: number;
}): Findings {
  // suspected when: final not in {accepted, cancelled}; or both counts > 0; or
  // accepted with createdCount !== 1 or cancelledCount !== 0; or cancelled with cancelledCount !== 1 or createdCount !== 0
  // text: `SUSPECTED PRODUCT BUG: confirm || cancel: final ${finalStatus}, BOOKING_CREATED ${createdCount}, BOOKING_CANCELLED ${cancelledCount} (F-C2)`
}

/** Pure. F-C3: one ACCEPTED booking, one confirmation webhook. */
export function checkConfirmConfirm(input: {
  finalStatus: string;
  createdCount: number;
  statuses: Array<number | null>;
}): Findings {
  // testGuards: checkStatusNotNull(statuses)
  // suspected: finalStatus !== "accepted" or createdCount !== 1 -> `SUSPECTED PRODUCT BUG: confirm || confirm: final ${finalStatus}, BOOKING_CREATED ${createdCount} (F-C3)`
}

/** Pure. Test guard for a thrown request (null); a 5xx is a product line. */
export function checkStatusNotNull(statuses: Array<number | null>): string[] {
  // null -> `TEST BUG: request threw (no HTTP status)`; 5xx -> handled by caller as suspected "5xx"
}
```

```ts
/** Pure. Every delivery must pass the signature check; a failure is a TEST BUG, not a product finding. */
export function checkSignedDeliveries(deliveries: Array<{ secretMatches: boolean }>): string[] {
  const bad = deliveries.filter((d) => !d.secretMatches).length;
  return bad === 0
    ? []
    : [`TEST BUG: ${bad} webhook delivery(ies) failed the x-cal-signature-256 check`];
}
```

### 7.4 `src/cal/session.ts`, `src/cal/private-link.ts` (NEW, step 3)

```ts
// src/cal/session.ts
/** Pure. Reads the seeded host password from the fork's seed text. Throws TEST BUG when the line is missing. */
export function extractHostPassword(seedText: string, email = "pro@example.com"): string {
  const m = seedText.match(
    new RegExp(`email: "${email.replace(".", "\\.")}",[\\s\\S]{0,200}?password: "([^"]+)"`),
  );
  if (!m?.[1]) throw new Error(`TEST BUG: seed password for ${email} not found`);
  return m[1];
}

/** Logs in through NextAuth credentials. Returns a cookie header. Never logs the password. */
export async function loginAsHost(baseUrl: string, password: string): Promise<string> {
  // GET /api/auth/csrf (keep set-cookie), POST /api/auth/callback/credentials (form: csrfToken,
  // email, password, json=true, redirect: "manual"), keep set-cookie; throw TEST BUG unless 200 and
  // a session-token cookie is set. Return "k=v; k=v" built from the jar.
}
```

```ts
// src/cal/private-link.ts
/** Pure. Lower-case, URL-safe, unique per case and trial. */
export function privateLinkId(casePrefixValue: string, trial: number): string {
  return `${casePrefixValue}-t${trial}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/** Pure. The batch body the tRPC client sends for `eventTypesHeavy/update`. */
export function multiplePrivateLinksBody(
  eventTypeId: number,
  links: Array<{ link: string; maxUsageCount: number }>,
): Record<
  string,
  { json: { id: number; multiplePrivateLinks: Array<{ link: string; maxUsageCount: number }> } }
> {
  return { "0": { json: { id: eventTypeId, multiplePrivateLinks: links } } };
}

/** Sets the event type's whole link list (replace semantics). Throws TEST BUG unless HTTP 200. */
export async function setPrivateLinks(
  baseUrl: string,
  cookie: string,
  eventTypeId: number,
  links: Array<{ link: string; maxUsageCount: number }>,
): Promise<void> {
  // POST `${baseUrl}/api/trpc/eventTypesHeavy/update?batch=1`, JSON body from multiplePrivateLinksBody
}
export async function clearPrivateLinks(
  baseUrl: string,
  cookie: string,
  eventTypeId: number,
): Promise<void> {
  await setPrivateLinks(baseUrl, cookie, eventTypeId, []);
}
```

Note: the link string must be unique per attempt (the link column is `@unique`). Use `privateLinkId(casePrefix(runPrefix, caseId), attempt)`
so reruns of one trial get a new id, and the case prefix keeps runs apart.

### 7.5 `src/cal/run-state-case.ts` (NEW, steps 4 and 5)

```ts
import type pg from "pg";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import { fireTogether } from "../races/fire-together.ts";
import {
  createRerunRunner,
  attemptTag,
  spreadPolicyFromEnv,
  validAttempts,
} from "../races/rerun-on-spread.ts";
import { runTrials } from "../races/run-trials.ts";
import { calBaseUrlFromEnv } from "../races/env.ts";
import { casePrefix, caseLeakPattern, likeLiteralPrefix } from "../medusa/payloads.ts";
import { createBooking, cancelBooking, type createSlotAllocator } from "./api.ts";
import { bookingBody, attendeeEmail, CAL_HOST_USERNAME } from "./payloads.ts";
import { readLinkState, readCaseAccepted, readBookingStatus } from "./state-oracle.ts";
import {
  checkLinkCap,
  checkConfirmCancel,
  checkConfirmConfirm,
  type Findings,
} from "./state-invariants.ts";
import { privateLinkId, setPrivateLinks, clearPrivateLinks } from "./private-link.ts";
import type { WebhookDelivery } from "../receivers/webhook-receiver.ts";

export type StateCaseResult = { histogram: RaceHistogram; suspected: string[] };

/** N parallel bookings through one link, distinct slots, per trial; cap from the case. */
export async function runLinkBurstCase(input: {
  pool: pg.Pool;
  setup: { userId: number; eventTypeId: number };
  slots: ReturnType<typeof createSlotAllocator>;
  cookie: string; // host session (loginAsHost)
  runPrefix: string;
  caseId: string;
  title: string;
  n: number; // 10
  cap: number; // 1 for -006, 3 for -008
  trials: number;
  labelled: readonly string[]; // owner-labelled tags; empty until labelled
}): Promise<StateCaseResult> {
  // 1. createHistogram({ caseId, title, product: "cal", concurrency: n, trials })
  // 2. runner = createRerunRunner(spreadPolicyFromEnv(), trials)
  // 3. per attempt (trial, attempt):
  //    a. slots = await input.slots.next() x n (distinct); link = privateLinkId(casePrefix(runPrefix, caseId), trial*100+attempt)
  //    b. setPrivateLinks(base, cookie, eventTypeId, [{ link, maxUsageCount: cap }])
  //    c. const { requests, dispatchSpreadMs } = await fireTogether(n, (i) => createBooking({ ...bookingBody({...,
  //         email: attendeeEmail(attemptPrefix, String(i)), eventTypeId, eventTypeSlug }), hasHashedBookingLink: true, hashedLink: link }))
  //    d. accepted = await readCaseAccepted(pool, likeLiteralPrefix(attemptPrefix)); state = await readLinkState(...)
  //    e. findings = checkLinkCap({ cap, accepted, usageCount: state.usageCount, statuses: requests.map(r => r.status) })
  //    f. finally: cancel every accepted booking of the attempt (cancelBooking), clearPrivateLinks
  //    g. return a RaceAttemptResult: valid from dispatchSpreadMs, invariantViolations: findings.testGuards,
  //       oracle: { accepted, usageCount, cap }, and the suspected lines kept on the side
  // 4. runTrials(trials, (trial) => runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)))
  // 5. leak check: readCaseAccepted(pool, caseLeakPattern(runPrefix, caseId)) must be 0 -> TEST BUG line otherwise
  // 6. histogram.verdict = invariantViolations.length === 0 ? "pass" : "fail"; writeHistogram; return { histogram, suspected }
  throw new Error("skeleton");
}

/** Confirm-vs-cancel (`confirm-cancel`) or confirm-vs-confirm (`confirm-confirm`) on one PENDING booking, per trial. */
export async function runPendingRaceCase(input: {
  pool: pg.Pool;
  setup: { userId: number; eventTypeId: number; username: string; length: number };
  slots: ReturnType<typeof createSlotAllocator>;
  receiver: { deliveries: WebhookDelivery[] };
  cookie: string;
  runPrefix: string;
  caseId: string;
  title: string;
  mode: "confirm-cancel" | "confirm-confirm";
  trials: number;
  labelled: readonly string[];
}): Promise<StateCaseResult> {
  // per attempt:
  //  a. slot = await input.slots.next(); pending = await createBooking({ ...bookingBody(...), user: input.setup.username }); must be 200
  //     and read its id and uid from the DB (readBookingId by attendee email); status must be "pending" (TEST BUG otherwise)
  //  b. before = receiver.deliveries.length
  //  c. mode "confirm-cancel": Promise.all([trpc confirm, cancelBooking(uid)]); "confirm-confirm": Promise.all([confirm, confirm])
  //  d. await waitQuiet(receiver, 1500, 8000)
  //  e. statuses from the calls (null when thrown); finalStatus = readBookingStatus(pool, id)
  //  f. createdCount = count of deliveries since `before` whose body.payload.uid === uid and body.triggerEvent === "BOOKING_CREATED"
  //     cancelledCount = same with "BOOKING_CANCELLED"
  //  g. findings = mode === "confirm-cancel" ? checkConfirmCancel(...) : checkConfirmConfirm(...)
  //  h. finally: cancelBooking(uid) if finalStatus is accepted or pending (cleanup)
  // Wrap as runLinkBurstCase does: runTrials + createRerunRunner + histogram + leak check + writeHistogram.
  throw new Error("skeleton");
}

/** Waits until no delivery arrived for `quietMs`, or `maxMs` passed. Returns the count. */
export async function waitQuiet(
  receiver: { deliveries: WebhookDelivery[] },
  quietMs: number,
  maxMs: number,
): Promise<number> {
  // poll every 100 ms: stop when now - lastChange >= quietMs, or now - start >= maxMs
  throw new Error("skeleton");
}
```

The per-attempt `RaceAttemptResult` must match the type in `src/races/types.ts` (fields `trial`, `attempt`, `valid`,
`ok`, `statuses`, `statusCounts`, `dispatchSpreadMs`, `oracle`, `invariantViolations`, `requests`). Build it the same way
`runIdenticalSlotCase` builds its attempt (`src/cal/run-case.ts`, the `runAttempt` closure).

### 7.6 Specs (steps 4 and 5)

Template (the four specs follow it; `-006` shown):

```ts
import { test, expect } from "@playwright/test";
import { createSlotAllocator } from "../../../src/cal/api.ts";
import { resolveHostSetup } from "../../../src/cal/oracle.ts";
import { loginAsHost, extractHostPassword } from "../../../src/cal/session.ts";
import { runLinkBurstCase } from "../../../src/cal/run-state-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { calBaseUrlFromEnv, calDatabaseUrlFromEnv, raceTrialsFromEnv } from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { readFileSync } from "node:fs";

const trials = raceTrialsFromEnv();
const runPrefix = p6RunPrefix();
const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
const labelled: readonly string[] = []; // owner labels F-C1 here after full-count CI (D-C7)
let setup: Awaited<ReturnType<typeof resolveHostSetup>>;
let cookie: string;

test.beforeAll(async () => {
  setup = await resolveHostSetup(pool);
  cookie = await loginAsHost(calBaseUrlFromEnv(), extractHostPassword(readFileSync(/* seed path under PRODUCTS_ROOT */, "utf8")));
});
test.afterAll(async () => closePool(pool));

test.describe("P6-CAL-RACE-006 private link single use", () => {
  test.describe.configure({ timeout: 120_000 + trials * 15_000 });

  test("P6-CAL-RACE-006 cap 1, N=10 parallel bookings → suspected F-C1 recorded, guards pass", async () => {
    const slots = createSlotAllocator(setup.eventTypeId, { pool, userId: setup.userId });
    const { histogram, suspected } = await runLinkBurstCase({
      pool, setup, slots, cookie, runPrefix, caseId: "P6-CAL-RACE-006",
      title: "private link cap 1, N=10 parallel bookings → one accepted", n: 10, cap: 1, trials, labelled,
    });
    for (const line of suspected) test.info().annotations.push({ type: "suspected-bug", description: line });
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
  });
});
```

`-007` uses `runPendingRaceCase` with `mode: "confirm-cancel"`, `setup.length` 60 and the tennis-class slot allocator
(`createSlotAllocator(tennisId, { pool, userId, slug: "tennis-class", minutes: 60 })`, the existing `slug` and `minutes` options).
Its beforeAll creates the webhook subscription on the tennis event type (`webhook/create`, `subscriberUrl` = receiver URL,
triggers `BOOKING_CREATED`, `BOOKING_CANCELLED`, `BOOKING_REQUESTED`) and `afterAll` deletes it. `-009` is the same with
`mode: "confirm-confirm"`. `-008` is `-006` with `cap: 3`.

The spec file also needs a histogram-artefact test, like `cal-race-001`'s second test, which reads
`results/races/<caseId>.json` and checks `attempts`, `trials`, `statusCounts` total, and `verdict`.

### 7.7 Unit test skeletons (steps 2 and 3)

`tests/unit/receivers-webhook-receiver.test.ts`, two new tests (inside the existing `describe`):

```ts
test("hmacSignatureCheck accepts the HMAC of the raw body and rejects any other", () => {
  const check = hmacSignatureCheck("s3cret");
  const body = '{"triggerEvent":"BOOKING_CREATED"}';
  const sig = createHmac("sha256", "s3cret").update(body).digest("hex");
  assert.equal(check({ "x-cal-signature-256": sig }, body), true);
  assert.equal(check({ "x-cal-signature-256": sig }, body + " "), false);
  assert.equal(check({}, body), false);
});

test("hmacSignatureCheck never matches a different-length signature", () => {
  assert.equal(hmacSignatureCheck("s3cret")({ "x-cal-signature-256": "00" }, "{}"), false);
});
```

`tests/unit/cal-state-invariants.test.ts`, seven tests (the last one is the signed-delivery guard):

1. `checkLinkCap passes when cap 1 admits one booking and the counter reads 1`
2. `checkLinkCap flags F-C1 when 10 bookings are accepted through a cap-1 link`
3. `checkLinkCap flags F-C1 when the cap-3 counter stops at 3 but 10 are accepted`
4. `checkConfirmCancel passes for accepted with one BOOKING_CREATED and none cancelled`
5. `checkConfirmCancel flags F-C2 when both side-effect sets fired`
6. `checkConfirmConfirm flags F-C3 when two BOOKING_CREATED webhooks arrived`
7. `checkSignedDeliveries flags a delivery whose signature does not match`

`tests/unit/cal-state-oracle.test.ts`, one test: `state-oracle SQL is read-only`: each constant matches `/^\s*SELECT\b/i`
and does not match `/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i`.

`tests/unit/cal-session.test.ts`, two tests:

1. `extractHostPassword reads the pro user password from seed text` (fixture string with `email: "pro@example.com",` and
   `password: "fixture-pw"`, expect `"fixture-pw"`; the fixture is invented, not the real seed value)
2. `extractHostPassword throws TEST BUG when the pro user is missing`

`tests/unit/cal-private-link.test.ts`, two tests:

1. `multiplePrivateLinksBody builds the tRPC batch shape`: expect `body["0"].json.multiplePrivateLinks[0]` to equal the input link.
2. `privateLinkId is lower-case, URL-safe and distinct per trial`.

### 7.8 Build steps (owner decisions in section 0; each step one commit)

Step 0 is done (section 3.7). Every step: `export PATH="/usr/local/bin:$PATH"`, then `npm run check` (expect exit 0) and
`npm run test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`. The count must match the table; if it differs, stop (rule 11).

| Step | Commit subject (Conventional, lowercase)                                              | `git add` paths                                                                                                                                                                                                                  | Unit tests after step |
| ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1    | `refactor(receivers): move the webhook receiver to src/receivers with a secret check` | `src/receivers/webhook-receiver.ts`, `src/documenso/run-case.ts`, `tests/documenso/races/documenso-self-test.spec.ts`, `tests/unit/receivers-webhook-receiver.test.ts`                                                           | 391                   |
| 2    | `feat(cal): add state oracle, invariants and the cal webhook signature check`         | `src/cal/state-oracle.ts`, `src/cal/state-invariants.ts`, `src/receivers/webhook-receiver.ts`, `tests/unit/receivers-webhook-receiver.test.ts`, `tests/unit/cal-state-invariants.test.ts`, `tests/unit/cal-state-oracle.test.ts` | 401 (+10)             |
| 3    | `feat(cal): add host session and private-link helpers`                                | `src/cal/session.ts`, `src/cal/private-link.ts`, `tests/unit/cal-session.test.ts`, `tests/unit/cal-private-link.test.ts`                                                                                                         | 405 (+4)              |
| 4    | `feat(cal): add P6-CAL-RACE-006 and -008 private link cases`                          | `src/cal/run-state-case.ts`, `tests/cal/races/cal-race-006-private-link.spec.ts`, `tests/cal/races/cal-race-008-private-link-cap.spec.ts`                                                                                        | 405 (+0)              |
| 5    | `feat(cal): add P6-CAL-RACE-007 and -009 pending booking cases`                       | `src/cal/run-state-case.ts`, `tests/cal/races/cal-race-007-confirm-vs-cancel.spec.ts`, `tests/cal/races/cal-race-009-double-confirm.spec.ts`                                                                                     | 405 (+0)              |
| 6    | `ci(cal): add a cal-state-races job for the state cases`                              | `.github/workflows/perf.yml`                                                                                                                                                                                                     | 405 (+0)              |
| 7    | `docs(readme): document the cal state races and their suspected findings`             | `README.md`, `docs/BACKLOG.md`                                                                                                                                                                                                   | 405 (+0)              |

Step-by-step commands and expected output:

1. `git mv src/documenso/webhook-receiver.ts src/receivers/webhook-receiver.ts`;
   `git mv tests/unit/webhook-receiver.test.ts tests/unit/receivers-webhook-receiver.test.ts`; update the two importers
   and the moved test (7.1; Documenso passes `headerSecretCheck("x-documenso-secret", expectedSecret)`). Then
   `npm run typecheck` (exit 0, no output) and `npm run test:unit` → `# tests 391`, `# pass 391`.
   Commit with the subject above. **Documenso smoke:** `documenso-smoke` (CI) must stay green on this commit; it is checked
   on the first full CI run on the branch (section 0 O6 runs) and recorded in the closeout.
2. Write `state-oracle.ts` and `state-invariants.ts` (7.2, 7.3), add `hmacSignatureCheck` (7.1) if step 1 left it out,
   and the tests in 7.7. Expect `# tests 401`, `# pass 401` (+2 HMAC, +7 invariants, +1 read-only SQL). Commit.
3. Write `session.ts` and `private-link.ts` (7.4) and their four tests. Expect `# tests 405`. Commit.
4. Write `runLinkBurstCase` (7.5) and the `-006` and `-008` specs (7.6). Local run (`npm run up:cal`, then `npm run down:cal`
   after the runs; both exit 0 expected): `RACE_TRIALS=3 npm run race:cal -- tests/cal/races/cal-race-006-private-link.spec.ts`
   and the `-008` file. Expected: each spec passes; each trial line shows as a `suspected-bug` annotation when it violates
   the cap, and the verdict is `pass`. `npm run test:unit` → `# tests 405`. Commit.
5. Write `runPendingRaceCase` and `waitQuiet` and the `-007`/`-009` specs. Local run with `RACE_TRIALS=3` for both files:
   each spec passes, suspected lines annotated. `npm run test:unit` → `# tests 405`. Commit.
6. CI: add the `cal-state-races` job to `.github/workflows/perf.yml` as in section 9.1. Run `npm run lint:actions` (exit 0)
   and `npm run check`. Commit. Push the branch (`git push -u origin feat/2026-10-23-p6-cal-state-races`, retry on network
   errors only). The job does not run on a push (section 9.1); the full-count runs are dispatched (section 9.4).
7. README rows (the four cases, the receiver move, the three suspected findings, the email gap) and `docs/BACKLOG.md`
   items F-C1, F-C2, F-C3 (labels and `test.fail()` wait for the owner). `npm run format:check` → `All matched files use
Prettier code style!`. Commit and push.

After step 7: section 9.4 (dispatch the full-count runs), then stop for the owner's labels (O6).

## 8. Build order and stop points

Steps 1 to 7 of section 7.8, in order, one commit each. The owner's decisions (section 0) are the approval for the CI job
and the receiver move, so the build does not stop for them. It stops after the first full-count CI runs (section 9.4), for
the labels (O6).

## 9. CI and the time budget (O5)

### 9.1 Jobs

- **`cal-smoke`: unchanged.** Its steps, its `HARNESS_UP_TIMEOUT_MS` (2400000) and its `timeout-minutes: 60` stay as they are.
  No race step is added to it; the four state cases do not touch it.
- **New job `cal-state-races`** in `.github/workflows/perf.yml`, placed after `cal-smoke`. It follows the Medusa precedent
  (`medusa-order-races`, `medusa-cancel-extras`): the same pins as `cal-smoke` (the Cal fork checkout at `CAL_REF`, the
  `CAL_REF` verification against `scripts/bootstrap.sh`, the Yarn version check), caches **restored, never saved** (the save
  steps stay in `cal-smoke` only), its own `timeout-minutes: 85`.

Skeleton (the setup steps are copied from `cal-smoke`; only the names, the artifact names and the race steps differ):

```yaml
cal-state-races:
  name: cal-state-races
  runs-on: ubuntu-24.04
  timeout-minutes: 85
  env:
    P6_WORKING_DIRECTORY: p6
    PRODUCTS_ROOT: ${{ github.workspace }}/products
    CAL_CHECKOUT_PATH: products/cal
    CAL_BASE_URL: http://127.0.0.1:3000
    # Fork trust-auth local DB (no password). Not a secret.
    CAL_DB_URL: postgresql://postgres@127.0.0.1:5450/calendso
    P6_WEBHOOK_HOST: p6-webhook.test
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
    COREPACK_ENABLE_STRICT: "0"
    TURBO_TELEMETRY_DISABLED: "1"
    NEXT_TELEMETRY_DISABLED: "1"
  steps:
    # checkout P6, checkout the Cal fork at CAL_REF, verify HEAD, verify CAL_REF (copy from cal-smoke)
    # setup-node, npm ci (copy); corepack and the yarn 4.12.0 check (copy)
    # restore Cal yarn cache and Cal node_modules cache (restore only, copy from cal-smoke)
    # yarn install --immutable; prisma generate; bootstrap.sh cal with BOOTSTRAP_SKIP_INSTALL=1 (copy)
    # restore Cal build cache (restore only, copy from cal-smoke)

    - name: Map the webhook host
      run: |
        set -euo pipefail
        echo "127.0.0.1 ${P6_WEBHOOK_HOST}" | sudo tee -a /etc/hosts >/dev/null
        getent hosts "${P6_WEBHOOK_HOST}" | grep -q '^127\.0\.0\.1 '

    - name: Start Cal (harness up)
      id: cal_up
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      env:
        # Same cap as cal-smoke (40 min).
        HARNESS_UP_TIMEOUT_MS: "2400000"
      run: |
        set -euo pipefail
        npm run up:cal

    - name: Race P6-CAL-RACE-006 (cal-race)
      if: ${{ !cancelled() && steps.cal_up.outcome == 'success' }}
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      timeout-minutes: ${{ github.event_name == 'pull_request' && 5 || 10 }}
      env:
        RACE_TRIALS: ${{ github.event_name == 'pull_request' && '5' || '50' }}
        P6_PLAYWRIGHT_JSON: results/playwright/cal-race-006.json
      run: |
        set -euo pipefail
        npm run race:cal -- tests/cal/races/cal-race-006-private-link.spec.ts

    # -007, -008 and -009: the same step shape, with their own spec, timeouts and JSON names.

    - name: Stop Cal (harness down)
      if: ${{ always() }}
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      run: |
        set -euo pipefail
        npm run down:cal || true

    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      if: ${{ !cancelled() && steps.cal_up.outcome == 'success' }}
      with:
        name: race-histograms-cal-state
        path: ${{ env.P6_WORKING_DIRECTORY }}/results/races/
        if-no-files-found: warn
        retention-days: 14

    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      if: ${{ failure() }}
      with:
        name: cal-state-harness-log
        path: ${{ env.P6_WORKING_DIRECTORY }}/results/harness/cal-up.log
        if-no-files-found: warn
        retention-days: 14

    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      if: ${{ always() }}
      with:
        name: cal-state-web-log
        path: ${{ env.P6_WORKING_DIRECTORY }}/node_modules/qa-portfolio-harness/.harness/cal-web.log
        if-no-files-found: warn
        retention-days: 14
```

Names are unique per run: `cal-smoke` uses `race-histograms-cal`, `cal-harness-log` and `cal-web-log`; the new job uses the
`-state` suffix, so the artifact names never collide. `RACE_TRIALS` is `5` on PRs and `50` on every other event (D6). The
`cal-state-races` job does not run on a push to a feature branch (`perf.yml` triggers: PRs, pushes to `main`, nightly,
dispatch). Full-count runs on this branch are dispatched by hand (9.4).

Histograms: `results/races/` holds one JSON per case (`P6-CAL-RACE-006.json` and so on). The job summary step
(`scripts/write-ci-job-summary.ts`) is not added to this job; the histograms are read from the artifact.

### 9.2 Time budget at 50 trials, with reruns and setup (planning assumptions, not measured)

Assumptions, stated so the owner can change them: setup before `up` (checkout, npm ci, yarn install, Prisma, bootstrap,
cache restore) 10 min; `up` typical 3 min (warm cache) and worst 40 min (the cap); per trial, setup (10 slot reads with
overlap checks, link update) 3.0 s, one 10-request burst 1.1 s (probe: 0.88 to 1.31 s, section 3.3), one confirm/cancel
round 1.5 s burst plus 1.5 s quiet window, cleanup 1.0 s; reruns: the invalid budget `max(20 %, 2)` of 50 trials = 10
bursts per case; warm-up 1 burst.

Per case (50 trials):

| Case                       | Per trial (planning)          | 50 trials | Reruns allowance  | Per case (planning) | Step timeout main / PR |
| -------------------------- | ----------------------------- | --------- | ----------------- | ------------------- | ---------------------- |
| `-006` (cap 1)             | 3.0 + 1.1 + 1.0 = 5.1 s       | 255 s     | 10 × 5.1 s = 51 s | ~5.1 min            | 10 / 5 min             |
| `-008` (cap 3)             | 5.1 s                         | 255 s     | 51 s              | ~5.1 min            | 10 / 5 min             |
| `-007` (confirm ‖ cancel)  | 0.3 + 0.5 + 3.0 + 0.3 = 4.1 s | 205 s     | 10 × 4.1 s = 41 s | ~4.2 min            | 10 / 5 min             |
| `-009` (confirm ‖ confirm) | 4.1 s                         | 205 s     | 41 s              | ~4.2 min            | 10 / 5 min             |

**Job `cal-state-races` (timeout 85 min):**

- New cases total: about 19 min (planning). Warm-up and reruns included.
- Typical run: 10 (setup) + 3 (`up`) + 19 (cases) + 2 (stop and uploads) = **34 min**. Margin to 85: 51 min.
- Worst run (`up` at the 40-min cap): 10 + 40 + 19 + 2 = **71 min**. Margin: **14 min**. Rule met (at least 10).
- PR run (5 trials): the four cases total about 2 min with reruns.

**Job `cal-smoke` (timeout 60 min, unchanged):**

- Typical: 10 + 3 + smoke 1 + `-001` 1.2 + `-003` 0.8 + self-test 1 + uploads 3 = **about 20 min**. Margin: 40 min.
- Worst (`up` at the 40-min cap): 10 + 40 + 1 + 1.2 + 0.8 + 1 + 3 = **57 min**. Margin: **3 min**. **Does not meet the
  10-minute rule.** The cause is the existing `HARNESS_UP_TIMEOUT_MS` of 40 min, which the owner's answers did not change.
  The one-line fix is a cap of 30 min (`1800000`): worst case becomes 47 min, margin 13. It is not applied in this task.
  Open question O10 asks the owner for the choice.

### 9.3 What the first runs measure

Per-case wall time, invalid attempts per case, the per-trial setup cost, and the `up` duration. No published numbers come
from these runs; the first three runs' medians come with the closeout (rule: median of at least 3 full-count runs).

### 9.4 Full-count runs for the labels (O6)

- Dispatch `perf.yml` on `feat/2026-10-23-p6-cal-state-races` three times (`workflow_dispatch`, which runs with
  `RACE_TRIALS` 50 for the new job). Each run is one full-count run for F-C1, F-C2 and F-C3.
- The three runs are read once each after they finish (rule 15), and the outcome of each case is recorded in the closeout
  (section 16) with its run link. A run that fails is root-caused first (rule 13); a setup failure is a TEST BUG and is not rerun.
- After three full-count runs exist, the build stops. The owner decides the labels; the test changes (`labelled` and
  `test.fail()`) follow in a later commit only after that decision.

## 10. Test strategy (what each layer proves)

- Unit (`npm run test:unit`): the pure checks (`checkLinkCap`, `checkConfirmCancel`, `checkConfirmConfirm`, `checkStatusNotNull`),
  the HMAC check, the password extraction, the batch body, the link id, the SQL being read-only. These run on every PR.
- Local race runs (`RACE_TRIALS=3`, section 7.8 step 4 and 5): prove each spec runs end to end on the real app. They are
  not published (roadmap rule).
- CI race runs (`cal-state-races`): the histograms under `race-histograms-cal-state`, the full-count evidence the owner needs for labels
  (rule 13).

## 11. Risks

1. **The three suspected findings may not reproduce at CI scale.** The probe is 5 link bursts and 8 concurrent rounds on one
   VM. Mitigation: the cases record SUSPECTED only (D-C7); the owner labels after 3 full-count CI runs (O6); no `test.fail()` now.
2. **Webhook filter by uid (O1) is unverified.** If `payload.uid` is not the field, the per-booking counts are wrong. Mitigation:
   step 0 probe before step 1 (section 7.8).
3. **Webhook signature (O3) is unverified.** RESOLVED by the step-0 probe (section 3.7): the header is `x-cal-signature-256`, the HMAC check
   in 7.1 is written to the documented format, and step 0 confirms it.
4. **Webhook delivery is asynchronous.** A quiet window can be too short on a slow CI runner, which would undercount.
   Mitigation: 1.5 s quiet, 8 s cap, and counts only; a count shortfall shows up as a SUSPECTED line on the next run, not as a
   silent pass. The owner can raise the window in one constant.
5. **No email capture.** D9: the `-007` email half is a recorded gap. A harness mail catcher is a harness change (H-email,
   section 13), not in this task.
6. **Sandbox heap.** `NODE_OPTIONS` set in a shell removes the harness heap default (section 3.1.1). CI does not set
   `NODE_OPTIONS`, so CI is unaffected; a local run needs the explicit heap value. Harness follow-up H-heap.
7. **Slot supply at full count.** 317 free 30-minute slots per 28 days (probe). `-006` and `-008` need 500 distinct slots each
   at 50 trials, and the allocator walks up to six 28-day windows (168 days), which is enough if cleanup frees slots. The
   `-007` and `-009` 60-minute slots: 78 in 14 days, so about 40 per 28 days; six windows give about 240, enough for 100.
   If the first CI run reports `TEST BUG: no free ... slot`, stop (rule 9).
8. **Link replace semantics.** `multiplePrivateLinks` replaces the list of the event type. Only one spec sets links at a time
   (one worker), and each attempt clears links at its end. A crashed spec could leave a link; the leak check reads the prefix.
9. **Webhook subscription leaks.** A crash before `afterAll` leaves a subscription on `tennis-class`. Mitigation: `afterAll`
   deletes by id, and the spec's setup first deletes any subscription whose `subscriberUrl` matches the receiver host.
10. **The receiver move touches Documenso.** `documenso-smoke` must stay green (roadmap "Done when"). Step 1 is its own commit
    so a regression points at one change.
11. **Owner-labelled tags and the `labelled` array.** An empty array means no assertion. A later label must match the tag text
    exactly (`F-C1`, `F-C2`, `F-C3`) or the line stays a suspicion.

## 12. Contradictions with the roadmap

- **C1 (trigger names).** The roadmap's `-009` text names a "`BOOKING_CONFIRMED`-type" webhook. The enum has no such trigger.
  Observed: acceptance fires `BOOKING_CREATED`; pending creation `BOOKING_REQUESTED`; cancel `BOOKING_CANCELLED`. The plan uses
  the observed names (roadmap: "names per probe").
- **C2 (line references).** The roadmap cites `BookingEventHandlerService.ts:61` for the usage call. In `CAL_REF` as built here
  the call is at line 46 (inside `onBookingCreatedOrRescheduled`) and the method at line 58. `HashedLinkRepository.incrementUsage`
  is at lines 245–258, not 251–258. The roadmap's behaviour is right; the line numbers drifted.
- **C3 (file sizes and paths).** The roadmap says `src/cal/run-case.ts` is 596 lines; it is 549 now. It says
  `tests/documenso/races/documenso-self-test.spec.ts:29` for the importer; it is line 25. `src/documenso/run-case.ts:74` is
  correct.
- **C4 (job timeout).** The roadmap's risk list says the Cal job "already 60-min timeout" is fine. The worst-case arithmetic
  (section 9.2) is about 77 min. Resolved by O5: a separate job with its own 85-minute timeout (worst 71 min).
- **C5 (the failure path of the increment).** The roadmap says a failed increment "is turned into `PrivateLinkExpired`" and
  implies the booking may fail. In the built code the error is caught and logged in `updatePrivateLinkUsage`, so the booking is
  never refused (section 3.3). The roadmap's risk is real, and the observed outcome is accepted bookings with no 4xx at all.
- **C6 (no loser responses).** The roadmap asks for "the loser status/body" of `-006`. There were no losers in 50 of 50 accepted
  requests, so no loser body exists to record. The plan records "no loser observed" and the 200s instead.

## 13. Proposed extras (out of scope until the owner accepts them)

- **E1 (proposed, `P6-CAL-RACE-010`):** confirm ‖ reject on one PENDING booking, the same side-effect check as `-007`.
- **E2 (proposed, `P6-CAL-RACE-011`):** an expired link (`expiresAt` in the past) under N parallel bookings: none accepted.
- **E3 (harness follow-up H-email):** a mail catcher in `docker/cal.compose.yml` so `-007` can assert emails. A harness change.
- **E4 (harness follow-up H-heap):** the harness adapter applies its heap default only when `NODE_OPTIONS` is unset
  (`cal.adapter.js:67`). Proposed: merge the default into an existing `NODE_OPTIONS` value. Not in this task (harness pin).
- **E5 (proposed, `P6-OBS-CAL-004`):** a Cal webhook with a wrong signature is rejected by the receiver, as a receiver-side test.
  Only if O3 shows the product signs deliveries.

## 14. Open questions and owner answers

Answered (section 0): O1 (`payload.uid` is the booking uid), O2 (the counter does not gate the write; intra-request order
not observable), O3 (signed with `x-cal-signature-256`, hex HMAC-SHA256 of the raw body; the receiver verifies it),
O4 (seed file at run time), O5 (separate job `cal-state-races`, `cal-smoke` unchanged), O6 (SUSPECTED until 3 full-count
CI runs), O7 (branch name), O8 (priorities `-008` P2, `-009` P1), O9 (email gap recorded).

Open:

- **O10. `cal-smoke` worst-case margin.** Section 9.2: at the 40-minute `up` cap the job's worst case is 57 min, a 3-minute
  margin against its 60-minute timeout, which does not meet the owner's "at least 10 minutes under" rule. Options: (a) cap
  `HARNESS_UP_TIMEOUT_MS` at 30 min in `cal-smoke` (worst 47 min, margin 13); (b) leave as is and accept the margin.
  Proposed: (a). Not applied; the owner decides. The new job is unaffected (its worst case is 71 min against 85).
- **O11. Full-count run count.** Owner: three full-count CI runs. Proposed: three `workflow_dispatch` runs on this branch
  (section 9.4), since the feature branch has no PR and no push trigger. If the owner prefers runs on `main`, the labels
  wait for those.
- **O12. Documenso smoke.** The receiver move (step 1) must leave `documenso-smoke` green. It runs only in CI (PR, main,
  nightly, dispatch). Proposed: the first dispatch run on this branch also runs `documenso-smoke` (dispatch runs all jobs),
  and its result goes into the closeout.

## 15. Self-check (rule 20)

- **(a) Roadmap "Done when".** Receiver refactor merged with Documenso green: step 1, verified by the owner's `documenso-smoke`
  (not run locally; gap listed). All four cases pass or record a proven bug with `test.fail()` and repeated-run evidence:
  **partly**. They record SUSPECTED lines in this task (D-C7); `test.fail()` needs CI full-count runs first (gap in O6).
  Histograms uploaded: step 6 (existing upload step). Leak check by prefix: 7.5 step 5. `npm run check` green: step gates.
- **(b) Named functions and files exist at those paths** (grep in this session): `createSlotAllocator`, `createBooking`,
  `cancelBooking`, `getFreeSlots` (`src/cal/api.ts`); `resolveHostSetup`, `selectRows` import (`src/cal/oracle.ts`);
  `bookingBody`, `attendeeEmail`, `CAL_HOST_USERNAME`, `CAL_EVENT_SLUG` (`src/cal/payloads.ts`); `startWebhookReceiver`,
  `parseDelivery` (`src/documenso/webhook-receiver.ts`); `runIdenticalSlotCase` (`src/cal/run-case.ts`); `fireTogether`
  (`src/races/fire-together.ts`); `createHistogram`, `writeHistogram` (`src/races/histogram.ts`); `createRerunRunner`,
  `spreadPolicyFromEnv`, `attemptTag`, `validAttempts` (`src/races/rerun-on-spread.ts`); `runTrials` (`src/races/run-trials.ts`);
  `calBaseUrlFromEnv`, `calDatabaseUrlFromEnv`, `raceTrialsFromEnv` (`src/races/env.ts`); `p6RunPrefix`
  (`src/races/prefix.ts`); `casePrefix`, `caseLeakPattern`, `likeLiteralPrefix` (`src/medusa/payloads.ts`);
  `createReadOnlyPool`, `closePool`, `selectRows` (`src/oracles/pg.ts`); `RaceHistogram`, `RaceAttemptResult` (`src/races/types.ts`).
  **NEW** (planned, skeleton in 7.x): `src/receivers/webhook-receiver.ts`, `src/cal/state-oracle.ts`, `src/cal/state-invariants.ts`,
  `src/cal/session.ts`, `src/cal/private-link.ts`, `src/cal/run-state-case.ts`, the four specs, the five unit files.
- **(c) CI estimate** includes reruns and setup and matches across sections (sections 1, 9.2 and 9.3): 19–20 min new cases;
  `cal-state-races` worst 71 min, timeout 85 (margin 14); `cal-smoke` worst 57 min, margin 3 (O10, not yet decided).
- **(d) Skeletons and commands:** every new function and test has a skeleton (7.1–7.7). Every step has its `git add` paths,
  commit subject, expected `npm run check` gate (`CHECK_EXIT=0`) and unit count (section 7.8). Items still to write in the build
  are marked as skeleton bodies, not left out.
- **(e) Owner answers.** No owner answer is recorded in this plan. Open items are marked as open (section 14).

## 16. Closeout notes

Filled in as the work goes. Final values are written at the end of the build and after the three full-count runs.

- **Plan versions:** `5ec8786` (first version, stopped for review); this version follows it (owner answers, step-0 probe,
  separate job).
- **Merge SHA:** not merged. No PR (the task asked for none; the labels wait for the owner).
- **Findings (SUSPECTED, not labelled):**
  - F-C1: link cap ignored for acceptance. 10 of 10 accepted through a cap-1 link in 5 of 5 probe runs; 10 of 10 through a
    cap-3 link in 1 run; the counter stops at the cap. The step-0 probe shows a booking is also written when the link is
    already full (section 3.7).
  - F-C2: confirm ‖ cancel on a PENDING booking: both 200 and both side-effect sets in 4 of 4 rounds; final `accepted`.
  - F-C3: confirm ‖ confirm on a PENDING booking: both 200 and two `BOOKING_CREATED` deliveries in 4 of 4 rounds.
- **Environment finding:** `up:cal` heap OOM in this sandbox (section 3.1.1); harness follow-up H-heap.
- **Deviations:**
  - D-C14: branch `feat/...` for the plan commit (rules 1 and 10 name `plan/...`). Owner's instruction, same as Task 3b.
  - Probe error (section 3.3): the first link-burst run did not set `hasHashedBookingLink`. Its rows are not evidence of F-C1.
  - Step-0 probe script had a stray booking call; removed before the run (section 3.7).
  - The first `up:cal` attempt ran with the sandbox `NODE_OPTIONS`; the later attempts with an explicit heap value.
- **Rule slips (honest record):**
  - Two duplicate Monitor watches and one stray one-minute reminder were created during the Cal start; all three were
    stopped or deleted before the probe ran, and none wrote to the repo or to Cal.
  - A harness command launched in a subshell reported "completed (exit 0)" before the real command finished. The real exit
    codes were read from the exit files. Reports use the real codes only.
  - The plan's time figures are planning assumptions (section 9.2), not measured values, and are labelled as such.
  - Section 9.2: the `cal-smoke` worst-case margin (3 min) does not meet the 10-minute rule; it is O10, not yet decided.
- **Step results (filled in during the build):** step 0 done (section 3.7). Steps 1 to 7, CI runs and labels: pending.
