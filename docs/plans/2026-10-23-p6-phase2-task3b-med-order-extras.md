# P6 Phase 2 Task 3b: Medusa order-state extras (`P6-MED-RACE-013`, `-014`)

Junior-engineer guide. Source: the roadmap's Task 3b section
([2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md), D13) and the Task 3 plan
([2026-10-22-p6-phase2-task3-med-budget-order-races.md](2026-10-22-p6-phase2-task3-med-budget-order-races.md)),
especially its §2.5 (cleanup), §9 (cleanup order) and §11 (stop rules). Branch: `feat/2026-10-23-p6-med-order-extras`,
cut from `origin/main` at `937b57d`. Rules: [agent-rules.md](../agent-rules.md). Backlog: F-M2 (not this task), F-M3
and X04 (labelled in Task 3, applied to N=10 here as SUSPECTED until CI), F-M4 (new in this task, carried from Task 3).

Everything below that says "probe" comes from the live probe on 2026-10-23 (section 3), run against the pinned
`MEDUSA_REF` `f677db438f27294fc50e4c7c6612e71ff38eeff5`. Cloud timings prove a test works and are never published
(roadmap, "Rules that hold for every task below"); CI numbers are the only published ones.

## 1. Goal, scope and the cases covered

**Goal.** Prove two side-effect and money primitives under a burst of cancels on one order:

- `P6-MED-RACE-013` (roadmap P2): N = 10 parallel cancels of one authorised (not captured) order. Stock must be released
  exactly once: `inventory_level.reserved_quantity` equals the live reservations, and a canceled order keeps none.
- `P6-MED-RACE-014` (roadmap P1, money): N = 10 parallel cancels of an order whose payment was captured first. Refunds
  never exceed the captured amount, and the order's own ledger (`order_summary.totals.refunded_total`) agrees with the
  refund rows.

**In scope.**

- Two new Playwright specs in `tests/medusa/races/`, a new runner `src/medusa/run-cancel-burst.ts`, two new oracle
  pieces (`LATEST_SUMMARY_SQL`, `readLatestSummaryRefund`) and one new invariant (`checkSummaryRefund`), unit tests for
  the pure and SQL pieces, and README rows.
- Signals stay **SUSPECTED** (annotations only). No `test.fail()` and no new PRODUCT BUG label in this task (see §4,
  decision D3b-4 and the open questions in §8).

**Out of scope.** Changing `run-order-case.ts`, the `-008`/`-009` specs, `.github/workflows/`, `MEDUSA_REF`, the
harness pin, or any product fork. `P6-MED-RACE-015` (spend budget) stays in "Later" (roadmap D13).

## 2. Assumptions the build depends on

Each one was checked on the live app in section 3. If one is false, stop and report it (rule 9).

| #   | Assumption                                                                                           | Probe result                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A1  | `POST /admin/orders/:id/cancel` returns 200 for exactly one of N parallel cancels; losers return 400 | Yes, 2–3 × 200 and 7–8 × 400 per burst, 12 of 12 bursts. Loser body: `already has an existing active order change` |
| A2  | No 5xx under a burst of 10                                                                           | 0 of 12 bursts had a 5xx                                                                                           |
| A3  | F-M3 reproduces at N = 10: `reserved_quantity` exceeds live reservations after the burst             | Yes: 6 of 6 `-013` attempts, reserved 6 to 8 with 1 live reservation                                               |
| A4  | F-M3 residue stays after cleanup, and the product cannot be deleted (phantom)                        | Yes: reserved 5 to 7 with 0 live reservations after cleanup; product `DELETE` returns 400 in 12 of 12              |
| A5  | `POST /admin/payments/:id/capture` with the full amount returns 200                                  | Yes: 200 in 6 of 6 `-014` runs, amount 1010                                                                        |
| A6  | Each captured-order burst leaves one refund row of the captured amount in the payment module         | Yes: 1 refund row of 1010 in 6 of 6 runs (captured 1010), so no over-refund in the payment module                  |
| A7  | `order_summary` can hold several rows per version, so "latest" needs a tie-break                     | Yes: versions 1 to 3, with 3 to 4 rows per order; two or more rows share a version in 5 of 6 runs                  |
| A8  | The order's latest `refunded_total` can differ from the refund rows (F-M4)                           | Yes: latest row 2020 against 1010 refunded in 2 of 6 runs; 2020 appears in some row in 5 of 6                      |
| A9  | Archive and reservation delete work during cleanup                                                   | Archive 200 in 12 of 12; reservation `DELETE` 200 in 12 of 12                                                      |
| A10 | Burst dispatch spread is within the 5 ms rule (`RACE_MAX_SPREAD_MS`)                                 | 1 to 2 ms in all 12 bursts, so no reruns are expected                                                              |

## 3. Probe results (2026-10-23, live app)

### 3.1 Commands and exit codes

The probe scripts are not committed (they live outside the repo, in the session scratchpad). This section records
their results. The probe imported the repo's helpers in `src/medusa/` and ran 6 bursts per case. Raw output stayed
in the scratchpad.

| Step                                                    | Exit code | Note                                                                               |
| ------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `dockerd` started (as `.claude/hooks/session-start.sh`) | —         | Docker was down at session start                                                   |
| `npm run up:medusa` (first)                             | 0         | Medusa `GET /health` HTTP 200 in 6.1 s                                             |
| probe, attempt 1                                        | 1         | Harness `PRODUCTS_ROOT` not set (environment, not product)                         |
| probe, attempt 2                                        | 1         | `MEDUSA_ADMIN_EMAIL` / `PASSWORD` not set for `seed()` (environment, not product)  |
| `npm run down:medusa` (first)                           | 0         | Stopped before the restart with the admin password                                 |
| `npm run up:medusa` (second, with the admin env set)    | 0         | Password generated per session and held in the shell only; never written to a file |
| probe (6 runs of each case)                             | 0         | 12 bursts, 0 script errors                                                         |
| `npm run down:medusa` (second)                          | 0         | Compose stack torn down, volumes kept                                              |

### 3.2 Real statuses and bodies (one sample per case)

`-013`, run 1, the burst statuses: `[200, 400, 200, 400, 400, 400, 400, 400, 400, 400]`. The loser body:

```json
{ "type": "invalid_data", "message": "Order (order_…) already has an existing active order change" }
```

`-014`, run 1, after `POST /admin/payments/:id/capture` with amount 1010, the capture returned 200 with
`payment.amount` 1010 and `currency_code` `eur`. The burst statuses: `[400, 400, 200, 400, 400, 200, 400, 400, 200, 400]`.

### 3.3 Six runs per case

