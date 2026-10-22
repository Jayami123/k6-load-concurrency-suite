# P6 Phase 2 Task 2: Medusa money races (plan, revision 1)

This is the implementation plan a weaker model will build from. Do not write code until the maintainer approves this
document.

Structure follows [2026-10-22-p6-phase2-task1-rerun-on-spread.md](2026-10-22-p6-phase2-task1-rerun-on-spread.md). The
source of this task is [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md), section "Task 2: Medusa money
races", decisions D5, D6, D12, and "Notes on the agreed order" items 4 and 8 (the gift-card gate). The framework it builds
on is Task 1 (rerun-on-spread, merged in PR #27 on this branch).

**Probe status (read this first).** Section 2 holds the **static** findings: read-only reads of the pinned Medusa source
(`MEDUSA_REF` `f677db43`, checked out at `/home/user/products/medusa-dtc-starter`, `@medusajs/*` 2.21.2). No Medusa stack
was started and no request was sent for this plan. The roadmap requires a **live** probe first (its "The live probe must
confirm" list, §2.5 below). That probe is Build step 0 and its output is pasted into this plan before any code is
written. Where a finding below is marked **static**, it is a hypothesis from code and must be confirmed live.

## Context

- Repo: `k6-load-concurrency-suite` (P6). Plan written on branch `claude/wonderful-meitner-a7ql20` (the designated branch
  for this session). The build branch is named in the roadmap's task table as `feat/<date>-p6-med-money-races`; the build
  will use the branch named by the maintainer.
- Harness `qa-portfolio-harness#v0.2.11`. Never edit the Medusa fork or `node_modules/qa-portfolio-harness`.
  `scripts/harness.mjs` starts and stops Medusa (`npm run up:medusa`, `npm run down:medusa`); every probe run ends with
  `npm run down:medusa`.
- Cases in this task: `P6-MED-RACE-007` (P1, refunds ≤ captured), `P6-MED-RACE-011` (accepted extra, partial-refund
  boundary), `P6-MED-RACE-010` (accepted extra, captures ≤ authorized, gated on capture being a separate step).
  `P6-MED-RACE-006` (gift card, P0) is **gated by D5** and is expected to move to "Later" (§2.1, §5).
- Owner decisions that apply: **D2** (valid when `dispatchSpreadMs ≤ RACE_MAX_SPREAD_MS`), **D3** (only spread makes an
  attempt invalid; product violations always count), **D4** (top-level `statusCounts` count valid attempts only), **D5**
  (no gift-card plugin: P6 never changes the Medusa fork), **D6** (trial counts: small on PRs, full on `main`, nightly and
  dispatch), **D12** (`-010` and `-011` are in scope with their proposed IDs). Task 1 decisions D26 to D33 apply
  unchanged (warm-up burst D28, `trials[]`/`attempts[]` histogram D30).
- Primitive (roadmap "Primitive bar"): **money never goes negative**, **money never over-returned**. Transfers to finance
  (prepaid card double spend, capture or refund over the authorised amount) and to healthcare billing (a payout cap on a
  claim).

## 1. Header

- Plan date 2026-10-22 (UTC). Static reads done in a Claude Code cloud session on the same date.
- Baseline: `main` at the merge of PR #27 (`147d94b`), `npm run check` must be green before the build starts (Step 0).
- Live numbers (time per attempt, race outcomes) are **proof only** until a GitHub Actions run; published numbers come
  only from Actions (median of at least 3 runs), per AGENTS.md.
- Secrets: the Medusa admin password comes from the harness config or the environment (`src/medusa/admin.ts` already does
  this). Nothing from a probe goes into this plan, the histograms or the logs.

## 2. Probe findings

### 2.1 Summary

| #   | Question                                    | Finding (static unless marked live)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Gate for `-006` (gift card at `MEDUSA_REF`) | **Static: no gift-card feature.** No file or directory named `*gift*` or `*store-credit*` in the installed `@medusajs/*` packages (whole tree searched); no gift-card admin or store route; `medusa-config.ts` has no `plugins` and no `modules`. The only "credit" hits are `credit_line_*` order-total fields. Likely outcome: `-006` moves to "Later" (D5). Live confirmation: §2.5 P1.                                                                                                              |
| G2  | Refund route and guard                      | **Static:** `admin/payments/[id]/refund` exists. `core-flows/dist/payment/workflows/refund-payment.js` line 33 throws `INVALID_DATA` "You are not allowed to refund more than the captured amount"; the check reads `payment.captures` and `payment.refunds` **before** the refund step. `acquireLockStep` appears in `dist/payment` only in `process-payment.js`, not in `refund-payment.js`. So the check-then-act window the roadmap names is in the code. Whether it is reachable is for the probe. |
| G3  | Capture route and guard                     | **Static:** `admin/payments/[id]/capture` exists; `capture-payment` workflow exists. The payment module has the comment `// TODO: what checks should be done here? e.g. captured_amount === amount?` (`payment/dist/services/payment-module.js` line 143). Auto-capture is a code path (`isAutoCaptured = !!payment?.captured_at`, line 332).                                                                                                                                                           |
| G4  | Does checkout auto-capture with `system`?   | **Static, open.** The `system` provider's `authorizePayment` returns status `AUTHORIZED` (`payment/dist/providers/system.js` lines 25–26), so checkout alone does not capture. Whether `completeCart` sets `captured_at` for this stack is **not settled**: it decides the gate for `-010`.                                                                                                                                                                                                             |
| G5  | Promotion lock (for Task 3, noted here)     | **Static:** `promotion-module.js` line 76 says the budget row is locked by the caller (`registerUsage`); lines 145 to 152 lock promotion rows in id order. Not used by Task 2.                                                                                                                                                                                                                                                                                                                          |
| G6  | Setup per attempt                           | Reuses Task 1 style: `createStockedVariant` and `prepareReadyCart` in `src/medusa/admin.ts` / `store.ts`, then `completeCart` (`src/medusa/store.ts` line 147) gives an order. Product handle per attempt via `attemptTag` (Task 1 §2.6, live). A captured order cannot be cancelled in the same way as an open one; cleanup is **open** (§2.5 P8).                                                                                                                                                     |
| G7  | Where money is read                         | Captures and refunds are rows of the payment module (`capture`, `refund`, `payment` tables; exact names and the `raw_amount` JSON shape are **static guesses**; §2.5 P4).                                                                                                                                                                                                                                                                                                                               |

### 2.2 Gate result for `-006` (D5)

Static evidence, to be confirmed live (§2.5 P1):

- `apps/backend/medusa-config.ts` (the whole file): `projectConfig` only; no `plugins`, no `modules`.
- The installed `@medusajs/*` packages contain no gift-card module. `find -L` over `apps/backend/node_modules/@medusajs`
  for `*gift*` and `*store-credit*` returns nothing.
- `dist/api/store` and `dist/api/admin` have no `gift-cards` directory.
- The store query configs mention `credit_line_subtotal`, `credit_line_tax_total`, `credit_line_total` (order-edit
  totals). Those are totals of an order change, not a spendable balance. They do not make `-006` runnable.

**Recommendation:** `P6-MED-RACE-006` moves to "Later" with this evidence (D5). The money primitive stays covered by
`-007`, `-010` and `-011`. No `med-race-006-gift-card.spec.ts` is created. The README and the Task 9 closeout record the
move. If the live probe finds a gift-card route, this recommendation is withdrawn and the owner decides (D5 forbids a
fork change, so a route in the pinned stack is the only way `-006` lands).

### 2.3 Gate result for `-010` (capture is a separate step)

Decision rule (roadmap, Task 2 probe item 2): `-010` stays in scope only if a `system`-provider checkout leaves the
payment **authorized and uncaptured** (`captured_at` null, zero `capture` rows) so that an admin capture is a separate
request. Static reading (G3, G4) says the path exists but does not settle the default. The live probe decides (P3). If
checkout captures automatically, `-010` moves to "Later" with that evidence, the same as `-006`.

### 2.4 The two refund cases: what the code says will race

For `-007` (N parallel refunds of X on one captured X) the expected behaviour is one success and N − 1 clean `400`
responses with the message from line 33. The code path that could break this:

1. Request A and request B both load the payment (captured X, refunded 0) before either commits its refund.
2. Both pass the guard in `validateRefundPaymentExceedsCapturedAmountStep`.
3. Both create a refund of X. The refunded sum is 2X against a captured X.

Whether step 1 happens in practice is a timing question, which is what the probe and the 50-trial run answer. The
roadmap is explicit that this is a check-then-act window with no lock step in `refund-payment.js`; the outcome is not
assumed.

For `-011` (N parallel refunds of X/2 on one captured X) the expected result is exactly two successes, a refund sum of
exactly X, and N − 2 clean 4xx. Three successes is the product violation, two successes with a sum other than X is a
product violation of the other kind, and fewer than two successes with no reason shown is a violation too (a valid
refund refused) and needs evidence before it is called a bug (§10).

### 2.5 Live probe output (not run yet)

The live probe (§2.5) is required before code. The output section is left empty on purpose. The build must paste the
real output here (route, body, status, body text, timing) and cite the run that produced it. No value in this section is
a guess.

| Probe item                            | Result (paste the real output) |
| ------------------------------------- | ------------------------------ |
| P1 gift-card routes                   | _pending_                      |
| P2 capture/refund bodies and statuses | _pending_                      |
| P3 checkout auto-capture              | _pending_                      |
| P4 table names and `raw_amount` shape | _pending_                      |
| P5 amounts (X integer, X/2)           | _pending_                      |
| P6 race outcome, proof only (3 runs)  | _pending_                      |
| P7 time per attempt                   | _pending_                      |
| P8 cleanup of a captured order        | _pending_                      |

### 2.6 What the repo already has (reused, not re-planned)

| Need                               | Where                                                                                                           | Status                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Stocked product per attempt        | `createStockedVariant` (`src/medusa/admin.ts` line 131)                                                         | reuse; the attempt tag is in the handle    |
| Ready carts, complete              | `prepareReadyCart(s)`, `completeCart` (`src/medusa/store.ts` lines 54, 139, 147)                                | reuse                                      |
| Cancel and archive, product delete | `cancelAndArchive`, `deleteProduct` (`src/medusa/admin.ts` lines 197, 211)                                      | reuse; check it works on a paid order (P8) |
| Payload helpers, prefixes          | `src/medusa/payloads.ts` (`casePrefix`, `caseLeakPattern`, `prefixedEmail`, `setupStepError`, `cleanupFailure`) | reuse                                      |
| Oracle + leak check                | `src/medusa/oracle.ts` (`readOversellSnapshot`, `leakCheck`)                                                    | reuse the pattern, new SQL constants       |
| Invariant helpers                  | `src/medusa/invariants.ts` (`checkOversellInvariants`)                                                          | reuse the shape                            |
| Per-trial runner                   | `createRerunRunner` (`src/races/rerun-on-spread.ts` line 96), `fireTogether`                                    | reuse as Task 1 does in `runOversellCase`  |
| Per-test run                       | `playwright.config.ts` project `medusa-race`, `timeout: 60_000` default, the oversell spec sets its own         | reuse                                      |

### 2.7 Files and tests that read the same code today

- `src/medusa/run-case.ts` (305 lines) is the oversell case. The money cases get their own module, not a grown
  `run-case.ts` (the roadmap allows this; §6 decides).
- `tests/medusa/races/med-race-001-oversell.spec.ts` (120 lines) is the spec shape to copy.
- `tests/medusa/races/framework-self-test.spec.ts` (149 lines) fires the runner; the money cases need no change to it.

## 3. Goal and scope

**Goal.** Prove that, under contention, the Medusa payment module never captures more than is authorised and never
refunds more than is captured. A case that breaks the rule is recorded as a product bug with repeated-run evidence, not
hidden.

**In:**

- `P6-MED-RACE-007`, `-011`, `-010` (the last only if G4 / P3 confirms a separate capture step).
- Admin client calls for capture, refund and reading a payment.
- Pure money helpers and invariants, with unit tests.
- Oracle SQL for captured and refunded sums per payment.
- One CI step in `medusa-smoke` for the new specs.
- README and `.env.example` changes (only if an env name is added; §12).

**Out:**

- `P6-MED-RACE-006` (D5; moves to "Later"). No plugin, no fork change.
- Any change to `runTrials`, `fireTogether`, `src/races/rerun-on-spread.ts` behaviour, `src/oracles/pg.ts`, the harness,
  the Medusa fork.
- Cases in Task 3 (`-005`, `-008`, `-009`, `-012`).
- Trial-count changes beyond what §12 says; job timeouts (D24 of Task 1 applies: no timeout change in this task unless
  the probe proves the job cannot fit; then the plan says so and the maintainer decides).
- Playwright `retries` (stay 0), `test.fail()` outside a proven product bug with repeated-run evidence (§10).

## 4. Test-case mapping

| Case                                      | Title (keep the case ID in the title)              | Spec                                                      | Oracle (per attempt, after the burst)                                             | Expected result                                              |
| ----------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `P6-MED-RACE-007` (P1)                    | refunds of X on one captured payment               | `tests/medusa/races/med-race-007-refunds.spec.ts`         | `refundedSum ≤ capturedSum` (raw amounts, integer); successes = 1; losers are 4xx | pass; a proven over-refund is `test.fail()` with evidence    |
| `P6-MED-RACE-011` (accepted extra)        | N parallel refunds of X/2                          | `tests/medusa/races/med-race-011-partial-refunds.spec.ts` | successes = 2; `refundedSum = capturedSum`; losers 4xx                            | pass; violations as §10                                      |
| `P6-MED-RACE-010` (accepted extra, gated) | N parallel captures of X on one authorised payment | `tests/medusa/races/med-race-010-captures.spec.ts`        | `capturedSum ≤ authorizedAmount`; successes = 1; losers 4xx                       | pass or proven bug; moves to "Later" if G4 says auto-capture |

Each case fires the Task 1 untimed **warm-up burst** first (D28). The warm-up has its own order and its own cleanup, so a
warm-up refund or capture never reaches a counted attempt.

## 5. Extras and follow-ups

| #   | Item                                                 | Decision                                                                                                                                                      |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D5  | `-006` gift card                                     | Moves to "Later" (§2.2), pending P1.                                                                                                                          |
| G4  | `-010` gate (auto-capture)                           | Decided by P3. Either the case lands or it moves to "Later" with the evidence.                                                                                |
| F1  | Refund rounding and decimal amounts                  | Out of this task. The amounts are chosen as integers (§7.3), so the float question does not arise here. A decimal case is a follow-up.                        |
| F2  | Captured-order cleanup, if P8 shows it is impossible | If a paid order cannot be cancelled, cleanup and the leak check are re-planned in the probe output (§9); the case does not ship without a working leak check. |

## 6. Architecture (every file touched, one responsibility each)

| File                                                                                       | Change          | Responsibility                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/medusa/admin.ts`                                                                      | edit            | Add `capturePayment`, `refundPayment`, `readOrderPayment` (admin HTTP; bodies per P2).                                                                      |
| `src/medusa/payloads.ts`                                                                   | edit            | Add `captureBody(amount)`, `refundBody(amount)` (pure, unit-tested).                                                                                        |
| `src/medusa/money.ts`                                                                      | **new**         | Pure: `parseWholeAmount(value)` (strict integer; rejects decimals and non-numeric strings with a TEST BUG message), `minorAmount` helper if P4/P5 needs it. |
| `src/medusa/oracle.ts`                                                                     | edit            | Add `CAPTURED_SUM_SQL`, `REFUNDED_SUM_SQL`, `REFUND_COUNT_SQL` (per payment id); `readMoneySnapshot(...)`.                                                  |
| `src/medusa/invariants.ts`                                                                 | edit            | Add `checkRefundCap`, `checkCaptureCap`, `checkSuccessCount` (pure).                                                                                        |
| `src/medusa/run-money-case.ts`                                                             | **new**         | The trial body for the money cases: per attempt setup, burst, oracle, cleanup, leak check; uses `createRerunRunner`.                                        |
| `tests/medusa/races/med-race-007-refunds.spec.ts`                                          | **new**         | `P6-MED-RACE-007`.                                                                                                                                          |
| `tests/medusa/races/med-race-011-partial-refunds.spec.ts`                                  | **new**         | `P6-MED-RACE-011`.                                                                                                                                          |
| `tests/medusa/races/med-race-010-captures.spec.ts`                                         | **new** (gated) | `P6-MED-RACE-010`.                                                                                                                                          |
| `tests/unit/money.test.ts`                                                                 | **new**         | §13.1.                                                                                                                                                      |
| `tests/unit/medusa-payloads.test.ts`, `medusa-oracle.test.ts`, `medusa-invariants.test.ts` | edit            | §13.2.                                                                                                                                                      |
| `.github/workflows/perf.yml`                                                               | edit            | One step in `medusa-smoke` (§11).                                                                                                                           |
| `README.md`                                                                                | edit            | Case rows, the `-006` "Later" move, the gate evidence (§17).                                                                                                |

Unchanged: `src/races/*`, `src/oracles/pg.ts`, `src/medusa/store.ts`, `src/medusa/run-case.ts` (the oversell case),
`scripts/harness.mjs`, the Medusa fork.

## 7. Design

### 7.1 Attempt shape (one trial index, one or more attempts)

For each trial index, the runner calls `attempt(n)` (Task 1 `AttemptFn`). One attempt:

1. **Setup (not raced).** `createStockedVariant` with handle `attemptTag(trial, attempt)`; `prepareReadyCart`; `completeCart`
   → one order and one payment. Read the payment id and the order total (`readOrderPayment`, P2).
2. **Pre-state (not raced, `-007` and `-011` only).** `capturePayment(X)` once, so the payment is captured X before the
   burst. Read `capturedSum` from the DB; it must equal X, or the attempt is a **setup error** (TEST BUG, not a rerun).
3. **Burst.** `fireTogether` of N admin requests: `-007` N × `refundPayment(X)`; `-011` N × `refundPayment(X/2)`;
   `-010` N × `capturePayment(X)` on an authorised payment (no pre-capture). Each request records its status and body.
4. **Oracle.** Read `capturedSum`, `refundedSum` (or `capturedSum` for `-010`), refund and capture row counts, by payment id.
5. **Cleanup.** Per P8: refund or cancel the order so it is not left open, then `deleteProduct`. The leak check runs by the
   case prefix (customer email and product handle).

The attempt returns `RaceAttemptResult` (Task 1 type) with `statusCounts`, `invariantViolations` (from §7.4), and the
money fields in `oracle`.

### 7.2 Which bursts can be invalid

Only the spread precondition (D3, Task 1). A money violation in an invalid attempt is still recorded and fails the case.
A setup error (step 2 or 1 fails) is never a rerun: it is a TEST BUG and fails the case at once, with the step named
(`setupStepError`).

### 7.3 Amounts

- X is the **order total** read in step 1 (for a one-unit cart at `EUR_UNIT_PRICE` 1000, `payloads.ts` line 1). It must
  parse as a whole integer (`parseWholeAmount`). If P5 shows Medusa returns a decimal string for this total, or the
  partial refund is not accepted at X/2, the plan is stopped and the maintainer decides the amount (the roadmap's "decimal
  amounts compared as floats" risk).
- The oracle compares **integers** in SQL (`SUM` of the integer part of `raw_amount`) and in JS through `parseWholeAmount`.
  No float arithmetic on money.

### 7.4 Invariants (pure, `src/medusa/invariants.ts`)

| Function                                             | Rule                                       | Violation text (example)                        |
| ---------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `checkRefundCap({ capturedSum, refundedSum })`       | `refundedSum ≤ capturedSum`                | `PRODUCT BUG: refunded 2000 of 1000 captured`   |
| `checkCaptureCap({ authorizedAmount, capturedSum })` | `capturedSum ≤ authorizedAmount`           | `PRODUCT BUG: captured 2000 of 1000 authorised` |
| `checkSuccessCount({ successes, expected, label })`  | `successes === expected`                   | `PRODUCT BUG: 3 refunds succeeded, expected 1`  |
| `checkLoserStatuses(statuses)`                       | every loser is 4xx; any 5xx is a violation | `PRODUCT BUG: 5xx on a racing refund: 500`      |

`checkSuccessCount` with a count **below** expected is a violation of its own kind, recorded with the request statuses
and bodies, and it is **not** called a bug until P6/§10 evidence exists.

## 8. Code

Skeletons only. The build writes the full code, with Prettier and typecheck green after each file.

### 8.1 `src/medusa/money.ts` (new)

```ts
// Whole-unit money. Amounts are integers in the Medusa order currency unit (see §7.3).
export function parseWholeAmount(value: string | number, label: string): number {
  const text = String(value);
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`TEST BUG: ${label} is not a whole amount: ${text}`);
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`TEST BUG: ${label} is outside the safe integer range: ${text}`);
  }
  return n;
}
```

Unit tests: §13.1.

### 8.2 `src/medusa/payloads.ts` (edit)

```ts
export function captureBody(amount: number) {
  return { amount };
}

export function refundBody(amount: number) {
  return { amount };
}
```

Exact bodies (field names, any required `refund_reason` or `note`, and whether `capture` accepts an omitted amount) are
set from P2 and must replace these skeletons before the build.

### 8.3 `src/medusa/admin.ts` (edit)

```ts
export async function capturePayment(token: string, paymentId: string, amount: number) {
  // Route: POST /admin/payments/:id/capture (static; body per P2).
  // Returns { status, bodyText } so the caller records every loser exactly.
}

export async function refundPayment(token: string, paymentId: string, amount: number) {
  // Route: POST /admin/payments/:id/refund (static; body per P2).
}

export async function readOrderPayment(token: string, orderId: string) {
  // Returns { paymentId, totalAmount, authorizedAmount, currencyCode }
  // from GET /admin/orders/:id?fields=... (fields per P2).
}
```

Each function returns the HTTP status and the body text. The case records the status; a non-2xx is a result, not an
exception, so `fireTogether` can count it.

### 8.4 `src/medusa/oracle.ts` (edit)

```ts
export const CAPTURED_SUM_SQL = `
  SELECT COALESCE(SUM(...), 0)::text AS total
  FROM capture
  WHERE payment_id = $1
`;
// REFUNDED_SUM_SQL: same shape on refund. The raw_amount JSON shape and the table
// names are static guesses; the exact SQL is written after P4.
```

### 8.5 `src/medusa/invariants.ts` (edit)

```ts
export function checkRefundCap(input: { capturedSum: number; refundedSum: number }): string[] {
  return input.refundedSum > input.capturedSum
    ? [`PRODUCT BUG: refunded ${input.refundedSum} of ${input.capturedSum} captured`]
    : [];
}
```

The other three checks follow the same shape (§7.4).

### 8.6 `src/medusa/run-money-case.ts` (new)

Shape only: `runMoneyCase({ caseId, mode, trials, ... })` where `mode` is `"refund-all" | "refund-half" | "capture"`. It
builds the runner with `createRerunRunner(spreadPolicyFromEnv(), trials)`, fires one warm-up attempt (own setup and
cleanup), runs `runTrials` over the runner's attempt function, writes the histogram in `finally`, and returns it.
`runOversellCase` (`src/medusa/run-case.ts`) is the reference for the trial loop and the histogram write.

## 9. Data isolation, cleanup and leak check

- Every product handle, customer email and cart carries `attemptTag` (Task 1) under the run prefix (`p6RunPrefix`).
- Orders are not deletable (Task 2 roadmap probe item 5). Cleanup is therefore P8: **refund** the captured amount back to
  zero if the admin allows it, then **cancel** the order (`cancelAndArchive`), then delete the product. If a captured order
  cannot be cancelled, the leak check counts it by customer email prefix, the case still fails the leak check on
  anything left open, and the probe output says so (F2).
- The oracle queries are by payment id, so a later attempt can never read an earlier attempt's rows.
- Leak check: `LEAK_LIVE_ORDERS_SQL`-style query on the case prefix (`src/medusa/oracle.ts` line 42) plus a payment
  query by order id. A non-empty result after cleanup fails the case as TEST BUG (cleanup), with the rows named.

## 10. Labels (PRODUCT BUG vs TEST BUG) and the evidence each needs

| Observation                                                    | Label                                       | Evidence needed before the label is used                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refundedSum > capturedSum` in any attempt                     | PRODUCT BUG (over-refund)                   | The attempt's request statuses and bodies, the DB rows, and the same failure in **3 full-count runs** of the case (or in the probe and one full-count run). |
| More than one successful capture of an authorised X            | PRODUCT BUG (over-capture)                  | As above, with the capture rows.                                                                                                                            |
| 5xx on a racing refund or capture                              | PRODUCT BUG (server fault under contention) | The status and body. Also `P6-OBS-DOC-001`-style: never a TEST BUG.                                                                                         |
| Setup fails (capture before the burst, checkout)               | TEST BUG                                    | The step name (`setupStepError`).                                                                                                                           |
| Leak check fails after cleanup                                 | TEST BUG (cleanup)                          | The leftover rows.                                                                                                                                          |
| Fewer successes than expected, all losers 4xx, sums consistent | Not yet classified                          | Repeated runs and the request bodies. Recorded as a violation, not called a bug, until shown.                                                               |

A proven product bug becomes `test.fail()` with the evidence in the annotation and the README (roadmap rule, §3 "Out").

## 11. CI (`.github/workflows/perf.yml`)

- One new step in the `medusa-smoke` job, after the existing "Race P6-MED-RACE-001 + extras (medusa-race)" step, running
  the money specs with `--project=medusa-race -g "P6-MED-RACE-0(07|10|11)"` (the exact grep is set by the build; `-010` only
  if it lands).
- `RACE_TRIALS`: `pull_request` → `3` (Medusa PR count, D6); otherwise the full count from §12.
- Histogram artefact stays `race-histograms-medusa`; the token scan (`scripts/evidence-token-scan.mjs`) runs before upload
  as for the other steps.
- Job timeout is 45 minutes (`medusa-smoke`). The money cases add time to a job that already runs `-001` at full count on
  `main`. §12 shows the budget; if it does not fit, the plan stops and the maintainer chooses (no timeout change without
  approval, Task 1 D24).

## 12. Trial counts, timing and environment

- **PR count:** 3 (D6). **Full count:** target 50 (master plan §1, D6). The probe (P7) measures the time per attempt. The
  budget is the job timeout of 45 minutes, minus the time the existing Medusa steps already take (`-001` at full count
  on `main`; read their step times from the latest `medusa-smoke` run, not from memory).
- If the four cases at 50 trials do not fit, the full count for the money specs is set lower (20 is the proposed fallback,
  with P7's numbers in the plan), and the deviation from the master plan's N ≥ 50 is written in the README and the PR.
- The per-test timeout in each spec is set from P7 (the oversell spec sets its own; the default in
  `playwright.config.ts` is 60 s, too short for a full money case).
- **Environment variables.** No new variable unless P5 shows one is needed. If a variable is added, its name goes in
  `.env.example` (names only) and the README.
- **Cursor Cloud and Claude Code cloud.** No change expected. If the probe shows one, the plan lists the step for both
  agents.

## 13. Unit tests

### 13.1 `tests/unit/money.test.ts` (new)

At least:

- `parseWholeAmount("1000", "x")` → 1000; `"-5"` → -5.
- `parseWholeAmount("10.5", "x")` throws `TEST BUG`; `"1e3"` throws; `""` throws; `"9007199254740993"` throws (not a safe integer).
- A value of `0` is accepted (a zero-capture payment is a valid state the oracle must report).

### 13.2 Updated tests

- `medusa-payloads.test.ts`: `captureBody(1000)` and `refundBody(500)` produce exactly the bodies from P2.
- `medusa-oracle.test.ts`: the new SQL constants contain the payment-id parameter and the table names from P4; a string
  check is enough (no DB).
- `medusa-invariants.test.ts`: `checkRefundCap` at the boundary (`refundedSum === capturedSum` → no violation;
  `+1` → violation); `checkCaptureCap` the same; `checkSuccessCount` for expected, below and above; `checkLoserStatuses`
  with a 4xx-only list (no violation) and one 5xx (violation).

## 14. Build steps (repo root; on any differing output: stop and report, paste it)

### Step 0. Baseline and live probe

```bash
export PATH="/usr/local/bin:$PATH"
npm run check                       # must be green on the designated branch before anything changes
npm run up:medusa                   # exit 0, /health 200
npm run smoke:medusa                # green
# P1..P8 (§2.5): run the probe scripts in the scratchpad against the live stack; paste output into §2.5
npm run down:medusa                 # always, exit 0, :9000 closed
```

Stop here if `npm run check` is not green. The probe output must be pasted into §2.5 before Step 1.

### Step 1. Money helpers (build commit 1)

`src/medusa/money.ts`, `tests/unit/money.test.ts`. Run `npm run typecheck` and `npm run test:unit`.

### Step 2. Admin client and payloads (build commit 2)

`src/medusa/payloads.ts`, `src/medusa/admin.ts`, `tests/unit/medusa-payloads.test.ts`. Exact bodies from P2 replace the
skeletons in §8.2 and §8.3.

### Step 3. Oracle and invariants (build commit 3)

`src/medusa/oracle.ts`, `src/medusa/invariants.ts`, the matching unit tests (§13.2).

### Step 4. Money case runner and `-007` (build commit 4)

`src/medusa/run-money-case.ts`, `tests/medusa/races/med-race-007-refunds.spec.ts`. Run one spec at `RACE_TRIALS=3` on the
VM (proof only) and paste the histogram verdict and the invalid/rerun counts.

### Step 5. `-011` (build commit 5)

`tests/medusa/races/med-race-011-partial-refunds.spec.ts` on the same runner.

### Step 6. `-010`, gated (build commit 6, only if G4 / P3 says capture is separate)

`tests/medusa/races/med-race-010-captures.spec.ts`. If P3 says auto-capture, skip this step, move `-010` to "Later" in
the README with the P3 output, and say so in the PR.

### Step 7. CI and README (build commit 7)

`.github/workflows/perf.yml` (one step, §11), `README.md` (§17), `.env.example` only if §12 added a name.

### Step 8. Roadmap sync (build commit 8)

`docs/plans/2026-10-22-p6-phase2-roadmap.md`: mark the gate results for `-006` and `-010`, and the chosen full count.

### Step 9. Verification and PR

`npm run check` green. Then the PR body links the green CI run (Task 1 D31 rule).

## 15. Verification gate (hard gate before the PR is marked ready; paste real output)

- `npm run check` output (Prettier, actionlint, typecheck, k6 inspect, unit tests with pass and fail counts).
- The `npx playwright test --list` count, before and after (the new specs added).
- A green CI run on the PR (small count) and the full-count run on `main` or nightly/dispatch, with the histogram artefact
  names.
- Every histogram: verdict, `trialsRequested`, `invalidTrials`, `reruns`, `warmup[]`, violations (zero is a valid result).

## 16. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

1. `docs(plans): add p6 phase 2 task 2 medusa money races plan` (this file only).
2. `feat(medusa): add money helpers` (`src/medusa/money.ts`, its test).
3. `feat(medusa): add capture and refund admin calls` (`payloads.ts`, `admin.ts`, test).
4. `feat(medusa): add money oracle and invariants` (`oracle.ts`, `invariants.ts`, tests).
5. `feat(races): add medusa refund race P6-MED-RACE-007` (runner, spec).
6. `feat(races): add medusa partial refund race P6-MED-RACE-011` (spec).
7. `feat(races): add medusa capture race P6-MED-RACE-010` (spec; only if gated in).
8. `ci(races): run the medusa money races` (`perf.yml`, README, `.env.example` if changed).
9. `docs(plans): sync the phase 2 roadmap with task 2`.

## 17. Docs (README)

- Case rows for `-007`, `-011`, `-010` (or its "Later" row), with their gates and the `-006` "Later" row and evidence.
- Known product bugs: a row only if a bug is proven (§10); no row is added for a violation not yet classified.

## 18. Will NOT do

- No gift-card plugin, no Medusa fork change, no `node_modules` edit (D5).
- No `retries`, no sleeps, no `test.fail()` without repeated-run evidence (§10).
- No publication of any timing from the cloud VM; the job summary gets Actions numbers only.
- No change to `runTrials`, `fireTogether` or the rerun policy.
- No new case beyond the three in §4 (the extras of Task 3 and `-006` stay out).

## 19. Risks and unknowns

| Risk                                                         | Mitigation                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| No gift-card feature (`-006`)                                | Gate P1; move to "Later" (D5).                                              |
| Capture is automatic with `system`                           | Gate P3; `-010` moves to "Later".                                           |
| The refund race never happens at N = 10 on this stack        | A real pass is a valid result (`-007`, `-011` pass). Record the proof runs. |
| Over-refund reproduces and needs `test.fail()`               | §10 evidence, 3 full-count runs, README row.                                |
| Job time: four money cases at 50 trials per run              | P7 sets the count; fallback 20; no timeout change without approval (§12).   |
| Refund of X/2 or X rejected for rounding or a required field | P2 and P5 record it; amount choice in §7.3.                                 |
| Captured orders cannot be cancelled, leak check fails        | P8 and F2 (§9).                                                             |
| Warm-up refund or capture reaching a counted attempt         | Warm-up has its own order and cleanup (§4).                                 |

## 20. Decisions (2026-10-22; numbering continues from Task 1's D33)

- **D34 Gift-card gate (static, to be confirmed by P1).** `-006` moves to "Later" unless a route exists at `MEDUSA_REF`.
- **D35 Capture gate (to be decided by P3).** `-010` stays only if checkout leaves the payment uncaptured.
- **D36 Money amounts are whole integers (§7.3).** Decimal amounts are a follow-up (F1).
- **D37 Setup errors are TEST BUG, never a rerun (§7.2).** Only spread reruns (Task 1 D2 to D4) apply.
- **D38 Cleanup by refund-to-zero then cancel, with the leak check as the backstop (§9).** Changes only if P8 says otherwise.

## 21. Open points for the maintainer

1. Confirm the D34 move of `-006` once P1 is in (the roadmap's gate is the decision).
2. The full count for the money cases if P7 shows 50 does not fit the 45-minute `medusa-smoke` job (§12).
3. Whether a violation with fewer successes than expected (§7.4 last rule) counts as a product bug without a repeated-run
   proof (proposed: no, §10).
