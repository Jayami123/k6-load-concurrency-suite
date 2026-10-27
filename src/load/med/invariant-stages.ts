// The Task 10 stages of P6-MED-LOAD-007, -008 and -009 (plan Phase 4b task 10 §6, owner decisions D40 to D43). The setup wraps the
// shared Medusa setup and adds the second instance URL, the location and, for -008, a campaign and a promotion. Each reconcile stage
// reads the stored state after the drain and judges it with a pure verdict (classifySplit, promoLedgerVerdict, terminalTransitionVerdict).
// Schema sources (pinned Medusa 2.21.2, fetched from npm at that version; migration files in the @medusajs packages):
//   "order" (status, canceled_at), order_change (status, canceled_at): @medusajs/order Migration20240219102530.js
//   fulfillment (shipped_at, canceled_at): @medusajs/fulfillment Migration20240311145700_InitialSetupMigration.js
//   promotion_campaign_budget ("limit", "used", type, campaign_id): @medusajs/promotion Migration20240227120221.js
// Joins already live on main and verified by CI: src/medusa/oracle.ts (MONEY_SNAPSHOT_SQL, PROMO_SNAPSHOT_SQL, OPEN_FULFILLMENTS_SQL).
import { readFileSync } from "node:fs";
import { medusaSecondBaseUrlFromEnv } from "../../races/env.ts";
import { PROMO_SNAPSHOT_SQL, readOversellSnapshot } from "../../medusa/oracle.ts";
import { createCampaign, createPromotion, seedAndLogin } from "../../medusa/admin.ts";
import { closePool, createReadOnlyPool, selectRows } from "../../oracles/pg.ts";
import { summaryCounter } from "../reconcile/index.ts";
import { medusaSetup } from "../products/medusa.ts";
import { parseK6Summary } from "../summary.ts";
import type { LoadContext, Stage, StageResult } from "../types.ts";
import { terminalTransitionVerdict, type OrderTerminal } from "./cancel-race.ts";
import { promoLedgerVerdict } from "./ledger.ts";
import { classifySplit, type InstanceCount } from "./instance-split.ts";
import { isRacedEmail } from "./raced-orders.ts";

/** One row per run order: state, cancel effects, fulfilments, payments and the money of its payments. */
export const RUN_ORDER_ROWS_SQL = `
SELECT o.id, o.email, o.status,
  (o.canceled_at IS NOT NULL)::int AS canceled,
  (SELECT COUNT(*) FROM order_change oc WHERE oc.order_id = o.id AND oc.status = 'canceled' AND oc.deleted_at IS NULL)::int AS cancel_changes,
  (SELECT COUNT(*) FROM order_fulfillment ofl JOIN fulfillment f ON f.id = ofl.fulfillment_id
     WHERE ofl.order_id = o.id AND ofl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.canceled_at IS NULL)::int AS live_fulfilments,
  (SELECT COUNT(*) FROM order_fulfillment ofl JOIN fulfillment f ON f.id = ofl.fulfillment_id
     WHERE ofl.order_id = o.id AND ofl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.canceled_at IS NULL AND f.shipped_at IS NOT NULL)::int AS shipped_fulfilments,
  (SELECT COUNT(*) FROM order_payment_collection opc JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
     WHERE opc.order_id = o.id AND p.deleted_at IS NULL)::int AS payments,
  (SELECT COALESCE(SUM(c.amount), 0)::text FROM order_payment_collection opc JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
     JOIN capture c ON c.payment_id = p.id WHERE opc.order_id = o.id AND c.deleted_at IS NULL) AS captured,
  (SELECT COALESCE(SUM(r.amount), 0)::text FROM order_payment_collection opc JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
     JOIN refund r ON r.payment_id = p.id WHERE opc.order_id = o.id AND r.deleted_at IS NULL) AS refunded,
  (SELECT COUNT(*) FROM order_payment_collection opc JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
     JOIN refund r ON r.payment_id = p.id WHERE opc.order_id = o.id AND r.deleted_at IS NULL)::int AS refund_rows
FROM "order" o
WHERE o.email LIKE $1 AND o.deleted_at IS NULL
`;

/** The campaign budget of a promotion: its usage limit and the used count (promotion_campaign_budget, type usage). */
export const CAMPAIGN_BUDGET_SQL = `
SELECT b."limit"::text AS limit, b.used::text AS used
FROM promotion_campaign_budget b
WHERE b.campaign_id = $1 AND b.type = 'usage' AND b.deleted_at IS NULL
`;

type RunOrderRow = {
  id: string;
  email: string;
  status: string;
  canceled: number;
  cancel_changes: number;
  live_fulfilments: number;
  shipped_fulfilments: number;
  payments: number;
  captured: string;
  refunded: string;
  refund_rows: number;
};

