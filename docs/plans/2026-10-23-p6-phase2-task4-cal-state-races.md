# P6 Phase 2 Task 4: Cal state races (`P6-CAL-RACE-006` to `-009`) + shared webhook receiver

Junior-engineer guide. Source: the roadmap's Task 4 section ([2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md),
"Task 4", D6, D7, D9, D12), the Task 3b plan as the structural model ([2026-10-23-p6-phase2-task3b-med-order-extras.md](2026-10-23-p6-phase2-task3b-med-order-extras.md)),
and [docs/BACKLOG.md](../BACKLOG.md) (no Cal item; the Task 3 Medusa item F-M2 is not this task). Branch:
`feat/2026-10-23-p6-cal-state-races`, cut from `origin/main` at `73db10f`. Rules: [agent-rules.md](../agent-rules.md).

Everything below marked **probe** comes from the live Cal web app on 2026-10-23 (section 3), pinned `CAL_REF` as built
by `scripts/bootstrap.sh`. Cloud timings prove a test works and are never published (roadmap, "Rules that hold for every
task below"); the CI numbers are the only published ones.

**Status of this plan.** The plan commit is the only commit on this branch. The task changes a CI workflow
(`.github/workflows/perf.yml`) and a shared module under `src/` (the webhook receiver), and the probe labels suspected
product behaviour, so rule 10 stops the build here for the owner's review. Steps 1 to 7 (section 8) are not started.

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
5. CI: four new `cal-smoke` steps, a webhook host mapping step, a job timeout change (section 9). **Not started until the
   owner approves.**
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
reaches the client. Open point O2 (section 14) asks the build to confirm the order with a timestamp read.

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
- Does not prove: the webhook signature header and body format (the probe used `secret: null`, so Cal sent no signature;
  see O3), the `payload.uid` field used to filter deliveries per booking (O1), the per-trial time budget (section 9 uses
  planning assumptions, marked as such), or any rate that a CI trial count depends on (rule 13: full-count CI runs).
- Does not prove: that any finding is a PRODUCT BUG. All of F-C1, F-C2, F-C3 stay SUSPECTED (section 4 D-C7).

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
  array per spec starts empty. The owner labels a tag after full-count runs; then the line becomes an assertion (D54
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
  `body.triggerEvent` (O1: field name to confirm).
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

## 6. Files

| Path                                                       | Change                                                       | Purpose                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/documenso/webhook-receiver.ts`                        | **moved** to `src/receivers/webhook-receiver.ts`             | Pluggable `SecretCheck` (7.1)                                                                                   |
| `src/receivers/webhook-receiver.ts`                        | **NEW (moved)**                                              | `headerSecretCheck`, `hmacSignatureCheck`, `parseDelivery`, `startWebhookReceiver` (7.1)                        |
| `src/documenso/run-case.ts`                                | edit                                                         | Import path (line 74) and `startWebhookReceiver` call: `check: headerSecretCheck("x-documenso-secret", secret)` |
| `tests/documenso/races/documenso-self-test.spec.ts`        | edit                                                         | Import path (line 25 today; the roadmap says 29) and the constructor call (same rule)                           |
| `tests/unit/webhook-receiver.test.ts`                      | **moved** to `tests/unit/receivers-webhook-receiver.test.ts` | Existing tests, new import path, `check` argument; +2 HMAC tests in step 2                                      |
| `src/cal/state-oracle.ts`                                  | **NEW**                                                      | SQL constants and readers (7.2)                                                                                 |
| `src/cal/state-invariants.ts`                              | **NEW**                                                      | Pure checks (5.1, 7.3)                                                                                          |
| `src/cal/session.ts`                                       | **NEW**                                                      | `extractHostPassword` (pure) and `loginAsHost` (7.4)                                                            |
| `src/cal/private-link.ts`                                  | **NEW**                                                      | `privateLinkId`, `multiplePrivateLinksBody`, `setPrivateLinks`, `clearPrivateLinks` (7.4)                       |
| `src/cal/run-state-case.ts`                                | **NEW**                                                      | `runLinkBurstCase`, `runPendingRaceCase`, `waitQuiet` (7.5)                                                     |
| `tests/cal/races/cal-race-006-private-link.spec.ts`        | **NEW**                                                      | `P6-CAL-RACE-006` (7.6)                                                                                         |
| `tests/cal/races/cal-race-007-confirm-vs-cancel.spec.ts`   | **NEW**                                                      | `P6-CAL-RACE-007` (7.6)                                                                                         |
| `tests/cal/races/cal-race-008-private-link-cap.spec.ts`    | **NEW**                                                      | `P6-CAL-RACE-008` (7.6)                                                                                         |
| `tests/cal/races/cal-race-009-double-confirm.spec.ts`      | **NEW**                                                      | `P6-CAL-RACE-009` (7.6)                                                                                         |
| `tests/unit/receivers-webhook-receiver.test.ts`            | edit                                                         | +2 tests for `hmacSignatureCheck` (7.7)                                                                         |
| `tests/unit/cal-state-invariants.test.ts`                  | **NEW**                                                      | 6 tests for the four checks (7.7)                                                                               |
| `tests/unit/cal-state-oracle.test.ts`                      | **NEW**                                                      | 1 test: SQL constants are read-only (7.7)                                                                       |
| `tests/unit/cal-session.test.ts`                           | **NEW**                                                      | 2 tests for `extractHostPassword` (7.7)                                                                         |
| `tests/unit/cal-private-link.test.ts`                      | **NEW**                                                      | 2 tests for `privateLinkId` and `multiplePrivateLinksBody` (7.7)                                                |
| `.github/workflows/perf.yml`                               | edit (step 6, after owner review)                            | `cal-smoke`: webhook host mapping, four race steps, job timeout (section 9)                                     |
| `README.md`                                                | edit (step 7)                                                | Rows for the four cases, the receiver move, the suspected findings, the email gap                               |
| `docs/BACKLOG.md`                                          | edit (step 7)                                                | Three items: F-C1, F-C2, F-C3 (labels and `test.fail()` after full-count CI)                                    |
| `docs/plans/2026-10-23-p6-phase2-task4-cal-state-races.md` | **NEW** (this file)                                          | Plan, closeout notes at the end                                                                                 |

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

`tests/unit/cal-state-invariants.test.ts`, six tests:

1. `checkLinkCap passes when cap 1 admits one booking and the counter reads 1`
2. `checkLinkCap flags F-C1 when 10 bookings are accepted through a cap-1 link`
3. `checkLinkCap flags F-C1 when the cap-3 counter stops at 3 but 10 are accepted`
4. `checkConfirmCancel passes for accepted with one BOOKING_CREATED and none cancelled`
5. `checkConfirmCancel flags F-C2 when both side-effect sets fired`
6. `checkConfirmConfirm flags F-C3 when two BOOKING_CREATED webhooks arrived`

`tests/unit/cal-state-oracle.test.ts`, one test: `state-oracle SQL is read-only`: each constant matches `/^\s*SELECT\b/i`
and does not match `/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i`.

`tests/unit/cal-session.test.ts`, two tests:

1. `extractHostPassword reads the pro user password from seed text` (fixture string with `email: "pro@example.com",` and
   `password: "fixture-pw"`, expect `"fixture-pw"`; the fixture is invented, not the real seed value)
2. `extractHostPassword throws TEST BUG when the pro user is missing`

`tests/unit/cal-private-link.test.ts`, two tests:

1. `multiplePrivateLinksBody builds the tRPC batch shape`: expect `body["0"].json.multiplePrivateLinks[0]` to equal the input link.
2. `privateLinkId is lower-case, URL-safe and distinct per trial`.

### 7.8 Build steps (run after owner approval; each step one commit)

Before step 1: **step 0 (probe re-run, no commit).** Run `probe-cal-confirm.mjs` with a webhook secret set to confirm the
signature header and body (O3) and read the `payload.uid` field of a `BOOKING_CREATED` delivery (O1). Record the output in
the step 0 notes of the plan's closeout. Expected: `x-cal-signature-256` present, `payload.uid` equal to the booking uid.
If either is different, stop and update sections 5 and 7.1 before step 1.

Every step: `export PATH="/usr/local/bin:$PATH"`, then `npm run check` (expect `CHECK_EXIT=0`) and
`npm run test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`. The count must match the table; if it differs, stop (rule 11).

| Step | Commit subject (Conventional, lowercase)                                              | `git add` paths                                                                                                                                                                                                                  | Unit tests after step |
| ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1    | `refactor(receivers): move the webhook receiver to src/receivers with a secret check` | `src/receivers/webhook-receiver.ts`, `src/documenso/run-case.ts`, `tests/documenso/races/documenso-self-test.spec.ts`, `tests/unit/receivers-webhook-receiver.test.ts` (plus the two `git mv` paths)                             | 391                   |
| 2    | `feat(cal): add state oracle, invariants and the cal webhook signature check`         | `src/cal/state-oracle.ts`, `src/cal/state-invariants.ts`, `src/receivers/webhook-receiver.ts`, `tests/unit/receivers-webhook-receiver.test.ts`, `tests/unit/cal-state-invariants.test.ts`, `tests/unit/cal-state-oracle.test.ts` | 400 (+9)              |
| 3    | `feat(cal): add host session and private-link helpers`                                | `src/cal/session.ts`, `src/cal/private-link.ts`, `tests/unit/cal-session.test.ts`, `tests/unit/cal-private-link.test.ts`                                                                                                         | 404 (+4)              |
| 4    | `feat(cal): add P6-CAL-RACE-006 and -008 private link cases`                          | `src/cal/run-state-case.ts` (runLinkBurstCase part), `tests/cal/races/cal-race-006-private-link.spec.ts`, `tests/cal/races/cal-race-008-private-link-cap.spec.ts`                                                                | 404 (+0)              |
| 5    | `feat(cal): add P6-CAL-RACE-007 and -009 pending booking cases`                       | `src/cal/run-state-case.ts` (runPendingRaceCase, waitQuiet), `tests/cal/races/cal-race-007-confirm-vs-cancel.spec.ts`, `tests/cal/races/cal-race-009-double-confirm.spec.ts`                                                     | 404 (+0)              |
| 6    | `ci(cal): run the cal state races in cal-smoke`                                       | `.github/workflows/perf.yml` (**owner review first**, rule 10)                                                                                                                                                                   | 404 (+0)              |
| 7    | `docs(readme): document the cal state races and their suspected findings`             | `README.md`, `docs/BACKLOG.md`                                                                                                                                                                                                   | 404 (+0)              |

Step-by-step commands, with the expected output:

1. `git mv src/documenso/webhook-receiver.ts src/receivers/webhook-receiver.ts`;
   `git mv tests/unit/webhook-receiver.test.ts tests/unit/receivers-webhook-receiver.test.ts`; edit the two importers and the
   moved test (7.1). Run `npm run typecheck` → exit 0 (no output). Run `npm run test:unit` → `# tests 391`, `# pass 391`.
   Commit: `git add src/receivers/webhook-receiver.ts src/documenso/run-case.ts tests/documenso/races/documenso-self-test.spec.ts tests/unit/receivers-webhook-receiver.test.ts && git commit -m "refactor(receivers): move the webhook receiver to src/receivers with a secret check"`.
   **Documenso smoke:** `documenso-smoke` (CI) must stay green on this commit. Local Documenso is not run here (Node 24 stack,
   separate probe); the owner checks the PR's smoke job.
   Note: `git mv` already stages both moves; the `git add` above adds the edits.
2. Write `state-oracle.ts`, `state-invariants.ts` (7.2, 7.3) and the HMAC function in `webhook-receiver.ts` if not already
   in step 1 (it is in 7.1; add it here if step 1 left it out, and keep step 1 green). Add the nine tests (7.7). Expect
   `# tests 400`, `# pass 400`. Commit with the subject above.
3. Write `session.ts` and `private-link.ts` (7.4) and their 4 tests. Expect `# tests 404`. Commit.
4. Write `runLinkBurstCase` (7.5) and the `-006`/`-008` specs (7.6). Local run (Cal up, `npm run up:cal`, then down):
   `RACE_TRIALS=3 npm run race:cal -- tests/cal/races/cal-race-006-private-link.spec.ts` → expected: 3 trials, a
   `suspected-bug` annotation per trial line, `1 passed` for the spec and `1 passed` for the histogram test. Then `-008` the
   same. `npm run test:unit` → `# tests 404`. Commit.
5. Write `runPendingRaceCase`, `waitQuiet` and the `-007`/`-009` specs. Local run with `RACE_TRIALS=3` for both files:
   expected `passed` for each spec and the suspected lines annotated. `npm run test:unit` → `# tests 404`. Commit.
6. CI (after owner review): edit `.github/workflows/perf.yml` per section 9. Run `npm run lint:actions` → exit 0. Commit.
   Open a PR only if the owner asks (rule 3, and the task rules).
7. README rows and BACKLOG items. `npm run format:check` → `All matched files use Prettier code style!`. Commit.

## 8. The rest of the build, in one place

Section 7.8 is the step list. The build stops after step 7 with the PR not opened (the owner asked for no PR in this task).
Run `npm run check` once more before any push, and read CI once after a PR is opened (rule 15).

## 9. CI changes and the time budget

### 9.1 CI changes (`.github/workflows/perf.yml`, job `cal-smoke`)

1. Add a step after "Start Cal (harness up)" (copy of the Documenso step "Map the webhook host", `perf.yml` line 884):

```yaml
- name: Map the webhook host
  run: |
    set -euo pipefail
    echo "127.0.0.1 ${P6_WEBHOOK_HOST}" | sudo tee -a /etc/hosts >/dev/null
    getent hosts "${P6_WEBHOOK_HOST}" | grep -q '^127\.0\.0\.1 '
```

`P6_WEBHOOK_HOST` is `p6-webhook.test` (`.env.example`); the job env gets it if it is not already set (Documenso's job sets
it at line 815). A second mapping of the same line is harmless because `tee -a` appends once per run.

2. Four race steps after the `-003` step, same shape as `-001` (`if: ${{ !cancelled() && steps.cal_up.outcome == 'success' }}`,
   `RACE_TRIALS` `'5'` on PRs and `'50'` otherwise, `P6_PLAYWRIGHT_JSON` under `results/playwright/`, `timeout-minutes`
   `5` on PRs and `10` otherwise).
3. Job `timeout-minutes` from 60 to **90** (section 9.2 arithmetic; open question O5).
4. No change to `race-histograms-cal` (its path already covers `results/races/`).

### 9.2 Time budget (planning assumptions, not measured; the first PR run measures them)

Assumptions, stated so the owner can change them: setup per trial (10 slot reads with overlap checks, link update) 3.0 s;
one 10-request burst 1.1 s (probe: 0.88 to 1.31 s, section 3.3); one confirm/cancel round 1.5 s burst plus 1.5 s quiet
window; cleanup of 10 bookings 1.0 s; rerun allowance (invalid budget `max(20 %, 2)` of 50 trials) 10 bursts per case.

| Case                     | Per trial (planning)          | 50 trials | Reruns allowance  | Warm-up | Per case (planning) | Step timeout (main) |
| ------------------------ | ----------------------------- | --------- | ----------------- | ------- | ------------------- | ------------------- |
| `-006` (cap 1)           | 3.0 + 1.1 + 1.0 = 5.1 s       | 255 s     | 10 × 5.1 s = 51 s | ~1 s    | ~5.1 min            | 10 min              |
| `-008` (cap 3)           | 5.1 s                         | 255 s     | 51 s              | ~1 s    | ~5.1 min            | 10 min              |
| `-007` (confirm‖cancel)  | 0.3 + 0.5 + 3.0 + 0.3 = 4.1 s | 205 s     | 10 × 4.1 s = 41 s | ~1 s    | ~4.2 min            | 10 min              |
| `-009` (confirm‖confirm) | 4.1 s                         | 205 s     | 41 s              | ~1 s    | ~4.2 min            | 10 min              |

- **New cases, total (planning):** about 19 min; worst case about 20 min with every rerun used.
- **Job, worst case:** harness up cap 40 min (`HARNESS_UP_TIMEOUT_MS` 2400000) + setup before it about 10 min (checkout,
  npm ci, yarn install, Prisma, bootstrap, build cache) + smoke 1 min + `-001` about 1.2 min + `-003` about 0.8 min + self-test
  about 1 min + new cases 20 min + summary and uploads about 3 min = **about 77 min**. Margin to the job timeout at 90 min:
  **13 min**, above the 10-minute rule (rule 20 (c)). At 60 min the job would time out in the worst case, which contradicts
  the roadmap (contradiction C4).
- **Typical main run** (warm build cache, `up` about 3 min): about 40 min total.
- **PR run** (5 trials): the four new cases about 2 min in total with reruns; the job stays well inside 90 min.
- Published numbers: none. These figures are planning values for the owner's review; section 9.3 says what the first run measures.

### 9.3 What the first CI run measures (not done here)

Per-case wall time, the number of invalid attempts per case, the observed per-trial setup cost, and the `up` duration. The
owner asked for "median of at least 3" published runs (roadmap rule); the plan does not publish any number until those runs
exist.

## 10. Test strategy (what each layer proves)

- Unit (`npm run test:unit`): the pure checks (`checkLinkCap`, `checkConfirmCancel`, `checkConfirmConfirm`, `checkStatusNotNull`),
  the HMAC check, the password extraction, the batch body, the link id, the SQL being read-only. These run on every PR.
- Local race runs (`RACE_TRIALS=3`, section 7.8 step 4 and 5): prove each spec runs end to end on the real app. They are
  not published (roadmap rule).
- CI race runs (`cal-smoke`): the histograms under `race-histograms-cal`, the full-count evidence the owner needs for labels
  (rule 13).

## 11. Risks

1. **The three suspected findings may not reproduce at CI scale.** The probe is 5 link bursts and 8 concurrent rounds on one
   VM. Mitigation: the cases record SUSPECTED only (D-C7); the owner labels after full-count runs; no `test.fail()` now.
2. **Webhook filter by uid (O1) is unverified.** If `payload.uid` is not the field, the per-booking counts are wrong. Mitigation:
   step 0 probe before step 1 (section 7.8).
3. **Webhook signature (O3) is unverified.** The probe used `secret: null`. Mitigation: step 0 with a secret; the HMAC check
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
  (section 9.2) is about 77 min. The plan proposes 90 (open question O5).
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

## 14. Open questions (proposed answers; the owner decides)

- **O1. Which field carries the booking uid in a webhook delivery?** Proposed: `body.payload.uid`, confirmed by the step 0 probe
  before step 1. If it differs, the plan changes section 5 only.
- **O2. Is the link increment after the booking row is written?** Proposed: yes, from the code path (section 3.3), confirmed by
  reading `Booking.createdAt` against the link update time in step 0. The answer does not change the cases, only the
  explanation in the findings.
- **O3. Does Cal sign deliveries when a secret is set, and in which format?** Proposed: the roadmap's `X-Cal-Signature-256` HMAC
  of the raw body, confirmed in step 0 with a secret. Not probed in this task (the probe used no secret).
- **O4. Where does the host password come from?** Proposed: the fork's seed file at run time (D-C6), the same way the harness
  reads the seeded API key. Alternative: a CI secret `CAL_HOST_PASSWORD`. Proposed: no new secret.
- **O5. Job timeout.** Proposed: 90 min (section 9.2). Alternative: a separate `cal-races` job with its own `up`, which costs
  about 25 min more per run in build time. Proposed: keep one job.
- **O6. Labels.** Proposed: F-C1, F-C2 and F-C3 stay SUSPECTED until full-count CI runs reproduce them, then the owner labels
  them (rule 13). No `test.fail()` in this task.
- **O7. Branch name.** Proposed: keep `feat/2026-10-23-p6-cal-state-races`, as the owner asked. Recorded as a deviation (D-C14).
- **O8. Priorities of `-008` and `-009`.** Proposed: P2 and P1 (section 1). Owner to confirm.
- **O9. Email gap.** Proposed: record it (D9), no harness change in this task.

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
  77 min worst job; 90-minute timeout with 13 min margin.
- **(d) Skeletons and commands:** every new function and test has a skeleton (7.1–7.7). Every step has its `git add` paths,
  commit subject, expected `npm run check` gate (`CHECK_EXIT=0`) and unit count (section 7.8). Items still to write in the build
  are marked as skeleton bodies, not left out.
- **(e) Owner answers.** No owner answer is recorded in this plan. Open items are marked as open (section 14).

## 16. Closeout notes

- **Merge SHA:** not merged. The build is stopped for owner review (rule 10: CI workflow change and a shared receiver move).
  No PR was opened (the task asked for none).
- **Plan commit:** the head of `feat/2026-10-23-p6-cal-state-races` after the plan commit (see the report header).
- **Findings (SUSPECTED, not labelled):**
  - F-C1: link cap ignored for acceptance. 10 of 10 accepted through a cap-1 link in 5 of 5 probe runs; 10 of 10 through a cap-3
    link in 1 run; the counter does stop at the cap.
  - F-C2: confirm ‖ cancel on a PENDING booking: both 200 and both side-effect sets in 4 of 4 rounds; final `accepted`.
  - F-C3: confirm ‖ confirm on a PENDING booking: both 200 and two `BOOKING_CREATED` deliveries in 4 of 4 rounds.
- **Environment finding:** `up:cal` OOM in this sandbox (section 3.1.1), a harness heap default that `NODE_OPTIONS` removes (H-heap).
- **Deviations:**
  - D-C14: branch name `feat/...` for the plan commit (rules 1 and 10 name `plan/...`); owner's instruction, same as Task 3b.
  - Probe error (recorded in section 3.3): the first link-burst run did not set `hasHashedBookingLink`; its 10 accepted bookings
    with no link row are not evidence of F-C1. Corrected in the next run; kept as a row.
  - The first `up:cal` attempt ran with the sandbox `NODE_OPTIONS`; the second with an explicit heap value. Both recorded.
- **Rule slips (honest record):**
  - I armed two duplicate Monitor watches and one stray one-minute reminder during the Cal start. I stopped or deleted all three
    before the probe ran; none wrote anything to the repo or to Cal.
  - A harness command was launched in a subshell whose wrapper reported "completed (exit 0)" before the real command finished.
    The real exit code was read from the exit file (`up-cal.exit`, `up-cal2.exit`). The reports use the real codes only.
  - Rule 15 (read CI once after pushing): no CI run exists for this branch (no PR, and `perf.yml` runs on PRs, `main`, nightly
    and dispatch only), so there is nothing to read yet.
  - The plan's CI and time figures are planning assumptions (section 9.2), not measured values; they are labelled as such.
