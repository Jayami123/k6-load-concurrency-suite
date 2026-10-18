import type pg from "pg";
import { selectRows, waitForStable } from "../oracles/pg.ts";

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

export async function leakCheck(
  pool: pg.Pool,
  likePrefix: string,
  inventoryItemId: string,
): Promise<string[]> {
  const violations: string[] = [];
  const [products, orders, reservations] = await Promise.all([
    selectRows<{ n: number }>(pool, LEAK_PRODUCTS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_LIVE_ORDERS_SQL, [likePrefix]),
    selectRows<{ n: number }>(pool, LEAK_LIVE_RESERVATIONS_SQL, [inventoryItemId]),
  ]);
  if (Number(products[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak products handle LIKE ${likePrefix}`);
  }
  if (Number(orders[0]?.n ?? 0) !== 0) {
    violations.push(`TEST BUG: leak live orders email LIKE ${likePrefix}`);
  }
  if (Number(reservations[0]?.n ?? 0) !== 0) {
    violations.push(`PRODUCT BUG: live reservations remain for inventory item ${inventoryItemId}`);
  }
  return violations;
}
