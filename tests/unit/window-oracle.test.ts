import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundaryPremise,
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

describe("boundaryPremise", () => {
  const recorded = 300_000;
  const windowOf = (lifetimeMs: number) => ({ createdAtMs: 0, expiresAtMs: lifetimeMs });

  it("matches the recorded lifetime and is gate-open at the image default", () => {
    const p = boundaryPremise([windowOf(recorded), windowOf(recorded)], recorded);
    assert.deepEqual(p, {
      gateOpen: true,
      premiseMatches: true,
      observedLifetimesMs: [recorded, recorded],
    });
  });

  it("allows one second of rounding and no more", () => {
    assert.equal(boundaryPremise([windowOf(recorded + 1_000)], recorded).premiseMatches, true);
    assert.equal(boundaryPremise([windowOf(recorded + 1_001)], recorded).premiseMatches, false);
  });

  it("closes the gate above 15 minutes and reports the mismatch", () => {
    const p = boundaryPremise([windowOf(16 * 60_000)], recorded);
    assert.equal(p.gateOpen, false);
    assert.equal(p.premiseMatches, false);
  });
});
