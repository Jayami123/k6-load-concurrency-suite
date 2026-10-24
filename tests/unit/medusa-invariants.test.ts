import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkCancelFulfilExclusive,
  checkGhostOrders,
  checkOrphanOrders,
  checkPromoCap,
  checkReservationDrift,
  checkSingleCancel,
  classifyFindings,
  checkCaptureCap,
  checkLoserStatuses,
  checkOversellInvariants,
  checkRefundCap,
  checkSummaryRefund,
  checkSuccessCount,
  checkMemoryLockCharacterization,
  checkTwoInstanceTraffic,
  classifyTwoInstanceLoser,
} from "../../src/medusa/invariants.ts";

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

  it("qty1 right order count but wrong status split", () => {
    const v = checkOversellInvariants(
      base({
        statuses: [
          ...Array.from({ length: 5 }, () => 200),
          ...Array.from({ length: 14 }, () => 400),
          409,
        ],
      }),
    );
    assert.ok(v.some((x) => x.includes("expected 200x5 400x15")));
    assert.ok(v.some((x) => x.includes("other than 200 or 400")));
  });

  it("missing responses are a TEST BUG", () => {
    const v = checkOversellInvariants(base({ statuses: Array.from({ length: 5 }, () => 200) }));
    assert.ok(v.some((x) => x.includes("TEST BUG") && x.includes("expected N 20")));
  });

  it("HTTP 200 that is not type=order", () => {
    const v = checkOversellInvariants(base({ httpWinnerCount: 4, uniqueOrderIds: 4 }));
    assert.ok(v.some((x) => x.includes("returned type=order")));
  });

  it("stocked_quantity not equal to S", () => {
    const v = checkOversellInvariants(base({ stocked: 6, available: 1 }));
    assert.ok(v.some((x) => x.includes("TEST BUG") && x.includes("stocked_quantity 6")));
  });

  it("inventory reserved drifts from reservation rows", () => {
    const v = checkOversellInvariants(
      base({ mode: "mixed", n: 5, reserved: 4, available: 1, reservationQty: 5 }),
    );
    assert.ok(v.some((x) => x.includes("PRODUCT BUG") && x.includes("reservation_item sum")));
  });
});

describe("money invariants", () => {
  it("checkRefundCap: refunds equal to the capture pass, one unit more is a PRODUCT BUG", () => {
    assert.deepEqual(checkRefundCap({ capturedSum: 1010, refundedSum: 1010 }), []);
    assert.deepEqual(checkRefundCap({ capturedSum: 1010, refundedSum: 505 }), []);
    assert.deepEqual(checkRefundCap({ capturedSum: 1010, refundedSum: 1011 }), [
      "PRODUCT BUG: refunded 1011 of 1010 captured",
    ]);
  });

  it("checkCaptureCap: captures equal to the authorised amount pass, more is a PRODUCT BUG", () => {
    assert.deepEqual(checkCaptureCap({ authorizedAmount: 1010, capturedSum: 1010 }), []);
    assert.deepEqual(checkCaptureCap({ authorizedAmount: 1010, capturedSum: 2020 }), [
      "PRODUCT BUG: captured 2020 of 1010 authorised",
    ]);
  });

  it("checkSuccessCount: agreement is null, a difference is a suspected bug in both directions", () => {
    assert.equal(checkSuccessCount({ successes: 2, expected: 2, label: "x" }), null);
    assert.equal(
      checkSuccessCount({ successes: 1, expected: 2, label: "refund X/2" }),
      "SUSPECTED PRODUCT BUG: refund X/2: 1 HTTP success(es), expected 2 (F-M1, D40)",
    );
    assert.match(checkSuccessCount({ successes: 3, expected: 2, label: "x" }) ?? "", /SUSPECTED/);
  });

  it("checkLoserStatuses: clean 4xx losers pass; a 5xx, a missing status or a 3xx is a violation", () => {
    assert.deepEqual(checkLoserStatuses([400, 400, 409]), []);
    assert.deepEqual(checkLoserStatuses([400, 500]), [
      "PRODUCT BUG: 5xx on a racing money request: 500",
    ]);
    assert.deepEqual(checkLoserStatuses([null]), [
      "TEST BUG: a racing money request threw before it got a status",
    ]);
    assert.deepEqual(checkLoserStatuses([302]), [
      "PRODUCT BUG: unexpected status on a racing money request: 302",
    ]);
  });
});

