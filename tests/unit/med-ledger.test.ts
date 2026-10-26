import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promoLedgerVerdict } from "../../src/load/med/ledger.ts";

const clean = {
  redemptions: 5,
  promoLimit: 10,
  balances: [100, 40],
  debitsSum: 60,
  balanceChange: -60,
};

describe("medusa promo ledger", () => {
  it("passes the landed clauses and keeps the gift-card clause pending", () => {
    const v = promoLedgerVerdict(clean);
    assert.equal(v.verdict, "PASS (gift-card pending)");
    assert.equal(v.clauses.find((c) => c.name === "gift-card")?.status, "PENDING");
  });

  it("is a product bug when redemptions exceed the budget", () => {
    assert.equal(promoLedgerVerdict({ ...clean, redemptions: 11 }).verdict, "FAIL (PRODUCT BUG)");
  });

  it("is a product bug when a balance goes negative, or the debits differ from the change", () => {
    assert.equal(
      promoLedgerVerdict({ ...clean, balances: [-1, 40] }).verdict,
      "FAIL (PRODUCT BUG)",
    );
    assert.equal(promoLedgerVerdict({ ...clean, debitsSum: 50 }).verdict, "FAIL (PRODUCT BUG)");
  });
});
