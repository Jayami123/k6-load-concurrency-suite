import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundarySchedule,
  expiryBoundaryVerdict,
  expiryGateOpen,
} from "../../src/twenty/window-oracle.ts";

describe("expiryBoundaryVerdict", () => {
  it("passes when the token is accepted before expiry and refused after it", () => {
    assert.equal(expiryBoundaryVerdict({ successes: 1 }, { successes: 0 }), "PASS");
  });

  it("is inconclusive when nothing is accepted", () => {
    assert.equal(expiryBoundaryVerdict({ successes: 0 }, { successes: 0 }), "INCONCLUSIVE");
  });

  it("suspects a product bug when the after token is accepted too", () => {
    assert.equal(
      expiryBoundaryVerdict({ successes: 1 }, { successes: 1 }),
      "PRODUCT_BUG_SUSPECTED",
    );
  });

  it("suspects a product bug when only the after token is accepted", () => {
    assert.equal(
      expiryBoundaryVerdict({ successes: 0 }, { successes: 1 }),
      "PRODUCT_BUG_SUSPECTED",
    );
  });

  it("schedules the before redemption 15 s early and the after redemption 15 s late", () => {
    assert.deepEqual(boundarySchedule(1_000_000), { beforeMs: 985_000, afterMs: 1_015_000 });
  });

  it("opens the gate for a lifetime at most 15 min and closes it above that", () => {
    assert.equal(expiryGateOpen(0, 300_000), true);
    assert.equal(expiryGateOpen(0, 900_000), true);
    assert.equal(expiryGateOpen(0, 900_001), false);
  });
});
