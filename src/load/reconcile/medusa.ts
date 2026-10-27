import type pg from "pg";
import { parseWholeAmount } from "../../medusa/money.ts";
import {
  LEAK_LIVE_ORDER_IDS_SQL,
  MONEY_PAYMENT_FOR_ORDER_SQL,
  readMoneySnapshot,
  readOversellSnapshot,
} from "../../medusa/oracle.ts";
import { selectRows } from "../../oracles/pg.ts";
import { checkCaptureCap, checkRefundCap } from "../../medusa/invariants.ts";
import { judgeLeakClause } from "../med/known-leak.ts";
import { auditByIntent } from "../knee/intents.ts";
import { MED_INTENT_ROWS_SQL, medRowsByIntent } from "../knee/med-intents.ts";
import type { AuditResult, AuditStageConfig, IntentCounters } from "./types.ts";
import { addFinding } from "./types.ts";

export interface MedusaVariantCounts {
  orderCount: number;
  orderQty: number;
  /** Orders and units that hold stock: not canceled, not archived. Reservations and reserved are compared with these. */
  liveOrderCount: number;
  liveOrderQty: number;
  /** Canceled orders: reported as their own count, and they must hold no reservation (P6-MED-LOAD-009, invariant-stages). */
  canceledOrderCount: number;
  /** Reservation quantity held by canceled orders (the known cancel-race leak, P6-OBS-MED-002). */
  canceledHeldQty?: number;
  reservationQty: number;
  stocked: number;
  reserved: number;
}

export interface MedusaPayment {
  amount: number;
  captured: number;
  refunded: number;
}

/** Counts from the database after the run (the reads are added with the Medusa product case, Task 7). */
export interface MedusaSnapshot {
  variant: MedusaVariantCounts;
  liveOrdersByEmail: number;
  payments: MedusaPayment[];
  ordersWithoutPayment: number;
  stock?: number;
  clientOrders?: number;
  /** Knee runs (plan task 1 §6.8): the per-intent audit replaces the client count check when present. */
  intents?: { counters: IntentCounters; rowsByIntent: Map<number, number>; ghostRows: number };
}

/**
 * Pure. Checks in order: rows, orders-le-stock, reservations, available, one-payment-per-order, balances, then the client comparison.
 * The database holding more orders than the client got back is F-M2 (counted, not a failure). The client holding more than the
 * database is a PRODUCT BUG (lost orders), and so is a live-order count that differs from the database.
 */
export function evaluateMedusaAudit(
  s: MedusaSnapshot,
  prefixLike: string,
  knownLeakId?: string,
): AuditResult {
  const v = s.variant;
  const result: AuditResult = {
    schema: 1,
    product: "medusa",
    prefixLike,
    rowsSeen: v.orderCount,
    checks: [],
    violations: [],
    knownBugs: {},
    unexpected: [],
    pending: [],
    leak: [],
  };
  const check = (name: string, ok: boolean, detail: string) =>
    result.checks.push({ name, ok, detail });
  const bug = (text: string) => addFinding(result, { kind: "PRODUCT BUG", text });

  check("rows", v.orderCount >= 1, `${v.orderCount} order(s)`);
  if (v.orderCount < 1)
    addFinding(result, {
      kind: "TEST BUG",
      text: `audit saw no orders (scope LIKE ${prefixLike})`,
    });

  if (s.stock !== undefined) {
    const ok = v.orderCount <= s.stock && v.orderQty <= s.stock;
    check("orders-le-stock", ok, `${v.orderCount} orders, ${v.orderQty} units, stock ${s.stock}`);
    if (!ok) bug(`oversold, ${v.orderCount} orders for stock ${s.stock}`);
  }

  const reservationsOk = v.reservationQty === v.liveOrderQty && v.reserved === v.reservationQty;
  const leakClause = judgeLeakClause({
    label: "reconcile reservations",
    leak: v.canceledHeldQty ?? 0,
    observed: v.reservationQty - v.liveOrderQty,
    onlyLeak: v.reserved === v.reservationQty,
    ...(knownLeakId === undefined ? {} : { knownId: knownLeakId }),
  });
  const detail = `rows ${v.reservationQty}, live units ${v.liveOrderQty}, reserved ${v.reserved}`;
  const message = `reservation rows ${v.reservationQty}, live units ${v.liveOrderQty}, inventory_level.reserved ${v.reserved}`;
  if (leakClause.status === "KNOWN") {
    check("reservations", true, `${leakClause.text}; ${detail}`);
  } else if (leakClause.status === "FAIL" || !reservationsOk) {
    check("reservations", false, detail);
    bug(leakClause.status === "FAIL" ? `${message} (${leakClause.text})` : message);
  } else {
    check("reservations", true, detail);
  }
  check(
    "canceled-orders",
    true,
    `${v.canceledOrderCount} canceled order(s), reported as their own count`,
  );

  const available = v.stocked - v.reserved;
  check("available", available >= 0, `available ${available}`);
  if (available < 0) bug(`available is negative (${available})`);

  const paymentsOk = s.payments.length === v.orderCount && s.ordersWithoutPayment === 0;
  check(
    "one-payment-per-order",
    paymentsOk,
    `${s.payments.length} payments, ${s.ordersWithoutPayment} order(s) without one`,
  );
  if (!paymentsOk)
    bug(
      `${s.payments.length} payments for ${v.orderCount} orders, ${s.ordersWithoutPayment} without one`,
    );

  const money = s.payments.flatMap((p) => [
    ...checkCaptureCap({ authorizedAmount: p.amount, capturedSum: p.captured }),
    ...checkRefundCap({ capturedSum: p.captured, refundedSum: p.refunded }),
  ]);
  check("balances", money.length === 0, `${money.length} balance violation(s)`);
  for (const line of money) addFinding(result, { kind: "PRODUCT BUG", text: line });

  if (s.intents) {
    const { counters, rowsByIntent, ghostRows } = s.intents;
    const audit = auditByIntent({
      started: counters.started,
      log: counters.log,
      rowsByIntent,
      ghostRows,
      interrupted: counters.interrupted,
      failWithRowKnownBugId: "F-M2",
    });
    check(
      "per-intent",
      audit.findings.length === 0,
      `${audit.counts.ok} ok, ${audit.counts.fail} fail, ${audit.counts.indeterminate} indeterminate, ${audit.counts.ghostRows} ghost row(s), ${audit.counts.duplicateRows} duplicate row(s)`,
    );
    for (const f of audit.findings)
      addFinding(result, { kind: f.kind, text: f.text, knownBugId: f.knownBugId });
  } else if (s.clientOrders !== undefined) {
    const difference = v.orderCount - s.clientOrders;
    check(
      "no-ghost-orders",
      s.liveOrdersByEmail === v.liveOrderCount && difference === 0,
      `database ${v.orderCount}, client ${s.clientOrders}`,
    );
    if (difference > 0) {
      addFinding(
        result,
        {
          kind: "PRODUCT BUG",
          text: "orders in the database that the client did not get back",
          knownBugId: "F-M2",
        },
        difference,
      );
    }
    if (s.clientOrders > v.orderCount)
      addFinding(result, {
        kind: "PRODUCT BUG",
        text: `client got ${s.clientOrders} orders, database has ${v.orderCount} (lost orders)`,
      });
  }
  if (s.liveOrdersByEmail !== v.liveOrderCount)
    addFinding(result, {
      kind: "PRODUCT BUG",
      text: `live orders by email ${s.liveOrdersByEmail} differ from database live orders ${v.liveOrderCount}`,
    });
  return result;
}

