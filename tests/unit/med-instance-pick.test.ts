import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { instanceFor } from "../../k6/lib/pure/instance.js";

describe("medusa two-instance pick", () => {
  it("alternates primary and secondary by iteration parity, so each serves half the stream", () => {
    const picks = Array.from({ length: 6 }, (_, i) => instanceFor(i));
    assert.deepEqual(picks, [
      "primary",
      "secondary",
      "primary",
      "secondary",
      "primary",
      "secondary",
    ]);
  });

  it("rejects a negative or fractional iteration index", () => {
    assert.throws(() => instanceFor(-1), /TEST BUG/);
    assert.throws(() => instanceFor(1.5), /TEST BUG/);
  });
});
