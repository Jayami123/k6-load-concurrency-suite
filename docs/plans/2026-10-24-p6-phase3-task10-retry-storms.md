# P6 Phase 3 Task 10: retry storms (`P6-CAL-LOAD-007`, `P6-MED-LOAD-006`, `P6-DOC-LOAD-007`, `P6-CAL-LOAD-009`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 10", D1, D5, D9.

**Interfaces assumed from the other Phase 3 plans** (must match the merged code at build time, §5 check 3): Task 3 (`LoadCase`, `Stage`, `runLoad`, `parseK6Summary`, `caseDataPrefix`, `iterationId`, `attendeeEmail`, `runJourney`, `openModelScenario`, `standardOptions`, `expectStatuses`), Task 4 (`judgeValidity`, `checkReadiness`), Task 6 ([task6](2026-10-24-p6-phase3-task6-load-reconciliation.md): audits, `composeStages`, `knownBugs`), Task 7 ([task7](2026-10-24-p6-phase3-task7-journey-smokes.md): the three journeys, product setup/cleanup, `LoadContext.secrets`), Task 8 ([task8](2026-10-24-p6-phase3-task8-med-load-conservation.md): `makeMedusaSetup({ stockFor })`, `classifyRefusal`), Task 9 ([task9](2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md): `documensoSetup({ webhookMode })`).

## 1. Header

