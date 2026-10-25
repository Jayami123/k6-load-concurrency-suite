import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpikePlan,
  classifySpikeResponse,
  phaseAt,
  spikeVus,
} from "../../k6/lib/pure/spike.js";

const plan = buildSpikePlan({
  steadyRate: 3,
  spikeRate: 9,
  steadySec: 60,
  spikeSec: 30,
  rampSec: 2,
  watchSec: 120,
});

describe("k6 lib spike", () => {
  it("builds the five stages and the marks of steady, ramp, spike, ramp and recovery", () => {
    assert.deepEqual(
      plan.stages.map((s) => [s.target, s.duration]),
      [
        [3, "60s"],
        [9, "2s"],
        [9, "30s"],
        [3, "2s"],
        [3, "120s"],
      ],
    );
    assert.deepEqual(plan.marks, { steadyEnd: 60, spikeStart: 62, spikeEnd: 92, end: 214 });
    assert.equal(plan.startRate, 3);
  });

  it("rejects a non-positive duration and a spike that is not above the steady rate", () => {
    const base = {
      steadyRate: 3,
      spikeRate: 9,
      steadySec: 60,
      spikeSec: 30,
      rampSec: 2,
      watchSec: 120,
    };
    assert.throws(() => buildSpikePlan({ ...base, steadySec: 0 }), /steadySec must be above 0/);
    assert.throws(() => buildSpikePlan({ ...base, spikeRate: 3 }), /steadyRate < spikeRate/);
  });

  it("phaseAt changes exactly at each mark and ends with undefined", () => {
    assert.equal(phaseAt(plan, 59_999), "steady");
    assert.equal(phaseAt(plan, 60_000), "ramp-up");
    assert.equal(phaseAt(plan, 62_000), "spike");
    assert.equal(phaseAt(plan, 92_000), "ramp-down");
    assert.equal(phaseAt(plan, 94_000), "recovery");
    assert.equal(phaseAt(plan, 214_000), undefined);
  });

  it("sizes the VU pool of the three default plans to 354/461, 59/77 and 24/32", () => {
    assert.deepEqual(spikeVus({ steadyRate: 3, spikeRate: 9, spikeSec: 30, rampSec: 2 }), {
      pre: 354,
      max: 461,
    });
    assert.deepEqual(spikeVus({ steadyRate: 0.5, spikeRate: 1.5, spikeSec: 30, rampSec: 2 }), {
      pre: 59,
      max: 77,
    });
    assert.deepEqual(spikeVus({ steadyRate: 0.2, spikeRate: 0.6, spikeSec: 30, rampSec: 2 }), {
      pre: 24,
      max: 32,
    });
  });

  it("classifies responses, with 429 as limited and status 0 as transport", () => {
    assert.equal(classifySpikeResponse(200, true), "ok");
    assert.equal(classifySpikeResponse(429, true), "limited");
    assert.equal(classifySpikeResponse(429, false), "limited");
    assert.equal(classifySpikeResponse(404, true), "refused_with_body");
    assert.equal(classifySpikeResponse(404, false), "refused_no_body");
    assert.equal(classifySpikeResponse(503, true), "server_error");
    assert.equal(classifySpikeResponse(0, false), "transport");
  });
});
