import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkOversellInvariants } from "../../src/medusa/invariants.ts";

const spreadLimit = 5;

function base(overrides: Partial<Parameters<typeof checkOversellInvariants>[0]>) {
  return {
    mode: "qty1" as const,
    s: 5,
    n: 20,
    orderCount: 5,
    orderQty: 5,
    httpWinnerCount: 5,
    uniqueOrderIds: 5,
    reservationQty: 5,
    stocked: 5,
    reserved: 5,
    available: 0,
    statuses: [...Array.from({ length: 5 }, () => 200), ...Array.from({ length: 15 }, () => 400)],
    loserTypes: Array.from({ length: 15 }, () => "not_allowed"),
    loserMessages: Array.from(
      { length: 15 },
      () => "Not enough stock available for item x at location y",
    ),
    loserQuantities: Array.from({ length: 15 }, () => 1),
    dispatchSpreadMs: 1,
    spreadLimit,
    ...overrides,
  };
}

describe("checkOversellInvariants", () => {
  it("qty1 happy", () => {
    assert.deepEqual(checkOversellInvariants(base({})), []);
  });

  it("qty1 oversell 6 orders", () => {
    const v = checkOversellInvariants(base({ orderCount: 6, uniqueOrderIds: 6 }));
    assert.ok(v.some((x) => x.includes("PRODUCT BUG") && x.includes("oversold")));
  });

  it("qty1 5xx", () => {
    const v = checkOversellInvariants(base({ statuses: [500] }));
    assert.ok(v.some((x) => x.includes("PRODUCT BUG") && x.includes("500")));
  });

  it("qty1 spread too high", () => {
    const v = checkOversellInvariants(base({ dispatchSpreadMs: 9 }));
    assert.ok(v.some((x) => x.includes("TEST BUG") && x.includes("dispatchSpreadMs")));
  });

  it("qty1 shared order ids", () => {
    const v = checkOversellInvariants(
      base({ httpWinnerCount: 5, uniqueOrderIds: 4, orderCount: 4 }),
    );
    assert.ok(v.some((x) => x.includes("shared order ids")));
  });

  it("mixed qty-3 wins", () => {
    const v = checkOversellInvariants(
      base({
        mode: "mixed",
        n: 5,
        orderCount: 3,
        httpWinnerCount: 3,
        uniqueOrderIds: 3,
        orderQty: 5,
        reservationQty: 5,
        loserQuantities: [1, 1],
        loserTypes: ["not_allowed", "not_allowed"],
        loserMessages: ["Not enough stock", "Not enough stock"],
        statuses: [200, 200, 200, 400, 400],
      }),
    );
    assert.deepEqual(v, []);
  });

  it("mixed qty-3 loses", () => {
    const v = checkOversellInvariants(
      base({
        mode: "mixed",
        n: 5,
        orderCount: 4,
        httpWinnerCount: 4,
        uniqueOrderIds: 4,
        orderQty: 4,
        reservationQty: 4,
        reserved: 4,
        available: 1,
        loserQuantities: [3],
        loserTypes: ["not_allowed"],
        loserMessages: ["Not enough stock"],
        statuses: [200, 200, 200, 200, 400],
      }),
    );
    assert.deepEqual(v, []);
  });

  it("mixed loser still fits", () => {
    const v = checkOversellInvariants(
      base({
        mode: "mixed",
        n: 5,
        orderCount: 4,
        orderQty: 4,
        reservationQty: 4,
        reserved: 4,
        available: 1,
        loserQuantities: [1],
        loserTypes: ["not_allowed"],
        loserMessages: ["Not enough stock"],
        statuses: [200, 200, 200, 200, 400],
      }),
    );
    assert.ok(v.some((x) => x.includes("could still fit")));
  });

  it("sameCart many 200s one id", () => {
    const v = checkOversellInvariants(
      base({
        mode: "sameCart",
        n: 10,
        httpWinnerCount: 10,
        uniqueOrderIds: 1,
        orderCount: 1,
        reservationQty: 1,
        reserved: 1,
        available: 4,
        stocked: 5,
        statuses: Array.from({ length: 10 }, () => 200),
        loserTypes: [],
        loserMessages: [],
        loserQuantities: [],
      }),
    );
    assert.deepEqual(v, []);
  });

  it("sameCart ten unique ids", () => {
    const v = checkOversellInvariants(
      base({
        mode: "sameCart",
        n: 10,
        httpWinnerCount: 10,
        uniqueOrderIds: 10,
        orderCount: 10,
        statuses: Array.from({ length: 10 }, () => 200),
        loserTypes: [],
        loserMessages: [],
        loserQuantities: [],
      }),
    );
    assert.ok(v.some((x) => x.includes("PRODUCT BUG")));
  });

  it("s0 zero orders", () => {
    const v = checkOversellInvariants(
      base({
        mode: "s0",
        s: 0,
        n: 5,
        orderCount: 0,
        orderQty: 0,
        httpWinnerCount: 0,
        uniqueOrderIds: 0,
        reservationQty: 0,
        stocked: 0,
        reserved: 0,
        available: 0,
        statuses: Array.from({ length: 5 }, () => 400),
        loserTypes: Array.from({ length: 5 }, () => "invalid_data"),
        loserMessages: Array.from({ length: 5 }, () => "Cannot complete"),
        loserQuantities: Array.from({ length: 5 }, () => 1),
      }),
    );
    assert.deepEqual(v, []);
  });

  it("phantom unique order ids", () => {
    const v = checkOversellInvariants(base({ uniqueOrderIds: 5, orderCount: 4 }));
    assert.ok(v.some((x) => x.includes("unique order ids")));
  });
});
