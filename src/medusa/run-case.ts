import { fireTogether } from "../races/fire-together.ts";
import { runTrials } from "../races/run-trials.ts";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import { attemptTag, createRerunRunner, spreadPolicyFromEnv } from "../races/rerun-on-spread.ts";
import { recordTrial } from "../races/trial-record.ts";
import { medusaBaseUrlFromEnv, type MedusaLockMode } from "../races/env.ts";
import type { RaceHistogram, RaceAttemptResult } from "../races/types.ts";
import type pg from "pg";
import {
  cancelAndArchive,
  createStockedVariant,
  deleteCustomersByEmail,
  deleteProduct,
  type MedusaCatalog,
} from "./admin.ts";
import {
  checkMemoryLockCharacterization,
  checkOrphanOrders,
  checkOversellInvariants,
  checkTwoInstanceTraffic,
  type OversellMode,
} from "./invariants.ts";
import { countCompleteRequests, readBackendLog } from "./harness-log.ts";
import { selectRows } from "../oracles/pg.ts";
import { LEAK_LIVE_ORDER_IDS_SQL, leakCheck, waitForOversellStable } from "./oracle.ts";
import {
  attemptEmailLike,
  caseLeakPattern,
  casePrefix,
  cleanupFailure,
  prefixedEmail,
} from "./payloads.ts";
import { completeCart, pickInstance, prepareReadyCarts } from "./store.ts";

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

/** Status counts per backend for one attempt: request i went to backend i % instances. Keys i0_* and i1_* always exist. */
function statusCountsPerInstance(
  statuses: Array<number | null>,
  instances: number,
): Record<string, number> {
  const out: Record<string, number> = {
    i0_200: 0,
    i0_400: 0,
    i0_other: 0,
    i1_200: 0,
    i1_400: 0,
    i1_other: 0,
  };
  statuses.forEach((status, i) => {
    const kind = status === 200 ? "200" : status === 400 ? "400" : "other";
    out[`i${i % instances}_${kind}`]! += 1;
  });
  return out;
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
  /** Backends that receive the completes: request i goes to instances[i % instances.length]. Default: [medusaBaseUrlFromEnv()]. */
  instances?: string[];
  /** Which invariant set decides the trial. "redis" (default) = checkOversellInvariants unchanged; "memory" = checkMemoryLockCharacterization. */
  lock?: MedusaLockMode;
};

export async function runOversellCase(input: RunOversellCaseInput): Promise<RaceHistogram> {
  const base = medusaBaseUrlFromEnv();
  const instances = input.instances ?? [base];
  const lock = input.lock ?? "redis";
  if (instances.length > 2) {
    throw new Error("TEST BUG: the harness starts at most two Medusa backends");
  }
  // Completes sent per backend, across warm-up and every attempt (the closure is shared by all of them).
  const sent = instances.map(() => 0);
  const serverCompletes = () =>
    instances.map((_, idx) => countCompleteRequests(readBackendLog(idx === 0 ? 0 : 1)));
  // Only the delta of the two reads is this case's traffic: the logs are per backend start, not per case.
  const serverBefore = instances.length > 1 ? serverCompletes() : [];
  const dataPrefix = casePrefix(input.runPrefix, input.caseId);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "medusa",
    concurrency: input.n,
    trials: input.trials,
  });

  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const inventoryItemIds: string[] = [];
  const cleanupViolations: string[] = [];
  const suspected: string[] = [];
  const leakPrefix = caseLeakPattern(input.runPrefix, input.caseId);

  try {
    // One attempt = fresh product, fresh carts, one burst, oracle, cleanup. The runner decides about reruns.
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      const trialLeaf = attemptTag(trial, attempt);
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
            const target = pickInstance(instances, i);
            sent[i % instances.length]! += 1;
            const result = await completeCart(input.catalog.publishableKey, cartId, target);
            rawBodies[i] = result.body;
            return result;
          },
          {
            warm: async () => {
              for (const url of instances) {
                const res = await fetch(`${url}/health`);
                await res.text();
              }
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

        let findingCount = 0;
        const record = recordTrial(trial, fired, () => {
          if (lock === "memory") {
            const check = checkMemoryLockCharacterization({
              s: input.s,
              instances: instances.length,
              orderCount: snapshot.orderCount,
              uniqueOrderIds: orderIdSet.size,
              httpWinnerCount,
              reservationQty: snapshot.reservationQty,
              reserved: snapshot.reserved,
              statuses: fired.requests.map((r) => r.status),
              loserTypes,
              loserMessages,
            });
            suspected.push(...check.suspected);
            findingCount = check.findings.length;
            if (check.violations.length > 0) {
              throw new Error(check.violations.join("; "));
            }
            return;
          }
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
          ...statusCountsPerInstance(
            fired.requests.map((r) => r.status),
            instances.length,
          ),
          oversold: orderIdSet.size > input.s ? 1 : 0,
          ghostOrders: snapshot.orderCount - orderIdSet.size,
          findings: findingCount,
        };
        if (input.mode === "s0") {
          record.oracle.lineItemStatus = 400;
          record.oracle.lineItemType = "not_allowed";
        }

        return record;
      } finally {
        // Sweep the attempt's live orders by email (F-M5, plan D48). A losing checkout can leave an order that HTTP
        // never returned, so the response ids above miss it. A failing sweep is a cleanup violation, never silent.
        try {
          const swept = await selectRows<{ id: string }>(input.pool, LEAK_LIVE_ORDER_IDS_SQL, [
            attemptEmailLike(dataPrefix, trialLeaf),
          ]);
          // Orphans are annotated before they are cancelled. They are SUSPECTED (F-M5), never a violation.
          suspected.push(
            ...checkOrphanOrders({
              liveOrderIds: swept.map((row) => row.id),
              returnedOrderIds: orderIds,
              attempt: trialLeaf,
            }),
          );
          for (const row of swept) {
            if (!orderIds.includes(row.id)) orderIds.push(row.id);
          }
        } catch (err) {
          cleanupViolations.push(cleanupFailure("order sweep", trialLeaf, err));
        }
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
    };

    // Untimed warm-up burst(s): trial index 0, own setup and cleanup, left out of the verdict and every count.
    await runner.warmup((attempt) => runAttempt(0, attempt));

    const trialResults = await runTrials(input.trials, (trial) =>
      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
    );

    runner.applyTo(histogram);
    if (instances.length > 1) {
      const serverAfter = serverCompletes();
      const serverCounts = serverAfter.map((count, idx) => count - (serverBefore[idx] ?? 0));
      histogram.invariantViolations.push(
        ...checkTwoInstanceTraffic({ clientCounts: sent, serverCounts }),
      );
    }
    histogram.invariantViolations.push(
      ...cleanupViolations,
      ...(await leakCheck(input.pool, leakPrefix, inventoryItemIds)),
    );

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    histogram.suspected = suspected;
    await writeHistogram(histogram);
  }

  return histogram;
}
