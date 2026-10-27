import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOOR, K, parseTolerance, toleranceOf } from "../../src/load/gate/tolerance.ts";

const arms = (values: number[]) => values.map((value, i) => ({ runId: String(101 + i), value }));

describe("a/a tolerance rule", () => {
  it("uses the floor when K x spread is smaller (a quiet set: spread 3 %)", () => {
    const t = toleranceOf("p95Ms", arms([100, 101, 103]));
    assert.equal(K * t.spread < FLOOR, true);
    assert.equal(t.tolerance, FLOOR);
    assert.equal(t.arms, 3);
    assert.deepEqual(t.runIds, ["101", "102", "103"]);
  });

  it("uses K x spread when it is larger (a noisy set: spread 36 %)", () => {
    // median 80, range 28.8: spread 0.36, tolerance 0.72
    const t = toleranceOf("p95Ms", arms([54.1, 79.8, 82.9]));
    assert.ok(Math.abs(t.spread - (82.9 - 54.1) / 79.8) < 1e-12);
    assert.ok(Math.abs(t.tolerance - K * t.spread) < 1e-12);
  });

  it("refuses fewer than three arms and cites the arms of one dispatch once", () => {
    assert.throws(() => toleranceOf("p50Ms", arms([10, 11])), /need at least 3/);
    // three arms of one GitHub run: one citation, three arms
    const t = toleranceOf("p50Ms", [
      { runId: "7", value: 10 },
      { runId: "7", value: 11 },
      { runId: "7", value: 12 },
    ]);
    assert.deepEqual(t.runIds, ["7"]);
    assert.equal(t.arms, 3);
  });

  it("parses a file whose tolerances follow the rule and refuses one whose tolerance does not", () => {
    const good = toleranceOf("requestsPerSec", arms([4, 4.02, 3.98]));
    const file = {
      schema: 1,
      metric: "A/A tolerance",
      unit: "fraction of the median (relative)",
      release: "p6-phase4b",
      products: { cal: { requestsPerSec: good } },
    };
    assert.deepEqual(parseTolerance(file), file);
    const bad = structuredClone(file);
    bad.products.cal.requestsPerSec!.tolerance = 0.5;
    assert.throws(() => parseTolerance(bad), /is not max\(FLOOR, K x spread\)/);
  });
});
