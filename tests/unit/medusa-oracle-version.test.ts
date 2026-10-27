import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANCELED_ORDERS_FOR_VARIANT_SQL,
  LIVE_ORDERS_FOR_VARIANT_SQL,
  LIVE_ORDER_QTY_FOR_VARIANT_SQL,
  ORDERS_FOR_VARIANT_SQL,
  ORDER_QTY_FOR_VARIANT_SQL,
} from "../../src/medusa/oracle.ts";

// order_item keeps one row per order version (Medusa 2.21.2 order migrations: the index on order_id and version). Only the rows of
// the order's current version are its items. The live query is checked in CI by the probe; these tests pin the predicates.
describe("medusa variant order queries", () => {
  for (const [name, sql] of [
    ["orders", ORDERS_FOR_VARIANT_SQL],
    ["units", ORDER_QTY_FOR_VARIANT_SQL],
    ["live orders", LIVE_ORDERS_FOR_VARIANT_SQL],
    ["live units", LIVE_ORDER_QTY_FOR_VARIANT_SQL],
    ["canceled orders", CANCELED_ORDERS_FOR_VARIANT_SQL],
  ] as const) {
    it(`${name} counts only the current version of each order's items`, () => {
      assert.match(sql, /oi\.version = o\.version/);
    });
  }

  for (const [name, sql] of [
    ["live orders", LIVE_ORDERS_FOR_VARIANT_SQL],
    ["live units", LIVE_ORDER_QTY_FOR_VARIANT_SQL],
  ] as const) {
    it(`${name} exclude canceled and archived orders`, () => {
      assert.match(sql, /o\.status NOT IN \('canceled', 'archived'\)/);
    });
  }

  it("the all-orders queries keep every status (the payment and stock checks read them)", () => {
    assert.doesNotMatch(ORDERS_FOR_VARIANT_SQL, /status/);
    assert.doesNotMatch(ORDER_QTY_FOR_VARIANT_SQL, /status/);
  });
});