| Run | `-013` 200s | `-013` pending / credit lines | `-013` reserved after burst / after cleanup (live reservations after cleanup) | `-014` 200s | `-014` pending / credit lines | `-014` latest `refunded_total` (rule in §5) | `-014` refund rows (sum) |
| --- | ----------- | ----------------------------- | ----------------------------------------------------------------------------- | ----------- | ----------------------------- | ------------------------------------------- | ------------------------ |
| 1   | 2           | 1 / 2                         | 8 / 7 (0)                                                                     | 3           | 1 / 3                         | 1010                                        | 1 (1010)                 |
| 2   | 3           | 1 / 5                         | 6 / 5 (0)                                                                     | 2           | 1 / 2                         | 1010                                        | 1 (1010)                 |
| 3   | 3           | 2 / 3                         | 7 / 6 (0)                                                                     | 3           | 2 / 3                         | **2020**                                    | 1 (1010)                 |
| 4   | 2           | 1 / 2                         | 8 / 7 (0)                                                                     | 2           | 1 / 2                         | 1010                                        | 1 (1010)                 |
| 5   | 2           | 1 / 2                         | 8 / 7 (0)                                                                     | 3           | 2 / 3                         | **2020**                                    | 1 (1010)                 |
| 6   | 3           | 1 / 5                         | 6 / 5 (0)                                                                     | 2           | 0 / 3                         | 1010                                        | 1 (1010)                 |

Summary of the six runs:

- **`-013`.** 7 or 8 of 10 requests refused (400) in each burst, with 2 or 3 successes (X04 at N = 10, in all 6 runs). Every
  run left `canceled` with 1 live reservation after the burst (F-M3: "canceled order keeps a live reservation") and
  `reserved_quantity` 6 to 8 against a live sum of 1 (F-M3 drift). After cleanup the reserved count stayed at 5 to 7
  with 0 live reservations. Every product `DELETE` returned 400.
- **`-014`.** The payment module held one refund of 1010 each time (captured 1010), so Task 2's money invariant holds in
  6 of 6 runs. The order ledger disagreed in 2 of 6 runs (latest row 2020 against 1010 refunded, in runs 3 and 5 of the
  table).

### 3.4 Timings (cloud VM, proof only; not published)

| Phase per attempt                        | `-013` (6 attempts)         | `-014` (6 attempts)         |
| ---------------------------------------- | --------------------------- | --------------------------- |
| Setup (product, cart, checkout, capture) | 1.7 to 2.3 s, mean 1.9 s    | 1.8 to 2.2 s, mean 2.0 s    |
| Burst (10 cancels)                       | 0.9 to 1.4 s, mean 1.1 s    | 1.0 to 1.6 s, mean 1.3 s    |
| Cleanup                                  | 0.17 to 0.21 s, mean 0.18 s | 0.15 to 0.22 s, mean 0.19 s |
| Whole attempt                            | 2.9 to 3.6 s, mean 3.2 s    | 2.9 to 3.9 s, mean 3.5 s    |

### 3.5 `order_summary` shape (what the probe proved)

Columns: `id text`, `order_id text`, `version integer`, `totals jsonb`, `created_at`, `updated_at`, `deleted_at`.
In `totals`, the keys used are `refunded_total`, `pending_difference`, `paid_total`, `current_order_total`, plus `raw_*`
precision objects. Rows per order: 3 to 4, with several rows sharing one version. Example (the second `-014` run): `version` 2 has
two rows created 19 ms apart, with `refunded_total` 2020 for the earlier one and 1010 for the later one. So "latest" is
defined in §5 as `ORDER BY version DESC, created_at DESC, id DESC`.

### 3.6 What the probe proves, and what it does not

- Proves: A1 to A10 (§2), so the design in §4 rests on real behaviour.
- Does not prove: the CI time budget (§7) or any rate for a PR trial count. The probe has 6 runs per case; the PR count
  waits for the full-count CI runs (rule 13).
- Does not prove: that the labels are right. The signals are SUSPECTED until the owner labels them (§4 D3b-4).

## 4. Design and decisions

