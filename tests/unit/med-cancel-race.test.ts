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

  it("counts a cancel that raced an open fulfilment as X05, and an X04 needs two cancel entries", () => {
    const x05: OrderTerminal = {
      orderId: "o5",
      terminal: ["FULFILLED", "CANCELED"],
      openFulfilment: true,
      sideEffects: { refunds: 1, reservationsLive: 1 },
    };
    const v = terminalTransitionVerdict([one, x05], []);
    assert.equal(v.verdict, "PASS (X04/X05 counted)");
    assert.equal(v.x05CancelFulfil, 1);
    assert.equal(v.f3Restore, 1);
    const oneCancelTwoRefunds: OrderTerminal = {
      orderId: "o6",
      terminal: ["FULFILLED", "CANCELED"],
      openFulfilment: false,
      sideEffects: { refunds: 2, reservationsLive: 0 },
    };
    assert.equal(
      terminalTransitionVerdict([one, oneCancelTwoRefunds], []).verdict,
      "FAIL (PRODUCT BUG)",
    );
  });

  it("does not count two cancels as X05: X05 needs one cancel and one fulfilment", () => {
    const twoCancels: OrderTerminal = {
      orderId: "o8",
      terminal: ["CANCELED", "CANCELED"],
      openFulfilment: true,
      sideEffects: { refunds: 1, reservationsLive: 0 },
    };
    assert.equal(terminalTransitionVerdict([one, twoCancels], []).verdict, "FAIL (PRODUCT BUG)");
  });

  it("does not count three cancels as X04: X04 is exactly two cancel entries", () => {
    const threeCancels: OrderTerminal = {
      orderId: "o9",
      terminal: ["CANCELED", "CANCELED", "CANCELED"],
      openFulfilment: false,
      sideEffects: { refunds: 2, reservationsLive: 0 },
    };
    assert.equal(terminalTransitionVerdict([one, threeCancels], []).verdict, "FAIL (PRODUCT BUG)");
  });

  it("is a test bug for an empty order list, and a product bug for an order with no terminal transition", () => {
    assert.equal(terminalTransitionVerdict([], []).verdict, "TEST BUG");
    const none: OrderTerminal = {
      orderId: "o7",
      terminal: [],
      openFulfilment: false,
      sideEffects: { refunds: 0, reservationsLive: 0 },
    };
    assert.equal(terminalTransitionVerdict([none], []).verdict, "FAIL (PRODUCT BUG)");
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
