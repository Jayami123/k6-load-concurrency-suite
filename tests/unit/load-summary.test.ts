import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseK6Summary } from "../../src/load/summary.ts";

const normal = {
  metrics: {
    http_reqs: { count: 1201, rate: 40 },
    http_req_failed: { value: 0 },
    iterations: { count: 1201 },
    dropped_iterations: { count: 0 },
    vus_max: { value: 80 },
    http_req_duration: { "p(95)": 1020, med: 30, max: 1500 },
    checks: { passes: 1201, fails: 0 },
  },
};

describe("load summary", () => {
  it("parses a normal summary", () => {
    const s = parseK6Summary(normal);
    assert.equal(s.requests, 1201);
    assert.equal(s.p95Ms, 1020);
    assert.equal(s.medMs, 30);
    assert.equal(s.maxMs, 1500);
    assert.equal(s.checksPassed, 1201);
    assert.equal(s.checksFailed, 0);
    assert.deepEqual(s.thresholdsCrossed, []);
  });

  it("a missing dropped_iterations is 0", () => {
    const { dropped_iterations: _unused, ...rest } = normal.metrics;
    assert.equal(parseK6Summary({ metrics: rest }).dropped, 0);
  });

  it("reads vus_max in both shapes: value and max", () => {
    assert.equal(parseK6Summary({ metrics: { vus_max: { value: 80 } } }).vusMax, 80);
    assert.equal(parseK6Summary({ metrics: { vus_max: { max: 75 } } }).vusMax, 75);
  });

  it("lists the thresholds that crossed (value true), not the passing ones", () => {
    const s = parseK6Summary({
      metrics: {
        checks: { thresholds: { "rate==1": true } },
        http_req_failed: { thresholds: { "rate<0.01": false } },
      },
    });
    assert.deepEqual(s.thresholdsCrossed, ["checks: rate==1"]);
  });
});
