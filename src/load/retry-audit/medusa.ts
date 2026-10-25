import type pg from "pg";
import { MONEY_PAYMENT_FOR_ORDER_SQL, readOversellSnapshot } from "../../medusa/oracle.ts";
import type { OversellOracleSnapshot } from "../../medusa/oracle.ts";
import { selectRows } from "../../oracles/pg.ts";
import { ORDERS_BY_EMAIL_SQL } from "../reconcile/medusa.ts";
import { judgeStorm } from "../retry-validity.ts";
import type { RetryCounters, RetryFinding, RetryJudgement } from "../retry-validity.ts";

/** Orders per intent (the intent is the cart email, which carries the iteration id). Read-only. */
export const MED_ORDERS_PER_INTENT_SQL = `SELECT o.email AS intent, count(*)::int AS n FROM "order" o WHERE o.email LIKE $1 AND o.deleted_at IS NULL GROUP BY o.email`;

export interface MedusaRetryInput {
  intents: number;
  ordersPerIntent: Record<string, number>;
  paymentsPerOrder: number[];
  snapshot: OversellOracleSnapshot;
  counters: RetryCounters;
}

const MEDUSA_KNOWN_GHOST = "F-M2";

/**
 * Pure. Storm first, then one order per intent, one payment per order, reserved == orders == reservations (one unit per order),
 * no 5xx, one order id per intent. An order the client never got back is a ghost: counted under F-M2, not a failure.
 */
export function judgeMedusaRetries(i: MedusaRetryInput): RetryJudgement {
  const findings: RetryFinding[] = [];
  const knownBugs: Record<string, number> = {};
  const c = i.counters;
  const s = i.snapshot;

  const storm = judgeStorm({
    intents: c.intents,
    firstTimeouts: c.firstTimeouts,
    retries: c.attempts - c.intents,
  });
  findings.push({ check: "storm", ok: storm.ok, kind: storm.kind, detail: storm.detail });

  const counts = Object.values(i.ordersPerIntent);
  const duplicates = counts.filter((n) => n > 1).length;
  findings.push({
    check: "one-order-per-intent",
    ok: duplicates === 0,
    kind: duplicates > 0 ? "PRODUCT BUG" : undefined,
    detail: `${duplicates} intent(s) with more than one order`,
  });

  // Every answer the client got back as an order must be in the database (the ghost check below allows the reverse).
  const acked = c.intentsOk <= counts.length;
  findings.push({
    check: "client-orders-in-db",
    ok: acked,
    kind: acked ? undefined : "PRODUCT BUG",
    detail: `client acknowledged ${c.intentsOk} order(s), database holds ${counts.length} order-bearing intent(s)`,
  });

  const dbOrders = counts.reduce((sum, n) => sum + n, 0);
  const ghosts = Math.max(0, dbOrders - c.intentsOk);
  if (ghosts > 0) knownBugs[MEDUSA_KNOWN_GHOST] = ghosts;
  findings.push({
    check: "ghost-orders",
    ok: true,
    detail: `${ghosts} order(s) the client did not get back, counted under ${MEDUSA_KNOWN_GHOST}`,
  });

  const badPayments = i.paymentsPerOrder.filter((n) => n !== 1).length;
  findings.push({
    check: "one-payment-per-order",
    ok: badPayments === 0,
    kind: badPayments > 0 ? "PRODUCT BUG" : undefined,
    detail: `${badPayments} order(s) without exactly one payment`,
  });

  const stockOk = s.reserved === s.orderCount && s.reservationQty === s.orderCount;
  findings.push({
    check: "reserved-equals-orders",
    ok: stockOk,
    kind: stockOk ? undefined : "PRODUCT BUG",
    detail: `orders ${s.orderCount}, reservations ${s.reservationQty}, reserved ${s.reserved}`,
  });

  findings.push({
    check: "no-5xx",
    ok: c.retry5xx === 0,
    kind: c.retry5xx > 0 ? "PRODUCT BUG" : undefined,
    detail: `${c.retry5xx} attempt(s) answered 5xx`,
  });

  findings.push({
    check: "order-id-match",
    ok: c.orderMismatch === 0,
    kind: c.orderMismatch > 0 ? "PRODUCT BUG" : undefined,
    detail: `${c.orderMismatch} retry answer(s) with a different order id`,
  });

  return { findings, knownBugs };
}

/** Reads the orders per intent, the payments per order and the variant's stock counts. Read-only. */
export async function readMedusaRetryAudit(
  pool: pg.Pool,
  cfg: { prefixLike: string; variantId: string; inventoryItemId: string; locationId: string },
): Promise<Pick<MedusaRetryInput, "ordersPerIntent" | "paymentsPerOrder" | "snapshot">> {
  const rows = await selectRows<{ intent: string; n: number }>(pool, MED_ORDERS_PER_INTENT_SQL, [
    cfg.prefixLike,
  ]);
  const ordersPerIntent: Record<string, number> = {};
  for (const r of rows) ordersPerIntent[r.intent] = r.n;
  const orders = await selectRows<{ id: string }>(pool, ORDERS_BY_EMAIL_SQL, [cfg.prefixLike]);
  const paymentsPerOrder: number[] = [];
  for (const order of orders) {
    const payments = await selectRows<{ payment_id: string }>(pool, MONEY_PAYMENT_FOR_ORDER_SQL, [
      order.id,
    ]);
    paymentsPerOrder.push(payments.length);
  }
  const snapshot = await readOversellSnapshot(
    pool,
    cfg.variantId,
    cfg.inventoryItemId,
    cfg.locationId,
  );
  return { ordersPerIntent, paymentsPerOrder, snapshot };
}