describe("budget and order-state invariants", () => {
  const cap = {
    cap: 3,
    counterUsed: 3,
    ordersWithPromo: 3,
    httpSuccesses: 3,
    label: "P6-MED-RACE-005",
  };

  it("checkPromoCap passes at the cap", () => {
    assert.deepEqual(checkPromoCap(cap), []);
  });

  it("checkPromoCap flags a counter above the cap as a PRODUCT BUG", () => {
    const out = checkPromoCap({ ...cap, counterUsed: 4 });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^PRODUCT BUG: P6-MED-RACE-005: usage counter 4 of cap 3$/);
  });

  it("checkPromoCap flags more orders than the cap as suspected F-M2", () => {
    const out = checkPromoCap({ ...cap, ordersWithPromo: 4 });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^SUSPECTED PRODUCT BUG: .*\(F-M2\)$/);
  });

  it("checkGhostOrders passes when every live order came back from a checkout", () => {
    assert.deepEqual(
      checkGhostOrders({ liveOrderIds: ["o1", "o2"], httpOrderIds: ["o2", "o1"] }),
      [],
    );
  });

  it("checkGhostOrders names a live order no checkout returned", () => {
    const out = checkGhostOrders({ liveOrderIds: ["o1", "o9"], httpOrderIds: ["o1"] });
    assert.deepEqual(out, [
      "SUSPECTED PRODUCT BUG: order o9 exists but no checkout returned it (F-M2)",
    ]);
  });

  it("checkSingleCancel passes one cancel, no pending change, one credit line", () => {
    assert.deepEqual(
      checkSingleCancel({
        status: "canceled",
        httpSuccesses: 1,
        pendingChanges: 0,
        creditLines: 1,
      }),
      [],
    );
  });

  it("checkSingleCancel flags two successful cancels as X04", () => {
    const out = checkSingleCancel({
      status: "canceled",
      httpSuccesses: 2,
      pendingChanges: 1,
      creditLines: 2,
    });
    assert.ok(out.length >= 1);
    assert.ok(out.every((l) => l.startsWith("SUSPECTED PRODUCT BUG:") && l.endsWith("(X04)")));
    assert.ok(out.some((l) => l.includes("2 cancels returned 200")));
  });

  it("checkSingleCancel names a status that is not canceled", () => {
    const out = checkSingleCancel({
      status: "pending",
      httpSuccesses: 1,
      pendingChanges: 0,
      creditLines: 1,
    });
    assert.deepEqual(out, [
      "SUSPECTED PRODUCT BUG: order status pending after two cancels, expected canceled (X04)",
    ]);
  });

  const exclusive = {
    status: "canceled",
    openFulfillments: 0,
    fulfilledQuantity: 0,
    cancelStatus: 200,
    fulfilStatus: 400,
  };

  it("checkCancelFulfilExclusive passes when the cancel wins cleanly", () => {
    assert.deepEqual(checkCancelFulfilExclusive(exclusive), []);
  });

  it("checkCancelFulfilExclusive passes when the fulfil wins cleanly", () => {
    assert.deepEqual(
      checkCancelFulfilExclusive({
        status: "pending",
        openFulfillments: 1,
        fulfilledQuantity: 1,
        cancelStatus: 400,
        fulfilStatus: 200,
      }),
      [],
    );
  });

  it("checkCancelFulfilExclusive flags canceled with an open fulfillment as X05", () => {
    const out = checkCancelFulfilExclusive({ ...exclusive, openFulfillments: 1 });
    assert.ok(
      out.some(
        (l) => l === "SUSPECTED PRODUCT BUG: order canceled with 1 open fulfillment(s) (X05)",
      ),
    );
  });

  it("checkCancelFulfilExclusive flags two winners", () => {
    const out = checkCancelFulfilExclusive({
      ...exclusive,
      fulfilStatus: 200,
      openFulfillments: 1,
      fulfilledQuantity: 1,
    });
    assert.ok(out.some((l) => l.includes("2 of cancel ‖ fulfil returned 200")));
  });

  it("checkReservationDrift passes consistent stock", () => {
    assert.deepEqual(
      checkReservationDrift({
        status: "canceled",
        liveReservations: 0,
        liveReservationQty: 0,
        reservedQuantity: 0,
      }),
      [],
    );
  });

  it("checkReservationDrift flags reserved_quantity without reservations as F-M3", () => {
    const out = checkReservationDrift({
      status: "canceled",
      liveReservations: 0,
      liveReservationQty: 0,
      reservedQuantity: 6,
    });
    assert.deepEqual(out, [
      "SUSPECTED PRODUCT BUG: reserved_quantity 6 but live reservations sum 0 (F-M3)",
    ]);
  });

  it("classifyFindings keeps suspected lines apart from violations when nothing is labelled", () => {
    const out = classifyFindings(
      ["SUSPECTED PRODUCT BUG: 2 cancels returned 200, expected 1 (X04)", "PRODUCT BUG: 5xx"],
      [],
    );
    assert.deepEqual(out, {
      violations: ["PRODUCT BUG: 5xx"],
      suspected: ["SUSPECTED PRODUCT BUG: 2 cancels returned 200, expected 1 (X04)"],
    });
  });

  it("classifyFindings promotes a labelled tag and leaves the others suspected", () => {
    const out = classifyFindings(
      [
        "SUSPECTED PRODUCT BUG: 2 cancels returned 200, expected 1 (X04)",
        "SUSPECTED PRODUCT BUG: order canceled with 1 open fulfillment(s) (X05)",
      ],
      ["X04"],
    );
    assert.deepEqual(out, {
      violations: ["PRODUCT BUG: 2 cancels returned 200, expected 1 (X04)"],
      suspected: ["SUSPECTED PRODUCT BUG: order canceled with 1 open fulfillment(s) (X05)"],
    });
  });
});

