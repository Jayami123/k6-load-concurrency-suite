import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kneeInvalidReasons, kneeValidityInput } from "../../src/load/knee/knee-report.ts";
import type { StepStat } from "../../src/load/knee/step-stats.ts";
import { judgeValidity } from "../../src/load/validity.ts";
import type { K6Summary } from "../../src/load/summary.ts";
import type { ResourceSummary } from "../../src/load/types.ts";

function step(index: number, started: number): StepStat {
  return {
    index,
    rate: 1,
    plannedIterations: 15,
    startedIterations: started,
    requests: started,
    p95Ms: 50,
    errors: 0,
    errorRate: 0,
    reached: started > 0,
  };
}

const RESOURCES: ResourceSummary = {
  samples: 10,
  intervalMs: 1000,
  k6CoresAvg: 0.2,
  k6CoresMax: 0.3,
  runnerBusyPctAvg: 95,
  runnerBusyPctMax: 95,
  memAvailablePctMin: 60,
};

describe("knee validity", () => {
  it("dropped iterations are judged per step, and the summary's dropped and peak VUs no longer count", () => {
    const summary = { dropped: 500, peakVus: 99 } as unknown as K6Summary;
    const judged = judgeValidity({ summary, maxVUs: 10, nproc: 4 });
    assert.ok(
      judged.reasons.some((r) => r.code === "dropped_iterations"),
      "the raw summary is INVALID",
    );
    const knee = judgeValidity(kneeValidityInput({ summary, maxVUs: 10, nproc: 4 }));
    assert.equal(
      knee.reasons.some((r) => r.code === "dropped_iterations"),
      false,
    );
    const perStep = kneeInvalidReasons([step(0, 10), step(1, 15)], {
      stopStep: null,
      reasons: [],
      limitMs: 1,
    });
    assert.ok(
      perStep.some((r) => r.code === "dropped_iterations"),
      "the per-step rule catches the clean short step",
    );
  });

  it("no stop is a no_knee reason", () => {
    const reasons = kneeInvalidReasons([step(0, 15)], { stopStep: null, reasons: [], limitMs: 1 });
    assert.ok(reasons.some((r) => r.code === "no_knee" && /knee is above step 0/.test(r.detail)));
  });

  it("the generator codes still apply to a knee run", () => {
    const summary = { dropped: 0, peakVus: 0 } as unknown as K6Summary;
    const knee = judgeValidity(
      kneeValidityInput({ summary, maxVUs: 10, nproc: 4, resources: RESOURCES }),
    );
    assert.ok(
      knee.reasons.some((r) => r.code === "runner_cpu"),
      "95 % host busy is still a generator limit",
    );
  });
});
