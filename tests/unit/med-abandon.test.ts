import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbandoned, judgeAbandon, type AbandonInput } from "../../src/load/spike/med-abandon.ts";

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
