import type pg from "pg";
import { selectRows, waitForStable } from "../oracles/pg.ts";
import { parseWholeAmount } from "./money.ts";

// order_item keeps one row per version of an order; only the current version (o.version) is the order's items.
export const ORDERS_FOR_VARIANT_SQL = `
SELECT COUNT(DISTINCT o.id)::int AS n
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
WHERE oli.variant_id = $1
  AND o.deleted_at IS NULL
`;

export const ORDER_QTY_FOR_VARIANT_SQL = `
SELECT COALESCE(SUM(oi.quantity), 0)::text AS qty
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
WHERE oli.variant_id = $1
  AND o.deleted_at IS NULL
`;

/** The orders that hold stock: not canceled, not archived (the same filter as LEAK_LIVE_ORDERS_SQL). */
export const LIVE_ORDERS_FOR_VARIANT_SQL = `
SELECT COUNT(DISTINCT o.id)::int AS n
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
WHERE oli.variant_id = $1
  AND o.deleted_at IS NULL
  AND o.status NOT IN ('canceled', 'archived')
`;

export const LIVE_ORDER_QTY_FOR_VARIANT_SQL = `
SELECT COALESCE(SUM(oi.quantity), 0)::text AS qty
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
WHERE oli.variant_id = $1
  AND o.deleted_at IS NULL
  AND o.status NOT IN ('canceled', 'archived')
`;

/** Orders of the variant that are canceled: their reservations must be gone (P6-MED-LOAD-009). */
export const CANCELED_ORDERS_FOR_VARIANT_SQL = `
SELECT COUNT(DISTINCT o.id)::int AS n
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
WHERE oli.variant_id = $1
  AND o.deleted_at IS NULL
  AND o.status = 'canceled'
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
  /** Non-canceled, non-archived orders and their units: what holds stock (reservations and reserved are compared with these). */
  liveOrderCount: number;
  liveOrderQty: number;
  canceledOrderCount: number;
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
  const [orderRows, qtyRows, liveRows, liveQtyRows, canceledRows, resRows, invRows] =
    await Promise.all([
      selectRows<{ n: number }>(pool, ORDERS_FOR_VARIANT_SQL, [variantId]),
      selectRows<{ qty: string }>(pool, ORDER_QTY_FOR_VARIANT_SQL, [variantId]),
      selectRows<{ n: number }>(pool, LIVE_ORDERS_FOR_VARIANT_SQL, [variantId]),
      selectRows<{ qty: string }>(pool, LIVE_ORDER_QTY_FOR_VARIANT_SQL, [variantId]),
      selectRows<{ n: number }>(pool, CANCELED_ORDERS_FOR_VARIANT_SQL, [variantId]),
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
    liveOrderCount: Number(liveRows[0]?.n ?? 0),
    liveOrderQty: Number(liveQtyRows[0]?.qty ?? 0),
    canceledOrderCount: Number(canceledRows[0]?.n ?? 0),
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
/** This run's reservations of an inventory item, through their order line items (cleanup deletes them before the product). */
export const RUN_RESERVATIONS_SQL = `
SELECT ri.id, oi.order_id
FROM reservation_item ri
JOIN order_item oi ON oi.item_id = ri.line_item_id AND oi.deleted_at IS NULL
JOIN "order" o ON o.id = oi.order_id
WHERE ri.inventory_item_id = $1
  AND ri.deleted_at IS NULL
  AND o.email LIKE $2
`;

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

/** $1 promotion id, $2 campaign id ('' for -012). Live (plan §2.2): losers' links are soft deleted, so live links only. */
export const PROMO_SNAPSHOT_SQL = `
SELECT
  (SELECT p.used FROM promotion p WHERE p.id = $1)::int AS promotion_used,
  (SELECT b.used::text FROM promotion_campaign_budget b WHERE b.campaign_id = $2 AND b.deleted_at IS NULL) AS budget_used,
  (SELECT COUNT(*) FROM order_promotion op JOIN "order" o ON o.id = op.order_id
     WHERE op.promotion_id = $1 AND op.deleted_at IS NULL AND o.deleted_at IS NULL)::int AS orders_with_promo
`;

/** Live orders of one attempt by email LIKE, ghosts included (F-M2), with whether each has a payment row. */
export const LIVE_ORDERS_FOR_EMAIL_SQL = `
SELECT o.id, o.status,
  EXISTS (SELECT 1 FROM order_payment_collection opc JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
          WHERE opc.order_id = o.id AND p.deleted_at IS NULL) AS has_payment
