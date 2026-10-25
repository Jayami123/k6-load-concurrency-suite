import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stockForKnee } from "../../src/load/knee/med-stock.ts";

describe("medusa knee stock", () => {
  it("the default plan (0.5 to 4.0 per second, 30 s holds, 2 s ramps, 8 steps) needs 622 units", () => {
    // holds 30 x 18 = 540; ramps 325 tenths = 32.5; arrivals 572.5; x 1.05 = 601.1, ceil 602; + 20
    assert.equal(
      stockForKnee({ startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 2, maxSteps: 8 }),
      622,
    );
  });

  it("fractional rates sum exactly over 8 steps of 0.5 with the same ramps", () => {
    assert.equal(
      stockForKnee({ startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 2, maxSteps: 8 }),
      622,
    );
  });

  it("a one-step plan gives ceil(1.05 x (hold + first ramp)) + 20", () => {
    // hold 2 x 10 = 20; first ramp 2 x 2 = 4 (startRate to itself); 24 x 1.05 = 25.2, ceil 26; + 20
    assert.equal(
      stockForKnee({ startRate: 2, stepRate: 2, holdSec: 10, rampSec: 2, maxSteps: 1 }),
      46,
    );
  });
});
