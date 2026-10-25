import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { abortedStepOf, evaluateStopRule, STOP_DEFAULTS } from "../../src/load/knee/stop-rule.ts";
import type { StepStat } from "../../src/load/knee/step-stats.ts";

function step(index: number, over: Partial<StepStat> = {}): StepStat {
  return {
    index,
    rate: 1 + index,
    plannedIterations: 30,
    startedIterations: 30,
    requests: 100,
    p95Ms: 100,
    errors: 0,
    errorRate: 0,
    reached: true,
    ...over,
  };
}

const RULE = { smokeP95Ms: 100, ...STOP_DEFAULTS };

describe("knee stop rule", () => {
  it("a p95 equal to the limit trips; just below does not", () => {
    const equal = evaluateStopRule([step(0, { p95Ms: 1000 })], RULE);
    assert.equal(equal.stopStep, 0);
    assert.deepEqual(equal.reasons, ["p95"]);
    assert.equal(equal.limitMs, 1000);
    assert.equal(evaluateStopRule([step(0, { p95Ms: 999.9 })], RULE).stopStep, null);
  });

  it("an error rate exactly 1 % does not trip; 1.01 % does", () => {
    assert.equal(evaluateStopRule([step(0, { errorRate: 0.01 })], RULE).stopStep, null);
    const over = evaluateStopRule([step(0, { errorRate: 0.0101 })], RULE);
    assert.equal(over.stopStep, 0);
    assert.deepEqual(over.reasons, ["error_rate"]);
  });

  it("an error abort on a step with fewer than minRequests requests reports error_rate with lowSampleStop true", () => {
    const v = evaluateStopRule(
      [step(0, { requests: 10, errors: 2, errorRate: 0.2, p95Ms: 5 })],
      RULE,
    );
    assert.equal(v.stopStep, 0);
    assert.deepEqual(v.reasons, ["error_rate"]);
    assert.equal(v.lowSampleStop, true);
    assert.equal(v.stopRequests, 10);
    assert.equal(v.stopErrors, 2);
  });

  it("an error abort with enough requests reports error_rate with lowSampleStop false", () => {
    const v = evaluateStopRule(
      [step(0, { requests: 40, errors: 4, errorRate: 0.1, p95Ms: 5 })],
      RULE,
    );
    assert.equal(v.stopStep, 0);
    assert.deepEqual(v.reasons, ["error_rate"]);
    assert.equal(v.lowSampleStop, false);
  });

  it("p95 on a low-request step still needs minRequests", () => {
    const v = evaluateStopRule(
      [step(0, { requests: 10, errors: 0, errorRate: 0, p95Ms: 5000 })],
      RULE,
    );
    assert.equal(v.stopStep, null);
    assert.deepEqual(v.reasons, []);
  });

  it("the first step wins", () => {
    const stats = [step(0), step(1, { p95Ms: 2000 }), step(2, { errorRate: 0.5 })];
    assert.equal(evaluateStopRule(stats, RULE).stopStep, 1);
  });

  it("reasons list error_rate before p95 when both trip at the stop step", () => {
    const both = evaluateStopRule([step(0, { errorRate: 0.2, p95Ms: 5000 })], RULE);
    assert.deepEqual(both.reasons, ["error_rate", "p95"]);
  });

  it("no trip gives a null stop step", () => {
    const v = evaluateStopRule([step(0), step(1, { p95Ms: 900 })], RULE);
    assert.equal(v.stopStep, null);
    assert.deepEqual(v.reasons, []);
  });
});

describe("abortedStepOf", () => {
  it("reads the step of a p95 abort from the k6 log", () => {
    const log =
      'time="2026-10-25T20:44:46Z" level=error msg="thresholds on metrics \'http_req_duration{step:4}\' were crossed; at least one has abortOnFail enabled, stopping test prematurely"';
    assert.deepEqual(abortedStepOf(log), { index: 4, reasons: ["p95"] });
  });

  it("reads the step of an error-rate abort", () => {
    const log =
      "msg=\"thresholds on metrics 'p6_nonconflict_error{step:2}' were crossed; at least one\"";
    assert.deepEqual(abortedStepOf(log), { index: 2, reasons: ["error_rate"] });
  });

  it("reads every metric crossed at the earliest step of one combined message", () => {
    const log =
      "msg=\"thresholds on metrics 'http_req_duration{step:5}, p6_nonconflict_error{step:4}, p6_nonconflict_error{step:4}' were crossed\"";
    assert.deepEqual(abortedStepOf(log), { index: 4, reasons: ["error_rate"] });
  });

  it("is null when the log names no crossed threshold", () => {
    assert.equal(
      abortedStepOf("running (0m01.0s), 000/016 VUs, 0 complete and 0 interrupted iterations"),
      null,
    );
  });
});