Each decision gives the reason. "D3b" numbers are local to this plan (the roadmap's D numbers are global).

- **D3b-1. A new runner, `src/medusa/run-cancel-burst.ts`; `run-order-case.ts` is not edited.** The roadmap's "files
  likely touched" lists `run-order-case.ts` (N as a parameter, `captureFirst`). That file is shared by the `-008` and
  `-009` specs, so editing it changes a shared runner. Rule 10 says stop for owner review in that case. A new file
  keeps those specs byte-identical and needs no review gate. The cost is some duplicated cleanup code; §13 E1 proposes
  merging them later, after the owner accepts.
- **D3b-2. `N` is a runner input (`concurrency`), set to 10 by both specs.** Roadmap requirement: N = 10. The existing
  runner's `N = 2` stays as it is.
- **D3b-3. "Latest" `order_summary` row = `ORDER BY version DESC, created_at DESC, id DESC`, `deleted_at IS NULL`.**
  A7 shows several rows share a version, so `version` alone is ambiguous. `id` breaks exact timestamp ties so the
  result is deterministic. Roadmap said "for example by version then created_at"; this is the concrete choice.
- **D3b-4. F-M3, X04 and F-M4 stay SUSPECTED for both new cases (annotations, `labelled: []`).** Rule 13: a signal is
  PRODUCT BUG only after repeated full-count CI runs and an owner label. The probe is 6 runs on one VM, not CI. So this
  build adds no `test.fail()` and no label. The roadmap's "Done when" asks for `test.fail()`; that moves to a follow-up
  after the owner labels (§14 Q2, Q3). This keeps the escalation check at NO for the label question.
- **D3b-5. X04 at N = 10 reuses `checkSingleCancel`.** Its lines already carry the X04 tag, which the owner labelled in
  Task 3 at N = 2. The roadmap's "credit lines = 1" for `-014` is the same check (`creditLines !== 1` is X04). Reusing
  it means no new tag and no new function for the burst.
- **D3b-6. The capture amount is the payment's own amount (1010), read from `payment`, not hard-coded.** The probe read
  it from the DB (`MONEY_PAYMENT_FOR_ORDER_SQL`), which keeps the case valid if the price changes.
- **D3b-7. A capture 5xx is a PRODUCT BUG; a non-200 4xx is TEST BUG.** Capture is a product route, not a fixture. The
  Task 2 rule (`checkLoserStatuses`) already treats 5xx as a product fault. A capture 4xx would mean the fixture is
  wrong.
- **D3b-8. Leak check and phantom products reuse Task 3's rules.** `orderStateLeakCheck` already reports a product that
  is phantom and was reported by the run as leaked data (D49), not a failure. A product that is not phantom is a
  TEST BUG. Probe A4 confirms phantoms appear and are reported.
- **D3b-9. Trials: 50 in CI, 3 on PRs.** The workflow already sets `RACE_TRIALS` to `3` on PRs and `50` on push and
  nightly (`perf.yml` line 174 pattern). Nothing new to configure.
- **D3b-10. No change to `MEDUSA_REF`, the harness pin or any product fork.** The probe ran on the pinned ref.
- **D3b-11. The branch is `feat/2026-10-23-p6-med-order-extras`, as the owner asked.** Rule 10 names a `plan/` branch for
  the plan commit; the owner's instruction set the `feat/` branch. Recorded as a deviation in the closeout (§10).
- **D3b-12. A cancel burst is 10 requests, with the existing `fireTogether` gate and `/health` warm-up.** The same
  method as Task 3, so the oracle's spread and status rules carry over.

## 5. Oracle definitions (exact)

- **Latest summary refund.** One row: `order_summary` rows of the order with `deleted_at IS NULL`, ordered by
  `version DESC, created_at DESC, id DESC`, first row. Value: `totals->>'refunded_total'`.
- **F-M4 signal.** Latest summary refund must equal the sum of the payment's refund rows
  (`readMoneySnapshot(...).refundedSum`). A difference is `SUSPECTED PRODUCT BUG: ... (F-M4)`. A missing summary row
  is `TEST BUG`.
- **Refund cap (asserted, PRODUCT BUG).** Refunded sum must not exceed captured sum (`checkRefundCap`, Task 2).
- **X04 at N = 10.** `checkSingleCancel`: one 200, `canceled`, zero pending changes, one credit line.
- **F-M3 at N = 10.** `checkReservationDrift`: canceled order keeps no live reservation; `reserved_quantity` equals the
  live reservation sum (both after the burst and after cleanup in the cleanup record).
- **Loser statuses.** Every non-200 is a clean 4xx; a 5xx is PRODUCT BUG; null (a thrown request) is TEST BUG
  (`checkLoserStatuses`).

## 6. Files

| Path                                                         | Change  | Purpose                                                                 |
| ------------------------------------------------------------ | ------- | ----------------------------------------------------------------------- |
| `src/medusa/oracle.ts`                                       | edit    | Add `LATEST_SUMMARY_SQL` and `readLatestSummaryRefund` (§7.1 skeleton). |
| `src/medusa/invariants.ts`                                   | edit    | Add `checkSummaryRefund` (§7.2 skeleton).                               |
| `src/medusa/run-cancel-burst.ts`                             | **NEW** | `runCancelBurstCase` (§7.3 skeleton). Shared by both specs.             |
| `tests/medusa/races/med-race-013-cancel-burst.spec.ts`       | **NEW** | `P6-MED-RACE-013` (§7.4 skeleton).                                      |
| `tests/medusa/races/med-race-014-captured-cancels.spec.ts`   | **NEW** | `P6-MED-RACE-014` (§7.5 skeleton).                                      |
| `tests/unit/medusa-oracle.test.ts`                           | edit    | One test: the latest-summary SQL is SELECT only and ordered (§7.6).     |
| `tests/unit/medusa-invariants.test.ts`                       | edit    | Three tests for `checkSummaryRefund` (§7.7).                            |
| `README.md`                                                  | edit    | Two rows in "Medusa budget and order-state races (Phase 2)" (§7.8).     |
| `docs/plans/2026-10-23-p6-phase2-task3b-med-order-extras.md` | **NEW** | This plan, with the closeout section at the end.                        |

Not touched: `src/medusa/run-order-case.ts`, `tests/medusa/races/med-race-008-*.spec.ts`,
`med-race-009-*.spec.ts`, `.github/workflows/perf.yml`, `package.json`, `scripts/bootstrap.sh`, `.env.example`.

## 7. Code skeletons and build steps

### 7.1 `LATEST_SUMMARY_SQL` and `readLatestSummaryRefund` (edit `src/medusa/oracle.ts`)

Add after `ORDER_STATE_SQL` (exported names used later: `selectRows`, `parseWholeAmount` are already imported there):

```ts
/** $1 order id. The latest order_summary refund (D3b-3): highest version, then latest created_at, then id. */
export const LATEST_SUMMARY_SQL = `
SELECT os.totals->>'refunded_total' AS refunded_total
FROM order_summary os
WHERE os.order_id = $1 AND os.deleted_at IS NULL
ORDER BY os.version DESC, os.created_at DESC, os.id DESC
LIMIT 1
`;

/** Latest order_summary refunded_total of an order, or null when the order has no summary row. */
export async function readLatestSummaryRefund(
  pool: pg.Pool,
  orderId: string,
): Promise<number | null> {
  const rows = await selectRows<{ refunded_total: string | null }>(pool, LATEST_SUMMARY_SQL, [
    orderId,
  ]);
  const value = rows[0]?.refunded_total;
  return value == null ? null : parseWholeAmount(value, "latest refunded_total");
}
```

### 7.2 `checkSummaryRefund` (edit `src/medusa/invariants.ts`)

Add after `checkRefundCap`:

```ts
/** -014. The order's latest order_summary refunded_total must equal the refund rows' sum (F-M4, SUSPECTED). */
export function checkSummaryRefund(input: {
  latestRefunded: number | null;
  refundRowsSum: number;
}): string[] {
  if (input.latestRefunded === null) {
    return ["TEST BUG: order has no order_summary row"];
  }
  if (input.latestRefunded === input.refundRowsSum) return [];
  return [
    `SUSPECTED PRODUCT BUG: order refunded_total ${input.latestRefunded} but refund rows sum ${input.refundRowsSum} (F-M4)`,
  ];
}
```

### 7.3 `runCancelBurstCase` (NEW `src/medusa/run-cancel-burst.ts`)

Skeleton with the full structure. Every helper it calls exists today (§9 lists them). It mirrors
`run-order-case.ts` on purpose so a reviewer can diff the two.

```ts
import type pg from "pg";
import { fireTogether } from "../races/fire-together.ts";
import { runTrials } from "../races/run-trials.ts";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import { attemptTag, createRerunRunner, spreadPolicyFromEnv } from "../races/rerun-on-spread.ts";
import { recordTrial } from "../races/trial-record.ts";
import { medusaBaseUrlFromEnv } from "../races/env.ts";
import type { RaceAttemptResult, RaceHistogram } from "../races/types.ts";
import { selectRows } from "../oracles/pg.ts";
import {
  archiveOrder,
  cancelOrder,
  capturePayment,
  createStockedVariant,
  deleteCustomersByEmail,
  deleteProduct,
  deleteReservation,
  type MedusaCatalog,
} from "./admin.ts";
import {
  checkLoserStatuses,
  checkRefundCap,
  checkReservationDrift,
  checkSingleCancel,
  checkSummaryRefund,
  classifyFindings,
} from "./invariants.ts";
import {
  MONEY_PAYMENT_FOR_ORDER_SQL,
  ORDER_RESERVATIONS_SQL,
  PHANTOM_RESERVED_SQL,
  orderStateLeakCheck,
  readLatestSummaryRefund,
  readMoneySnapshot,
  readOrderState,
} from "./oracle.ts";
import {
  caseLeakPattern,
  casePrefix,
  cleanupFailure,
  prefixedEmail,
  setupStepError,
} from "./payloads.ts";
import { completeCart, prepareReadyCarts } from "./store.ts";

/**
 * Cancel burst on one order (P6-MED-RACE-013: authorised; P6-MED-RACE-014: captured first).
 * Every signal is SUSPECTED until the owner labels it (plan D3b-4); `labelled` promotes a tag, as in run-order-case.
 */
export type RunCancelBurstInput = {
  pool: pg.Pool;
  token: string;
  catalog: MedusaCatalog;
  runPrefix: string;
  caseId: string;
  title: string;
  /** Parallel cancels per burst (10 for both cases). */
  concurrency: number;
  /** Capture the order's payment with its full amount before the burst (-014). */
  captureFirst: boolean;
  trials: number;
  labelled: readonly string[];
};

export type RunCancelBurstResult = {
  histogram: RaceHistogram;
  suspected: string[];
  reportedLeaked: string[];
};

function orderIdOf(body: string): string | null {
  try {
    const json = JSON.parse(body) as { type?: string; order?: { id?: string } };
    return json.type === "order" ? (json.order?.id ?? null) : null;
  } catch {
    return null;
  }
}

export async function runCancelBurstCase(
  input: RunCancelBurstInput,
): Promise<RunCancelBurstResult> {
  const base = medusaBaseUrlFromEnv();
  const dataPrefix = casePrefix(input.runPrefix, input.caseId);
  const leakPrefix = caseLeakPattern(input.runPrefix, input.caseId);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "medusa",
    concurrency: input.concurrency,
    trials: input.trials,
  });
  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const runSuspected: string[] = [];
  const cleanupViolations: string[] = [];
  const reportedLeaked: string[] = [];
  const reportedProductIds: string[] = [];
  /** One cleanup step: a throw is recorded and the next step still runs (as in run-order-case.ts). */
  const guard = async (kind: string, key: string, step: () => Promise<void>): Promise<void> => {
    try {
      await step();
    } catch (err) {
      cleanupViolations.push(cleanupFailure(kind, key, err));
    }
  };

  try {
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      const leaf = attemptTag(trial, attempt);
      const email = prefixedEmail(dataPrefix, `${leaf}-c00`);
      let productId = "";
      let inventoryItemId = "";
      let orderId = "";
      let paymentId = "";

      try {
        // Setup, not raced. A throw here is a TEST BUG (D37), except a capture 5xx (D3b-7).
        const stocked = await createStockedVariant({
          token: input.token,
          catalog: input.catalog,
          prefix: dataPrefix,
          leaf: `${leaf}-product`,
          s: 50,
          onCreated: (ids) => {
            if (ids.productId) productId = ids.productId;
            if (ids.inventoryItemId) inventoryItemId = ids.inventoryItemId;
          },
        });
        const [cart] = await prepareReadyCarts(1, () => ({
          publishableKey: input.catalog.publishableKey,
          regionId: input.catalog.regionId,
          salesChannelId: input.catalog.salesChannelId,
          variantId: stocked.variantId,
          email,
          quantity: 1,
        }));
        const lineError = setupStepError("add line item", cart?.lineItemStatus ?? 0);
        if (lineError || !cart) throw new Error(lineError ?? "TEST BUG: add line item missing");
        const done = await completeCart(input.catalog.publishableKey, cart.cartId);
        const completeError = setupStepError("complete", done.status);
        if (completeError) throw new Error(completeError);
        orderId = orderIdOf(done.body) ?? "";
        if (!orderId) throw new Error("TEST BUG: checkout returned no order");

        if (input.captureFirst) {
          const [pay] = await selectRows<{ payment_id: string; amount: string }>(
            input.pool,
            MONEY_PAYMENT_FOR_ORDER_SQL,
            [orderId],
          );
          if (!pay) throw new Error(`TEST BUG: no payment row for order ${orderId}`);
          paymentId = pay.payment_id;
          const cap = await capturePayment(input.token, paymentId, Number(pay.amount));
          if (cap.status !== 200) {
            throw new Error(
              cap.status >= 500
                ? `PRODUCT BUG: capture HTTP ${cap.status}`
                : `TEST BUG: capture HTTP ${cap.status}`,
            );
          }
        }

        // Burst: `concurrency` parallel cancels of the same order.
        const bodies: string[] = [];
        const fired = await fireTogether(
          input.concurrency,
          async (i) => {
            const res = await cancelOrder(input.token, orderId);
            bodies[i] = res.body;
            return res;
          },
          {
            warm: async () => {
              const res = await fetch(`${base}/health`);
              await res.text();
            },
          },
        );

        const state = await readOrderState(
          input.pool,
          orderId,
          inventoryItemId,
          input.catalog.locationId,
        );
        const statuses = fired.requests.map((r) => r.status);
        const lines = [
          ...checkSingleCancel({
            status: state.status,
            httpSuccesses: statuses.filter((s) => s === 200).length,
            pendingChanges: state.pendingChanges,
            creditLines: state.creditLines,
          }),
          ...checkReservationDrift(state),
          ...checkLoserStatuses(statuses.filter((s) => s !== 200)),
        ];
        let latestRefunded: number | null = null;
        let refundedSum = 0;
        if (input.captureFirst) {
          const money = await readMoneySnapshot(input.pool, paymentId, orderId);
          refundedSum = money.refundedSum;
          latestRefunded = await readLatestSummaryRefund(input.pool, orderId);
          lines.push(
            ...checkRefundCap({ capturedSum: money.capturedSum, refundedSum: money.refundedSum }),
            ...checkSummaryRefund({ latestRefunded, refundRowsSum: money.refundedSum }),
          );
        }
        const { violations, suspected } = classifyFindings(lines, input.labelled);

        // Same rule as run-order-case.ts: suspected lines never fail the case; a PRODUCT BUG does.
        const record = recordTrial(trial, fired, () => {
          if (violations.length > 0) throw new Error(violations.join("; "));
        });
        record.oracle = {
          mode: input.captureFirst ? "captured-cancel" : "cancel-burst",
          status: state.status,
          pendingChanges: state.pendingChanges,
          creditLines: state.creditLines,
          liveReservations: state.liveReservations,
          reservedQuantity: state.reservedQuantity,
          liveReservationQty: state.liveReservationQty,
          latestRefunded,
          refundedSum,
          loserStatus: statuses.find((s) => s !== 200) ?? null,
          suspectedBug: suspected.join(" | "),
        };
        for (const line of suspected) {
          runSuspected.push(`trial ${trial} attempt ${attempt}: ${line}`);
        }
        return record;
      } finally {
        // Cleanup, plan §9 of Task 3 (order: cancel, archive, reservations, product, customer).
        if (orderId) {
          await guard("order", orderId, async () => {
            const { status } = await readOrderState(
              input.pool,
              orderId,
              inventoryItemId,
              input.catalog.locationId,
            );
            if (status !== "canceled") {
              const res = await cancelOrder(input.token, orderId);
              if (res.status !== 200) {
                cleanupViolations.push(
                  cleanupFailure("order cancel", orderId, `HTTP ${res.status}`),
                );
              }
            }
          });
          await guard("order archive", orderId, () => archiveOrder(input.token, orderId));
        }
        if (inventoryItemId) {
          await guard("reservations", inventoryItemId, async () => {
            const rows = await selectRows<{ id: string }>(input.pool, ORDER_RESERVATIONS_SQL, [
              inventoryItemId,
            ]);
            for (const row of rows) {
              await guard("reservation", row.id, async () => {
                const status = await deleteReservation(input.token, row.id);
                if (status !== 200) {
                  cleanupViolations.push(cleanupFailure("reservation", row.id, `HTTP ${status}`));
                }
              });
            }
          });
        }
        if (productId) {
          try {
            await deleteProduct(input.token, productId);
          } catch (err) {
            await guard("product", productId, async () => {
              const phantom = await selectRows<{ id: string }>(input.pool, PHANTOM_RESERVED_SQL, [
                leakPrefix,
              ]);
              if (phantom.some((row) => row.id === productId)) {
                reportedProductIds.push(productId);
                reportedLeaked.push(`product ${productId} (F-M3, D49)`);
              } else {
                cleanupViolations.push(cleanupFailure("product", productId, err));
              }
            });
          }
        }
        await guard("customer", email, () => deleteCustomersByEmail(input.token, email));
      }
    };

    // Untimed warm-up attempt (D28), then the counted trials.
    await runner.warmup((attempt) => runAttempt(0, attempt));
    const trialResults = await runTrials(input.trials, (trial) =>
      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
    );

    runner.applyTo(histogram);
    const leak = await orderStateLeakCheck(input.pool, leakPrefix, reportedProductIds);
    histogram.invariantViolations.push(...cleanupViolations, ...leak.violations);

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return { histogram, suspected: runSuspected, reportedLeaked };
}
```

Note for the junior: the leaked products are recorded in the cleanup path (`reportedLeaked`, the same as
`run-order-case.ts`), so `orderStateLeakCheck`'s `reportedLeaked` ids are not added a second time. Step 4's run shows the
product lines in the annotations.

### 7.4 `P6-MED-RACE-013` spec (NEW `tests/medusa/races/med-race-013-cancel-burst.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import {
  runCancelBurstCase,
  type RunCancelBurstResult,
} from "../../../src/medusa/run-cancel-burst.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa cancel burst (authorised)", () => {
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let result: RunCancelBurstResult;
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();

  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await closePool(pool);
  });

  test.describe("P6-MED-RACE-013 cancel burst", () => {
    // 60 s + 10 s per trial (Task 3 pattern; probe: about 3.2 s per attempt, 61 attempts at most).
    test.describe.configure({ timeout: 60_000 + trials * 10_000 });

    test.beforeAll(async () => {
      token = await seedAndLogin();
      catalog = await loadCatalog(token);
      result = await runCancelBurstCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-013",
        title: "ten parallel cancels of one order → stock released once",
        concurrency: 10,
        captureFirst: false,
        trials,
        labelled: [],
      });
    });

    test("P6-MED-RACE-013 ten parallel cancels of one order → stock released once", () => {
      for (const line of result.suspected) {
        test.info().annotations.push({ type: "suspected-bug", description: line });
      }
      for (const line of result.reportedLeaked) {
        test.info().annotations.push({ type: "leaked-data", description: line });
      }
      // Guards: 5xx, setup, cleanup and the leak check. Labelled signals are never in the verdict (D54).
      expect(result.histogram.verdict).toBe("pass");
    });
  });
});
```

### 7.5 `P6-MED-RACE-014` spec (NEW `tests/medusa/races/med-race-014-captured-cancels.spec.ts`)

Identical to 7.4 with these changes: the file name and `describe` text say "captured", `caseId` is
`"P6-MED-RACE-014"`, `title` is `"ten parallel cancels of a captured order → refunds ≤ captured"`, and
`captureFirst: true`. Everything else (annotations, the verdict guard, the timeout) is the same.

### 7.6 Unit test: the latest-summary SQL (edit `tests/unit/medusa-oracle.test.ts`)

Add `LATEST_SUMMARY_SQL` to the import list from `../../src/medusa/oracle.ts`, then add this `it` inside the existing
`describe("promotion and order-state oracle", ...)`:

```ts
it("the latest order_summary read is SELECT only and orders by version, then created_at, then id", () => {
  assert.doesNotThrow(() => assertSelectOnly(LATEST_SUMMARY_SQL));
  assert.match(LATEST_SUMMARY_SQL, /ORDER BY os\.version DESC, os\.created_at DESC, os\.id DESC/);
});
```

### 7.7 Unit tests: `checkSummaryRefund` (edit `tests/unit/medusa-invariants.test.ts`)

Add `checkSummaryRefund` to the import list, then add a new `describe` at the end of the file:

```ts
describe("checkSummaryRefund (F-M4)", () => {
  it("equal refunded totals give no line", () => {
    assert.deepEqual(checkSummaryRefund({ latestRefunded: 1010, refundRowsSum: 1010 }), []);
  });

  it("a latest refunded_total above the refund rows is a SUSPECTED F-M4 line", () => {
    const lines = checkSummaryRefund({ latestRefunded: 2020, refundRowsSum: 1010 });
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /^SUSPECTED PRODUCT BUG: .*\(F-M4\)$/);
  });

  it("no order_summary row is a TEST BUG", () => {
    assert.deepEqual(checkSummaryRefund({ latestRefunded: null, refundRowsSum: 1010 }), [
      "TEST BUG: order has no order_summary row",
    ]);
  });
});
```

### 7.8 README rows (edit `README.md`)

In the section "Medusa budget and order-state races (Phase 2)", add two rows to the table after the `P6-MED-RACE-009`
row (same column layout as the existing rows):

```
| `P6-MED-RACE-013` | ten parallel cancels of one order (authorised) | `reserved_quantity` = live reservations; no 5xx; setup, cleanup | X04, F-M3 (annotation) | `medusa-smoke` |
| `P6-MED-RACE-014` | ten parallel cancels of one captured order     | refunds ≤ captured; no 5xx; setup, cleanup                    | X04, F-M3, F-M4 (annotation) | `medusa-smoke` |
```

### 7.9 Build steps (one commit each)

Before every `npm run check`, format the files you touched: `npx prettier --write <files>`. `npm run check` runs
`prettier --check .` and will fail on unformatted files.

Expected unit count at the start: **383** (measured on `origin/main` 937b57d, 2026-10-23).

| Step | What                                                | Files (`git add` paths)                                                   | Commit subject                                                           | Unit count after step |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| 1    | Oracle SQL and read helper (§7.1), unit test (§7.6) | `src/medusa/oracle.ts`, `tests/unit/medusa-oracle.test.ts`                | `feat(medusa): read the latest order_summary refund for the -014 oracle` | **384**               |
| 2    | `checkSummaryRefund` (§7.2) and its tests (§7.7)    | `src/medusa/invariants.ts`, `tests/unit/medusa-invariants.test.ts`        | `feat(medusa): add the F-M4 summary refund check`                        | **387**               |
| 3    | Runner (§7.3). No unit test: it needs the live app. | `src/medusa/run-cancel-burst.ts`                                          | `feat(medusa): add the cancel-burst runner for -013 and -014`            | **387**               |
| 4    | Spec `-013` (§7.4), then a live proof (below)       | `tests/medusa/races/med-race-013-cancel-burst.spec.ts`                    | `test(medusa): add P6-MED-RACE-013 cancel burst`                         | **387**               |
| 5    | Spec `-014` (§7.5), then a live proof (below)       | `tests/medusa/races/med-race-014-captured-cancels.spec.ts`                | `test(medusa): add P6-MED-RACE-014 captured cancels`                     | **387**               |
| 6    | README rows (§7.8) and the closeout section (§10)   | `README.md`, `docs/plans/2026-10-23-p6-phase2-task3b-med-order-extras.md` | `docs(readme): add the -013 and -014 rows`                               | **387**               |

Commands for each step (run from the repo root, with `export PATH="/usr/local/bin:$PATH"`):

```
git add <files from the table>
git commit -m "<subject from the table>"
npx prettier --write <files from the table>
npm run check; echo "check_exit=$?"
```

**Expected output** of `npm run check` (the last lines): `# tests <count>`, `# pass <count>`, `# fail 0`, then
`check_exit=0`. If the count differs from the table, stop and explain (rule 11). Never edit the expected number.

