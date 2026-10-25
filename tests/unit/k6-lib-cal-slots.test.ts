import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scheduleWindow, slotFor } from "../../k6/lib/pure/cal-slots.js";

describe("k6 lib cal slots", () => {
  it("slotFor returns the target of iteration n and undefined past the supply", () => {
    const starts = ["2026-11-03T09:00:00.000Z", "2026-11-03T10:00:00.000Z"];
    assert.equal(slotFor(starts, 0), starts[0]);
    assert.equal(slotFor(starts, 1), starts[1]);
    assert.equal(slotFor(starts, 2), undefined);
  });

  it("scheduleWindow is the day of the target from 00:00 UTC, for the given number of days", () => {
    assert.deepEqual(scheduleWindow("2026-11-03T09:30:00.000Z", 28), {
      startTime: "2026-11-03T00:00:00.000Z",
      endTime: "2026-12-01T00:00:00.000Z",
    });
  });

  it("the window contains the target and does not move with the time of day", () => {
    const a = scheduleWindow("2026-11-03T00:00:00.000Z", 28);
    const b = scheduleWindow("2026-11-03T23:59:59.000Z", 28);
    assert.deepEqual(a, b);
    assert.ok(Date.parse(a.startTime) <= Date.parse("2026-11-03T23:59:59.000Z"));
    assert.ok(Date.parse(a.endTime) > Date.parse("2026-11-03T23:59:59.000Z"));
  });
});