- **Task.** Phase 3 Task 10. Cases: `P6-CAL-LOAD-007`, `P6-MED-LOAD-006` (P0), `P6-DOC-LOAD-007`, `P6-CAL-LOAD-009` (accepted extra 2026-10-22; gate passed, §3.5).
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-retry-storms`.
- **Base.** `origin/main` = `5acd2a0`, plus Tasks 3 to 9 merged (Medusa part needs Task 8; the roadmap says 7 and 8).
- **Harness pin.** Unchanged.
- **Environment change.** None.
- **Unit tests.** B = count on main when the build starts (today's chain: 743 after Tasks 1 to 9). This plan adds **+34** (§12); expected B + 34 (**777** today). Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 554 -> T4 597 -> T5 653 -> T6 686 -> T7 702 -> T8 719 -> T9 743 -> T10 777. Deltas are what counts if the tasks merge in another order.
- **Owner decisions taken (2026-10-24, recorded, not open).** D5 amended (Medusa LOAD steps in `medusa-load`, timeout 45, Task 7). Q1 a `-009` surplus fails the run, labelled `PRODUCT BUG (SUSPECTED; related to F-C1, different mechanism)`; the owner labels it after rule 13. Q2 accept 45 for the new job (not a raise). Q3 accept the final 30 s attempt. Q4 accept 1 intent per second, pending runner confirmation. All closed in §13.
- **Stop for owner review.** Yes (rule 10): `perf.yml` steps added in three jobs.

## 2. What it proves

- **A client that times out and retries the same request never causes a second effect.** One logical request (one intent) leaves one booking, one order with one payment and one stock decrement, one signature and one seal with one set of completion emails; and a single-use private link admits one booking however many retries arrive.
- **Finance and healthcare.** Side-effect exactly-once under retries: a retried payment must not charge twice and a retried prescription submit must not dispense twice. The retries are produced by the client giving up before the server finishes, which is the real shape of a retry storm.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3 runner, Documenso under `/opt/node24`, 4 vCPU, 16 GB), k6 2.3.0, products started with `npm run up:<product>` and stopped with `down`. Timings are **VM, proof only**. "Intent" = one logical request; every retry carries the same body.

### 3.1 Which timeout makes the server finish after the client gave up (probe item 1)

| Product / request                               | Server latency (VM)              | Client timeout tried                 | What the server saw                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cal `POST /api/book/event`                      | 110 to 240 ms (steady about 115) | 20 to 40 ms                          | the first request is still in flight when the retry arrives; the booking is created exactly once; the aborted first request can still leave a booking the client never learned of |
| Cal, timeout 70 ms or more                      |                                  | ≥ 70 ms                              | retries arrive after the first finished: they answer the sequential status (below); no overlap                                                                                    |
| Medusa `POST /store/carts/:id/complete`         | about 175 to 230 ms              | 100 ms (and any value up to 150 ms)  | the complete finishes after the client aborted; the retry answers 200 with the same order id                                                                                      |
| Documenso `recipient.completeDocumentWithToken` | tens of ms                       | 15 to 40 ms, then 3 parallel retries | the first call completes server-side; the parallel retries are answered `ALREADY_SIGNED` (one `SIGNED`, sometimes not seen by the client)                                         |

k6 `timeout` aborts the connection and reports status 0 (error code 1050); the server (checked in `cal-web.log` and the Medusa log counts) still finishes the request. Too short a timeout would stop the request before the server reads it; none of the values above did (every intent produced its side effect once).

### 3.2 Cal retry status (probe item 2, `P6-CAL-LOAD-007`)

```text
sequential identical retry (first finished):       409 {"message":"no_available_users_found_error"}      (not 400)
retry overlapping the in-flight first (timeout ≤ 40 ms):  400 redacted "An error occurred while querying the database."   = P6-OBS-CAL-001
timeout ≥ 70 ms:                                   409
accepted bookings per intent:                      exactly 1 (every run)
```

So the roadmap's expectation (the redacted 400, counted under `P6-OBS-CAL-001`) holds only for overlapping retries; sequential retries answer 409. Both are counted, neither is a new bug. The aborted first request can leak a booking the client never saw, so cleanup sweeps by attendee prefix using uids read from the database (Task 7 `calCleanup`).

### 3.3 Medusa retries: one order, one payment (probe item 4)

Node probe: with a client timeout ≤ 150 ms and an immediate retry, the retry returned 200 with the **same order id**; one order and one payment per cart. Native k6 probe, 21 iterations, timeout 100 ms plus retry:

```text
first attempts timed out 21 of 21; retries answered 200 21 of 21 (same order id as the DB order)
database: orders 21, payments 21, reservations 21 (one each per cart); stock reserved +21 (one unit per order)
```

Stock moves once per order and a payment is created once per cart (`payment_collection` and `payment` rows in `order_payment_collection`), not per attempt.

### 3.4 Documenso retries: one signature, one seal, one email set (probe item 5)

`completeDocumentWithToken` with a 15 to 40 ms client timeout and 3 parallel retries (same token): per recipient one response `SIGNED` (sometimes only the server knows), the others `ALREADY_SIGNED`; database: seal job 1, `DOCUMENT_COMPLETED` audit row 1, status `COMPLETED`, and **one completed email per recipient** (Inbucket message count). The retries are for the same recipient, so the `P6-OBS-DOC-002` mechanism (different recipients completing in parallel) is not exercised; recipients still complete one after the other.

### 3.5 Gate for `P6-CAL-LOAD-009` PASSES (probe item 3)

`P6-CAL-RACE-006` landed on `main` (`cal-race-006-private-link.spec.ts`, `src/cal/private-link.ts`: `setPrivateLinks`, `clearPrivateLinks`, `privateLinkId`; `src/cal/state-oracle.ts`: `readLinkState`, `readEventLinks`, `CASE_ACCEPTED_SQL`; session cookie from `loginAsHost` in `src/cal/session.ts`). From the LOAD runner the setup is reusable: it logs in as the host, saves the prior links, sets one cap-1 link per intent in one `setPrivateLinks` call (replace semantics), and restores the prior links in cleanup (the Phase 2 `run-state-case.ts` pattern).
Probe with `maxUsageCount` 1, `hasHashedBookingLink: true`, `hashedLink: <link>`, timeout 20 ms and 3 retries, 10 intents:

```text
per intent: 1 booking, HashedLink usageCount 1 of 1
retries: about 29 of 30 answered the redacted 400 (P6-OBS-CAL-001); occasionally 1 answered 200 ACCEPTED (the same booking, not a second one)
```

One intent has one link, so the parallel-admission bug `F-C1` (N different bookings through one link admit more than the cap, README Known product bugs) is not what is tested here; a surplus booking or `usageCount` above 1 for a link used by a single intent is reported as `PRODUCT BUG (SUSPECTED; related to F-C1, different mechanism)` (§7): the same surface (the cap is not enforced), but one intent with retries instead of N parallel intents.

### 3.6 Rates and what the probe could not confirm

Retries multiply the request rate by up to the number of attempts (Cal 4, Medusa 3, Documenso 4 for the retried request), so the fixed rates are **1 intent per second for all four cases** (half of Task 7's Cal rate). The Medusa and Documenso rates equal Task 7's validated 1 per second; the Cal rate follows the amplification rule. Build-time probe must confirm: (1) `dropped_iterations` 0 and a VALID verdict at 1 per second on the runner (three dispatch runs) and on the VM before the CI step is written; (2) that at least half of the first attempts time out at the chosen timeouts on the runner (§7 storm check); (3) the step times of §10; (4) that `hostPasswordFromProducts` works inside the `cal-smoke` job (it reads the seed output the job already produces).

## 4. Depends on earlier plans

The interface list above, plus from `main`: `src/cal/{api,payloads,oracle,session,private-link,state-oracle}.ts`, `src/medusa/{store,oracle,payloads}.ts`, `src/documenso/{account,api,payloads,oracle,inbucket,run-case}.ts`, `src/oracles/pg.ts`, README "Known product bugs" (`P6-OBS-CAL-001`, `F-C1`, `F-M2`, `P6-OBS-DOC-002`).

## 5. Build-time recheck

| #   | Check                       | Command                                                                                                                                                                                                                       | Expected                                                                                                  |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Base                        | `git fetch origin main && git log -1 --format=%h origin/main`                                                                                                                                                                 | descendant of `5acd2a0`                                                                                   |
| 2   | Baseline                    | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                                           | exit 0, `# tests` = B (743 once Tasks 1 to 9 are merged)                                                  |
| 3   | Earlier tasks merged        | `grep -n "export function runMedCheckout\|export function runCalBook\|export function runDocSign\|export function makeMedusaSetup\|export function classifyRefusal" k6/journeys/*.js src/load/products/*.ts k6/lib/pure/*.js` | all found; otherwise stop and report                                                                      |
| 4   | Link helpers still on main  | `grep -n "export" src/cal/private-link.ts src/cal/state-oracle.ts`                                                                                                                                                            | `setPrivateLinks`, `readLinkState`, `readEventLinks`; if gone, `-009` moves to "Later" with that evidence |
| 5   | Retry status                | with Cal up, one overlapping and one sequential retry (timeout 30 ms, then 300 ms)                                                                                                                                            | overlapping 400 redacted, sequential 409, one accepted booking                                            |
| 6   | Storm happens               | each case once on the VM (`npm run load:<case> -- --profile pr`)                                                                                                                                                              | at least half of the first attempts time out; one effect per intent                                       |
| 7   | Host password in the CI job | `hostPasswordFromProducts(process.env)` inside `cal-smoke` (first dispatch run)                                                                                                                                               | returns a password; otherwise `-009` setup is a TEST BUG to fix before merge                              |

