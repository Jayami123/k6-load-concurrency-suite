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
 * Every signal is SUSPECTED until the owner labels it (plan D3b-4); `labelled` promotes a tag, as in run-order-case.ts.
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
