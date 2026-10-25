import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickSlotStarts, slotsNeeded, supplyWindowDays } from "../../src/load/knee/cal-supply.ts";

const DEFAULT = { startRate: 2, stepRate: 2, holdSec: 30, rampSec: 2, maxSteps: 9 };

describe("cal knee slot supply", () => {
  it("slotsNeeded of the default plan is 2,835", () => {
    // 30 x (2 + 4 + ... + 18) = 2,700; x 1.05 = 2,835
    assert.equal(slotsNeeded(DEFAULT), 2835);
  });

  it("supplyWindowDays(2835) is 263", () => {
    assert.equal(supplyWindowDays(2835), 263);
  });

  it("pickSlotStarts dedupes, sorts and cuts", () => {
    const offered = [
      "2026-11-03T10:00:00.000Z",
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
      "2026-11-03T11:00:00.000Z",
    ];
    assert.deepEqual(pickSlotStarts(offered, 2), [
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
    ]);
  });

  it("a short list throws TEST BUG: slot supply", () => {
    assert.throws(() => pickSlotStarts(["2026-11-03T09:00:00.000Z"], 2), /TEST BUG: slot supply/);
  });
});