## 6. Design

### 6.1 File tree

```text
k6/lib/retry.js                              NEW      pure: buildPlan, classifyAttempt; impure with injected deps: runAttempts
k6/journeys/cal-book.js, med-checkout.js, doc-sign.js     CHANGED  accept opts.retryPlan; the retried request is sent through runAttempts
k6/cases/cal-load-007.js, med-load-006.js, doc-load-007.js, cal-load-009.js (+ example JSON each)   NEW
src/load/retry-validity.ts                   NEW      judgeStorm (the storm actually happened)
src/load/retry-audit/{cal,medusa,documenso}.ts   NEW  judgeCalRetries, judgeMedusaRetries, judgeDocumensoRetries (pure) + readers
src/load/products/cal.ts                     CHANGED  calSetup({ privateLinks?: boolean }): saves prior links, sets one cap-1 link per intent; cleanup restores
src/load/cases.ts                            CHANGED  + the four cases
package.json                                 CHANGED  + load:cal-retry, load:medusa-retry, load:documenso-retry, load:cal-link-retry
.github/workflows/perf.yml                   CHANGED  LOAD steps in cal-smoke (2), medusa-load (1), documenso-smoke (1)
README.md                                    CHANGED  + case rows, standalone commands
tests/unit/k6-lib-retry.test.ts, retry-validity.test.ts, retry-audit-{cal,medusa,documenso}.test.ts, load-products-cal.test.ts (3 more)
```

### 6.2 `k6/lib/retry.js` (pure plus injected deps; tests run in Node)

```js
/** One attempt: { timeoutMs, delayMs, parallel }. parallel > 1 sends that many identical requests together (http.batch). */
export function buildPlan(spec) {
  // spec: { stormTimeoutMs, stormAttempts, parallelRetries, finalTimeoutMs, delayMs }  -> [{ timeoutMs, delayMs, parallel }, ..., { timeoutMs: finalTimeoutMs, delayMs, parallel: 1 }]
}
/** "ok" (2xx) | "timeout" (status 0) | "conflict" (409) | "redacted400" (400 with the Cal redacted message) | "refused" (other 4xx) | "server5xx" | "other". Pure. */
export function classifyAttempt(status, message) {
  /* ... */
}
/**
 * Sends the SAME request for each plan step until one answers "ok" or the plan ends.
 * send(step, n) -> [{status, message}] (an array of `parallel` results). deps: { sleep }.
 * Returns { attempts: [{ n, class }], resolved: boolean, last }. The logical-request id is not
 * generated here: the caller passes the same body every time, so the audit joins retries by the body's id.
 */
export function runAttempts(plan, send, deps) {
  /* ... */
}
```

The final step has a long timeout (30 s) so every intent ends with a definite answer; the short steps are the storm. Plans: Cal `buildPlan({ stormTimeoutMs: 35, stormAttempts: 3, parallelRetries: 1, finalTimeoutMs: 30000, delayMs: 0 })`; Cal link: `stormTimeoutMs: 20`; Medusa: `stormTimeoutMs: 100, stormAttempts: 2`; Documenso: first attempt `stormTimeoutMs: 25, stormAttempts: 1`, then `parallelRetries: 3`. Each journey adds counters: `p6_intents`, `p6_attempts`, `p6_first_timeouts` (the first attempt timed out), `p6_retry_ok`, `p6_retry_conflict`, `p6_retry_redacted400`, `p6_retry_refused`, `p6_retry_5xx`, and `p6_retry_order_mismatch` (Medusa: a 200 whose order id differs from another 200 of the same intent).
Journey changes (additive, Task 7 call sites unchanged because `opts.retryPlan` defaults to none): Cal `book` step, Medusa `complete` step (only that request is retried), Documenso `completeDocumentWithToken` of each recipient. Thresholds of the retry cases: `checks == 1` on the intent-level checks only (**no 5xx among attempts**, **every 200 of an intent carries the same order id/status contract**); `http_req_failed` is **not** a threshold here because a deliberate client timeout counts as a failed request.