**Live proof, steps 4 and 5 only** (Medusa must be up; this is the proof that the spec runs, not a published number):

```
export PATH="/usr/local/bin:$PATH" PRODUCTS_ROOT=/home/user/products MEDUSA_ADMIN_EMAIL=admin@qa.local
export MEDUSA_ADMIN_PASSWORD="$(openssl rand -hex 16)"   # per session, never written to a file
npm run up:medusa;   echo "up_exit=$?"
RACE_TRIALS=3 npm run race:medusa -- tests/medusa/races/med-race-013-cancel-burst.spec.ts; echo "spec_exit=$?"
npm run down:medusa; echo "down_exit=$?"
```

Expected: `up_exit=0`, then Playwright prints `1 passed` with the `suspected-bug` annotations listed, `spec_exit=0`,
`down_exit=0`. Use the `-014` spec the same way in step 5. A `failed` verdict means a PRODUCT BUG or TEST BUG line;
stop and root-cause it. Do not raise `RACE_TRIALS` above 3 for the proof (PR-level count).

Step 6 also adds the closeout section (§10) with the real commit SHAs and the proof output.

## 8. CI changes and the time budget

### 8.1 CI changes in this build: none

The `medusa-smoke` race step runs `npm run race:medusa -- --grep-invert "P6-MED-RACE-0(05|12)"`
(`.github/workflows/perf.yml`, line 178). Both new specs live in `tests/medusa/races`, so they run there without a
workflow edit. Nothing else changes: no workflow, no runner under `src/` (the existing runner is not edited), no pin.

