import type pg from "pg";
import { selectRows, waitForStable } from "../oracles/pg.ts";
import { parseWholeAmount } from "./money.ts";

export const ORDERS_FOR_VARIANT_SQL = `
SELECT COUNT(DISTINCT o.id)::int AS n
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
WHERE oli.variant_id = $1
  AND o.deleted_at IS NULL
`;

export const ORDER_QTY_FOR_VARIANT_SQL = `
SELECT COALESCE(SUM(oi.quantity), 0)::text AS qty
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
WHERE oli.variant_id = $1
  AND o.deleted_at IS NULL
`;

export const RESERVATION_QTY_SQL = `
SELECT COALESCE(SUM(quantity), 0)::text AS qty, COUNT(*)::int AS n
FROM reservation_item
WHERE inventory_item_id = $1
  AND deleted_at IS NULL
`;

export const INVENTORY_LEVEL_SQL = `
SELECT stocked_quantity::text AS stocked, reserved_quantity::text AS reserved
FROM inventory_level
WHERE inventory_item_id = $1
  AND location_id = $2
  AND deleted_at IS NULL
`;

export const LEAK_PRODUCTS_SQL = `
SELECT COUNT(*)::int AS n FROM product
WHERE handle LIKE $1 AND deleted_at IS NULL
`;

export const LEAK_LIVE_ORDERS_SQL = `
SELECT COUNT(*)::int AS n FROM "order"
WHERE email LIKE $1 AND deleted_at IS NULL AND status <> 'archived' AND status <> 'canceled'
`;

/** Medusa 2.21.2 customer module: table "customer", soft delete via deleted_at. */
export const LEAK_CUSTOMERS_SQL = `
SELECT COUNT(*)::int AS n FROM customer
WHERE email LIKE $1 AND deleted_at IS NULL
`;

export const LEAK_LIVE_RESERVATIONS_SQL = `
SELECT COUNT(*)::int AS n FROM reservation_item
WHERE inventory_item_id = $1 AND deleted_at IS NULL
`;

export type OversellOracleSnapshot = {
  orderCount: number;
  orderQty: number;
  reservationQty: number;
  stocked: number;
  reserved: number;
};

export async function readOversellSnapshot(
  pool: pg.Pool,
  variantId: string,
  inventoryItemId: string,
  locationId: string,
): Promise<OversellOracleSnapshot> {
  const [orderRows, qtyRows, resRows, invRows] = await Promise.all([
    selectRows<{ n: number }>(pool, ORDERS_FOR_VARIANT_SQL, [variantId]),
    selectRows<{ qty: string }>(pool, ORDER_QTY_FOR_VARIANT_SQL, [variantId]),
    selectRows<{ qty: string }>(pool, RESERVATION_QTY_SQL, [inventoryItemId]),
    selectRows<{ stocked: string; reserved: string }>(pool, INVENTORY_LEVEL_SQL, [
      inventoryItemId,
      locationId,
    ]),
  ]);
  const stocked = Number(invRows[0]?.stocked ?? 0);
  const reserved = Number(invRows[0]?.reserved ?? 0);
  return {
    orderCount: Number(orderRows[0]?.n ?? 0),
    orderQty: Number(qtyRows[0]?.qty ?? 0),
    reservationQty: Number(resRows[0]?.qty ?? 0),
    stocked,
    reserved,
  };
}

export async function waitForOversellStable(
  pool: pg.Pool,
  variantId: string,
  inventoryItemId: string,
  locationId: string,
): Promise<OversellOracleSnapshot> {
  return waitForStable(() => readOversellSnapshot(pool, variantId, inventoryItemId, locationId));
}

