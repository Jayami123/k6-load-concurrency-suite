import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignDelayMs,
  buildSpikePlan,
  classifySpikeResponse,
  distanceToBoundaryMs,
  inOneWindow,
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
    assert.deepEqual(plan.marks, {
      steadyEnd: 60,
      spikeStart: 62,
      spikeEnd: 92,
      quietEnd: 94,
      end: 214,
    });
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

  it("a quiet phase sends nothing (target 0) between the ramp down and the watch, and is labelled quiet", () => {
    const quiet = buildSpikePlan({
      steadyRate: 3,
      spikeRate: 9,
      steadySec: 58,
      spikeSec: 30,
      rampSec: 2,
      watchSec: 58,
      quietSec: 60,
      timeUnitSec: 10,
    });
    assert.deepEqual(quiet.stages.slice(3), [
      { target: 3, duration: "2s" },
      { target: 0, duration: "1s" },
      { target: 0, duration: "60s" },
      { target: 3, duration: "1s" },
      { target: 3, duration: "57s" },
    ]);
    assert.deepEqual(quiet.marks, {
      steadyEnd: 58,
      spikeStart: 60,
      spikeEnd: 90,
      quietEnd: 153,
      end: 211,
    });
    assert.equal(phaseAt(quiet, 91_000), "ramp-down");
    assert.equal(phaseAt(quiet, 100_000), "quiet");
    assert.equal(phaseAt(quiet, 152_999), "quiet");
    assert.equal(phaseAt(quiet, 153_000), "recovery");
    assert.throws(
      () => buildSpikePlan({ ...quietBase(), watchSec: 1 }),
      /watchSec must be 2 or more after a quiet phase/,
    );
  });
});

function quietBase() {
  return {
    steadyRate: 3,
    spikeRate: 9,
    steadySec: 58,
    spikeSec: 30,
    rampSec: 2,
    watchSec: 58,
    quietSec: 60,
    timeUnitSec: 10,
  };
}

describe("spike alignment to the limiter's minute windows", () => {
  it("a start exactly on the boundary waits 0 ms, and any other start waits less than one minute", () => {
    // The spike begins 60 s after the scenario start (steady 58 s + ramp 2 s).
    assert.equal(alignDelayMs(120_000, 60_000), 0);
    assert.equal(alignDelayMs(120_001, 60_000), 59_999);
    assert.equal(alignDelayMs(60_000, 0), 0);
    assert.equal(alignDelayMs(90_000, 0), 30_000);
    for (let now = 0; now < 180_000; now += 997) {
      const d = alignDelayMs(now, 62_000);
      assert.ok(d >= 0 && d < 60_000, `wait ${d} ms at ${now}`);
      assert.equal((now + d + 62_000) % 60_000, 0, `spike start at ${now} + ${d} is on a boundary`);
    }
  });

  it("the spike's 30 s sit in one window when the spike starts on a boundary, and cross one when it does not", () => {
    assert.equal(inOneWindow(120_000, 150_000), true);
    assert.equal(inOneWindow(120_000, 179_999), true);
    assert.equal(inOneWindow(170_000, 200_000), false);
  });

  it("the distance to the nearest minute boundary is the smaller of the two sides", () => {
    assert.equal(distanceToBoundaryMs(120_000), 0);
    assert.equal(distanceToBoundaryMs(120_001), 1);
    assert.equal(distanceToBoundaryMs(119_999), 1);
    assert.equal(distanceToBoundaryMs(150_000), 30_000);
  });
});
