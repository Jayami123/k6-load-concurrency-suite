import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findGaps } from "../../src/load/telemetry/gaps.ts";

describe("telemetry gaps", () => {
  it("no gap when the samples keep the interval", () => {
    assert.deepEqual(findGaps([0, 1000, 2000], 1000), []);
  });

  it("one gap is reported with its start, end and length", () => {
    assert.deepEqual(findGaps([0, 1000, 4100], 1000), [
      { fromMs: 1000, toMs: 4100, lengthMs: 3100 },
    ]);
  });

  it("a difference of exactly 2 x interval is not a gap", () => {
    assert.deepEqual(findGaps([0, 2000, 4000], 1000), []);
  });

  it("unsorted input is sorted first", () => {
    assert.deepEqual(findGaps([4000, 0, 2000], 1000), []);
  });
});
