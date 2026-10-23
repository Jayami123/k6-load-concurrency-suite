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
  archiveOrder,
  cancelFulfillment,
  cancelOrder,
  createFulfillment,
  createStockedVariant,
  deleteCustomersByEmail,
  deleteProduct,
  deleteReservation,
  type MedusaCatalog,
} from "./admin.ts";
import {
  checkCancelFulfilExclusive,
  checkLoserStatuses,
  checkReservationDrift,
  checkSingleCancel,
  classifyFindings,
} from "./invariants.ts";
import {
  OPEN_FULFILLMENTS_SQL,
  ORDER_LINE_ITEM_SQL,
  ORDER_RESERVATIONS_SQL,
  PHANTOM_RESERVED_SQL,
  orderStateLeakCheck,
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
 * double-cancel: two parallel cancels of one order (P6-MED-RACE-008, P1 X04).
 * cancel-vs-fulfil: one cancel ‖ one fulfil of one order (P6-MED-RACE-009, P1 X05).
 */
export type OrderMode = "double-cancel" | "cancel-vs-fulfil";

export type RunOrderCaseInput = {
  pool: pg.Pool;
  token: string;
  catalog: MedusaCatalog;
  runPrefix: string;
  caseId: string;
  title: string;
  mode: OrderMode;
  trials: number;
  /** Signal tags the owner labelled (plan D54); a labelled SUSPECTED line is asserted. Empty until labelled. */
  labelled: readonly string[];
};

export type RunOrderCaseResult = {
  histogram: RaceHistogram;
  /** SUSPECTED PRODUCT BUG lines, per attempt. Annotated by the spec; they never change the verdict (D54). */
  suspected: string[];
  /** Residue a product defect left that no admin route clears (plan D49). Reported, never a failure. */
  reportedLeaked: string[];
};

/** Two requests per burst: the X04/X05 shape the roadmap ports (plan D46). */
const N = 2;

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

export async function runOrderCase(input: RunOrderCaseInput): Promise<RunOrderCaseResult> {
  const base = medusaBaseUrlFromEnv();
  const dataPrefix = casePrefix(input.runPrefix, input.caseId);
  const leakPrefix = caseLeakPattern(input.runPrefix, input.caseId);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "medusa",
    concurrency: N,
    trials: input.trials,
  });
  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const runSuspected: string[] = [];
  const cleanupViolations: string[] = [];
  const reportedLeaked: string[] = [];
  const reportedProductIds: string[] = [];
  /** Runs one cleanup step; a throw (DB read, network, admin 5xx) is a TEST BUG and the next step still runs. */
  const guard = async (kind: string, key: string, step: () => Promise<void>): Promise<void> => {
    try {
      await step();
    } catch (err) {
      cleanupViolations.push(cleanupFailure(kind, key, err));
    }
  };

  try {
    // One attempt = fresh product and checkout order, one burst of two requests, oracle, cleanup.
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      const leaf = attemptTag(trial, attempt);
      const email = prefixedEmail(dataPrefix, `${leaf}-c00`);
      let productId = "";
      let inventoryItemId = "";
      let orderId = "";

      try {
        // Setup, not raced. A throw here is a TEST BUG (D37).
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
        const [item] = await selectRows<{ item_id: string }>(input.pool, ORDER_LINE_ITEM_SQL, [
          orderId,
        ]);
        if (!item) throw new Error(`TEST BUG: no line item for order ${orderId}`);

        // Burst: index 0 cancels; index 1 cancels (-008) or fulfils (-009).
        const bodies: string[] = [];
        const fired = await fireTogether(
          N,
          async (i) => {
            const res =
              i === 1 && input.mode === "cancel-vs-fulfil"
                ? await createFulfillment(
                    input.token,
                    orderId,
                    item.item_id,
                    input.catalog.locationId,
                  )
                : await cancelOrder(input.token, orderId);
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
          ...(input.mode === "double-cancel"
            ? checkSingleCancel({
                status: state.status,
                httpSuccesses: statuses.filter((s) => s === 200).length,
                pendingChanges: state.pendingChanges,
                creditLines: state.creditLines,
              })
            : checkCancelFulfilExclusive({
                status: state.status,
                openFulfillments: state.openFulfillments,
                fulfilledQuantity: state.fulfilledQuantity,
                cancelStatus: statuses[0] ?? null,
                fulfilStatus: statuses[1] ?? null,
              })),
          ...checkReservationDrift(state),
          ...checkLoserStatuses(statuses.filter((s) => s !== 200)),
        ];
        const { violations, suspected } = classifyFindings(lines, input.labelled);

        // Same rule as runPromoCase: suspected lines never reach invariantViolations, so a suspected signal in the
        // warm-up cannot fail the case; a PRODUCT BUG in the warm-up still does.
        const record = recordTrial(trial, fired, () => {
          if (violations.length > 0) throw new Error(violations.join("; "));
        });
        record.oracle = {
          mode: input.mode,
          status: state.status,
          openFulfillments: state.openFulfillments,
          pendingChanges: state.pendingChanges,
          creditLines: state.creditLines,
          liveReservations: state.liveReservations,
          reservedQuantity: state.reservedQuantity,
          fulfilledQuantity: state.fulfilledQuantity,
          loserStatus: statuses.find((s) => s !== 200) ?? null,
          loserMessage: messageOf(bodies[statuses.findIndex((s) => s !== 200)]),
          suspectedBug: suspected.join(" | "),
        };
        for (const line of suspected)
          runSuspected.push(`trial ${trial} attempt ${attempt}: ${line}`);
        return record;
      } finally {
        // Cleanup, plan §9. A route the product state blocks leaves leaked data (D49), not a failure.
        // Each step is guarded, so a failing step never skips the later ones or hides the attempt's own error.
        if (orderId) {
          await guard("order", orderId, async () => {
            const { status } = await readOrderState(
              input.pool,
              orderId,
              inventoryItemId,
              input.catalog.locationId,
            );
            const open = await selectRows<{ id: string }>(input.pool, OPEN_FULFILLMENTS_SQL, [
              orderId,
            ]);
            for (const f of open) {
              if (status === "canceled") {
                reportedLeaked.push(`fulfillment ${f.id} of canceled order ${orderId} (X05, D49)`);
                continue;
              }
              const res = await cancelFulfillment(input.token, orderId, f.id);
              if (res.status !== 200) {
                cleanupViolations.push(cleanupFailure("fulfillment", f.id, `HTTP ${res.status}`));
              }
            }
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

    // Untimed warm-up burst (D28): trial index 0, own data and cleanup, outside the verdict and every count.
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