function mainRun(ctx: LoadContext) {
  return ctx.k6.find((k) => k.label === "main") ?? ctx.k6[0];
}

function auditOf(ctx: LoadContext): Record<string, unknown> | undefined {
  return ctx.config.audit as Record<string, unknown> | undefined;
}

/** Counter totals of the main run's summary (a missing counter is 0). */
function counter(summary: unknown, name: string): number {
  return summaryCounter(summary, name) ?? 0;
}

/**
 * Setup of the Task 10 cases: the shared Medusa setup, then the second instance URL and the stock location (for -007 and -009),
 * and for -008 a campaign with a usage limit and a promotion on it. The limit is the planned iteration count (decision D43).
 */
export function makeInvariantSetup(opts: { promo: boolean }): Stage {
  return async (ctx: LoadContext): Promise<StageResult> => {
    const base = await medusaSetup(ctx);
    if (!base.ok) return base;
    const audit = auditOf(ctx);
    const secondUrl = medusaSecondBaseUrlFromEnv();
    ctx.config.locationId = audit?.locationId;
    if (secondUrl !== undefined) ctx.config.secondBaseUrl = secondUrl;
    if (!opts.promo) return base;
    const token = ctx.secrets.MEDUSA_ADMIN_TOKEN ?? (await seedAndLogin());
    const prefix = String(audit?.prefix ?? ctx.config.prefix);
    const c = ctx.config;
    const limit = Math.ceil((Number(c.rate) * Number(c.durationSec)) / Number(c.timeUnitSec ?? 1));
    if (!Number.isFinite(limit) || limit < 1)
      return { ok: false, kind: "TEST BUG", reasons: ["promo setup: planned iterations unknown"] };
    const campaignId = await createCampaign(token, `${prefix}-campaign`, limit);
    const promotionId = await createPromotion(token, `${prefix}-promo`, { campaignId });
    ctx.config.promoCode = `${prefix}-promo`;
    ctx.config.promoShare = 0.5;
    ctx.config.promoLimit = limit;
    if (audit) {
      audit.campaignId = campaignId;
      audit.promotionId = promotionId;
    }
    return {
      ok: true,
      reasons: [`promotion ${promotionId} on campaign ${campaignId}, limit ${limit}`],
    };
  };
}

/** P6-MED-LOAD-007: the two-instance split verdict (classifySplit). */
export const splitStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const main = mainRun(ctx);
  const audit = auditOf(ctx);
  if (!main || !audit)
    return { ok: false, kind: "TEST BUG", reasons: ["split: no main run or no audit config"] };
  const summary = JSON.parse(readFileSync(main.summaryPath, "utf8"));
  const pool = createReadOnlyPool();
  try {
    const rows = await selectRows<RunOrderRow>(pool, RUN_ORDER_ROWS_SQL, [
      String(audit.prefixLike),
    ]);
    const snapshot = await readOversellSnapshot(
      pool,
      String(audit.variantId),
      String(audit.inventoryItemId),
      String(audit.locationId),
    );
    const clientOrders = counter(summary, "p6_orders");
    const byEmail = new Map<string, number>();
    for (const r of rows) byEmail.set(r.email, (byEmail.get(r.email) ?? 0) + 1);
    const duplicateCartOrders = [...byEmail.values()].filter((n) => n > 1).length;
    const perInstance: InstanceCount[] = [
      { instance: "primary", requests: counter(summary, "p6_requests_primary"), orders: 0 },
      { instance: "secondary", requests: counter(summary, "p6_requests_secondary"), orders: 0 },
    ];
    const dropped = parseK6Summary(summary).dropped;
    const verdict = classifySplit({
      orders: rows.length,
      stock: Number(audit.stock),
      perInstance,
      duplicateCartOrders,
      reservationsMatchOrders:
        snapshot.reservationQty === snapshot.orderQty &&
        snapshot.reserved === snapshot.reservationQty,
      onePaymentPerOrder: rows.every((r) => r.payments === 1),
      perIntentReconciled: rows.length === clientOrders,
      ghostOrders: Math.max(0, rows.length - clientOrders),
      invalidReasons: dropped > 0 ? [`${dropped} dropped iteration(s)`] : [],
    });
    const kind =
      verdict.verdict === "FAIL (PRODUCT BUG)"
        ? "PRODUCT BUG"
        : verdict.verdict === "PASS"
          ? undefined
          : verdict.verdict === "INVALID"
            ? "INVALID"
            : "TEST BUG";
    return {
      ok: verdict.verdict === "PASS",
      kind,
      reasons: verdict.reasons.length > 0 ? verdict.reasons : [`split: ${verdict.verdict}`],
      data: { verdict: verdict.verdict, orders: rows.length, perInstance },
    };
  } finally {
    await closePool(pool);
  }
};