### 6.3 `judgeStorm` (`src/load/retry-validity.ts`, pure)

```ts
export function judgeStorm(c: { intents: number; firstTimeouts: number; retries: number }): {
  ok: boolean;
  kind?: "TEST BUG";
  detail: string;
};
```

`firstTimeouts / intents ≥ 0.5` and `retries ≥ firstTimeouts`; otherwise `TEST BUG: no storm (N of M first attempts timed out)`. A run whose timeout is too short or too long has proven nothing, so it cannot PASS. The share 0.5 is a plan constant (probe: Medusa 21 of 21).

### 6.4 The audits (`src/load/retry-audit/*.ts`)

Readers use read-only SELECTs (prefix as parameter, `assertSelectOnly`); the judges are pure.

```ts
// cal.ts
export const CAL_ACCEPTED_PER_INTENT_SQL = `SELECT a.email AS intent, count(DISTINCT b.id)::int AS n
FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id WHERE a.email LIKE $1 AND b.status = 'accepted' GROUP BY a.email`;
export const CAL_LINKS_SQL = `SELECT link, "usageCount"::int AS "usageCount", "maxUsageCount"::int AS "maxUsageCount" FROM "HashedLink" WHERE "eventTypeId" = $1 AND link LIKE $2`;
export function judgeCalRetries(i: {
  intents: number;
  acceptedPerIntent: Record<string, number>;
  linkRows?: LinkRow[];
  counters: RetryCounters;
}): RetryJudgement;
// medusa.ts
export const MED_ORDERS_PER_INTENT_SQL = `SELECT o.email AS intent, count(*)::int AS n FROM "order" o WHERE o.email LIKE $1 AND o.deleted_at IS NULL GROUP BY o.email`;
export function judgeMedusaRetries(i: {
  intents: number;
  ordersPerIntent: Record<string, number>;
  paymentsPerOrder: number[];
  snapshot: OversellOracleSnapshot;
  counters: RetryCounters;
}): RetryJudgement;
// documenso.ts
export function judgeDocumensoRetries(i: {
  intents: number;
  rows: {
    status: string;
    sealJobs: number;
    completedAudit: number;
    signedRecipients: number;
    recipients: number;
    emailsPerRecipient: number[];
  }[];
  counters: RetryCounters;
}): RetryJudgement;
export interface RetryJudgement {
  findings: { check: string; ok: boolean; kind?: "PRODUCT BUG" | "TEST BUG"; detail: string }[];
  knownBugs: Record<string, number>;
}
```

Payments per order reuse Task 6's join (`order_payment_collection` → `payment`); the Documenso per-intent row joins on the title prefix, and completion emails are counted per recipient mailbox with `src/documenso/inbucket.ts`. Every `detail` is built from numbers.

### 6.5 Cal link setup (`src/load/products/cal.ts`)

`calSetup({ privateLinks: true })` adds: `cookie = await loginAsHost(...)` (into `ctx.secrets.CAL_HOST_COOKIE`, never `ctx.config`), `prior = await readEventLinks(pool, eventTypeId)` (kept in `ctx.handles.calPriorLinks`), `links = intents.map((_, i) => ({ link: privateLinkId(dataPrefix, i), maxUsageCount: 1 }))`, `await setPrivateLinks(base, cookie, eventTypeId, links)`; `ctx.config.links` lists the link ids (not secrets: they are the ids the booking body must carry) and `ctx.config.audit` gets `linkLike`. The journey's booking body for intent `n` carries `hasHashedBookingLink: true, hashedLink: links[n]`.
`calCleanup` additionally restores `prior` through `setPrivateLinks` (as `run-state-case.ts` does) and fails with `TEST BUG: prior links not restored` if the restore throws. The event type is shared with `cal-smoke`'s other steps, so the restore is mandatory and the step runs last in the job.

### 6.6 Cases

```ts
export const CAL_LOAD_007: LoadCase = {
  id: "P6-CAL-LOAD-007",
  title: "Cal booking retried after a short client timeout",
  product: "cal",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 2000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 2000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-007.js", env: {} }],
  stages: {
    setup: calSetup({}),
    reconcile: composeStages([calAuditStage, calRetryStage]),
    cleanup: calCleanup,
  },
};
// CAL_LOAD_009: calSetup({ privateLinks: true }), script cal-load-009.js, secretEnv: []
// MED_LOAD_006: setup makeMedusaSetup({ stockFor: (planned) => planned + 20 }), script med-load-006.js
// DOC_LOAD_007: setup documensoSetup({ webhookMode: "ok" }), script doc-load-007.js, secretEnv: ["DOCUMENSO_API_TOKEN"]
```