FROM "order" o
WHERE o.email LIKE $1 AND o.deleted_at IS NULL AND o.status NOT IN ('archived', 'canceled')
`;

/** $1 order id, $2 inventory item id, $3 location id. Inventory is read by item id, not through order_item (plan D52). */
export const ORDER_STATE_SQL = `
SELECT o.status,
  (SELECT COUNT(*) FROM order_fulfillment ofl JOIN fulfillment f ON f.id = ofl.fulfillment_id
     WHERE ofl.order_id = $1 AND ofl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.canceled_at IS NULL)::int AS open_fulfillments,
  (SELECT COUNT(*) FROM order_change ch WHERE ch.order_id = $1 AND ch.status = 'pending' AND ch.deleted_at IS NULL)::int AS pending_changes,
  (SELECT COUNT(*) FROM order_credit_line cl WHERE cl.order_id = $1 AND cl.deleted_at IS NULL)::int AS credit_lines,
  (SELECT COUNT(*) FROM reservation_item ri WHERE ri.inventory_item_id = $2 AND ri.deleted_at IS NULL)::int AS live_reservations,
  (SELECT COALESCE(SUM(ri.quantity), 0)::text FROM reservation_item ri WHERE ri.inventory_item_id = $2 AND ri.deleted_at IS NULL) AS live_reservation_qty,
  (SELECT il.reserved_quantity::text FROM inventory_level il WHERE il.inventory_item_id = $2 AND il.location_id = $3 AND il.deleted_at IS NULL) AS reserved_quantity,
  (SELECT oi.fulfilled_quantity::text FROM order_item oi WHERE oi.order_id = $1 AND oi.deleted_at IS NULL ORDER BY oi.version DESC LIMIT 1) AS fulfilled_quantity
FROM "order" o WHERE o.id = $1
`;

/** $1 order id. The line item id the fulfil body needs (latest order version). */
export const ORDER_LINE_ITEM_SQL = `
SELECT oi.item_id FROM order_item oi
WHERE oi.order_id = $1 AND oi.deleted_at IS NULL
ORDER BY oi.version DESC LIMIT 1
`;

/** $1 inventory item id. Live reservations the cleanup deletes (live: DELETE /admin/reservations/:id 200). */
export const ORDER_RESERVATIONS_SQL = `
SELECT ri.id FROM reservation_item ri
WHERE ri.inventory_item_id = $1 AND ri.deleted_at IS NULL
`;

/** $1 order id. Open fulfillments the cleanup cancels while the order is not canceled. */
export const OPEN_FULFILLMENTS_SQL = `
SELECT f.id FROM order_fulfillment ofl JOIN fulfillment f ON f.id = ofl.fulfillment_id
WHERE ofl.order_id = $1 AND ofl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.canceled_at IS NULL
`;

/** $1 handle LIKE. Live products whose reserved_quantity exceeds their live reservations (F-M3 residue, plan D49). */
export const PHANTOM_RESERVED_SQL = `
SELECT DISTINCT p.id FROM product p
JOIN product_variant pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
JOIN product_variant_inventory_item pvi ON pvi.variant_id = pv.id
JOIN inventory_level il ON il.inventory_item_id = pvi.inventory_item_id AND il.deleted_at IS NULL
WHERE p.handle LIKE $1 AND p.deleted_at IS NULL
  AND il.reserved_quantity > (SELECT COALESCE(SUM(ri.quantity), 0) FROM reservation_item ri
                              WHERE ri.inventory_item_id = il.inventory_item_id AND ri.deleted_at IS NULL)
