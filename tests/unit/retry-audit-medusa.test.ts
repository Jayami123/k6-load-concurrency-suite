import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeMedusaRetries, type MedusaRetryInput } from "../../src/load/retry-audit/medusa.ts";
import type { RetryCounters } from "../../src/load/retry-validity.ts";

const counters = (over: Partial<RetryCounters> = {}): RetryCounters => ({
  intents: 10,
  attempts: 15,
  firstTimeouts: 5,
  intentsOk: 10,
  retryOk: 0,
  retryConflict: 0,
  retryRedacted400: 0,
  retryRefused: 0,
  retry5xx: 0,
  orderMismatch: 0,
  ...over,
});

const ordersPerIntent = (n = 10): Record<string, number> =>
  Object.fromEntries(Array.from({ length: n }, (_, k) => [`i${k}`, 1]));

const input = (over: Partial<MedusaRetryInput> = {}): MedusaRetryInput => ({
  intents: 10,
  ordersPerIntent: ordersPerIntent(),
  paymentsPerOrder: Array.from({ length: 10 }, () => 1),
  snapshot: {
    orderCount: 10,
    liveOrderCount: 10,
    orderQty: 10,
    liveOrderQty: 10,
    canceledOrderCount: 0,
    reservationQty: 10,
    stocked: 100,
    reserved: 10,
  },
  counters: counters(),
  ...over,
});

const failed = (r: ReturnType<typeof judgeMedusaRetries>) => r.findings.filter((f) => !f.ok);

describe("retry audit: medusa", () => {
  it("one order and one payment per intent, stock reserved once per order, passes", () => {
    const r = judgeMedusaRetries(input());
    assert.deepEqual(failed(r), []);
    assert.deepEqual(r.knownBugs, {});
  });

  it("two orders for one intent is a PRODUCT BUG", () => {
    const r = judgeMedusaRetries(input({ ordersPerIntent: { ...ordersPerIntent(), i0: 2 } }));
    const f = r.findings.find((x) => x.check === "one-order-per-intent");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
  });

  it("two payments for one order is a PRODUCT BUG", () => {
    const r = judgeMedusaRetries(input({ paymentsPerOrder: [2, ...Array(9).fill(1)] }));
    const f = r.findings.find((x) => x.check === "one-payment-per-order");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.match(f?.detail ?? "", /^1 order\(s\)/);
  });

  it("reserved stock that differs from the orders is a PRODUCT BUG", () => {
    const r = judgeMedusaRetries(
      input({
        snapshot: {
          orderCount: 10,
          liveOrderCount: 10,
          orderQty: 10,
          liveOrderQty: 10,
          canceledOrderCount: 0,
          reservationQty: 10,
          stocked: 100,
          reserved: 9,
        },
      }),
    );
    const f = r.findings.find((x) => x.check === "reserved-equals-orders");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
  });

  it("a retry answered with a different order id is a PRODUCT BUG", () => {
    const r = judgeMedusaRetries(input({ counters: counters({ orderMismatch: 1 }) }));
    const f = r.findings.find((x) => x.check === "order-id-match");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
  });

  it("an order the client got back that the database does not hold is a PRODUCT BUG", () => {
    const r = judgeMedusaRetries(input({ ordersPerIntent: {}, paymentsPerOrder: [] }));
    const f = r.findings.find((x) => x.check === "client-orders-in-db");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
  });

  it("a ghost order the client never got back is counted under F-M2, not a failure", () => {
    const r = judgeMedusaRetries(input({ counters: counters({ intentsOk: 9 }) }));
    assert.deepEqual(failed(r), []);
    assert.equal(r.knownBugs["F-M2"], 1);
  });
});