### 8.2 Time budget at full trial count (estimate; the first full-count CI run replaces it)

Attempts per case: 1 untimed warm-up + 50 trials + invalid budget `ceil(50 × 20 %) = 10` (`invalidBudget`, rerun
on spread), so **61 attempts at most**, **51 expected** (spread is 1 to 2 ms, so reruns are not expected).

Per attempt: **3.2 s** for `-013` and **3.5 s** for `-014` (cloud probe means, §3.4, used only for this estimate).

| Case       | Expected (51 attempts)  | Worst (61 attempts)     |
| ---------- | ----------------------- | ----------------------- |
| `-013`     | 51 × 3.2 s = 2 min 43 s | 61 × 3.2 s = 3 min 15 s |
| `-014`     | 51 × 3.5 s = 2 min 59 s | 61 × 3.5 s = 3 min 34 s |
| Both cases | **5 min 42 s**          | **6 min 49 s**          |

`medusa-smoke` race step, measured on the Task 3 dispatch runs (Task 3 closeout: 13:05, 11:58 and 19:17), plus the
added time:

| Run (Task 3)    | Today | + expected (5:42) | + worst (6:49) | Stop rule (24:00, 80 % of 30 min) | Job timeout (45 min, margin 10 → 35 min) |
| --------------- | ----- | ----------------- | -------------- | --------------------------------- | ---------------------------------------- |
| run 1           | 13:05 | 18:47             | 19:54          | under                             | under                                    |
| run 2           | 11:58 | 17:40             | 18:47          | under                             | under                                    |
| run 3 (slowest) | 19:17 | **24:59**         | **26:06**      | **over**                          | under                                    |

