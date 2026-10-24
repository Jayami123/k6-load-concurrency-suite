import { checkCaptureCap, checkRefundCap } from "../../medusa/invariants.ts";
import type { AuditResult } from "./types.ts";
import { addFinding } from "./types.ts";

export interface MedusaVariantCounts {
  orderCount: number;
  orderQty: number;
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
}

/** Pure. Checks in order: rows, orders-le-stock, reservations, available, one-payment-per-order, balances, no-ghost-orders (F-M2, counted). */
export function evaluateMedusaAudit(s: MedusaSnapshot, prefixLike: string): AuditResult {
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

  const reservationsOk = v.reservationQty === v.orderQty && v.reserved === v.reservationQty;
  check(
    "reservations",
    reservationsOk,
    `rows ${v.reservationQty}, units ${v.orderQty}, reserved ${v.reserved}`,
  );
  if (!reservationsOk) {
    bug(
      `reservation rows ${v.reservationQty}, orders ${v.orderQty}, inventory_level.reserved ${v.reserved}`,
    );
  }

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

  if (s.clientOrders !== undefined) {
    const difference = v.orderCount - s.clientOrders;
    check(
      "no-ghost-orders",
      s.liveOrdersByEmail === v.orderCount && difference === 0,
      `database ${v.orderCount}, client ${s.clientOrders}`,
    );
    if (difference !== 0) {
      addFinding(
        result,
        {
          kind: "PRODUCT BUG",
          text: "orders in the database that the client did not get back",
          knownBugId: "F-M2",
        },
        Math.abs(difference),
      );
    }
  }
  return result;
}
