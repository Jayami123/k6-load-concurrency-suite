import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateOverhead, OVERHEAD_MARGINS, type OverheadRun } from "../../src/load/overhead.ts";

const runs = (requests: number, p95Ms: number, dropped = 0): OverheadRun[] => [
  { requests, p95Ms, dropped },
  { requests, p95Ms, dropped },
  { requests, p95Ms, dropped },
];

describe("sampler overhead", () => {
  it("within the margins gives no violation", () => {
    assert.deepEqual(evaluateOverhead(runs(800, 1000), runs(801, 1020)), []);
  });

  it("each margin breaks on its own, with one line each", () => {
    assert.equal(evaluateOverhead(runs(800, 1000), runs(700, 1000)).length, 1);
    assert.equal(evaluateOverhead(runs(800, 1000), runs(800, 1200)).length, 1);
    assert.equal(evaluateOverhead(runs(800, 1000), runs(800, 1000, 3)).length, 1);
    assert.equal(OVERHEAD_MARGINS.p95Pct, 10);
  });
});
