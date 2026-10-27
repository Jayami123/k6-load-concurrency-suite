import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { d33Growth } from "../../src/load/soak/d33.ts";
import type { SoakPoint } from "../../src/load/soak/slope.ts";

/** One sample per second for `minutes`, with value(minute) as the RSS in MB. */
function series(minutes: number, value: (m: number) => number): SoakPoint[] {
  return Array.from({ length: minutes * 60 + 1 }, (_, s) => ({
    tMs: s * 1000,
    value: value(s / 60),
  }));
}

describe("D33 growth over the last 60 minutes (sustained, D36)", () => {
  it("ignores points after the requested end of the run", () => {
    // flat RSS to minute 120, then a late ramp that lies after the end passed to d33Growth
    const pts = series(180, (m) => (m < 120 ? 1800 : 1800 + 10 * (m - 120)));
    const r = d33Growth(pts, 120 * 60_000);
    assert.equal(r.flag, false);
    assert.equal(r.n, 3601);
  });

  it("does not flag a flat RSS", () => {
    const r = d33Growth(series(120, () => 1800));
    assert.equal(r.flag, false);
    assert.equal(r.n, 3601);
  });

  it("flags growth of 2 MB/min sustained through both halves of the last hour", () => {
    const r = d33Growth(series(120, (m) => 1500 + 2 * m));
    assert.equal(r.flag, true);
    assert.ok(r.firstHalfTheilSenPerMin !== null && Math.abs(r.firstHalfTheilSenPerMin - 2) < 1e-6);
    assert.ok(
      r.secondHalfTheilSenPerMin !== null && Math.abs(r.secondHalfTheilSenPerMin - 2) < 1e-6,
    );
  });

  it("does not flag an early ramp that is released before the last hour", () => {
    const r = d33Growth(series(120, (m) => (m < 60 ? 1500 + 10 * m : 2100)));
    assert.equal(r.flag, false);
  });

  it("does not flag a single step followed by a plateau (heap or cache expansion, D36)", () => {
    const r = d33Growth(series(120, (m) => (m < 90 ? 1800 : 2000)));
    assert.equal(r.flag, false);
  });

  it("does not flag growth in the second half only", () => {
    const r = d33Growth(series(120, (m) => (m < 90 ? 1800 : 1800 + 4 * (m - 90))));
    assert.equal(r.flag, false);
    assert.ok(r.firstHalfTheilSenPerMin !== null && r.firstHalfTheilSenPerMin < 0.5);
  });

  it("does not flag growth in the first half only", () => {
    const r = d33Growth(series(120, (m) => (m < 90 ? 1800 + 4 * (m - 60) : 2040)));
    assert.equal(r.flag, false);
  });

  it("does not flag a small step", () => {
    const r = d33Growth(series(120, (m) => (m < 90 ? 1800 : 1820)));
    assert.equal(r.flag, false);
  });
});
