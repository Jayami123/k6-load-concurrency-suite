import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeValidity, VALIDITY_LIMITS, type ValidityInput } from "../../src/load/validity.ts";
import type { K6Summary } from "../../src/load/summary.ts";
import type { ResourceSummary } from "../../src/load/types.ts";

const summary = (over: Partial<K6Summary> = {}): K6Summary => ({
  requests: 1200,
  failedRate: 0,
  iterations: 1200,
  dropped: 0,
  vusMax: 80,
  peakVus: 20,
  p95Ms: 1000,
  medMs: 30,
  maxMs: 1500,
  checksPassed: 1200,
  checksFailed: 0,
  thresholdsCrossed: [],
  ...over,
});

const resources = (over: Partial<ResourceSummary> = {}): ResourceSummary => ({
  samples: 30,
  intervalMs: 1000,
  k6CoresAvg: 0.75,
  k6CoresMax: 0.9,
  runnerBusyPctAvg: 40,
  runnerBusyPctMax: 60,
  memAvailablePctMin: 60,
  ...over,
});

const base = (over: Partial<ValidityInput> = {}): ValidityInput => ({
  summary: summary(),
  maxVUs: 120,
  nproc: 4,
  resources: resources(),
  ...over,
});

describe("load validity", () => {
  it("a normal run is VALID with no reasons", () => {
    assert.deepEqual(judgeValidity(base()), { verdict: "VALID", reasons: [] });
  });

  it("dropped iterations make the run INVALID", () => {
    const v = judgeValidity(base({ summary: summary({ dropped: 170 }) }));
    assert.equal(v.verdict, "INVALID");
    assert.equal(v.reasons[0]!.code, "dropped_iterations");
  });

  it("peak VUs equal to the maximum is vu_exhausted", () => {
    const v = judgeValidity(base({ summary: summary({ peakVus: 120 }), maxVUs: 120 }));
    assert.deepEqual(
      v.reasons.map((r) => r.code),
      ["vu_exhausted"],
    );
  });

  it("peak VUs below the maximum gives no VU reason", () => {
    assert.equal(
      judgeValidity(base({ summary: summary({ peakVus: 119 }), maxVUs: 120 })).verdict,
      "VALID",
    );
  });

  it("k6 using more than half of the cores is k6_cpu", () => {
    const v = judgeValidity(base({ resources: resources({ k6CoresAvg: 2.5 }) }));
    assert.deepEqual(
      v.reasons.map((r) => r.code),
      ["k6_cpu"],
    );
  });

  it("the runner busy over the limit is runner_cpu", () => {
    const v = judgeValidity(base({ resources: resources({ runnerBusyPctAvg: 90 }) }));
    assert.deepEqual(
      v.reasons.map((r) => r.code),
      ["runner_cpu"],
    );
  });

  it("memory available under the limit is runner_memory", () => {
    const v = judgeValidity(base({ resources: resources({ memAvailablePctMin: 5 }) }));
    assert.deepEqual(
      v.reasons.map((r) => r.code),
      ["runner_memory"],
    );
  });

  it("a telemetry gap is a reason", () => {
    const v = judgeValidity(base({ telemetry: { gaps: ["t=10 s"] } }));
    assert.deepEqual(
      v.reasons.map((r) => r.code),
      ["telemetry_gap"],
    );
  });

  it("clock skew within the limit is no reason", () => {
    const v = judgeValidity(base({ telemetry: { gaps: [], skewMs: 40, skewLimitMs: 100 } }));
    assert.equal(v.verdict, "VALID");
  });

  it("clock skew beyond the limit is clock_skew", () => {
    const v = judgeValidity(base({ telemetry: { gaps: [], skewMs: -250, skewLimitMs: 100 } }));
    assert.deepEqual(
      v.reasons.map((r) => r.code),
      ["clock_skew"],
    );
  });

  it("absent resources give no CPU or memory reason", () => {
    const v = judgeValidity(base({ resources: undefined }));
    assert.equal(v.verdict, "VALID");
  });

  it("reasons come in the fixed order", () => {
    const v = judgeValidity(
      base({
        summary: summary({ dropped: 3, peakVus: 120 }),
        resources: resources({ k6CoresAvg: 3, runnerBusyPctAvg: 99, memAvailablePctMin: 1 }),
        telemetry: { gaps: ["g"], skewMs: 900, skewLimitMs: 100 },
        maxVUs: 120,
      }),
    );
    assert.deepEqual(
      v.reasons.map((r) => r.code),
      [
        "dropped_iterations",
        "vu_exhausted",
        "k6_cpu",
        "runner_cpu",
        "runner_memory",
        "telemetry_gap",
        "clock_skew",
      ],
    );
    assert.equal(VALIDITY_LIMITS.runnerBusyPctMax, 85);
  });
});