/** Every order of the case prefix, whatever its status (the payment check looks at all of them). */
export const ORDERS_BY_EMAIL_SQL = `SELECT id FROM "order" WHERE email LIKE $1 AND deleted_at IS NULL`;

/** Reads the variant counts, the live orders, and each order's payments and their captures and refunds. */
export async function readMedusaSnapshot(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "medusa" }>,
  clientOrders?: number,
): Promise<MedusaSnapshot> {
  const variant = await readOversellSnapshot(
    pool,
    cfg.variantId,
    cfg.inventoryItemId,
    cfg.locationId,
  );
  const live = await selectRows<{ id: string }>(pool, LEAK_LIVE_ORDER_IDS_SQL, [cfg.prefixLike]);
  const orders = await selectRows<{ id: string }>(pool, ORDERS_BY_EMAIL_SQL, [cfg.prefixLike]);
  const payments: MedusaPayment[] = [];
  let ordersWithoutPayment = 0;
  for (const order of orders) {
    const rows = await selectRows<{ payment_id: string; amount: string }>(
      pool,
      MONEY_PAYMENT_FOR_ORDER_SQL,
      [order.id],
    );
    if (rows.length === 0) ordersWithoutPayment += 1;
    for (const row of rows) {
      const money = await readMoneySnapshot(pool, row.payment_id, order.id);
      payments.push({
        amount: parseWholeAmount(row.amount, "payment amount"),
        captured: money.capturedSum,
        refunded: money.refundedSum,
      });
    }
  }
  return {
    variant,
    liveOrdersByEmail: live.length,
    payments,
    ordersWithoutPayment,
    stock: cfg.stock,
    clientOrders,
  };
}

/** Reads, then evaluates. Knee runs pass the intent counters: the audit then reconciles per intent (plan task 3 §6.4b). */
export async function reconcileMedusa(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "medusa" }>,
  clientOrders?: number,
  intents?: IntentCounters,
): Promise<AuditResult> {
  const snapshot = await readMedusaSnapshot(pool, cfg, clientOrders);
  if (intents) {
    if (cfg.prefix === undefined)
      throw new Error("TEST BUG: medusa audit config has no prefix for the per-intent audit");
    const rows = await selectRows<{ id: string; email: string }>(pool, MED_INTENT_ROWS_SQL, [
      cfg.prefixLike,
    ]);
    snapshot.intents = { counters: intents, ...medRowsByIntent(rows, cfg.prefix) };
  }
  return evaluateMedusaAudit(snapshot, cfg.prefixLike, cfg.knownLeakId);
}
