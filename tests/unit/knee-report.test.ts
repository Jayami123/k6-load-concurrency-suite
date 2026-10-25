import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findHits } from "../../scripts/evidence-token-scan.mjs";
import { buildKneeReport, formatKneeTable } from "../../src/load/knee/knee-report.ts";
import type { FirstSaturated } from "../../src/load/knee/first-saturated.ts";
import type { StepStat } from "../../src/load/knee/step-stats.ts";
import type { StopRule, StopVerdict } from "../../src/load/knee/stop-rule.ts";
import type { RunMeta } from "../../src/load/types.ts";

const RULE: StopRule = { smokeP95Ms: 100, p95Factor: 10, errorRate: 0.01, minRequests: 20 };
const SAT: FirstSaturated = {
  resource: "db_wait",
  step: 2,
  perResource: {} as FirstSaturated["perResource"],
  absentSources: [],
};
const META = {
  environment: {
    kind: "github-actions",
    runnerImage: "ubuntu24",
    imageVersion: "20261023.334.3",
    nproc: 4,
  },
} as unknown as RunMeta;

function step(index: number, rate: number, over: Partial<StepStat> = {}): StepStat {
  return {
    index,
    rate,
    plannedIterations: 15,
    startedIterations: 15,
    requests: 15,
    p95Ms: 120,
    errors: 0,
    errorRate: 0,
    reached: true,
    ...over,
  };
}

const STEPS = [step(0, 0.5), step(1, 1), step(2, 1.5)];

function report(steps: StepStat[], stop: StopVerdict) {
  return buildKneeReport({
    caseId: "P6-MED-LOAD-004",
    runId: "20261025T100000Z-aaaaaaaa",
    steps,
    stop,
    rule: RULE,
    saturated: SAT,
    meta: META,
    conflicts: 0,
  });
}

describe("knee report", () => {
  it("the range is between the last clean step and the stop step", () => {
    const r = report(STEPS, { stopStep: 2, reasons: ["p95"], limitMs: 1000 });
    assert.equal(r.verdict, "KNEE");
    assert.deepEqual(r.range, { lowerStep: 1, upperStep: 2, lowerRate: 1, upperRate: 1.5 });
    assert.equal(r.stop?.rate, 1.5);
  });

  it("a stop at step 0 is a TEST BUG finding, not a range", () => {
    const r = report(STEPS, { stopStep: 0, reasons: ["error_rate"], limitMs: 1000 });
    assert.equal(r.verdict, "INVALID");
    assert.equal(r.range, undefined);
    assert.ok(r.invalid.some((f) => f.code === "knee_below_start"));
  });

  it("no stop is NO_KNEE", () => {
    const r = report(STEPS, { stopStep: null, reasons: [], limitMs: 1000 });
    assert.equal(r.verdict, "NO_KNEE");
    assert.equal(r.range, undefined);
    assert.ok(r.invalid.some((f) => f.code === "no_knee"));
  });

  it("a clean step short of its plan by more than the allowance is INVALID; the floor of 2 holds at 15 planned", () => {
    const short2 = report([step(0, 0.5, { startedIterations: 13 }), step(1, 1)], {
      stopStep: null,
      reasons: [],
      limitMs: 1000,
    });
    assert.equal(
      short2.invalid.filter((f) => f.code === "dropped_iterations").length,
      0,
      "2 short is allowed",
    );
    const short3 = report([step(0, 0.5, { startedIterations: 12 }), step(1, 1)], {
      stopStep: null,
      reasons: [],
      limitMs: 1000,
    });
    assert.equal(
      short3.invalid.filter((f) => f.code === "dropped_iterations").length,
      1,
      "3 short is not",
    );
    assert.equal(short3.verdict, "INVALID");
  });

  it("the stop step's drops are ignored", () => {
    const steps = [step(0, 0.5), step(1, 1, { startedIterations: 5 }), step(2, 1.5)];
    const r = report(steps, { stopStep: 1, reasons: ["p95"], limitMs: 1000 });
    assert.equal(r.invalid.filter((f) => f.code === "dropped_iterations").length, 0);
    assert.equal(r.verdict, "KNEE");
  });

  it("markdown table and the lower-bound line of a plan without a stop", () => {
    const none = report(STEPS, { stopStep: null, reasons: [], limitMs: 1000 });
    const md = formatKneeTable(none);
    assert.match(md, /\| step \| rate \|/);
    assert.match(md, /no knee up to step 2 \(rate 1\.5\)/);
    const kneeMd = formatKneeTable(report(STEPS, { stopStep: 2, reasons: ["p95"], limitMs: 1000 }));
    assert.match(kneeMd, /Knee range: between 1 and 1\.5 iterations\/s/);
  });

  it("the report JSON passes the token scan", () => {
    assert.deepEqual(
      findHits(JSON.stringify(report(STEPS, { stopStep: 2, reasons: ["p95"], limitMs: 1000 }))),
      [],
    );
  });
});
