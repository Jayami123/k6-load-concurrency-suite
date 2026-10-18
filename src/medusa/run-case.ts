import { fireTogether } from "../races/fire-together.ts";
import { runTrials } from "../races/run-trials.ts";
import {
  aggregateDispatchSpread,
  createHistogram,
  mergeStatusCounts,
  writeHistogram,
} from "../races/histogram.ts";
import { recordTrial } from "../races/trial-record.ts";
import { medusaBaseUrlFromEnv, raceMaxSpreadMsFromEnv } from "../races/env.ts";
import type { RaceHistogram, RaceTrialResult } from "../races/types.ts";
import type pg from "pg";
import {
  cancelAndArchive,
  createStockedVariant,
  deleteCustomersByEmail,
  deleteProduct,
  type MedusaCatalog,
} from "./admin.ts";
import { checkOversellInvariants, type OversellMode } from "./invariants.ts";
import { leakCheck, waitForOversellStable } from "./oracle.ts";
import { caseLeakPattern, casePrefix, cleanupFailure, prefixedEmail } from "./payloads.ts";
import { completeCart, prepareReadyCarts } from "./store.ts";

function parseCompleteBody(body: string): {
  type: string | null;
  orderId: string | null;
  message: string | null;
} {
  try {
    const json = JSON.parse(body) as {
      type?: string;
      order?: { id?: string };
      message?: string;
    };
    return {
      type: json.type ?? null,
      orderId: json.order?.id ?? null,
      message: json.message ?? null,
    };
  } catch {
    return { type: null, orderId: null, message: null };
  }
}

export type RunOversellCaseInput = {
  pool: pg.Pool;
  token: string;
  catalog: MedusaCatalog;
  runPrefix: string;
  caseId: string;
  title: string;
  s: number;
  n: number;
  mode: OversellMode;
  trials: number;
  quantities?: number[];
};

