import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recycleSlotIndex } from "../../k6/lib/pure/recycle.js";

describe("soak slot recycling", () => {
  it("reuses each slot after the pool size of other iterations", () => {
    const slots = [0, 1, 2, 3, 4, 5, 6].map((i) => recycleSlotIndex(i, 3));
    assert.deepEqual(slots, [0, 1, 2, 0, 1, 2, 0]);
  });

  it("refuses a pool that is not a whole number of at least one slot", () => {
    for (const size of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => recycleSlotIndex(0, size), /TEST BUG: recycle pool size/);
    }
  });
});
