import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { assertSelectOnly } from "../../src/oracles/pg.ts";
import {
  LEAK_CAMPAIGNS_SQL,
  LEAK_PRODUCT_IDS_SQL,
  LEAK_PROMOTIONS_SQL,
  LIVE_ORDERS_FOR_EMAIL_SQL,
  OPEN_FULFILLMENTS_SQL,
  ORDER_LINE_ITEM_SQL,
  ORDER_RESERVATIONS_SQL,
  ORDER_STATE_SQL,
  PHANTOM_RESERVED_SQL,
  PROMO_SNAPSHOT_SQL,
  orderStateLeakCheck,
  promoLeakCheck,
  LEAK_LIVE_ORDER_IDS_SQL,
  MONEY_PAYMENT_FOR_ORDER_SQL,
  MONEY_SNAPSHOT_SQL,
  LEAK_CUSTOMERS_SQL,
  LEAK_LIVE_ORDERS_SQL,
  LEAK_LIVE_RESERVATIONS_SQL,
  LEAK_PRODUCTS_SQL,
  LATEST_SUMMARY_SQL,
  leakCheck,
} from "../../src/medusa/oracle.ts";

/** Fake pool: answers each leak query with the count given for its SQL. */
function fakePool(counts: Map<string, number>, seen: Array<[string, unknown[]]>): pg.Pool {
  return {
    query: async (sql: string, params: unknown[]) => {
      seen.push([sql, params]);
      return { rows: [{ n: counts.get(sql) ?? 0 }] };
    },
  } as unknown as pg.Pool;
}

const pattern = "p6-qa-x-extra-s1-n2-%";

describe("leakCheck", () => {
  it("customer SQL is select-only and soft-delete aware", () => {
    assertSelectOnly(LEAK_CUSTOMERS_SQL);
    assert.match(LEAK_CUSTOMERS_SQL, /FROM customer\s+WHERE email LIKE \$1 AND deleted_at IS NULL/);
  });

  it("clean case has no violations and queries customers with the case pattern", async () => {
    const seen: Array<[string, unknown[]]> = [];
    const v = await leakCheck(fakePool(new Map(), seen), pattern, ["inv_1"]);
    assert.deepEqual(v, []);
    assert.ok(seen.some(([sql, params]) => sql === LEAK_CUSTOMERS_SQL && params[0] === pattern));
  });

  it("leftover customers fail the case as a TEST BUG", async () => {
    const v = await leakCheck(fakePool(new Map([[LEAK_CUSTOMERS_SQL, 2]]), []), pattern, []);
    assert.deepEqual(v, [`TEST BUG: leak customers email LIKE ${pattern}`]);
  });

  it("still flags products, orders and reservations", async () => {
    const counts = new Map([
      [LEAK_PRODUCTS_SQL, 1],
      [LEAK_LIVE_ORDERS_SQL, 1],
      [LEAK_LIVE_RESERVATIONS_SQL, 1],
    ]);
    const v = await leakCheck(fakePool(counts, []), pattern, ["inv_1"]);
    assert.equal(v.length, 3);
    assert.ok(v.some((x) => x.includes("leak products")));
    assert.ok(v.some((x) => x.includes("leak live orders")));
    assert.ok(v.some((x) => x.includes("inv_1")));
  });
});

describe("money oracle SQL", () => {
  it("every money query is a SELECT and reads through the read-only pool", () => {
    for (const sql of [MONEY_PAYMENT_FOR_ORDER_SQL, MONEY_SNAPSHOT_SQL, LEAK_LIVE_ORDER_IDS_SQL]) {
      assert.doesNotThrow(() => assertSelectOnly(sql));
    }
  });

  it("the snapshot sums capture and refund amounts by payment id and counts pending changes by order id", () => {
    assert.match(MONEY_SNAPSHOT_SQL, /FROM capture c WHERE c\.payment_id = \$1/);
    assert.match(MONEY_SNAPSHOT_SQL, /FROM refund r WHERE r\.payment_id = \$1/);
    assert.match(MONEY_SNAPSHOT_SQL, /oc\.order_id = \$2 AND oc\.status = 'pending'/);
    assert.match(MONEY_SNAPSHOT_SQL, /deleted_at IS NULL/);
  });

  it("the payment lookup goes from order to payment collection to payment", () => {
    assert.match(MONEY_PAYMENT_FOR_ORDER_SQL, /JOIN order_payment_collection opc/);
    assert.match(MONEY_PAYMENT_FOR_ORDER_SQL, /opc\.order_id = \$1/);
  });

  it("the live-order id query matches the case prefix and excludes archived and canceled orders", () => {
    assert.match(LEAK_LIVE_ORDER_IDS_SQL, /SELECT id FROM "order"/);
    assert.match(LEAK_LIVE_ORDER_IDS_SQL, /email LIKE \$1/);
    assert.match(LEAK_LIVE_ORDER_IDS_SQL, /status <> 'archived' AND status <> 'canceled'/);
  });
});

/** Fake pool that answers id queries from `rows` and count queries from `counts`. */
function rowsPool(rows: Map<string, Array<{ id: string }>>, counts: Map<string, number>): pg.Pool {
  return {
    query: async (sql: string) => ({ rows: rows.get(sql) ?? [{ n: counts.get(sql) ?? 0 }] }),
  } as unknown as pg.Pool;
}

describe("promotion and order-state oracle", () => {
  it("the promotion and order-state reads are SELECT only", () => {
    for (const sql of [PROMO_SNAPSHOT_SQL, LIVE_ORDERS_FOR_EMAIL_SQL, ORDER_STATE_SQL]) {
      assert.doesNotThrow(() => assertSelectOnly(sql));
    }
  });

  it("the latest order_summary read is SELECT only and orders by version, then created_at, then id", () => {
    assert.doesNotThrow(() => assertSelectOnly(LATEST_SUMMARY_SQL));
    assert.match(LATEST_SUMMARY_SQL, /ORDER BY os\.version DESC, os\.created_at DESC, os\.id DESC/);
  });

  it("the cleanup and leak queries are SELECT only", () => {
    for (const sql of [
      ORDER_LINE_ITEM_SQL,
      ORDER_RESERVATIONS_SQL,
      OPEN_FULFILLMENTS_SQL,
      PHANTOM_RESERVED_SQL,
      LEAK_PROMOTIONS_SQL,
      LEAK_CAMPAIGNS_SQL,
      LEAK_PRODUCT_IDS_SQL,
    ]) {
      assert.doesNotThrow(() => assertSelectOnly(sql));
    }
  });

  it("promoLeakCheck passes a clean case", async () => {
    assert.deepEqual(await promoLeakCheck(fakePool(new Map(), []), pattern), []);
  });

  it("promoLeakCheck names a leaked promotion", async () => {
    const counts = new Map([[LEAK_PROMOTIONS_SQL, 1]]);
    assert.deepEqual(await promoLeakCheck(fakePool(counts, []), pattern), [
      `TEST BUG: leak promotion LIKE ${pattern}`,
    ]);
  });

  it("orderStateLeakCheck reports a reported phantom product as leaked data, not a violation", async () => {
    const rows = new Map([
      [LEAK_PRODUCT_IDS_SQL, [{ id: "prod_1" }]],
      [PHANTOM_RESERVED_SQL, [{ id: "prod_1" }]],
    ]);
    const out = await orderStateLeakCheck(rowsPool(rows, new Map()), pattern, ["prod_1"]);
    assert.deepEqual(out, { violations: [], reportedLeaked: ["prod_1"] });
  });
});
