import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickSlotStarts, slotsNeeded, supplyWindowDays } from "../../src/load/knee/cal-supply.ts";

const DEFAULT = { startRate: 2, stepRate: 2, holdSec: 30, rampSec: 2, maxSteps: 9 };

describe("cal knee slot supply", () => {
  it("slotsNeeded of the default plan is 3,008: 2,700 hold and 164 ramp arrivals, x 1.05", () => {
    // holds: 30 x (2 + 4 + ... + 18) = 2,700; ramps: 2 x 2 (the first, from startRate) + sum of 2 x (r - 1) for r = 4..18 = 160
    assert.equal(slotsNeeded(DEFAULT), 3008);
  });

  it("supplyWindowDays(3008) is 278", () => {
    assert.equal(supplyWindowDays(3008), 278);
  });

  it("a ramp-free plan counts the holds only", () => {
    assert.equal(slotsNeeded({ ...DEFAULT, rampSec: 0 }), Math.ceil(2700 * 1.05));
  });

  it("pickSlotStarts dedupes, sorts and cuts", () => {
    const offered = [
      "2026-11-03T10:00:00.000Z",
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
      "2026-11-03T11:00:00.000Z",
    ];
    assert.deepEqual(pickSlotStarts(offered, 2), [
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
    ]);
  });

  it("a short list throws TEST BUG: slot supply", () => {
    assert.throws(() => pickSlotStarts(["2026-11-03T09:00:00.000Z"], 2), /TEST BUG: slot supply/);
  });
});
