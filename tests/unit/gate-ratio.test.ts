import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ratioOf, ratiosOf } from "../../src/load/gate/ratio.ts";

describe("a/b ratios", () => {
  it("is b over the A median", () => {
    assert.equal(ratioOf(12, 10), 1.2);
  });

  it("gives one ratio per B arm over the median of the A arms", () => {
    // A median of 9, 10, 11 is 10
    assert.deepEqual(ratiosOf([9, 10, 11], [12, 10, 8]), [1.2, 1, 0.8]);
  });

  it("refuses a zero, negative or non-finite median (TEST BUG, never a divide by zero)", () => {
    assert.throws(() => ratioOf(12, 0), /TEST BUG/);
    assert.throws(() => ratiosOf([10, -1, 10], [12]), /TEST BUG/);
    assert.throws(() => ratioOf(Number.NaN, 10), /TEST BUG/);
  });
});