`maxLatencyMs` is high (2000 to 4000 ms) because the final attempt waits for the server; Little's-law sizing then gives enough VUs for the amplified in-flight requests.

## 7. Oracles and assertions

| Case             | Per-response (k6 checks, `== 1`)                                                                                                          | Post-load (audit)                                                                                                                            | If it fails                                                                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-007` Cal       | no attempt answers 5xx; every status is 0, 200, 400 (redacted message) or 409                                                             | exactly 1 accepted booking per intent; none for an intent that never reached the server is a TEST BUG; no duplicate                          | duplicate booking or a 5xx: PRODUCT BUG. Redacted 400 and 409 retries are **counted**: `knownBugs["P6-OBS-CAL-001"]` for the redacted 400, plain counter for 409; not violations                                 |
| `-009` Cal link  | same as `-007`, booking body carries the link                                                                                             | 1 booking per link, `usageCount == 1`                                                                                                        | a link with 2 bookings or `usageCount > 1`: **PRODUCT BUG (SUSPECTED; related to F-C1, different mechanism)**, fails the run, the owner labels after rule 13 repeats; `usageCount 0` with a booking: PRODUCT BUG |
| `-006` Medusa    | no 5xx; all 200s of an intent carry the same order id (`p6_retry_order_mismatch == 0`); a retry never answers 200 with a different `type` | 1 order per intent email; 1 payment per order; `reserved == orders == reservations` (stock −1 once per order); no ghost order                | two orders for one intent: PRODUCT BUG; a ghost order (DB orders above client intents) goes to `knownBugs["F-M2"]` (Task 6 rule)                                                                                 |
| `-007` Documenso | no 5xx; every response is `SIGNED` or `ALREADY_SIGNED`                                                                                    | per document `COMPLETED`, 1 seal job, 1 `DOCUMENT_COMPLETED` audit row, every recipient signed once, exactly 1 completed email per recipient | a second seal or a second email: PRODUCT BUG (a double seal is also reported under `knownBugs["P6-OBS-DOC-002"]` and `unexpected`, Task 6)                                                                       |
| all              | `judgeStorm`: at least half of the first attempts timed out and retries were sent                                                         |                                                                                                                                              | TEST BUG (no storm proves nothing)                                                                                                                                                                               |
| all              | `dropped_iterations == 0`, VUs below the cap, runner not saturated                                                                        |                                                                                                                                              | INVALID (Task 4), never hides a correctness failure                                                                                                                                                              |

**PRODUCT BUG vs TEST BUG.** A duplicate side effect, a 5xx, a changed order id or a surplus beyond a link's cap is a PRODUCT BUG with the per-intent counts as evidence. A run in which the storm did not happen, a missing setup row, a failed restore of the prior links or a failed cleanup is a TEST BUG. The Cal retry statuses (redacted 400, 409) are expected and counted, not failures. No `test.fail()`: nothing new was proven by the probe; a duplicate effect in the build run follows rule 13 (repeat, SUSPECTED, report).
**Conflict with Task 6.** Task 6 counts known bugs without failing the run (Q1 there). For `-009` the whole claim is "one booking per link", so a surplus is reported as `PRODUCT BUG (SUSPECTED; related to F-C1, different mechanism)` **and fails** the run (owner decision Q1: this exception to the count-only rule is confirmed; the owner assigns a label only after the repeats of rule 13). Task 6's other change applies here too: an `unexpected` entry (for example a Documenso double seal with sequential completions) fails the run as `PRODUCT BUG (SUSPECTED)`.

## 8. Data isolation, cleanup, leak check

- Prefix `caseDataPrefix(runPrefix, caseId)`; the intent id is `iterationId(prefix, n)` in the attendee email, the cart email, the document title and the link id, so the audit joins every retry to one intent.
- Cleanup sweeps by prefix from the database (an aborted first request can leave a booking, order or document the client never learned of): Cal cancels uids read from `caseLiveBookings` (Task 7) and restores the prior links; Medusa sweeps orders by email prefix, the product and the customers; Documenso deletes envelopes by title prefix and ends the run (`endRun`).
- Leak checks per product after cleanup are asserted (a Cal link left behind fails as TEST BUG: the event type is shared).
- Cal slot supply is not consumed by retries: retries carry the same slot, so supply stays `planned` (60 of 320 per window at the full profile of Task 7's maths, 30 here).

## 9. Token scan

New artefacts: `audit.json` per case with the retry judgement (counts and ids), counter summaries. The Cal host cookie and the Documenso token travel in `ctx.secrets` only; `k6-config.json` holds the link ids (ids the product exposes in its public URLs, not credentials) and the run prefix; signing tokens never reach labels (Task 7 rules). A unit test passes a built config and an audit result for each case through `findHits`. The job-level `results/load` scan runs before the upload.

## 10. CI budget

Convention (one for every Phase 3 plan, Task 3 §9): worst case = Phase 2 closeout §2.7 worst case + the Task 1 cold start (Medusa +1.1, Cal +3.0, Documenso +2.0 estimate) + the image pull at its 6-minute cap minus the measured 0.3 (+5.7) + each new step, "estimates" at its measured/estimated duration and "at caps" at its `timeout-minutes`; at least 10 minutes under the job timeout; no existing job timeout raised. Bases: `cal-smoke` 9.7 (run 39741411392) + 3.0 + 5.7 = **18.4**; `documenso-smoke` 6.9 (run 39821517901) + 2.0 + 5.7 = **14.6**; `medusa-load` (new) from its measured parts. VM step time per case (full profile): setup 1 to 5 + k6 30 + drain/audit 2 + cleanup 3 to 14 + scan 5 ≈ 45 to 56 s, ×2 for the runner = about 1.5 to 2 min.

Step caps: Cal and Medusa LOAD steps `timeout-minutes: ${{ github.event_name == 'pull_request' && 4 || 6 }}` (estimate 1.5 to 1.6, 80 % stop rule 4.8 main and 3.2 PR); the Documenso step follows the one Documenso rule of Task 9 §10: **4 on `main`/dispatch, 3 on PRs** (estimate 1.5, stop rule 3.2 and 2.4).

| Job                 | Base (min)                                                                                       | Task 3 install (estimate / cap) | Retired smoke | Steps (estimates / caps)                                                 | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin (caps) |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- | ------------- | ------------------------------------------------------------------------ | ---------------------- | -------------------- | ------- | ------------- |
| `cal-smoke`         | 18.4                                                                                             | 0.04 / 2.0                      | −0.02         | Task 7 1.4 / 6, `-007` 1.5 / 6, `-009` 1.6 / 6                           | 22.9                   | **38.4**             | 60      | **21.6**      |
| `documenso-smoke`   | 14.6                                                                                             | 0.04 / 2.0                      | −0.02         | Task 7 1.5 / 4, Task 9 `-002` 1.5 / 4 and `-008` 1.5 / 4, `-007` 1.5 / 4 | 20.6                   | **32.6**             | 45      | **12.4**      |
| `medusa-load` (new) | install 0.04 / 2.0, pull 0.3 / 6.0, start 0.9 / 1.0, overhead 2.0, scan and upload 1.0, cold 1.1 |                                 | n/a           | Task 7 1.9 / 6, Task 8 1.7 / 6, `-006` 1.5 / 6                           | 10.4                   | **31.1**             | **45**  | **13.9**      |

(`medusa-load` at caps: 2.0 + 6.0 + 1.0 + 2.0 + 18 + 1.0 + 1.1 = 31.1; it would be 32.1 if the install step kept the old 3-minute cap.) Each new step also has its own estimate and stop rule in the table above and in the Task 7 to 9 plans; token scan cap 2 (estimate 0.1, stop 1.6) and upload cap 3 (estimate 0.2, stop 2.4) in each job.

**Timeout of the new job (owner decision Q2).** `medusa-load` takes `timeout-minutes: 45` (the value of `medusa-smoke`); it is a new job, so no existing timeout is raised, and the Task 7 and Task 8 plans carry the same value. `documenso-smoke` keeps 45 and has 12.4 minutes of margin even at caps. The Phase 2 follow-ups that stack on the existing Medusa jobs (F-M4 `test.fail()` with 5 PR trials in `medusa-cancel-extras`; `P6-MED-RACE-009` PR trials 13 → 20 in the `medusa-smoke` race step; the 24.1 vs 24.0 stop-rule BACKLOG item) are listed in Task 7 §10 and are not touched here. Trials: none (not a race).

## 11. Environment changes

None. The Cal host password comes from the seed output the job already produces; nothing new for Cursor Cloud or Claude Code cloud.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-retry-storms origin/main` (after Tasks 7, 8, 9 are merged). Counts relative to B (B = count on main when the build starts; 743 today after Tasks 1 to 9).

