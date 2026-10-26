import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { soakSlope, warmupSecFor, type SoakPoint } from "../../src/load/soak/slope.ts";

const T0 = 0;
/** One point per minute, starting at `startSec`, with the given values. */
function series(values: number[], startSec = 0): SoakPoint[] {
  return values.map((value, i) => ({ tMs: T0 + (startSec + i * 60) * 1000, value }));
}

describe("soak slope", () => {
  it("sets the warm-up to max(300 s, 20 % of the soak)", () => {
    assert.equal(warmupSecFor(600), 300);
    assert.equal(warmupSecFor(1800), 360);
    assert.equal(warmupSecFor(7200), 1440);
  });

  it("reports no samples and no slope when every point is inside warm-up", () => {
    const r = soakSlope(series([1, 2, 3], 0), T0, 600);
    assert.equal(r.reason, "no samples");
    assert.equal(r.n, 0);
    assert.equal(r.slopePerMin, null);
    assert.equal(r.theilSenPerMin, null);
  });

  it("reports too few samples and no slope for a single point after warm-up", () => {
    const r = soakSlope(series([5], 600), T0, 300);
    assert.equal(r.reason, "too few samples");
    assert.equal(r.n, 1);
    assert.equal(r.slopePerMin, null);
  });

  it("recovers a known line: least squares and Theil–Sen both give its slope", () => {
    const r = soakSlope(
      series(
        Array.from({ length: 12 }, (_, i) => 100 + 0.1 * i),
        300,
      ),
      T0,
      300,
    );
    assert.equal(r.reason, "ok");
    assert.equal(r.n, 12);
    assert.ok(Math.abs(r.slopePerMin! - 0.1) < 1e-9);
    assert.ok(Math.abs(r.theilSenPerMin! - 0.1) < 1e-9);
    assert.equal(r.stepsOver, 0);
  });

  it("ignores the points before warm-up", () => {
    const warm = series([10_000, 10_000, 10_000], 0);
    const steady = series([1, 1, 1, 1, 1], 600);
    const r = soakSlope([...warm, ...steady], T0, 300);
    assert.equal(r.n, 5);
    assert.ok(Math.abs(r.slopePerMin!) < 1e-9);
  });

  it("counts one late step, and Theil–Sen stays at zero while least squares rises", () => {
    const values = [...Array.from({ length: 19 }, () => 100), 200];
    const r = soakSlope(series(values, 300), T0, 300);
    assert.equal(r.stepsOver, 1);
    assert.equal(r.theilSenPerMin, 0);
    assert.ok(r.slopePerMin! > 0);
  });
});
