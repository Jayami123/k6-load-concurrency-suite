import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { terminalTransitionVerdict, type OrderTerminal } from "../../src/load/med/cancel-race.ts";

const one: OrderTerminal = {
  orderId: "o1",
  terminal: ["FULFILLED"],
  openFulfilment: false,
  sideEffects: { refunds: 0, reservationsLive: 0 },
};

describe("medusa terminal transition", () => {
  it("passes when every order has one terminal transition", () => {
    const v = terminalTransitionVerdict([one, { ...one, orderId: "o2" }], []);
    assert.equal(v.verdict, "PASS");
    assert.equal(v.singleTerminal, 2);
  });

  it("counts a double cancel with two refunds as X04, and passes with the known count", () => {
    const double: OrderTerminal = {
      orderId: "o3",
      terminal: ["CANCELED", "CANCELED"],
      openFulfilment: false,
      sideEffects: { refunds: 2, reservationsLive: 0 },
    };
    const v = terminalTransitionVerdict([one, double], []);
    assert.equal(v.verdict, "PASS (X04/X05 counted)");
    assert.equal(v.x04Double, 1);
  });

  it("is a product bug for a double terminal state no known bug explains, and INVALID outranks it", () => {
    const unexplained: OrderTerminal = {
      orderId: "o4",
      terminal: ["FULFILLED", "CANCELED"],
      openFulfilment: false,
      sideEffects: { refunds: 0, reservationsLive: 0 },
    };
    assert.equal(terminalTransitionVerdict([one, unexplained], []).verdict, "FAIL (PRODUCT BUG)");
    assert.equal(
      terminalTransitionVerdict([one, unexplained], ["2 dropped iterations"]).verdict,
      "INVALID",
    );
  });
});