| Step | Commit subject                                                      | `git add` paths                                                                                                                                                                                                                                                                                                               | `npm run check` expected           |
| ---- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0    | `docs(plans): bring the phase 3 task 10 plan onto the build branch` | `docs/plans/2026-10-24-p6-phase3-task10-retry-storms.md`                                                                                                                                                                                                                                                                      | exit 0, B                          |
| 1    | `feat(k6): add the retry plan library`                              | `k6/lib/retry.js tests/unit/k6-lib-retry.test.ts`                                                                                                                                                                                                                                                                             | exit 0, **B + 9**                  |
| 2    | `feat(load): judge that the retry storm happened`                   | `src/load/retry-validity.ts tests/unit/retry-validity.test.ts`                                                                                                                                                                                                                                                                | exit 0, **B + 12**                 |
| 3    | `feat(load): audit cal retries and private-link usage`              | `src/load/retry-audit/cal.ts tests/unit/retry-audit-cal.test.ts`                                                                                                                                                                                                                                                              | exit 0, **B + 20**                 |
| 4    | `feat(load): audit medusa retries`                                  | `src/load/retry-audit/medusa.ts tests/unit/retry-audit-medusa.test.ts`                                                                                                                                                                                                                                                        | exit 0, **B + 26**                 |
| 5    | `feat(load): audit documenso retries`                               | `src/load/retry-audit/documenso.ts tests/unit/retry-audit-documenso.test.ts`                                                                                                                                                                                                                                                  | exit 0, **B + 31**                 |
| 6    | `feat(load): set and restore cal private links for load runs`       | `src/load/products/cal.ts tests/unit/load-products-cal.test.ts`                                                                                                                                                                                                                                                               | exit 0, **B + 34**                 |
| 7    | `feat(k6): send the retried request through the retry plan`         | `k6/journeys/cal-book.js k6/journeys/med-checkout.js k6/journeys/doc-sign.js k6/cases/cal-load-007.js k6/cases/med-load-006.js k6/cases/doc-load-007.js k6/cases/cal-load-009.js k6/cases/cal-load-007.example.json k6/cases/med-load-006.example.json k6/cases/doc-load-007.example.json k6/cases/cal-load-009.example.json` | exit 0 (`k6 inspect` ok), B + 34   |
| 8    | `feat(load): register the four retry storm cases`                   | `src/load/cases.ts package.json`                                                                                                                                                                                                                                                                                              | exit 0, B + 34                     |
| 9    | `ci(perf): run the retry storm loads in the product jobs`           | `.github/workflows/perf.yml`                                                                                                                                                                                                                                                                                                  | exit 0 (actionlint silent), B + 34 |
| 10   | `docs: document the retry storm load cases`                         | `README.md`                                                                                                                                                                                                                                                                                                                   | exit 0, B + 34                     |

