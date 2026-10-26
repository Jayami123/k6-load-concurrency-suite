import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plateauRatio } from "../../src/load/soak/plateau.ts";
import type { SoakPoint } from "../../src/load/soak/slope.ts";

/** One point per minute from time zero, with the given values. */
function series(values: number[]): SoakPoint[] {
  return values.map((value, i) => ({ tMs: i * 60_000, value }));
}

describe("soak plateau", () => {
  it("reports no samples when there are no points after warm-up", () => {
    const r = plateauRatio([], 0, 0);
    assert.equal(r.reason, "no samples");
    assert.equal(r.ratio, null);
  });

  it("reports too few samples below three points after warm-up", () => {
    const r = plateauRatio(series([1, 2]), 0, 0);
    assert.equal(r.reason, "too few samples");
    assert.equal(r.middleMedian, null);
    assert.equal(r.ratio, null);
  });

  it("gives a ratio of 1 for a flat series", () => {
    const r = plateauRatio(series([7, 7, 7, 7, 7, 7, 7, 7, 7]), 0, 0);
    assert.equal(r.reason, "ok");
    assert.equal(r.ratio, 1);
  });

  it("compares the last third's median with the middle third's median", () => {
    // Nine points: middle third 4, 5, 6 (median 5); last third 7, 8, 9 (median 8).
    const r = plateauRatio(series([1, 2, 3, 4, 5, 6, 7, 8, 9]), 0, 0);
    assert.equal(r.middleMedian, 5);
    assert.equal(r.lastMedian, 8);
    assert.ok(Math.abs(r.ratio! - 1.6) < 1e-9);
  });

  it("gives no ratio when the middle third's median is zero", () => {
    const r = plateauRatio(series([0, 0, 0, 0, 0, 5]), 0, 0);
    assert.equal(r.reason, "zero middle median");
    assert.equal(r.ratio, null);
    assert.equal(r.lastMedian, 2.5);
  });
});
