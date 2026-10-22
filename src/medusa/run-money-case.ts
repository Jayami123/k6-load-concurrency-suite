import { fireTogether } from "../races/fire-together.ts";
import { runTrials } from "../races/run-trials.ts";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import { attemptTag, createRerunRunner, spreadPolicyFromEnv } from "../races/rerun-on-spread.ts";
import { recordTrial } from "../races/trial-record.ts";
import { medusaBaseUrlFromEnv } from "../races/env.ts";
import type { RaceAttemptResult, RaceHistogram } from "../races/types.ts";
import { selectRows } from "../oracles/pg.ts";
import type pg from "pg";
import {
  cancelAndArchive,
  capturePayment,
  confirmPendingOrderChange,
  createStockedVariant,
  deleteCustomersByEmail,
  deleteProduct,
  refundPayment,
  type MedusaCatalog,
} from "./admin.ts";
import {
  checkCaptureCap,
  checkLoserStatuses,
  checkRefundCap,
  checkSuccessCount,
} from "./invariants.ts";
import { parseWholeAmount } from "./money.ts";
import { MONEY_PAYMENT_FOR_ORDER_SQL, moneyLeakCheck, readMoneySnapshot } from "./oracle.ts";
import {
  caseLeakPattern,
  casePrefix,
  cleanupFailure,
  prefixedEmail,
  setupStepError,
} from "./payloads.ts";
import { completeCart, prepareReadyCarts } from "./store.ts";

/**
 * refund-all: capture X, then N parallel refunds of X (P6-MED-RACE-007).
 * refund-half: capture X, then N parallel refunds of X/2 (P6-MED-RACE-011).
 * capture: authorised X, then N parallel captures of X (P6-MED-RACE-010).
 */
export type MoneyMode = "refund-all" | "refund-half" | "capture";

/** Successes the HTTP side should show. A different count is a suspected bug (D40), never a failure by itself. */
const EXPECTED_SUCCESSES: Record<MoneyMode, number> = {
  "refund-all": 1,
  "refund-half": 2,
  capture: 1,
};

export type RunMoneyCaseInput = {
  pool: pg.Pool;
  token: string;
  catalog: MedusaCatalog;
  runPrefix: string;
  caseId: string;
  title: string;
  mode: MoneyMode;
  n: number;
  trials: number;
};

export type RunMoneyCaseResult = {
  histogram: RaceHistogram;
  /** Orders the cleanup could not archive. Reported as leaked data, not a failure (D41). */
  reportedLeakedOrderIds: string[];
};

function orderIdOf(body: string): string | null {
  try {
    const json = JSON.parse(body) as { type?: string; order?: { id?: string } };
    return json.type === "order" ? (json.order?.id ?? null) : null;
  } catch {
    return null;
  }
}

function messageOf(body: string | undefined): string {
  if (!body) return "";
  try {
    const json = JSON.parse(body) as { message?: unknown };
    return typeof json.message === "string" ? json.message : "";
  } catch {
    return "";
  }
}

