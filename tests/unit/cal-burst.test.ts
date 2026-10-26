import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyBurst, type BurstAttempt } from "../../src/load/cal/burst.ts";

const attempts = (kinds: BurstAttempt["bodyKind"][]): BurstAttempt[] =>
  kinds.map((bodyKind, i) => ({
    intent: `p6-i${i} burst`,
    status: bodyKind === "accepted" ? 200 : 400,
    bodyKind,
  }));

const base = {
  targetSlot: "2026-10-27T10:00:00.000Z",
  accepted: 1,
  attempts: attempts([
    "accepted",
    "slot-taken",
    "slot-taken",
    "redacted-400",
    "slot-taken",
    "slot-taken",
    "slot-taken",
    "slot-taken",
  ]),
  expectedAttempts: 8,
  droppedIterations: 0,
  requestStartMs: [0, 10, 20, 30, 40, 50, 60, 100],
  slotFreeAtSetup: true,
  fiveXx: 0,
};

describe("cal burst classifier", () => {
  it("passes with exactly one ACCEPTED and counts the redacted 400 under its known-bug id", () => {
    const v = classifyBurst(base);
    assert.equal(v.verdict, "PASS");
    assert.equal(v.histogram["redacted-400"], 1);
    assert.deepEqual(v.knownBugs, { "P6-OBS-CAL-001": 1, "P6-OBS-CAL-003": 0 });
  });

  it("fails as a product bug when two bookings are ACCEPTED on the slot", () => {
    const v = classifyBurst({ ...base, accepted: 2 });
    assert.equal(v.verdict, "FAIL (PRODUCT BUG)");
    assert.match(v.reasons[0] ?? "", /2 ACCEPTED/);
  });

  it("fails as a product bug on any HTTP 5xx in the burst", () => {
    const v = classifyBurst({ ...base, fiveXx: 1 });
    assert.equal(v.verdict, "FAIL (PRODUCT BUG)");
    assert.match(v.reasons[0] ?? "", /5xx/);
  });

  it("is INVALID when the attempts are not the expected count, and applies no contention rule", () => {
    const v = classifyBurst({ ...base, accepted: 2, expectedAttempts: 9 });
    assert.equal(v.verdict, "INVALID");
    assert.match(v.reasons[0] ?? "", /8 attempts, expected 9/);
  });

  it("is INVALID on a dropped iteration", () => {
    const v = classifyBurst({ ...base, droppedIterations: 1 });
    assert.equal(v.verdict, "INVALID");
    assert.match(v.reasons[0] ?? "", /dropped/);
  });

  it("is INVALID when the request starts spread over more than 100 ms", () => {
    const v = classifyBurst({ ...base, requestStartMs: [0, 150] });
    assert.equal(v.verdict, "INVALID");
    assert.match(v.reasons[0] ?? "", /spread 150 ms/);
  });

  it("is TEST BUG when no attempt won, or the slot was not free at setup", () => {
    assert.equal(classifyBurst({ ...base, accepted: 0 }).verdict, "TEST BUG");
    const notFree = classifyBurst({ ...base, slotFreeAtSetup: false });
    assert.equal(notFree.verdict, "TEST BUG");
    assert.match(notFree.reasons[0] ?? "", /not free at setup/);
  });
});