describe("checkSummaryRefund (F-M4)", () => {
  it("equal refunded totals give no line", () => {
    assert.deepEqual(checkSummaryRefund({ latestRefunded: 1010, refundRowsSum: 1010 }), []);
  });

  it("a latest refunded_total above the refund rows is a SUSPECTED F-M4 line", () => {
    const lines = checkSummaryRefund({ latestRefunded: 2020, refundRowsSum: 1010 });
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /^SUSPECTED PRODUCT BUG: .*\(F-M4\)$/);
  });

  it("no order_summary row is a TEST BUG", () => {
    assert.deepEqual(checkSummaryRefund({ latestRefunded: null, refundRowsSum: 1010 }), [
      "TEST BUG: order has no order_summary row",
    ]);
  });
});

describe("checkOrphanOrders (F-M5)", () => {
  it("no line when every live order was returned", () => {
    assert.deepEqual(
      checkOrphanOrders({ liveOrderIds: ["o1"], returnedOrderIds: ["o1", "o2"], attempt: "t0a1" }),
      [],
    );
  });

  it("an unreturned live order is one SUSPECTED line with its id and attempt", () => {
    const lines = checkOrphanOrders({
      liveOrderIds: ["o1", "o9"],
      returnedOrderIds: ["o1"],
      attempt: "t0a1",
    });
    assert.deepEqual(lines, ["SUSPECTED: orphan order (F-M5): order o9 in attempt t0a1"]);
  });

  it("the line is never a violation: it does not start with PRODUCT BUG or TEST BUG", () => {
    const [line] = checkOrphanOrders({
      liveOrderIds: ["o9"],
      returnedOrderIds: [],
      attempt: "t0a1",
    });
    assert.equal(line!.startsWith("PRODUCT BUG") || line!.startsWith("TEST BUG"), false);
    assert.equal(line!.startsWith("SUSPECTED"), true);
  });
});