export async function runOversellCase(input: RunOversellCaseInput): Promise<RaceHistogram> {
  const spreadLimit = raceMaxSpreadMsFromEnv();
  const base = medusaBaseUrlFromEnv();
  const dataPrefix = casePrefix(input.runPrefix, input.caseId);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "medusa",
    concurrency: input.n,
    trials: input.trials,
  });

  const spreads: number[] = [];
  const perTrial: RaceTrialResult[] = [];
  const inventoryItemIds: string[] = [];
  const cleanupViolations: string[] = [];
  const leakPrefix = caseLeakPattern(input.runPrefix, input.caseId);

  try {
    const trialResults = await runTrials(input.trials, async (trial) => {
      const trialLeaf = `t${trial}`;
      const productLeaf = `${trialLeaf}-product`;
      const orderIds: string[] = [];
      const customerEmails: string[] = [];

      let variantId = "";
      let inventoryItemId = "";
      let productId = "";

      try {
        const stocked = await createStockedVariant({
          token: input.token,
          catalog: input.catalog,
          prefix: dataPrefix,
          leaf: productLeaf,
          s: input.s,
          onCreated: (ids) => {
            if (ids.productId) productId = ids.productId;
            if (ids.inventoryItemId && !inventoryItemIds.includes(ids.inventoryItemId)) {
              inventoryItemIds.push(ids.inventoryItemId);
            }
          },
        });
        variantId = stocked.variantId;
        inventoryItemId = stocked.inventoryItemId;

        const quantities =
          input.mode === "mixed"
            ? (input.quantities ?? [3, 1, 1, 1, 1])
            : Array.from({ length: input.n }, () => 1);

        let cartIds: string[] = [];
        let cartQuantities: number[] = quantities;

        if (input.mode === "sameCart") {
          const email = prefixedEmail(dataPrefix, `${trialLeaf}-c0`);
          customerEmails.push(email);
          const carts = await prepareReadyCarts(1, () => ({
            publishableKey: input.catalog.publishableKey,
            regionId: input.catalog.regionId,
            salesChannelId: input.catalog.salesChannelId,
            variantId,
            email,
            quantity: 1,
          }));
          if (carts[0]?.lineItemStatus !== 200) {
            throw new Error(
              `TEST BUG: add line item HTTP ${carts[0]?.lineItemStatus ?? "missing"}`,
            );
          }
          cartIds = carts.map((c) => c.cartId);
          cartQuantities = Array.from({ length: input.n }, () => 1);
        } else {
          const carts = await prepareReadyCarts(input.n, (i) => {
            const email = prefixedEmail(dataPrefix, `${trialLeaf}-c${String(i).padStart(2, "0")}`);
            customerEmails.push(email);
            return {
              publishableKey: input.catalog.publishableKey,
              regionId: input.catalog.regionId,
              salesChannelId: input.catalog.salesChannelId,
              variantId,
              email,
              quantity: quantities[i] ?? 1,
            };
          });
          cartIds = carts.map((c) => c.cartId);

          if (input.mode !== "s0") {
            const bad = carts.find((c) => c.lineItemStatus !== 200);
            if (bad) {
              throw new Error(
                `TEST BUG: add line item HTTP ${bad.lineItemStatus} type=${bad.lineItemType ?? "missing"}`,
              );
            }
          }

          if (input.mode === "s0") {
            const bad = carts.find((c) => c.lineItemStatus !== 400);
            if (bad) {
              throw new Error(`PRODUCT BUG: s0 expected line-item 400, got ${bad.lineItemStatus}`);
            }
            if (carts.some((c) => c.lineItemType !== "not_allowed")) {
              throw new Error("PRODUCT BUG: s0 line-item type expected not_allowed");
            }
          }
        }

        const rawBodies: string[] = Array.from({ length: input.n }, () => "");
        const fired = await fireTogether(
          input.n,
          async (i) => {
            const cartId = input.mode === "sameCart" ? cartIds[0]! : cartIds[i]!;
            const result = await completeCart(input.catalog.publishableKey, cartId);
            rawBodies[i] = result.body;
            return result;
          },
          {
            warm: async () => {
              const res = await fetch(`${base}/health`);
              await res.text();
            },
          },
        );

        const parsedBodies = rawBodies.map((body) => parseCompleteBody(body));

        const httpWinnerCount = fired.requests.filter(
          (r, idx) => r.status === 200 && parsedBodies[idx]?.type === "order",
        ).length;
        const orderIdSet = new Set<string>();
        for (let i = 0; i < fired.requests.length; i++) {
          const req = fired.requests[i]!;
          const p = parsedBodies[i]!;
          if (req.status === 200 && p.type === "order" && p.orderId) {
            orderIdSet.add(p.orderId);
            orderIds.push(p.orderId);
          }
        }

        const loserStatuses: Array<number | null> = [];
        const loserTypes: string[] = [];
        const loserMessages: string[] = [];
        const loserQuantities: number[] = [];
        for (let i = 0; i < fired.requests.length; i++) {
          const req = fired.requests[i]!;
          if (req.status === 200) continue;
          const p = parsedBodies[i]!;
          loserStatuses.push(req.status);
          loserTypes.push(p.type ?? "");
          loserMessages.push(p.message ?? "");
          loserQuantities.push(cartQuantities[i] ?? 1);
        }

        const snapshot = await waitForOversellStable(
          input.pool,
          variantId,
          inventoryItemId,
          input.catalog.locationId,
        );
        const available = snapshot.stocked - snapshot.reserved;

        const record = recordTrial(trial, fired, () => {
          const violations = checkOversellInvariants({
            mode: input.mode,
            s: input.s,
            n: input.n,
            orderCount: snapshot.orderCount,
            orderQty: snapshot.orderQty,
            httpWinnerCount,
            uniqueOrderIds: orderIdSet.size,
            reservationQty: snapshot.reservationQty,
            stocked: snapshot.stocked,
            reserved: snapshot.reserved,
            available,
            statuses: fired.requests.map((r) => r.status),
            loserTypes,
            loserMessages,
            loserQuantities,
            dispatchSpreadMs: fired.dispatchSpreadMs,
            spreadLimit,
          });
          if (violations.length > 0) {
            throw new Error(violations.join("; "));
          }
        });

        record.oracle = {
          s: input.s,
          n: input.n,
          orderCount: snapshot.orderCount,
          httpWinnerCount,
          uniqueOrderIds: orderIdSet.size,
          reservationQty: snapshot.reservationQty,
          stocked: snapshot.stocked,
          reserved: snapshot.reserved,
          available,
          loserStatus: loserStatuses[0] ?? null,
          loserType: loserTypes[0] ?? null,
          orderQty: snapshot.orderQty,
        };
        if (input.mode === "s0") {
          record.oracle.lineItemStatus = 400;
          record.oracle.lineItemType = "not_allowed";
        }

        perTrial.push(record);
        spreads.push(record.dispatchSpreadMs);
        mergeStatusCounts(histogram.statusCounts, record.statusCounts);

        if (!record.ok) {
          throw new Error(record.error);
        }
      } finally {
        for (const orderId of [...new Set(orderIds)]) {
          try {
            await cancelAndArchive(input.token, orderId);
          } catch {
            /* best effort */
          }
        }
        if (productId) {
          try {
            await deleteProduct(input.token, productId);
          } catch {
            /* reservations may block until cancel completes */
          }
        }
        for (const email of customerEmails) {
          try {
            await deleteCustomersByEmail(input.token, email);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("customer", email, err));
          }
        }
      }
    });

    const recorded = new Set(perTrial.map((t) => t.trial));
    for (const failed of trialResults.filter((t) => !t.ok && !recorded.has(t.trial))) {
      perTrial.push({
        trial: failed.trial,
        ok: false,
        statuses: [],
        statusCounts: {},
        dispatchSpreadMs: 0,
        oracle: {},
        invariantViolations: failed.error ? [failed.error] : [],
        error: failed.error,
      });
    }

    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);

    histogram.invariantViolations.push(
      ...cleanupViolations,
      ...(await leakCheck(input.pool, leakPrefix, inventoryItemIds)),
    );

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return histogram;
}