/** P6-MED-LOAD-008: the promo ledger verdict (promoLedgerVerdict). Balance is captured minus refunded per order (D40, D43). */
export const ledgerStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const main = mainRun(ctx);
  const audit = auditOf(ctx);
  if (!main || !audit || !audit.campaignId || !audit.promotionId)
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["ledger: promotion or campaign missing from setup"],
    };
  const pool = createReadOnlyPool();
  try {
    const rows = await selectRows<RunOrderRow>(pool, RUN_ORDER_ROWS_SQL, [
      String(audit.prefixLike),
    ]);
    const promo = await selectRows<{ orders_with_promo: number }>(pool, PROMO_SNAPSHOT_SQL, [
      String(audit.promotionId),
      String(audit.campaignId),
    ]);
    const budget = await selectRows<{ limit: string | null; used: string }>(
      pool,
      CAMPAIGN_BUDGET_SQL,
      [String(audit.campaignId)],
    );
    const limit = budget[0]?.limit;
    const result = promoLedgerVerdict({
      redemptions: Number(promo[0]?.orders_with_promo ?? 0),
      promoLimit: limit === null || limit === undefined ? Number.NaN : Number(limit),
      balances: rows.map((r) => Number(r.captured) - Number(r.refunded)),
      debitsSum: rows.reduce((n, r) => n + (Number(r.captured) - Number(r.refunded)), 0),
      // the balances and the debits come from the same rows, so no balance change is independent of them: the clause is PENDING
      balanceChange: null,
    });
    const failed = result.clauses.filter((c) => c.status === "FAIL (PRODUCT BUG)");
    return {
      ok: result.verdict === "PASS" || result.verdict === "PASS (gift-card pending)",
      kind:
        failed.length > 0 ? "PRODUCT BUG" : result.verdict === "TEST BUG" ? "TEST BUG" : undefined,
      reasons:
        failed.length > 0
          ? failed.map((c) => `${c.name}: ${c.detail}`)
          : [`ledger: ${result.verdict}`],
      data: {
        verdict: result.verdict,
        clauses: result.clauses.map((c) => `${c.name}: ${c.status}`),
        budgetUsed: budget[0]?.used ?? null,
      },
    };
  } finally {
    await closePool(pool);
  }
};

/** P6-MED-LOAD-009: the terminal transition verdict (terminalTransitionVerdict). Terminal states come from stored records (D41). */
export const cancelRaceStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const main = mainRun(ctx);
  const audit = auditOf(ctx);
  if (!main || !audit)
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["cancel race: no main run or no audit config"],
    };
  const summary = JSON.parse(readFileSync(main.summaryPath, "utf8"));
  const dropped = parseK6Summary(summary).dropped;
  const pool = createReadOnlyPool();
  try {
    const rows = await selectRows<RunOrderRow>(pool, RUN_ORDER_ROWS_SQL, [
      String(audit.prefixLike),
    ]);
    // only the orders a race was injected into have a terminal transition to judge; the others are plain checkouts
    const raced = rows.filter((r) => isRacedEmail(r.email));
    const orders: OrderTerminal[] = raced.map((r) => {
      const cancels = Math.max(r.cancel_changes, r.canceled);
      // the race creates a fulfilment and never ships it, so a live fulfilment is the fulfilment (X05 needs FULFILLED)
      const terminal = [
        ...Array.from({ length: cancels }, () => "CANCELED"),
        ...(r.live_fulfilments > 0 ? ["FULFILLED"] : []),
      ];
      return {
        orderId: r.id,
        terminal,
        openFulfilment: r.canceled === 1 && r.live_fulfilments > 0,
        sideEffects: { refunds: r.refund_rows, reservationsLive: 0 },
      };
    });
    const verdict = terminalTransitionVerdict(
      orders,
      dropped > 0 ? [`${dropped} dropped iteration(s)`] : [],
    );
    return {
      ok: verdict.verdict === "PASS" || verdict.verdict === "PASS (X04/X05 counted)",
      kind:
        verdict.verdict === "FAIL (PRODUCT BUG)"
          ? "PRODUCT BUG"
          : verdict.verdict === "INVALID"
            ? "INVALID"
            : verdict.verdict === "TEST BUG"
              ? "TEST BUG"
              : undefined,
      reasons: verdict.reasons.length > 0 ? verdict.reasons : [`cancel race: ${verdict.verdict}`],
      data: {
        verdict: verdict.verdict,
        orders: raced.length,
        x04Double: verdict.x04Double,
        x05CancelFulfil: verdict.x05CancelFulfil,
      },
    };
  } finally {
    await closePool(pool);
  }
};