The race step timeout is 30 min (non-PR). Its 80 % stop rule is 24 min. On the slowest Task 3 runner, the added
cases take the step over 24 min. The job stays under 35 min, so no job-timeout risk. **This is the reason §8.3 Q1
exists.** Nothing in this build changes the job split. Per rule 9 this is an owner decision.

PR runs: `RACE_TRIALS=3` gives at most 1 + 3 + 2 = 6 attempts per case, about 20 s per case, about 40 s in total. The
PR race step has a 10 min timeout and runs in about 2 min 15 s today, so the PR margin is fine.

### 8.3 Open questions for CI timing (owner decides; proposed answers given)

- **Q1. Keep both cases in `medusa-smoke`, or split them into a new job?** Proposed: **split** into a new job
  (`medusa-cancel-extras`, same pins as `medusa-smoke`, `timeout-minutes: 45`, step timeout 30). The reason: the slowest
  Task 3 run reaches 24:59 with both cases in `medusa-smoke`, over the 24-minute stop rule. This build does not make
  the change; it is a workflow edit and needs the owner's review first.

## 9. Existing names this plan uses (rule 20 b)

Checked by reading the files on 2026-10-23 (`origin/main` 937b57d):

- `src/medusa/admin.ts`: `seedAndLogin`, `loadCatalog`, `createStockedVariant`, `cancelOrder`, `capturePayment`,
  `archiveOrder`, `deleteReservation`, `deleteProduct`, `deleteCustomersByEmail`, `MedusaCatalog`.
- `src/medusa/store.ts`: `prepareReadyCarts`, `completeCart`.
- `src/medusa/oracle.ts`: `readOrderState`, `readMoneySnapshot`, `MONEY_PAYMENT_FOR_ORDER_SQL`, `ORDER_RESERVATIONS_SQL`,
  `PHANTOM_RESERVED_SQL`, `orderStateLeakCheck`, and `parseWholeAmount` (imported from `money.ts`).
- `src/medusa/invariants.ts`: `checkSingleCancel`, `checkReservationDrift`, `checkLoserStatuses`, `checkRefundCap`,
  `classifyFindings`.
