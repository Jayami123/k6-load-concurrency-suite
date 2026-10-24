import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maxVUs, plannedIterations, preAllocatedVUs } from "../../k6/lib/pure/sizing.js";

describe("k6 lib sizing", () => {
  it("Little's law example: 40 iterations/s x 1.6 s with the 1.25 safety factor is 80 VUs", () => {
    assert.equal(preAllocatedVUs({ rate: 40, maxLatencyMs: 1600 }), 80);
  });

  it("never goes below one VU", () => {
    assert.equal(preAllocatedVUs({ rate: 0.1, maxLatencyMs: 1 }), 1);
  });

  it("maxVUs adds 50 % headroom by default", () => {
    assert.equal(maxVUs(80), 120);
  });

  it("plannedIterations is rate times duration", () => {
    assert.equal(plannedIterations(40, 30), 1200);
  });

  it("throws on a non-positive rate", () => {
    assert.throws(
      () => preAllocatedVUs({ rate: 0, maxLatencyMs: 10 }),
      /rate must be a positive number/,
    );
  });
});
