import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aaArmsFor, spreadOf, type AaArm } from "../../src/load/gate/aa-noise.ts";

function arm(runId: string, over: Partial<AaArm> = {}): AaArm {
  return {
    runId,
    armId: `${runId}-1-1`,
    utcDay: "2026-10-27",
    caseId: "P6-CAL-LOAD-003",
    profile: "steady",
    rate: 4,
    medians: { p95Ms: 80, p50Ms: 40, requestsPerSec: 4 },
    ...over,
  };
}

describe("a/a noise spread", () => {
  it("is (max - min) / median of the arm values", () => {
    // median 110, range 20: 20 / 110
    assert.equal(spreadOf([100, 110, 120]), 20 / 110);
  });

  it("refuses fewer than three arms and any value that is not finite and above 0", () => {
    assert.throws(() => spreadOf([100, 110]), /need at least 3/);
    assert.throws(() => spreadOf([100, 0, 120]), /finite and above 0/);
    assert.throws(() => spreadOf([100, Number.NaN, 120]), /finite and above 0/);
  });
});

describe("a/a arms of one case", () => {
  it("returns the values of one metric for the arms of that case only", () => {
    const arms = [
      arm("1"),
      arm("2", { medians: { p95Ms: 90, p50Ms: 41, requestsPerSec: 4 } }),
      arm("3", { caseId: "P6-MED-LOAD-002", medians: { p95Ms: 999, p50Ms: 1, requestsPerSec: 1 } }),
    ];
    assert.deepEqual(aaArmsFor("P6-CAL-LOAD-003", arms, 4, "p95Ms"), [
      { runId: "1", armId: "1-1-1", utcDay: "2026-10-27", value: 80 },
      { runId: "2", armId: "2-1-1", utcDay: "2026-10-27", value: 90 },
    ]);
  });

  it("refuses a non-steady arm and an arm at another rate than the steady rate (TEST BUG)", () => {
    assert.throws(
      () => aaArmsFor("P6-CAL-LOAD-003", [arm("1", { profile: "full" })], 4, "p95Ms"),
      /is full, not steady/,
    );
    assert.throws(
      () => aaArmsFor("P6-CAL-LOAD-003", [arm("1", { rate: 3 })], 4, "p95Ms"),
      /ran at 3\/s, the steady rate is 4\/s/,
    );
  });
});
