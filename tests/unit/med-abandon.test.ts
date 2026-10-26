import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAbandoned,
  judgeAbandon,
  medusaAbandonVerdict,
  type AbandonInput,
} from "../../src/load/spike/med-abandon.ts";

const CLEAN: AbandonInput = {
  abandoned: 25,
  orders: 75,
  reservationRowsLive: 75,
  reservedQuantity: 75,
  stock: 200,
  probeStatus: 200,
};

describe("medusa abandoned carts", () => {
  it("abandons every fourth iteration and no other", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 7, 8].map((n) => isAbandoned(n)),
      [false, false, false, true, false, true, false],
    );
  });

  it("reservations equal the orders and the probe succeeds: no finding", () => {
    assert.deepEqual(judgeAbandon(CLEAN), { ok: true, findings: [] });
  });

  it("a reservation for an abandoned cart is a product bug line", () => {
    const r = judgeAbandon({ ...CLEAN, reservationRowsLive: 76 });
    assert.equal(r.ok, false);
    assert.match(r.findings[0] ?? "", /reservation rows 76 differ from orders 75/);
  });

  it("a refused probe with stock left is a product bug line", () => {
    const r = judgeAbandon({ ...CLEAN, probeStatus: 409 });
    assert.equal(r.ok, false);
    assert.match(r.findings[0] ?? "", /abandoned carts block stock/);
    // With no stock left the refusal is expected, not a finding.
    assert.equal(judgeAbandon({ ...CLEAN, stock: 75, probeStatus: 409 }).ok, true);
  });
});

describe("medusa abandoned-cart verdict wiring", () => {
  const snapshot = { orderCount: 75, orderQty: 75, reservationQty: 75, stocked: 200, reserved: 75 };

  it("passes a spike run whose reservations match its orders and whose probe purchase succeeds", () => {
    const v = medusaAbandonVerdict({ abandoned: 25, snapshot, stock: 200, probeStatus: 200 });
    assert.equal(v.verdict, "PASS");
    assert.equal(v.abandoned, 25);
    assert.equal(v.orders, 75);
  });

  it("fails a spike run with a reservation row for an abandoned cart", () => {
    const v = medusaAbandonVerdict({
      abandoned: 25,
      snapshot: { ...snapshot, reservationQty: 76 },
      stock: 200,
      probeStatus: 200,
    });
    assert.equal(v.verdict, "PRODUCT BUG (SUSPECTED)");
    assert.match(v.findings[0] ?? "", /reservation rows 76 differ from orders 75/);
  });
});
