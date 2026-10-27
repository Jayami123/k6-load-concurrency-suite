import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  freeOfHostBookings,
  pickSlotStarts,
  slotsNeeded,
  supplyWindowDays,
} from "../../src/load/knee/cal-supply.ts";

const DEFAULT = { startRate: 2, stepRate: 2, holdSec: 30, rampSec: 2, maxSteps: 9 };

describe("cal knee slot supply", () => {
  it("slotsNeeded of the default plan is 3,008: 2,700 hold and 164 ramp arrivals, x 1.05", () => {
    // holds: 30 x (2 + 4 + ... + 18) = 2,700; ramps: 2 x 2 (the first, from startRate) + sum of 2 x (r - 1) for r = 4..18 = 160
    assert.equal(slotsNeeded(DEFAULT), 3008);
  });

  it("supplyWindowDays(3008) is 278", () => {
    assert.equal(supplyWindowDays(3008), 278);
  });

  it("a ramp-free plan counts the holds only", () => {
    assert.equal(slotsNeeded({ ...DEFAULT, rampSec: 0 }), Math.ceil(2700 * 1.05));
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

describe("cal supply without the host's busy time", () => {
  const OFFERED = [
    "2026-11-03T09:00:00.000Z",
    "2026-11-03T09:30:00.000Z",
    "2026-11-03T10:00:00.000Z",
  ];

  it("a seed booking from 09:01:10 to 09:31:10 excludes both 09:00 and 09:30", () => {
    const busy = [{ start: "2026-11-03T09:01:10.000Z", end: "2026-11-03T09:31:10.000Z" }];
    assert.deepEqual(freeOfHostBookings(OFFERED, busy), ["2026-11-03T10:00:00.000Z"]);
  });

  it("an aligned 09:00 to 09:30 booking excludes only 09:00", () => {
    const busy = [{ start: "2026-11-03T09:00:00.000Z", end: "2026-11-03T09:30:00.000Z" }];
    assert.deepEqual(freeOfHostBookings(OFFERED, busy), [
      "2026-11-03T09:30:00.000Z",
      "2026-11-03T10:00:00.000Z",
    ]);
  });

  it("a short supply after the busy filter is a TEST BUG", () => {
    const busy = [{ start: "2026-11-03T09:01:10.000Z", end: "2026-11-03T09:31:10.000Z" }];
    const free = freeOfHostBookings(OFFERED, busy);
    assert.throws(() => pickSlotStarts(free, 2), /TEST BUG: slot supply 1 < needed 2/);
  });
});
