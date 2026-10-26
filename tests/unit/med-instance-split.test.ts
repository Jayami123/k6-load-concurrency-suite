import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySplit, type InstanceCount } from "../../src/load/med/instance-split.ts";

const both: InstanceCount[] = [
  { instance: "primary", requests: 50, orders: 4 },
  { instance: "secondary", requests: 50, orders: 4 },
];

const clean = {
  orders: 8,
  stock: 10,
  perInstance: both,
  duplicateCartOrders: 0,
  reservationsMatchOrders: true,
  onePaymentPerOrder: true,
  perIntentReconciled: true,
  ghostOrders: 0,
  invalidReasons: [] as string[],
};

describe("medusa two-instance conservation", () => {
  it("passes when every check holds and both instances served requests", () => {
    assert.equal(classifySplit(clean).verdict, "PASS");
  });

  it("is a product bug when orders exceed stock, or a cart has two orders", () => {
    assert.equal(classifySplit({ ...clean, orders: 11 }).verdict, "FAIL (PRODUCT BUG)");
    assert.equal(classifySplit({ ...clean, duplicateCartOrders: 1 }).verdict, "FAIL (PRODUCT BUG)");
  });

  it("is a test bug, not a pass, when an instance served no request", () => {
    const idle = [both[0]!, { instance: "secondary" as const, requests: 0, orders: 0 }];
    const v = classifySplit({ ...clean, perInstance: idle });
    assert.equal(v.verdict, "TEST BUG");
    assert.ok(v.reasons[0]?.includes("secondary"));
  });

  it("is INVALID when the run carries invalid reasons, which outrank a product failure", () => {
    const v = classifySplit({ ...clean, orders: 11, invalidReasons: ["3 dropped iterations"] });
    assert.equal(v.verdict, "INVALID");
    assert.deepEqual(v.reasons, ["3 dropped iterations"]);
  });
});