describe("two-instance invariants", () => {
  const memoryInput = (
    overrides: Partial<Parameters<typeof checkMemoryLockCharacterization>[0]>,
  ) => ({
    s: 3,
    instances: 2,
    orderCount: 3,
    uniqueOrderIds: 3,
    httpWinnerCount: 3,
    reservationQty: 3,
    reserved: 3,
    statuses: [200, 200, 200],
    loserTypes: [] as string[],
    loserMessages: [] as string[],
    ...overrides,
  });

  it("checkTwoInstanceTraffic accepts equal counts", () => {
    assert.deepEqual(checkTwoInstanceTraffic({ clientCounts: [8, 7], serverCounts: [8, 7] }), []);
  });

  it("checkTwoInstanceTraffic flags a count mismatch", () => {
    const out = checkTwoInstanceTraffic({ clientCounts: [8, 7], serverCounts: [8, 6] });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /TEST BUG: instance 1 logged 6 cart completions, the client sent 7/);
  });

  it("checkTwoInstanceTraffic flags an instance with zero requests", () => {
    const out = checkTwoInstanceTraffic({ clientCounts: [8, 0], serverCounts: [8, 0] });
    assert.ok(out.some((line) => /instance 1 was sent no request/.test(line)));
  });

  it("classifyTwoInstanceLoser returns clean for a stock refusal", () => {
    assert.equal(
      classifyTwoInstanceLoser("Not enough stock available for variant", "not_allowed"),
      "clean",
    );
  });

  it("classifyTwoInstanceLoser returns f-m2-signature for the temp_failure message", () => {
    assert.equal(
      classifyTwoInstanceLoser('{"type":"temp_failure","message":"retry"}', "unexpected_state"),
      "f-m2-signature",
    );
  });

  it("classifyTwoInstanceLoser returns other for anything else", () => {
    assert.equal(classifyTwoInstanceLoser("boom", null), "other");
  });

  it("checkMemoryLockCharacterization reports an oversold clean trial as findings only", () => {
    const out = checkMemoryLockCharacterization(
      memoryInput({
        orderCount: 4,
        uniqueOrderIds: 4,
        httpWinnerCount: 4,
        reservationQty: 4,
        reserved: 4,
        statuses: [200, 200, 200, 200],
        loserTypes: ["not_allowed"],
        loserMessages: ["Not enough stock available"],
      }),
    );
    assert.deepEqual(out.violations, []);
    assert.ok(
      out.findings.some((line) => /CHARACTERIZATION: oversold, 4 orders for S=3/.test(line)),
    );
  });

  it("checkMemoryLockCharacterization flags a 5xx", () => {
    const out = checkMemoryLockCharacterization(memoryInput({ statuses: [200, 500, 200] }));
    assert.ok(out.violations.some((line) => line === "PRODUCT BUG: HTTP 500"));
  });

  it("checkMemoryLockCharacterization flags orders above instances x S", () => {
    const out = checkMemoryLockCharacterization(
      memoryInput({
        orderCount: 7,
        uniqueOrderIds: 7,
        httpWinnerCount: 7,
        reservationQty: 7,
        reserved: 7,
        statuses: [200, 200, 200, 200, 200, 200, 200],
      }),
    );
    assert.ok(out.violations.some((line) => /7 orders exceed instances x S = 6/.test(line)));
  });

  // The RACE-003 trial 45 pattern of run 40120499660: instance 0 admitted 3, instance 1 admitted 4, S = 3.
  it("checkMemoryLockCharacterization names the backend that admitted more than S", () => {
    const out = checkMemoryLockCharacterization(
      memoryInput({
        orderCount: 7,
        uniqueOrderIds: 7,
        httpWinnerCount: 7,
        reservationQty: 7,
        reserved: 3,
        statuses: [200, 400, 400, 200, 400, 200, 400, 200, 400, 200, 200, 400, 200, 400, 400],
      }),
    );
    assert.ok(
      out.violations.includes("PRODUCT BUG (SUSPECTED): instance 1 admitted 4 orders for S=3"),
    );
    assert.ok(!out.violations.some((line) => /instance 0 admitted/.test(line)));
  });

  // The RACE-003 trial 39 pattern: instance 1 admitted 4 while the total (5) is within instances x S = 6.
  it("checkMemoryLockCharacterization flags a per-backend excess even when the total is within the bound", () => {
    const out = checkMemoryLockCharacterization(
      memoryInput({
        orderCount: 5,
        uniqueOrderIds: 5,
        httpWinnerCount: 5,
        reservationQty: 5,
        reserved: 3,
        statuses: [400, 200, 200, 400, 400, 400, 400, 200, 400, 200, 400, 200, 400, 400, 400],
      }),
    );
    assert.ok(
      out.violations.includes("PRODUCT BUG (SUSPECTED): instance 1 admitted 4 orders for S=3"),
    );
    assert.ok(!out.violations.some((line) => /exceed instances x S/.test(line)));
  });

  it("checkMemoryLockCharacterization passes when every backend admits at most S", () => {
    const out = checkMemoryLockCharacterization(
      memoryInput({
        orderCount: 5,
        uniqueOrderIds: 5,
        httpWinnerCount: 5,
        reservationQty: 5,
        reserved: 3,
        statuses: [200, 200, 200, 200, 200, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400],
      }),
    );
    assert.ok(!out.violations.some((line) => /admitted/.test(line)));
  });
});