`;

/** $1 handle LIKE. Live product ids of a case. */
export const LEAK_PRODUCT_IDS_SQL = `
SELECT id FROM product WHERE handle LIKE $1 AND deleted_at IS NULL
`;

/** Budget rows are not checked: a campaign delete keeps them (plan §2.1 Q7). */
export const LEAK_PROMOTIONS_SQL = `
SELECT COUNT(*)::int AS n FROM promotion WHERE code LIKE $1 AND deleted_at IS NULL
`;

export const LEAK_CAMPAIGNS_SQL = `
SELECT COUNT(*)::int AS n FROM promotion_campaign WHERE campaign_identifier LIKE $1 AND deleted_at IS NULL
`;

export type PromoSnapshot = { promotionUsed: number; budgetUsed: number; ordersWithPromo: number };

export async function readPromoSnapshot(
  pool: pg.Pool,
  promotionId: string,
  campaignId: string,
): Promise<PromoSnapshot> {
  const [row] = await selectRows<{
    promotion_used: number | null;
    budget_used: string | null;
    orders_with_promo: number;
  }>(pool, PROMO_SNAPSHOT_SQL, [promotionId, campaignId]);
  if (!row) throw new Error("TEST BUG: promotion snapshot returned no row");
  return {
    promotionUsed: Number(row.promotion_used ?? 0),
    budgetUsed: row.budget_used === null ? 0 : parseWholeAmount(row.budget_used, "budget used"),
    ordersWithPromo: Number(row.orders_with_promo),
  };
}

export type OrderState = {
  status: string;
  openFulfillments: number;
  pendingChanges: number;
  creditLines: number;
  liveReservations: number;
  liveReservationQty: number;
  reservedQuantity: number;
  fulfilledQuantity: number;
};

export async function readOrderState(
  pool: pg.Pool,
  orderId: string,
  inventoryItemId: string,
  locationId: string,
): Promise<OrderState> {
  const [row] = await selectRows<{
    status: string;
    open_fulfillments: number;
    pending_changes: number;
    credit_lines: number;
    live_reservations: number;
    live_reservation_qty: string;
    reserved_quantity: string | null;
    fulfilled_quantity: string | null;
  }>(pool, ORDER_STATE_SQL, [orderId, inventoryItemId, locationId]);
  if (!row) throw new Error(`TEST BUG: order ${orderId} not found`);
  return {
    status: row.status,
    openFulfillments: Number(row.open_fulfillments),
    pendingChanges: Number(row.pending_changes),
    creditLines: Number(row.credit_lines),
    liveReservations: Number(row.live_reservations),
    liveReservationQty: parseWholeAmount(row.live_reservation_qty, "live reservation qty"),
    reservedQuantity: parseWholeAmount(row.reserved_quantity ?? "0", "reserved quantity"),
    fulfilledQuantity: parseWholeAmount(row.fulfilled_quantity ?? "0", "fulfilled quantity"),
  };
}

/** $1 order id. The latest order_summary refund (plan D3b-3): highest version, then latest created_at, then id. */
export const LATEST_SUMMARY_SQL = `
SELECT os.totals->>'refunded_total' AS refunded_total
FROM order_summary os
WHERE os.order_id = $1 AND os.deleted_at IS NULL
ORDER BY os.version DESC, os.created_at DESC, os.id DESC
LIMIT 1
`;

/** Latest order_summary refunded_total of an order, or null when the order has no summary row. */
export async function readLatestSummaryRefund(
  pool: pg.Pool,
  orderId: string,
): Promise<number | null> {
  const rows = await selectRows<{ refunded_total: string | null }>(pool, LATEST_SUMMARY_SQL, [
    orderId,
  ]);
  const value = rows[0]?.refunded_total;
  return value == null ? null : parseWholeAmount(value, "latest refunded_total");
}

/** Leak check for -005 / -012 (the moneyLeakCheck shape). Every leftover is a TEST BUG. */
export async function promoLeakCheck(pool: pg.Pool, likePrefix: string): Promise<string[]> {
  const [products, customers, orders, promotions, campaigns] = await Promise.all([
    selectRows<{ n: number }>(pool, LEAK_PRODUCTS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CUSTOMERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_LIVE_ORDERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_PROMOTIONS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CAMPAIGNS_SQL, [likePrefix]),
  ]);
  const rows: Array<[string, Array<{ n: number }>]> = [
    ["products", products],
    ["customers", customers],
    ["live orders", orders],
    ["promotion", promotions],
    ["campaign", campaigns],
  ];
  return rows
    .filter(([, r]) => Number(r[0]?.n ?? 0) !== 0)
    .map(([kind]) => `TEST BUG: leak ${kind} LIKE ${likePrefix}`);
}

/**
 * Leak check for -008 / -009. A live product that PHANTOM_RESERVED_SQL lists and the run reported is leaked data,
 * not a failure (plan D49). Any other leftover is a TEST BUG.
 */
export async function orderStateLeakCheck(
  pool: pg.Pool,
  likePrefix: string,
  reportedProductIds: readonly string[],
): Promise<{ violations: string[]; reportedLeaked: string[] }> {
  const [products, phantom, customers, orders] = await Promise.all([
    selectRows<{ id: string }>(pool, LEAK_PRODUCT_IDS_SQL, [likePrefix]),
    selectRows<{ id: string }>(pool, PHANTOM_RESERVED_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_CUSTOMERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_LIVE_ORDERS_SQL, [likePrefix]),
  ]);
  const phantomIds = new Set(phantom.map((row) => row.id));
  const reported = new Set(reportedProductIds);
  const violations: string[] = [];
  const reportedLeaked: string[] = [];
  for (const product of products) {
    if (phantomIds.has(product.id) && reported.has(product.id)) {
      reportedLeaked.push(product.id);
    } else {
      violations.push(`TEST BUG: leak product ${product.id} handle LIKE ${likePrefix}`);
    }
  }
  if (Number(customers[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak customers email LIKE ${likePrefix}`);
  }
  if (Number(orders[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak live orders email LIKE ${likePrefix}`);
  }
  return { violations, reportedLeaked };
}
