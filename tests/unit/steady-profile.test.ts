import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KneeBounds } from "../../src/load/knee/bounds.ts";
import { CASES } from "../../src/load/cases.ts";
import {
  STEADY_DURATION_SEC,
  STEADY_TIME_UNIT_SEC,
  withSteadyProfile,
} from "../../src/load/steady.ts";

function bounds(product: "cal" | "medusa", lowerBoundRate: number): KneeBounds {
  return {
    schema: 1,
    metric: "knee range lower bound",
    unit: "iterations per second",
    release: "p6-phase4a",
    products: {
      [product]: {
        caseId: product === "cal" ? "P6-CAL-LOAD-005" : "P6-MED-LOAD-004",
        profile: "full",
        lowerBoundRate,
        medianLowerRate: lowerBoundRate,
        upperBoundRate: lowerBoundRate + 2,
        n: 3,
        runIds: ["1001", "1002", "1003"],
        environment: "ubuntu24 20261023.334.3, 4 vCPU",
        environments: {},
        notes: [],
      },
    },
  };
}

describe("steady profile", () => {
  it("sets the rate to half the lower bound, the duration to 120 s and the latency to twice the full profile's", () => {
    const steady = withSteadyProfile(CASES["P6-CAL-LOAD-003"]!, bounds("cal", 6)).profiles.steady!;
    assert.equal(steady.rate, 3);
    assert.equal(steady.durationSec, STEADY_DURATION_SEC.full);
    assert.equal(steady.maxLatencyMs, 2 * CASES["P6-CAL-LOAD-003"]!.profiles.full.maxLatencyMs);
    assert.equal(steady.timeUnitSec, STEADY_TIME_UNIT_SEC);
  });

  it("leaves the pr and full profiles untouched", () => {
    const base = CASES["P6-CAL-LOAD-003"]!;
    const derived = withSteadyProfile(base, bounds("cal", 6));
    assert.deepEqual(derived.profiles.pr, base.profiles.pr);
    assert.deepEqual(derived.profiles.full, base.profiles.full);
  });

  it("names the missing product when the bounds lack it", () => {
    assert.throws(
      () => withSteadyProfile(CASES["P6-MED-LOAD-002"]!, bounds("cal", 6)),
      /no medusa bound/,
    );
  });

  it("gives the steady run its own label", () => {
    const derived = withSteadyProfile(CASES["P6-CAL-LOAD-003"]!, bounds("cal", 6));
    assert.equal(derived.label, "steady baseline, environment-bound");
    assert.equal(CASES["P6-CAL-LOAD-003"]!.label, "steady baseline, environment-bound");
  });
});
