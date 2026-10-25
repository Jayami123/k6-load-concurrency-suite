import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stockForKnee } from "../../src/load/knee/med-stock.ts";

describe("medusa knee stock", () => {
  it("the default plan (0.5 to 4.0 per second, 30 s holds, 8 steps) needs 587 units", () => {
    assert.equal(
      stockForKnee({ startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 2, maxSteps: 8 }),
      587,
    );
  });

  it("fractional rates sum exactly over 8 steps of 0.5", () => {
    // 30 x (0.5 + 1.0 + ... + 4.0) = 30 x 18 = 540; x 1.05 = 567; + 20
    assert.equal(
      stockForKnee({ startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 2, maxSteps: 8 }),
      567 + 20,
    );
  });

  it("a one-step plan gives ceil(1.05 x rate x hold) + 20", () => {
    // 2 per second for 10 s = 20; x 1.05 = 21; + 20
    assert.equal(
      stockForKnee({ startRate: 2, stepRate: 2, holdSec: 10, rampSec: 2, maxSteps: 1 }),
      41,
    );
  });
});
