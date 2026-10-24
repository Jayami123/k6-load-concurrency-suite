import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUMMARY_TREND_STATS,
  assertCorrectnessThresholds,
  closedModelScenario,
  openModelScenario,
  rampingOpenScenario,
  standardOptions,
} from "../../k6/lib/pure/options.js";

describe("k6 lib options", () => {
  it("open scenario has the constant-arrival-rate shape and Little's-law VUs", () => {
    assert.deepEqual(
      openModelScenario({ rate: 40, durationSec: 30, maxLatencyMs: 1600, exec: "work" }),
      {
        executor: "constant-arrival-rate",
        rate: 40,
        timeUnit: "1s",
        duration: "30s",
        preAllocatedVUs: 80,
        maxVUs: 120,
        exec: "work",
      },
    );
  });

  it("ramping scenario sizes the pool for the peak rate", () => {
    const s = rampingOpenScenario({
      startRate: 10,
      stages: [{ target: 40, durationSec: 10 }],
      maxLatencyMs: 1600,
    });
    assert.equal(s.executor, "ramping-arrival-rate");
    assert.equal(s.preAllocatedVUs, 80);
    assert.deepEqual(s.stages, [{ target: 40, duration: "10s" }]);
  });

  it("closed scenario is constant-vus", () => {
    assert.deepEqual(closedModelScenario({ vus: 5, durationSec: 20 }), {
      executor: "constant-vus",
      vus: 5,
      duration: "20s",
    });
  });

  it("standardOptions has no url system tag and the fixed trend stats", () => {
    const o = standardOptions({ scenarios: {} });
    assert.equal((o.systemTags as string[]).includes("url"), false);
    assert.deepEqual(o.summaryTrendStats, SUMMARY_TREND_STATS);
  });

  it("the threshold guard accepts checks and tagged http_req_failed", () => {
    assert.doesNotThrow(() =>
      assertCorrectnessThresholds({
        checks: ["rate==1"],
        "http_req_failed{name:GET /work}": ["rate<0.01"],
      }),
    );
  });

  it("the threshold guard rejects a latency threshold", () => {
    assert.throws(
      () => assertCorrectnessThresholds({ http_req_duration: ["p(95)<500"] }),
      /latency\/throughput gate/,
    );
  });
});