/** Products and orders are checked once per case even if no inventory item was ever created. */
export async function leakCheck(
  pool: pg.Pool,
  likePrefix: string,
  inventoryItemIds: string[],
): Promise<string[]> {
  const violations: string[] = [];
  const [products, orders, customers, ...reservations] = await Promise.all([
    selectRows<{ n: number }>(pool, LEAK_PRODUCTS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_LIVE_ORDERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CUSTOMERS_SQL, [likePrefix]),
    ...inventoryItemIds.map((id) =>
      selectRows<{ n: number }>(pool, LEAK_LIVE_RESERVATIONS_SQL, [id]),
    ),
  ]);
  if (Number(products?.[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak products handle LIKE ${likePrefix}`);
  }
  if (Number(orders?.[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak live orders email LIKE ${likePrefix}`);
  }
  if (Number(customers?.[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak customers email LIKE ${likePrefix}`);
  }
  reservations.forEach((rows, i) => {
    if (Number(rows[0]?.n ?? 0) !== 0) {
      violations.push(
        `PRODUCT BUG: live reservations remain for inventory item ${inventoryItemIds[i]}`,
      );
    }
  });
  return violations;
}

/** Payment of an order (live, §2.5 P4): the order's payment collection holds one payment in the money cases. */
export const MONEY_PAYMENT_FOR_ORDER_SQL = `
SELECT p.id AS payment_id, p.amount::text AS amount
FROM payment p
JOIN payment_collection pc ON pc.id = p.payment_collection_id
JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
WHERE opc.order_id = $1 AND p.deleted_at IS NULL
`;

/** Money of one payment ($1) and the pending order changes of its order ($2). Live: capture and refund have amount numeric. */
export const MONEY_SNAPSHOT_SQL = `
SELECT
  (SELECT COALESCE(SUM(c.amount), 0)::text FROM capture c WHERE c.payment_id = $1 AND c.deleted_at IS NULL) AS captured_sum,
  (SELECT COUNT(*)::text FROM capture c WHERE c.payment_id = $1 AND c.deleted_at IS NULL) AS capture_rows,
  (SELECT COALESCE(SUM(r.amount), 0)::text FROM refund r WHERE r.payment_id = $1 AND r.deleted_at IS NULL) AS refunded_sum,
  (SELECT COUNT(*)::text FROM refund r WHERE r.payment_id = $1 AND r.deleted_at IS NULL) AS refund_rows,
  (SELECT COUNT(*)::text FROM order_change oc WHERE oc.order_id = $2 AND oc.status = 'pending' AND oc.deleted_at IS NULL) AS pending_changes
`;

/** Live orders of a case prefix, by id, so a reported stuck order can be told apart from a new leak (D41). */
export const LEAK_LIVE_ORDER_IDS_SQL = `
SELECT id FROM "order"
WHERE email LIKE $1 AND deleted_at IS NULL AND status <> 'archived' AND status <> 'canceled'
`;

export type MoneySnapshot = {
  capturedSum: number;
  captureRows: number;
  refundedSum: number;
  refundRows: number;
  pendingChanges: number;
};

export async function readMoneySnapshot(
  pool: pg.Pool,
  paymentId: string,
  orderId: string,
): Promise<MoneySnapshot> {
  const [row] = await selectRows<{
    captured_sum: string;
    capture_rows: string;
    refunded_sum: string;
    refund_rows: string;
    pending_changes: string;
  }>(pool, MONEY_SNAPSHOT_SQL, [paymentId, orderId]);
  if (!row) throw new Error("TEST BUG: money snapshot returned no row");
  return {
    capturedSum: parseWholeAmount(row.captured_sum, "captured sum"),
    captureRows: Number(row.capture_rows),
    refundedSum: parseWholeAmount(row.refunded_sum, "refunded sum"),
    refundRows: Number(row.refund_rows),
    pendingChanges: Number(row.pending_changes),
  };
}

/**
 * Leak check for the money cases. A live order of this case that is in `reportedLeakedOrderIds` is reported
 * as leaked data, not a failure (D41). Any other live order, product or customer is a TEST BUG.
 */
export async function moneyLeakCheck(
  pool: pg.Pool,
  likePrefix: string,
  reportedLeakedOrderIds: string[],
): Promise<{ violations: string[]; reportedLeaked: string[] }> {
  const violations: string[] = [];
  const [products, customers, orders] = await Promise.all([
    selectRows<{ n: number }>(pool, LEAK_PRODUCTS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CUSTOMERS_SQL, [likePrefix]),
    selectRows<{ id: string }>(pool, LEAK_LIVE_ORDER_IDS_SQL, [likePrefix]),
  ]);
  if (Number(products[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak products handle LIKE ${likePrefix}`);
  }
  if (Number(customers[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak customers email LIKE ${likePrefix}`);
  }
  const reported = new Set(reportedLeakedOrderIds);
  const reportedLeaked: string[] = [];
  for (const order of orders) {
    if (reported.has(order.id)) {
      reportedLeaked.push(order.id);
    } else {
      violations.push(`TEST BUG: leak live order ${order.id} email LIKE ${likePrefix}`);
    }
  }
  return { violations, reportedLeaked };
}