New unit tests, by name (34): `k6-lib-retry` (9: the plan ends with the long final step; parallel step sends N requests; `classifyAttempt` for 200, 0, 409, redacted 400, other 4xx, 5xx; `runAttempts` stops at the first ok; it sends the same body object every time; it sleeps only when `delayMs > 0`); `retry-validity` (3: half of first attempts timed out passes; none timed out is TEST BUG; retries fewer than timeouts is TEST BUG); `retry-audit-cal` (8: one booking per intent passes; a duplicate booking per intent; redacted 400 retries go to `knownBugs["P6-OBS-CAL-001"]`; a 5xx; accepted missing though the client saw 200; link usage 1 of 1 passes; link `usageCount` 2 → PRODUCT BUG (SUSPECTED; related to F-C1); a link with 2 bookings); `retry-audit-medusa` (6: clean; two orders for one intent; two payments for one order; `reserved` differs from orders; order id mismatch counter above 0; ghost order goes to `knownBugs["F-M2"]`); `retry-audit-documenso` (5: clean; second seal; second email for one recipient; a recipient not signed; `ALREADY_SIGNED` never seen is allowed); `load-products-cal` (+3: one cap-1 link per intent with unique lower-case ids; the host cookie is in `ctx.secrets` and not in `ctx.config`; a failed restore of the prior links is a TEST BUG line). Sum 9 + 3 + 8 + 6 + 5 + 3 = **34**.
Before step 9 run each case once on the VM (`npm run up:<product>`; `npm run load:cal-retry -- --profile pr`, `load:cal-link-retry`, `load:medusa-retry`, `load:documenso-retry`; `down`): all PASS with a real storm (`judgeStorm` ok). After step 10: `git push -u origin feat/<build date>-p6-retry-storms`, `gh pr create` (rule A3), read CI once (rule 15), one `workflow_dispatch` on `main` after merge. Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                                                                          | Mitigation                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Timeout too short (nothing reaches the server) or too long (no retries)                       | `judgeStorm` makes both a TEST BUG; timeouts come from the probe table (§3.1)                                                  |
| R2  | Retries amplify load into saturation                                                          | 1 intent per second; validity (Task 4) turns saturation into INVALID                                                           |
| R3  | An aborted first request leaves rows the client never saw                                     | cleanup sweeps by prefix from the database                                                                                     |
| R4  | The shared Cal event type keeps a link after a failed run                                     | prior links are saved and restored; a failed restore is a TEST BUG; the step runs last in `cal-smoke`                          |
| R5  | The Medusa 100 ms timeout is too long on a fast runner (complete finishes before the timeout) | `judgeStorm` shows it; the build lowers the timeout to the largest value that gives at least half timeouts, recorded in the PR |
| R6  | Documenso parallel retries trip `P6-OBS-DOC-002`                                              | recipients complete one after the other; any double seal goes to `unexpected` (new evidence)                                   |

