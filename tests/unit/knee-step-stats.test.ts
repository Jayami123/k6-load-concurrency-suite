import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stepStatsFromSummary } from "../../src/load/knee/step-stats.ts";
import type { KneePlanSpec } from "../../src/load/types.ts";

const SPEC: KneePlanSpec = { startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 5, maxSteps: 3 };

describe("knee per-step statistics", () => {
  it("reads a full summary: started, requests, p95, errors and the rate", () => {
    const summary = {
      metrics: {
        "p6_step_started{step:0}": { count: 15 },
        "http_reqs{step:0}": { count: 15 },
        "http_req_duration{step:0}": { "p(95)": 120 },
        "p6_nonconflict_error{step:0}": { passes: 0, fails: 15, rate: 0 },
      },
    };
    const [s0] = stepStatsFromSummary(summary, SPEC);
    assert.deepEqual(s0, {
      index: 0,
      rate: 0.5,
      plannedIterations: 15,
      startedIterations: 15,
      requests: 15,
      p95Ms: 120,
      errors: 0,
      errorRate: 0,
      reached: true,
    });
  });

  it("the Rate metric's passes is the error count", () => {
    const summary = {
      metrics: {
        "http_reqs{step:1}": { count: 40 },
        "p6_nonconflict_error{step:1}": { passes: 2, fails: 38, rate: 0.05 },
      },
    };
    const s1 = stepStatsFromSummary(summary, SPEC)[1]!;
    assert.equal(s1.errors, 2);
    assert.equal(s1.errorRate, 0.05);
    assert.equal(s1.rate, 1);
  });

  it("a missing step is not reached and counts 0; nothing is invented", () => {
    const [, , s2] = stepStatsFromSummary({ metrics: {} }, SPEC);
    assert.equal(s2!.reached, false);
    assert.equal(s2!.startedIterations, 0);
    assert.equal(s2!.requests, 0);
    assert.equal(s2!.p95Ms, undefined);
    assert.equal(s2!.errorRate, 0);
  });

  it("planned iterations are rate x holdSec", () => {
    const stats = stepStatsFromSummary({ metrics: {} }, SPEC);
    assert.deepEqual(
      stats.map((s) => [s.rate, s.plannedIterations]),
      [
        [0.5, 15],
        [1, 30],
        [1.5, 45],
      ],
    );
  });
});
