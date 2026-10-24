import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateMedusaAudit, type MedusaSnapshot } from "../../src/load/reconcile/medusa.ts";

const SCOPE = "p6-qa-20261024t010203z-3fa9c0d1-med-load-001-%";
const clean = (): MedusaSnapshot => ({
  variant: { orderCount: 3, orderQty: 3, reservationQty: 3, stocked: 3, reserved: 3 },
  liveOrdersByEmail: 3,
  payments: [
    { amount: 10, captured: 10, refunded: 0 },
    { amount: 10, captured: 10, refunded: 0 },
    { amount: 10, captured: 10, refunded: 0 },
  ],
  ordersWithoutPayment: 0,
  stock: 3,
  clientOrders: 3,
});

describe("medusa reconciliation", () => {
  it("a clean snapshot passes", () => {
    const r = evaluateMedusaAudit(clean(), SCOPE);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.knownBugs, {});
  });

  it("more orders than stock is oversold (PRODUCT BUG)", () => {
    const s = clean();
    s.variant = { ...s.variant, orderCount: 4, orderQty: 4, reservationQty: 4, reserved: 4 };
    s.payments.push({ amount: 10, captured: 10, refunded: 0 });
    s.liveOrdersByEmail = 4;
    s.clientOrders = 4;
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /oversold, 4 orders for stock 3/.test(v.text)));
  });

  it("reservation rows that differ from the orders are a PRODUCT BUG", () => {
    const s = clean();
    s.variant = { ...s.variant, reservationQty: 2 };
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /reservation rows 2, orders 3/.test(v.text)));
  });

  it("inventory_level.reserved that differs from the reservations is a PRODUCT BUG", () => {
    const s = clean();
    s.variant = { ...s.variant, reserved: 1 };
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /inventory_level.reserved 1/.test(v.text)));
  });

  it("negative available is a PRODUCT BUG", () => {
    const s = clean();
    s.variant = { ...s.variant, stocked: 2 };
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /available is negative \(-1\)/.test(v.text)));
  });

  it("an order in the database that the client did not get back is counted under F-M2, not a violation", () => {
    const s = clean();
    s.clientOrders = 2;
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.equal(r.knownBugs["F-M2"], 1);
    assert.equal(r.violations.filter((v) => v.knownBugId).length, 0);
  });

  it("a captured amount above the authorized amount is a PRODUCT BUG (capture cap)", () => {
    const s = clean();
    s.payments[0] = { amount: 10, captured: 11, refunded: 0 };
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /captured 11/.test(v.text) || /capture/i.test(v.text)));
  });

  it("a refund above the captured amount is a PRODUCT BUG (refund cap)", () => {
    const s = clean();
    s.payments[1] = { amount: 10, captured: 10, refunded: 12 };
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /refunded 12 of 10 captured/.test(v.text)));
  });

  it("an order without a payment is a PRODUCT BUG", () => {
    const s = clean();
    s.ordersWithoutPayment = 1;
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /without one/.test(v.text)));
  });

  it("zero orders is a TEST BUG", () => {
    const s = clean();
    s.variant = { ...s.variant, orderCount: 0 };
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.equal(r.violations[0]!.kind, "TEST BUG");
  });

  it("the stock check runs only when the stock is known", () => {
    const s = clean();
    delete (s as Partial<MedusaSnapshot>).stock;
    const r = evaluateMedusaAudit(s, SCOPE);
    assert.equal(
      r.checks.some((c) => c.name === "orders-le-stock"),
      false,
    );
  });
});