- `src/medusa/payloads.ts`: `casePrefix`, `caseLeakPattern`, `prefixedEmail`, `setupStepError`, `cleanupFailure`.
- `src/races/`: `fireTogether`, `runTrials`, `createHistogram`, `writeHistogram`, `attemptTag`, `createRerunRunner`,
  `spreadPolicyFromEnv`, `recordTrial`, `medusaBaseUrlFromEnv`, `raceTrialsFromEnv`, `p6RunPrefix`, `invalidBudget`.
- `src/oracles/pg.ts`: `createReadOnlyPool`, `selectRows`, `closePool`.

New names (all NEW): `LATEST_SUMMARY_SQL`, `readLatestSummaryRefund`, `checkSummaryRefund`, `runCancelBurstCase`,
`RunCancelBurstInput`, `RunCancelBurstResult`.

## 10. Closeout notes

Filled in at the end of the build, before any build PR. No PR was opened in this session; the owner decides.

- Merge SHA: _none_ (no PR; this branch is not merged).
- Commits on `feat/2026-10-23-p6-med-order-extras`:
  - `a0ebb6c` `docs(plans): add the phase 2 task 3b med-order-extras plan` (the plan alone).
  - `6c82346` `feat(medusa): read the latest order_summary refund for the -014 oracle` (step 1; unit count 383 → 384).
  - `6665cbb` `feat(medusa): add the F-M4 summary refund check` (step 2; 384 → 387).
  - `6bb883d` `feat(medusa): add the cancel-burst runner for -013 and -014` (step 3; 387).
  - `8848acd` `test(medusa): add P6-MED-RACE-013 cancel burst` (step 4; 387).
  - `3a493b6` `test(medusa): add P6-MED-RACE-014 captured cancels` (step 5; 387).
  - Step 6 (README rows and this closeout): see the branch head.
- Findings (live proofs, `RACE_TRIALS=3`, cloud VM, not published):
  - `-013`: `1 passed`; verdict `pass`; X04 and F-M3 reported as `suspected-bug` annotations; no violations.
  - `-014`: `1 passed`; verdict `pass`; X04, F-M3 and F-M4 as `suspected-bug` annotations (F-M4 in 2 of 3 trials); no
    violations; the refund rows sum to the captured amount.
  - The labels stay SUSPECTED: no `test.fail()`, no PRODUCT BUG label (D3b-4). CI full-count runs decide them.
  - The CI workflow, the shared runner `run-order-case.ts` and the harness pin are unchanged.
- Deviations from this plan:
  - Branch: `feat/...`, not `plan/...`, as the owner asked (D3b-11; rule 10).
  - Runner in a new file, not `run-order-case.ts` (D3b-1).
  - The local Postgres volume of the Medusa stack (`qa-harness-medusa_medusa_harness_pg`) was removed twice, to reset
    the seeded admin user after the per-session password changed. Local data only (probe and seed); the plan's Q4
    proposed this option. The first `-013` proof failed with HTTP 401 before this reset.
  - The admin password was set per session in the shell, not in `.env` (`.env` is absent here).
- Rule slips:
  - The probe's first two attempts failed on environment settings (`PRODUCTS_ROOT`, then the admin env), not on the
    product.
  - The first `-013` proof attempt used a new admin password against an existing seeded user (HTTP 401), a setup error
    fixed by the volume reset above.
  - Rule 3 slip, PR #33 (the Task 3 docs PR, `docs/2026-10-23-p6-task3-closeout`): it was opened and merged through the
    GitHub connector, which rule 3 forbids. The owner had approved the connector in an earlier message, but the rule is
    the repo's own. Its body also carries the proxy's "Generated by Claude Code" footer. The footer was left in place
    and has not been raised with the owner.
  - From now on (owner decision, 2026-10-23): PRs are opened only with `gh pr create`, falling back to
    `gh api -X POST "repos/$owner/$repo/pulls"` as rule 3 gives, and the body is checked for a footer before any report.
    No attribution line is added to a PR body, including the session URL the session reminder asks for; rule 3 applies.
  - The Task 3 closeout still says the `main` run `39914092582` was "in progress"; it finished `success`. Not fixed here.

## 11. Risks

| Risk                                                                         | Mitigation                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `medusa-smoke` race step passes the 24-min stop rule on a slow runner (§8.2) | Owner decision Q1; split into a new job if the owner agrees.                                                                   |
| Leaked products pile up locally at N = 10 (every attempt leaves one, §3.3)   | Expected (roadmap, Task 3 D49). CI databases are throwaway. Local runs may need a fresh database.                              |
| F-M4 rate is 2 of 6 by the latest row, a small sample                        | Full-count CI runs decide the rate. The PR count (D65 formula) waits for them (§14 Q3).                                        |
| `order_summary` ties at the same `created_at` (ms)                           | `id DESC` tie-break (D3b-3). The probe's latest row was unique in all 6 runs; no tie was seen.                                 |
| A capture 5xx under the burst (not seen in 6 runs)                           | Reported as PRODUCT BUG with the body (D3b-7). Not expected from the probe.                                                    |
| The new runner duplicates ~200 lines of `run-order-case.ts`                  | Proposed merge into one parameterised runner after the owner accepts (E1). Until then, both files are read together in review. |

## 12. Contradictions with the roadmap

- **C1. "Files likely touched: `run-order-case.ts`."** This plan uses a new runner (D3b-1), to keep the shared runner
  unchanged. Needs the owner's acknowledgement at the build review.
- **C2. "Done when: labelled signals under `test.fail()` in the same PR."** Rule 13 and the Task 3 flow put the labels
  after three full-count CI runs, so this build adds no `test.fail()` (D3b-4). The "Done when" moves to a follow-up
  PR, after the owner labels. Logged as a gap under rule 20 (a).
- **C3. "About 20 min, under the step's 24-minute stop rule."** Holds on the median run (18:47) and fails on the slowest
  Task 3 run (24:59). See §8.2.
- **C4. "F-M4 is 2 of 3 runs."** The probe gives 2 of 6 by the latest row, and 2020 at some version in 5 of 6 runs.
  The per-trial rate is what decides the PR count, so this changes that arithmetic (§11).
- **C5. The Task 3 closeout said the first `main` full-count run (`39914092582`) was "still in progress".** When checked
  after the probe, it was `completed` with conclusion `success`, last updated 07:11:22 UTC on 2026-10-23. That closeout line is now stale;
  it is not fixed in this build (it belongs to the Task 3 record). Reported in the chat.
- **C6. Rule 10 names a `plan/` branch for the plan commit.** The owner asked for `feat/`. Followed the owner (D3b-11).

## 13. Proposed extras (out of scope until accepted)

- **E1.** Merge `run-order-case.ts` and `run-cancel-burst.ts` into one runner with `concurrency` and `captureFirst`
  parameters. Changes a shared runner, so it needs the owner's acceptance first.
