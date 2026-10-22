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
  createCampaign,
  createPromotion,
  createStockedVariant,
  deleteCampaign,
  deleteCustomersByEmail,
  deleteProduct,
  deletePromotion,
  type MedusaCatalog,
} from "./admin.ts";
import {
  checkGhostOrders,
  checkLoserStatuses,
  checkPromoCap,
  classifyFindings,
} from "./invariants.ts";
import { LIVE_ORDERS_FOR_EMAIL_SQL, promoLeakCheck, readPromoSnapshot } from "./oracle.ts";
import {
  caseLeakPattern,
  casePrefix,
  cleanupFailure,
  likeLiteralPrefix,
  prefixedEmail,
  promoCode,
  setupStepError,
} from "./payloads.ts";
import { completeCart, prepareReadyCarts } from "./store.ts";

/**
 * budget: a campaign with a usage budget of `cap`, one promotion in it (P6-MED-RACE-005).
 * limit: one promotion with a usage limit of `cap`, no campaign (P6-MED-RACE-012).
 */
export type PromoMode = "budget" | "limit";

export type RunPromoCaseInput = {
  pool: pg.Pool;
  token: string;
  catalog: MedusaCatalog;
  runPrefix: string;
  caseId: string;
  title: string;
  mode: PromoMode;
  n: number;
  cap: number;
  trials: number;
  /** Signal tags the owner labelled (plan D54); a labelled SUSPECTED line is asserted. Empty until labelled. */
  labelled: readonly string[];
};

export type RunPromoCaseResult = {
  histogram: RaceHistogram;
  /** SUSPECTED PRODUCT BUG lines, per attempt. Annotated by the spec; they never change the verdict (D54). */
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

function messageOf(body: string | undefined): string {
  if (!body) return "";
  try {
    const json = JSON.parse(body) as { message?: unknown };
    return typeof json.message === "string" ? json.message : "";
  } catch {
    return "";
  }
}

export async function runPromoCase(input: RunPromoCaseInput): Promise<RunPromoCaseResult> {
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
  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const runSuspected: string[] = [];
  const cleanupViolations: string[] = [];

  try {
    // One attempt = fresh product, campaign/promotion and N carts, one burst, oracle, cleanup.
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      const leaf = attemptTag(trial, attempt);
      // The trailing "-" keeps "t1-" from matching "t10-".
      const emailLike = likeLiteralPrefix(`${dataPrefix}-${leaf}-`);
      const code = promoCode(dataPrefix, leaf);
      const emails = Array.from({ length: input.n }, (_, i) =>
        prefixedEmail(dataPrefix, `${leaf}-c${String(i).padStart(2, "0")}`),
      );
      let productId = "";
      let promotionId = "";
      let campaignId = "";

      try {
        // Setup, not raced. A throw here is a TEST BUG (D37): runTrial rethrows it and never reruns it.
        const stocked = await createStockedVariant({
          token: input.token,
          catalog: input.catalog,
          prefix: dataPrefix,
          leaf: `${leaf}-product`,
          s: 50,
          onCreated: (ids) => {
            if (ids.productId) productId = ids.productId;
          },
        });
        if (input.mode === "budget") {
          campaignId = await createCampaign(input.token, `${dataPrefix}-${leaf}-camp`, input.cap);
        }
        promotionId = await createPromotion(
          input.token,
          code,
          input.mode === "budget" ? { campaignId } : { limit: input.cap },
        );
        const carts = await prepareReadyCarts(input.n, (i) => ({
          publishableKey: input.catalog.publishableKey,
          regionId: input.catalog.regionId,
          salesChannelId: input.catalog.salesChannelId,
          variantId: stocked.variantId,
          email: emails[i]!,
          quantity: 1,
          promoCode: code,
        }));
        for (const cart of carts) {
          const lineError = setupStepError("add line item", cart.lineItemStatus);
          if (lineError) throw new Error(lineError);
        }

        const bodies: string[] = [];
        const fired = await fireTogether(
          input.n,
          async (i) => {
            const res = await completeCart(input.catalog.publishableKey, carts[i]!.cartId);
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

        const httpOrderIds = bodies.map(orderIdOf).filter((id): id is string => id !== null);
        const snapshot = await readPromoSnapshot(input.pool, promotionId, campaignId);
        const live = await selectRows<{ id: string }>(input.pool, LIVE_ORDERS_FOR_EMAIL_SQL, [
          emailLike,
        ]);
        const losers = fired.requests.filter((r) => r.status !== 200);
        const httpSuccesses = fired.requests.length - losers.length;
        const counterUsed = input.mode === "budget" ? snapshot.budgetUsed : snapshot.promotionUsed;
        const lines = [
          ...checkPromoCap({
            cap: input.cap,
            counterUsed,
            ordersWithPromo: snapshot.ordersWithPromo,
            httpSuccesses,
            label: input.caseId,
          }),
          ...checkGhostOrders({ liveOrderIds: live.map((o) => o.id), httpOrderIds }),
          ...checkLoserStatuses(losers.map((r) => r.status)),
        ];
        const { violations, suspected } = classifyFindings(lines, input.labelled);

        // Only violations reach recordTrial's throw. Suspected lines stay out of invariantViolations, so a
        // suspected signal in the warm-up cannot fail the case; a PRODUCT BUG in the warm-up still does.
        const record = recordTrial(trial, fired, () => {
          if (violations.length > 0) throw new Error(violations.join("; "));
        });
        record.oracle = {
          mode: input.mode,
          n: input.n,
          cap: input.cap,
          httpSuccesses,
          counterUsed,
          ordersWithPromo: snapshot.ordersWithPromo,
          liveOrders: live.length,
          loserStatus: losers[0]?.status ?? null,
          loserMessage: messageOf(bodies[fired.requests.findIndex((r) => r.status !== 200)]),
          suspectedBug: suspected.join(" | "),
        };
        for (const line of suspected)
          runSuspected.push(`trial ${trial} attempt ${attempt}: ${line}`);
        return record;
      } finally {
        // Cleanup, plan §9: live orders by email prefix (ghost orders included), product, promotion, campaign,
        // customers.
        const live = await selectRows<{ id: string }>(input.pool, LIVE_ORDERS_FOR_EMAIL_SQL, [
          emailLike,
        ]);
        for (const order of live) {
          try {
            await cancelAndArchive(input.token, order.id);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("order", order.id, err));
          }
        }
        if (productId) {
          try {
            await deleteProduct(input.token, productId);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("product", productId, err));
          }
        }
        if (promotionId) {
          try {
            await deletePromotion(input.token, promotionId);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("promotion", promotionId, err));
          }
        }
        if (campaignId) {
          try {
            await deleteCampaign(input.token, campaignId);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("campaign", campaignId, err));
          }
        }
        for (const email of emails) {
          try {
            await deleteCustomersByEmail(input.token, email);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("customer", email, err));
          }
        }
      }
    };

    // Untimed warm-up burst (D28): trial index 0, own data and cleanup, outside the verdict and every count.
    await runner.warmup((attempt) => runAttempt(0, attempt));

    const trialResults = await runTrials(input.trials, (trial) =>
      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
    );

    runner.applyTo(histogram);
    const leak = await promoLeakCheck(input.pool, leakPrefix);
    histogram.invariantViolations.push(...cleanupViolations, ...leak);

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return { histogram, suspected: runSuspected, reportedLeaked: [] };
}
