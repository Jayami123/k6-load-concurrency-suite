import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pairFraction, pairRateFor } from "../../k6/lib/pure/pair.js";

describe("documenso pair share", () => {
  it("runs the pair stream at rate × pairShare, in addition to the sequential rate", () => {
    assert.equal(pairRateFor(2, 0.1), 0.2);
    assert.equal(pairRateFor(2, 0.5), 1);
    assert.equal(pairRateFor(2, 1), 2);
  });

  it("gives the pair fraction of all documents as pairShare / (1 + pairShare), and rejects a share outside (0, 1]", () => {
    assert.ok(Math.abs(pairFraction(0.1) - 0.0909) < 1e-4); // 9.1 %, not 10 %
    assert.equal(pairFraction(1), 0.5);
    assert.throws(() => pairRateFor(2, 0), /pairShare must be above 0/);
    assert.throws(() => pairRateFor(2, 1.5), /pairShare must be above 0/);
  });

  it("rejects a share that gives less than one whole pair start per 10 s, naming the share", () => {
    assert.throws(() => pairRateFor(2, 0.01), /pairShare 0\.01 gives 0\.2 pair starts per 10 s/);
    assert.throws(() => pairRateFor(2, 0.0001), /pairShare 0\.0001/);
    assert.equal(pairRateFor(2, 0.05), 0.1); // 1 start per 10 s
  });
});
