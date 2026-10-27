import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOOR, K, parseTolerance, toleranceOf } from "../../src/load/gate/tolerance.ts";

/** Three counted arms, one per run id (run 101, 102, 103), all on 2026-10-27 unless a day is given. */
function arms(values: number[], day = "2026-10-27") {
  return values.map((value, i) => ({
    runId: String(101 + i),
    armId: `${101 + i}-1-1`,
    utcDay: day,
    value,
  }));
}

describe("a/a tolerance rule", () => {
  it("uses the floor when K x spread is smaller (a quiet set: spread 3 %)", () => {
    const t = toleranceOf("p95Ms", arms([100, 101, 103]));
    assert.equal(K * t.spread < FLOOR, true);
    assert.equal(t.tolerance, FLOOR);
    assert.deepEqual(t.arms, ["101-1-1", "102-1-1", "103-1-1"]);
    assert.deepEqual(t.runIds, ["101", "102", "103"]);
  });

  it("uses K x spread when it is larger (a noisy set: spread 36 %)", () => {
    // median 80, range 28.8: spread 0.36, tolerance 0.72
    const t = toleranceOf("p95Ms", arms([54.1, 79.8, 82.9]));
    assert.ok(Math.abs(t.spread - (82.9 - 54.1) / 79.8) < 1e-12);
    assert.ok(Math.abs(t.tolerance - K * t.spread) < 1e-12);
  });

  it("refuses fewer than three arms and two arms with the same arm id", () => {
    assert.throws(() => toleranceOf("p50Ms", arms([10, 11])), /need at least 3/);
    assert.throws(
      () =>
        toleranceOf("p50Ms", [
          { runId: "7", armId: "7-1-1", utcDay: "2026-10-27", value: 10 },
          { runId: "7", armId: "7-1-1", utcDay: "2026-10-27", value: 11 },
          { runId: "7", armId: "7-1-2", utcDay: "2026-10-27", value: 12 },
        ]),
      /same arm id/,
    );
  });

  it("refuses the committed file when its three arms all come from one run (two runs on two UTC days are needed)", () => {
    // three counted arms, one GitHub run: the tolerance itself is computed...
    const one = toleranceOf("p50Ms", [
      { runId: "7", armId: "7-1-1", utcDay: "2026-10-27", value: 10 },
      { runId: "7", armId: "7-1-2", utcDay: "2026-10-27", value: 11 },
      { runId: "7", armId: "7-1-3", utcDay: "2026-10-27", value: 12 },
    ]);
    assert.deepEqual(one.runIds, ["7"]);
    assert.equal(one.arms.length, 3);
    // ...but the committed file refuses it
    const file = {
      schema: 1,
      metric: "A/A tolerance",
      unit: "fraction of the median (relative)",
      release: "p6-phase4b",
      products: { cal: { p50Ms: one } },
    };
    assert.throws(() => parseTolerance(file), /at least 2 distinct runIds/);
  });

  it("parses a file of two runs on two days whose tolerances follow the rule, and refuses one whose tolerance does not", () => {
    const good = toleranceOf("requestsPerSec", [
      { runId: "101", armId: "101-1-1", utcDay: "2026-10-27", value: 4 },
      { runId: "101", armId: "101-1-2", utcDay: "2026-10-27", value: 4.02 },
      { runId: "102", armId: "102-1-1", utcDay: "2026-10-28", value: 3.98 },
    ]);
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
