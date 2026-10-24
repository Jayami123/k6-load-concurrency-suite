import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CO_MARGINS,
  evaluateCoordinatedOmission,
  type CoInput,
} from "../../src/load/co-relations.ts";

// Probe numbers (plan §7): rate 40 x 30 s = 1200 planned.
const probe: CoInput = {
  open: { requests: 1201, dropped: 0, p95Ms: 1020 },
  closed: { requests: 1008, dropped: 0, p95Ms: 26 },
  undersized: { requests: 1030, dropped: 170, p95Ms: 1400 },
  rate: 40,
  durationSec: 30,
  serviceMs: 25,
};

describe("coordinated-omission relations", () => {
  it("all six relations pass on the probe numbers", () => {
    assert.deepEqual(evaluateCoordinatedOmission(probe), []);
  });

  it("R1 fails alone when the open run loses arrivals", () => {
    const out = evaluateCoordinatedOmission({
      ...probe,
      open: { ...probe.open, requests: 900 },
      closed: { ...probe.closed, requests: 800 },
    });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^R1/);
  });

  it("R2 fails alone when the sized open run drops iterations", () => {
    const out = evaluateCoordinatedOmission({ ...probe, open: { ...probe.open, dropped: 100 } });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^R2/);
  });

  it("R3 fails alone when the closed run sends as many requests as the open run", () => {
    const out = evaluateCoordinatedOmission({
      ...probe,
      closed: { ...probe.closed, requests: 1201 },
    });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^R3/);
  });

  it("R4 fails alone when the closed p95 is not clearly lower", () => {
    const out = evaluateCoordinatedOmission({ ...probe, closed: { ...probe.closed, p95Ms: 500 } });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^R4/);
  });

  it("R5 fails alone when the open p95 does not show the stall", () => {
    const out = evaluateCoordinatedOmission({ ...probe, open: { ...probe.open, p95Ms: 100 } });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^R5/);
  });

  it("R6 fails alone when the under-sized run reports no drops", () => {
    const out = evaluateCoordinatedOmission({
      ...probe,
      undersized: { ...probe.undersized, dropped: 0 },
    });
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^R6/);
  });

  it("the margins are exposed as constants", () => {
    assert.equal(CO_MARGINS.openKeepsRate, 0.97);
    assert.equal(CO_MARGINS.closedP95Factor, 3);
  });
});