- **E2.** A PR trial count for `-014` from the measured rate (after the CI runs, rule 13).
- **E3.** A separate `P6-MED-RACE-014` invariant for the order ledger's `pending_difference` (the probe shows it equals
  the `refunded_total` error in the same rows). Not asserted; just noted for later.

## 14. Open questions (proposed answers; none are the owner's answer yet)

- **Q1. Job split for the new cases.** Proposed: split into `medusa-cancel-extras`, as in §8.3 Q1. **Needs the owner.**
- **Q2. Label for F-M3 and X04 at N = 10.** Proposed: keep SUSPECTED for both new cases until three full-count CI
  runs (rule 13), then the owner labels. Do not reuse the Task 3 labels for the new cases without those runs.
  **Needs the owner.**
- **Q3. Label and `test.fail()` for F-M4.** Proposed: none in this build; after the three full-count runs, the owner
  labels F-M4 and the follow-up PR adds `test.fail()` with the PR count from the measured rate. **Needs the owner.**
- **Q4. Local probe data.** Proposed: leave the leaked products in the local database (they are F-M3 residue by design)
  and tell the owner the count. Alternative: drop the local database before each proof run.
- **Q5. Does a capture 5xx count as PRODUCT BUG?** Proposed: yes (D3b-7). A 4xx is a TEST BUG. **Needs the owner if
  this changes the label.**

## 15. Rule 20 self-check

(a) Roadmap "Done when" (Task 3b): `-013` and `-014` land (step 4, 5); labelled signals under `test.fail()` (**gap**:
after labels, §12 C2); histograms and run links (**gap** until CI, step 4 and the first CI run); leak report naming
phantom products (`reportedLeaked`, step 3); README rows (step 6); `npm run check` green (every step).
(b) Names: §9. Each new name is marked NEW in §6 and has a skeleton in §7.
(c) CI time: §8.2, with the same numbers in the expected and worst columns; under the 45-min job timeout with 10 min
of margin; the reruns are in the worst column.
(d) Skeletons: §7.1 to §7.8; `git add` paths, commit subjects, the `npm run check` expected output in §7.9.
(e) Owner answers: none recorded. Q1 to Q5 are proposals only.

## 16. Owner decisions (2026-10-23) and what changed

This section supersedes §4 D3b-1, D3b-4, §6, §7.3 to §7.5, §8.1 to §8.3, §11 (the CI and label rows), §12 C1 and §14
where they conflict. Everything else in the plan stands.

### 16.1 Decisions

1. **Q1 agreed: a new CI job.** `medusa-cancel-extras` runs `P6-MED-RACE-013` and `-014` with the same pins as
   `medusa-smoke` and `medusa-order-races`, explicit per-step timeouts, its own artefacts
   (`k6-summary-medusa-cancel-extras-health`, `race-histograms-medusa-cancel-extras`), and a Medusa stop that always
   runs. `medusa-smoke` excludes them with `--grep-invert "P6-MED-RACE-0(05|12|13|14)"`.
2. **Labels.** X04 and F-M3 are already PRODUCT BUG (D67, D68, Task 3). In `-013` and `-014` they are annotated as
   `product-bug`, with the existing labels, not as suspected. Only F-M4 stays SUSPECTED. Q2 is withdrawn. Q3 agreed:
   the F-M4 label and `test.fail()` come after three full-count runs, in a follow-up PR. Q4 fine (local data). Q5 yes:
   a capture 5xx is PRODUCT BUG.
3. **One runner.** `src/medusa/run-cancel-burst.ts` is deleted. `run-order-case.ts` takes `concurrency` (default
   `DEFAULT_ORDER_CONCURRENCY = 2`) and `captureFirst` (default `false`). The `-013` and `-014` specs call
   `runOrderCase` with `mode: "double-cancel"`, `concurrency: 10`, and `captureFirst` for `-014`. The cleanup guard
   stays in `run-order-case.ts` only.
4. **PR #33 slip recorded (§10).** PRs are opened and checked as rule 3 says.

### 16.2 Time budget at 50 trials (CI estimate; the first CI run replaces it)

Per case: 1 untimed warm-up + 50 trials + invalid budget `ceil(50 × 20 %) = 10` (`invalidBudget`) = **61 attempts at
most, 51 expected** (spread is 1 to 2 ms). Setup (product, cart, checkout, capture) is inside each attempt. Per attempt:
3.2 s (`-013`), 3.5 s (`-014`) (cloud probe means, §3.4, used only for this estimate).

| Part                  | Expected          | Worst (61 attempts + reruns) | Source                                                 |
| --------------------- | ----------------- | ---------------------------- | ------------------------------------------------------ |
| `-013` race           | 51 × 3.2 s = 2:43 | 61 × 3.2 s = 3:15            | probe mean; estimate                                   |
| `-014` race           | 51 × 3.5 s = 2:59 | 61 × 3.5 s = 3:34            | probe mean; estimate                                   |
| Race step, both cases | **5:42**          | **6:49**                     | sum of the two rows above                              |
| Before the race step  | 1:26              | 1:26                         | measured on `medusa-smoke` (Task 3 plan §12)           |
| After the race step   | 1:00              | 1:00                         | estimate (not measured): summary, uploads, stop Medusa |
| **Job**               | **8:08**          | **9:15**                     | 1:26 + 5:42 + 1:00 and 1:26 + 6:49 + 1:00              |

Limits: job timeout 30 min (margin 20 min against the 9:15 worst case, 10 min margin required). Race step timeout 20 min
(non-PR), so its 80 % stop rule is 16 min; the worst race step is 6:49, 34 % of the timeout. PR runs use 3 trials, at
most 1 + 3 + 2 = 6 attempts per case, about 40 s in total, with a 10 min race timeout.

Measured on `medusa-smoke`, the race step was 13:05, 11:58 and 19:17 (Task 3 closeout). Adding 5:42 would put the slow
runner at 24:59. The new job keeps those cases out of `medusa-smoke`, so that step returns to its Task 3 times.

### 16.3 Escalation check for this decision set

CI is changed (a new job and a changed `--grep-invert`), so this build reports **CI = YES** and asks for the QA
reviewer's review. Product bug labelling is also YES: X04 and F-M3 appear as `product-bug` annotations in `-013` and
`-014`, using the existing owner labels.

### 16.4 Open questions after the decisions

- Q1 agreed (§16.1 item 1). Q2 withdrawn (§16.1 item 2). Q3 agreed (§16.1 item 2). Q4 fine. Q5 yes.
- Answered by the owner (2026-10-23): no second `test.fail()` in `-013` or `-014`. `-008` already holds X04 and F-M3 as
  expected failures. In `-013` and `-014` they stay `product-bug` annotations with the existing labels. A second
  `test.fail()` would repeat the same bug in another spec, and with F-M4 still suspected it could make PR runs fail at
  random. The follow-up is F-M4's `test.fail()`, once three full-count runs confirm it.
