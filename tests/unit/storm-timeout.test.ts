import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stormTimeoutFor } from "../../src/load/storm-timeout.ts";

describe("storm timeout rule", () => {
  it("is a quarter of the minimum, rounded down", () => {
    assert.equal(stormTimeoutFor(91), 22);
    assert.equal(stormTimeoutFor(40.9), 10);
    assert.equal(stormTimeoutFor(60), 15);
  });

  it("clamps at 5 ms below and at the old 100 ms above", () => {
    assert.equal(stormTimeoutFor(12), 5);
    assert.equal(stormTimeoutFor(400), 100);
    assert.equal(stormTimeoutFor(10_000), 100);
  });

  it("throws on a non-positive or non-finite minimum", () => {
    assert.throws(() => stormTimeoutFor(0), /TEST BUG/);
    assert.throws(() => stormTimeoutFor(-3), /TEST BUG/);
    assert.throws(() => stormTimeoutFor(Number.NaN), /TEST BUG/);
    assert.throws(() => stormTimeoutFor(Number.POSITIVE_INFINITY), /TEST BUG/);
  });
});
