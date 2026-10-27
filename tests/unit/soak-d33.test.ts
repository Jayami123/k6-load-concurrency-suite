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

describe("D33 growth over the last 60 minutes", () => {
  it("does not flag a flat RSS", () => {
    const r = d33Growth(series(120, () => 1800));
    assert.equal(r.flag, false);
    assert.equal(r.n, 3601);
  });

  it("flags sustained growth of 2 MB/min through the last hour", () => {
    const r = d33Growth(series(120, (m) => 1500 + 2 * m));
    assert.equal(r.flag, true);
    assert.ok(r.theilSenPerMin !== null && Math.abs(r.theilSenPerMin - 2) < 1e-6);
  });

  it("does not flag an early ramp that is released before the last hour", () => {
    const r = d33Growth(series(120, (m) => (m < 60 ? 1500 + 10 * m : 2100)));
    assert.equal(r.flag, false);
  });

  it("flags a step inside the last hour when the Theil–Sen and plateau conditions hold, as the rule is written", () => {
    const r = d33Growth(series(120, (m) => (m < 90 ? 1800 : 2000)));
    assert.equal(r.flag, true);
    assert.ok(r.plateauRatio !== null && r.plateauRatio > 1.02);
  });

  it("does not flag a small step that leaves the plateau ratio at or below 1.02", () => {
    const r = d33Growth(series(120, (m) => (m < 90 ? 1800 : 1820)));
    assert.equal(r.flag, false);
  });
});
