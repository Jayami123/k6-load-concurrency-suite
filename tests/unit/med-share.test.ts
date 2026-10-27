import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shareHit } from "../../k6/lib/pure/share.js";

describe("medusa promo share", () => {
  it("takes exactly half of the iterations at share 0.5, alternating", () => {
    const hits = Array.from({ length: 10 }, (_, i) => shareHit(i, 0.5));
    assert.equal(hits.filter(Boolean).length, 5);
    assert.deepEqual(hits.slice(0, 4), [false, true, false, true]);
  });

  it("rejects an index or a share outside its range", () => {
    assert.throws(() => shareHit(-1, 0.5), /iteration index/);
    assert.throws(() => shareHit(0, 1.5), /share 1.5 is outside/);
  });
});