export async function runMoneyCase(input: RunMoneyCaseInput): Promise<RunMoneyCaseResult> {
  const base = medusaBaseUrlFromEnv();
  const dataPrefix = casePrefix(input.runPrefix, input.caseId);
  const leakPrefix = caseLeakPattern(input.runPrefix, input.caseId);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "medusa",
    concurrency: input.n,
    trials: input.trials,
  });
  const expected = EXPECTED_SUCCESSES[input.mode];
  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const cleanupViolations: string[] = [];
  const reportedLeakedOrderIds: string[] = [];
  let liveLeakedOrderIds: string[] = [];

  // Cleanup per plan §9: confirm a pending change, refund the rest to zero, cancel and archive, delete the product.
  // Any failure here is reported as leaked data (D41); it never fails the case by itself.
  const cleanupOrder = async (orderId: string, paymentId: string): Promise<void> => {
    let stuck = false;
    try {
      const before = await readMoneySnapshot(input.pool, paymentId, orderId);
      if (before.pendingChanges > 0) {
        const confirm = await confirmPendingOrderChange(input.token, orderId);
        if (confirm.status !== 200) stuck = true;
      }
      const after = await readMoneySnapshot(input.pool, paymentId, orderId);
      const rest = after.capturedSum - after.refundedSum;
      if (rest > 0) {
        const refund = await refundPayment(input.token, paymentId, rest);
        if (refund.status !== 200) stuck = true;
      }
      await cancelAndArchive(input.token, orderId);
    } catch {
      stuck = true;
    }
    if (stuck) reportedLeakedOrderIds.push(orderId);
  };

  try {
    // One attempt = fresh product, fresh cart and order, the money setup, one burst, oracle, cleanup.
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      const trialLeaf = attemptTag(trial, attempt);
      const customerEmails: string[] = [];
      let productId = "";
      let orderId = "";
      let paymentId = "";

      try {
        const stocked = await createStockedVariant({
          token: input.token,
          catalog: input.catalog,
          prefix: dataPrefix,
          leaf: `${trialLeaf}-product`,
          s: 50,
          onCreated: (ids) => {
            if (ids.productId) productId = ids.productId;
          },
        });

        const email = prefixedEmail(dataPrefix, `${trialLeaf}-c00`);
        customerEmails.push(email);
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
        const placed = orderIdOf(done.body);
        if (!placed) throw new Error("TEST BUG: checkout returned no order");
        orderId = placed;

        const [payment] = await selectRows<{ payment_id: string; amount: string }>(
          input.pool,
          MONEY_PAYMENT_FOR_ORDER_SQL,
          [orderId],
        );
        if (!payment) throw new Error(`TEST BUG: no payment for order ${orderId}`);
        paymentId = payment.payment_id;
        const authorizedAmount = parseWholeAmount(payment.amount, "order total");
        if (input.mode === "refund-half" && authorizedAmount % 2 !== 0) {
          throw new Error(`TEST BUG: order total ${authorizedAmount} is odd, so X/2 is not whole`);
        }
        const requestAmount =
          input.mode === "refund-half" ? authorizedAmount / 2 : authorizedAmount;

        if (input.mode !== "capture") {
          const pre = await capturePayment(input.token, paymentId, authorizedAmount);
          const preError = setupStepError("capture before the burst", pre.status);
          if (preError) throw new Error(preError);
          const preSnapshot = await readMoneySnapshot(input.pool, paymentId, orderId);
          if (preSnapshot.capturedSum !== authorizedAmount) {
            throw new Error(
              `TEST BUG: pre-capture sum ${preSnapshot.capturedSum} is not ${authorizedAmount}`,
            );
          }
        }

        const bodies: string[] = [];
        const fired = await fireTogether(
          input.n,
          async (i) => {
            const res =
              input.mode === "capture"
                ? await capturePayment(input.token, paymentId, requestAmount)
                : await refundPayment(input.token, paymentId, requestAmount);
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

        const losers = fired.requests.filter((r) => r.status !== 200);
        const successes = fired.requests.filter((r) => r.status === 200).length;
        const finding = checkSuccessCount({
          successes,
          expected,
          label: `${input.caseId} ${input.title}`,
        });
        const snapshot = await readMoneySnapshot(input.pool, paymentId, orderId);

        const record = recordTrial(trial, fired, () => {
          const violations = [
            ...(input.mode === "capture"
              ? checkCaptureCap({ authorizedAmount, capturedSum: snapshot.capturedSum })
              : checkRefundCap({
                  capturedSum: snapshot.capturedSum,
                  refundedSum: snapshot.refundedSum,
                })),
            ...checkLoserStatuses(losers.map((r) => r.status)),
          ];
          if (violations.length > 0) throw new Error(violations.join("; "));
        });

        const firstLoser = fired.requests.findIndex((r) => r.status !== 200);
        record.oracle = {
          mode: input.mode,
          n: input.n,
          requestAmount,
          authorizedAmount,
          httpSuccesses: successes,
          expectedSuccesses: expected,
          capturedSum: snapshot.capturedSum,
          captureRows: snapshot.captureRows,
          refundedSum: snapshot.refundedSum,
          refundRows: snapshot.refundRows,
          pendingChanges: snapshot.pendingChanges,
          loserStatus: losers[0]?.status ?? null,
          loserMessage: messageOf(bodies[firstLoser]),
          suspectedBug: finding ?? "",
        };
        return record;
      } finally {
        if (orderId && paymentId) {
          await cleanupOrder(orderId, paymentId);
        } else if (orderId) {
          // Checkout created an order but the payment lookup failed: no money to refund, cancel only.
          try {
            await cancelAndArchive(input.token, orderId);
          } catch {
            reportedLeakedOrderIds.push(orderId);
          }
        }
        if (productId) {
          try {
            await deleteProduct(input.token, productId);
          } catch {
            /* reservations may block until the order is archived */
          }
        }
        for (const address of customerEmails) {
          try {
            await deleteCustomersByEmail(input.token, address);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("customer", address, err));
          }
        }
      }
    };

    // Untimed warm-up burst (D28): trial index 0, own order and cleanup, outside the verdict and every count.
    await runner.warmup((attempt) => runAttempt(0, attempt));

    const trialResults = await runTrials(input.trials, (trial) =>
      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
    );

    runner.applyTo(histogram);
    const leak = await moneyLeakCheck(input.pool, leakPrefix, reportedLeakedOrderIds);
    liveLeakedOrderIds = leak.reportedLeaked;
    histogram.invariantViolations.push(...cleanupViolations, ...leak.violations);

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return { histogram, reportedLeakedOrderIds: liveLeakedOrderIds };
}
