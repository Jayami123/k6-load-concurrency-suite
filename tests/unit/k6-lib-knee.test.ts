import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKneePlan,
  classifyResponse,
  intentLine,
  kneeVus,
  stepAt,
  stopRuleThresholds,
} from "../../k6/lib/pure/knee.js";
import { standardOptions } from "../../k6/lib/pure/options.js";

const PLAN = { startRate: 0.5, stepRate: 0.5, holdSec: 30, rampSec: 5, maxSteps: 3 };

describe("k6 lib knee plan", () => {
  it("plan shape with timeUnit 10s targets, stages, and bad input rejected", () => {
    const plan = buildKneePlan(PLAN);
    assert.deepEqual(
      plan.steps.map((s) => s.rate),
      [0.5, 1, 1.5],
    );
    assert.deepEqual(
      plan.steps.map((s) => [s.holdFromSec, s.holdToSec]),
      [
        [5, 35],
        [40, 70],
        [75, 105],
      ],
    );
    assert.deepEqual(plan.stages[0], { target: 5, duration: "5s" });
    assert.deepEqual(plan.stages[1], { target: 5, duration: "30s" });
    assert.equal(plan.totalSec, 105);
    assert.throws(() => buildKneePlan({ ...PLAN, startRate: 0 }), /TEST BUG/);
    assert.throws(() => buildKneePlan({ ...PLAN, rampSec: -1 }), /TEST BUG/);
    assert.throws(() => buildKneePlan({ ...PLAN, maxSteps: 0 }), /TEST BUG/);
    assert.throws(() => buildKneePlan({ ...PLAN, startRate: 0.55 }), /TEST BUG/);
  });

  it("stepAt: hold, ramp, boundary and after the end", () => {
    const plan = buildKneePlan(PLAN);
    assert.equal(stepAt(plan, 5_000), 0, "a hold starts at its first instant");
    assert.equal(stepAt(plan, 20_000), 0);
    assert.equal(stepAt(plan, 35_000), null, "the hold ends before the next ramp");
    assert.equal(stepAt(plan, 37_000), null, "during the ramp of step 1");
    assert.equal(stepAt(plan, 39_999), null);
    assert.equal(stepAt(plan, 40_000), 1);
    assert.equal(stepAt(plan, 104_999), 2);
    assert.equal(stepAt(plan, 105_000), null, "after the plan");
    assert.equal(stepAt(plan, -1), null);
  });

  it("kneeVus: sizing, the minimum and the cap", () => {
    assert.equal(kneeVus({ peakRate: 10, iterationMs: 500, factor: 2, min: 5, maxCap: 100 }), 10);
    assert.equal(kneeVus({ peakRate: 0.5, iterationMs: 100, factor: 1, min: 5, maxCap: 100 }), 5);
    assert.equal(
      kneeVus({ peakRate: 1000, iterationMs: 1000, factor: 2, min: 5, maxCap: 100 }),
      100,
    );
  });

  it("stopRuleThresholds: keys, p(95) and rate limits, abortOnFail, empty submetric lists", () => {
    const t = stopRuleThresholds(buildKneePlan(PLAN), {
      stopP95Ms: 800,
      errorRate: 0.01,
      delayAbortEvalSec: 10,
    });
    assert.deepEqual(t["http_req_duration{step:0}"], [
      { threshold: "p(95)<800", abortOnFail: true, delayAbortEval: "10s" },
    ]);
    assert.deepEqual(t["p6_nonconflict_error{step:2}"], [
      { threshold: "rate<=0.01", abortOnFail: true, delayAbortEval: "10s" },
    ]);
    for (const key of ["p6_step_started{step:1}", "http_reqs{step:1}", "checks{step:1}"]) {
      assert.deepEqual(t[key], [], key);
    }
    assert.equal(Object.keys(t).length, 15);
  });

  it("classifyResponse: Cal", () => {
    assert.equal(classifyResponse("cal", 409, undefined), "conflict");
    assert.equal(
      classifyResponse("cal", 400, "An error occurred while querying the database."),
      "conflict",
    );
    assert.equal(classifyResponse("cal", 400, "bad input"), "error");
    assert.equal(classifyResponse("cal", 503, undefined), "error");
    assert.equal(classifyResponse("cal", 0, undefined), "error");
    assert.equal(classifyResponse("cal", 200, undefined), "ok");
  });

  it("classifyResponse: Medusa", () => {
    assert.equal(
      classifyResponse("medusa", 400, "Not enough stock available", "not_allowed"),
      "conflict",
    );
    assert.equal(
      classifyResponse(
        "medusa",
        400,
        'Updating Status from "pending" to "completed" is not allowed',
        "not_allowed",
      ),
      "error",
      "the ghost refusal is an error",
    );
    assert.equal(classifyResponse("medusa", 500, undefined), "error");
    assert.equal(classifyResponse("medusa", 200, undefined), "ok");
  });

  it("classifyResponse: Documenso has no conflicts, a 429 is an error", () => {
    assert.equal(classifyResponse("documenso", 429, "too many"), "error");
    assert.equal(classifyResponse("documenso", 409, undefined), "error");
    assert.equal(classifyResponse("documenso", 500, undefined), "error");
    assert.equal(classifyResponse("documenso", 200, undefined), "ok");
  });

  it("standardOptions still throws on a latency threshold", () => {
    assert.throws(
      () =>
        standardOptions({
          scenarios: {},
          thresholds: { http_req_duration: ["p(95)<100"] },
        }),
      /latency\/throughput gate/,
    );
  });

  it("intentLine round-trips the outcome, net and ghost flags", () => {
    assert.deepEqual(JSON.parse(intentLine(7, true, false, false)), { intent: 7, outcome: "ok" });
    assert.deepEqual(JSON.parse(intentLine(6, false, false, true)), {
      intent: 6,
      outcome: "fail",
      ghost: true,
    });
    assert.deepEqual(JSON.parse(intentLine(6, false, true, false)), {
      intent: 6,
      outcome: "fail",
      net: true,
    });
    assert.equal(
      intentLine(6, true, true, true),
      '{"intent":6,"outcome":"ok"}',
      "committed hides the flags",
    );
  });
});