**Contradictions with the roadmap.**

| #   | Roadmap says                                     | Probe shows                                                                   | Effect                                                       |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| C1  | Cal retry status expected to be the redacted 400 | an overlapping retry answers the redacted 400, a sequential retry answers 409 | both counted; only the redacted 400 goes to `P6-OBS-CAL-001` |
| C2  | "one LOAD step per product job"                  | Cal has two cases (`-007`, `-009`)                                            | two steps in `cal-smoke`                                     |
| C3  | (Task 7 plan) `medusa-load` timeout 30           | three LOAD steps at caps reach 31.0 min                                       | new job takes 45; Tasks 7 and 8 plans updated                |

**Observations, no new bug label proposed.** `P6-OBS-CAL-001` reproduces under retries (counted). An aborted Cal booking request can still create a booking the client never learns of: expected for a request that was already read, covered by the one-booking-per-intent assertion.

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-CAL-LOAD-012`: backoff variants for the Cal retry (delay 0, 100 and 300 ms) to chart the redacted-400 share against retry spacing (a characterisation of `P6-OBS-CAL-001`).
- `P6-MED-LOAD-011`: the Medusa retry storm on the payment-session step (`payment-sessions`), not only on complete.
- `P6-X-LOAD-020`: expose the retry plan numbers in `run-meta.json` so a reader sees the timeouts used.

**Owner decisions (all four questions closed 2026-10-24).**

- **Q1 (closed: fail the run, labelled `PRODUCT BUG (SUSPECTED; related to F-C1, different mechanism)`; the owner labels after rule 13).** `-009`: a surplus booking or `usageCount > 1` is reported as `F-C1` and fails the run (proposed, an exception to Task 6's count-only rule). Accept?
- **Q2 (closed: accept 45; a new job, not a raise).** New job `medusa-load` with `timeout-minutes: 45` (so three LOAD steps at their caps stay 14 minutes under it). Accept?
- **Q3 (closed: accept the final 30 s attempt).** Retries use a final 30 s attempt after the short storm attempts, so every intent gets a definite answer. Accept, or keep every attempt short?
- **Q4 (closed: accept, pending runner confirmation by three dispatch runs).** Rate 1 intent per second for all four cases: accept?

## 14. Done when (roadmap, made measurable)

- [ ] `P6-CAL-LOAD-007`, `P6-MED-LOAD-006`, `P6-DOC-LOAD-007` VALID and green with a real storm (`judgeStorm` ok) on the PR and once on `main`; known `P6-OBS-CAL-001` counted under its ID, not as a failure.
- [ ] `P6-CAL-LOAD-009` lands the same way (gate passed, §3.5); if the helpers are gone at build time it is listed under "Later" with the evidence.
- [ ] Per intent exactly one booking / one order with one payment and stock −1 / one signature, one seal and one email set / one booking per link; or a proven product bug is recorded with repeated evidence (rule 13).
- [ ] Artefacts shipped (summary, telemetry, chart, `run-meta.json`, `audit.json`) after a clean token scan; the prior Cal links are restored.
- [ ] `npm run check` exit 0 with **B + 34** (777 on today's chain); no existing job timeout raised; every new step has `timeout-minutes`.

## 15. Rule 20 self-check

- (a) Done-when in §14; gaps: the rate and the storm share on the runner (§3.6), the host password in the CI job (§5 check 7), settled at build time and by three dispatch runs.
- (b) Existing names grepped at `5acd2a0`: `src/cal/{private-link,state-oracle,session,oracle,api}.ts` (`setPrivateLinks`, `privateLinkId`, `readLinkState`, `readEventLinks`, `CASE_ACCEPTED_SQL`, `loginAsHost`, `hostPasswordFromProducts`, `caseLiveBookings`), `src/medusa/oracle.ts` (`ORDERS_FOR_VARIANT_SQL`, `readOversellSnapshot`), `src/documenso/*`, README Known product bugs. NEW: `buildPlan`, `classifyAttempt`, `runAttempts`, `judgeStorm`, `judge*Retries`, `CAL_ACCEPTED_PER_INTENT_SQL`, `CAL_LINKS_SQL`, `MED_ORDERS_PER_INTENT_SQL`, the four cases and scripts. Names from Tasks 3 to 9 are checked at build time (§5 check 3).
- (c) CI time: §10, estimates and caps (`cal-smoke` 38.4 of 60, `documenso-smoke` 32.6 of 45, `medusa-load` 31.1 of 45).
- (d) Skeletons: §6. Steps with `git add` paths and expected counts: §12.
- (e) The owner's answers to Q1 to Q4 are recorded in §1 and §13.
