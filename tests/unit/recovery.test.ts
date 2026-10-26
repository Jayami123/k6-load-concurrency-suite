import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SecondBin, StatusCounts } from "../../src/load/chart/k6-points.ts";
import {
  isStorm,
  recoverySeconds,
  referenceUpper,
  windowsFromBins,
  type Window,
} from "../../src/load/recovery.ts";

const T0 = 1_000_000;
const NONE: StatusCounts = { ok: 0, r4xx: 0, r429: 0, r5xx: 0, transport: 0 };

/** One bin per second: `requests` answers at `p95Ms`. */
function bins(fromSec: number, toSec: number, requests: number, p95Ms: number): SecondBin[] {
  return Array.from({ length: toSec - fromSec }, (_, i) => ({
    t: T0 + (fromSec + i) * 1000,
    requests,
    p95Ms,
    status: { ...NONE, ok: requests },
  }));
}

function win(index: number, p95Ms: number | undefined, requests = 100, r5xx = 0): Window {
  return {
    index,
    fromMs: T0 + index * 10_000,
    toMs: T0 + (index + 1) * 10_000,
    requests,
    p95Ms,
    status: { ...NONE, ok: requests - r5xx, r5xx },
  };
}

describe("recovery", () => {
  it("cuts 10-second windows and gives no p95 under 40 requests", () => {
    const w = windowsFromBins([...bins(0, 10, 4, 100), ...bins(10, 20, 3, 500)], T0);
    assert.equal(w.length, 2);
    assert.equal(w[0]?.requests, 40);
    assert.equal(w[0]?.p95Ms, 100);
    assert.equal(w[1]?.requests, 30);
    assert.equal(w[1]?.p95Ms, undefined);
  });

  it("takes the reference from the pre-spike windows after the first, and the band when given", () => {
    const pre = [win(0, 900), win(1, 200), win(2, 250)];
    assert.equal(referenceUpper(pre), 250);
    assert.equal(referenceUpper(pre, { max: 300 }), 300);
    assert.equal(referenceUpper(pre, { max: 200 }), 250);
  });

  it("recovers at the end of the second of two consecutive windows inside the reference", () => {
    const spikeEnd = T0 + 100_000;
    const after = [win(10, 900), win(11, 280), win(12, 290)];
    assert.equal(recoverySeconds(after, spikeEnd, 300), 30);
  });

  it("does not count a single dip as recovery", () => {
    const spikeEnd = T0 + 100_000;
    const after = [win(10, 280), win(11, 900), win(12, 290), win(13, 295)];
    assert.equal(recoverySeconds(after, spikeEnd, 300), 40);
  });

  it("is undefined when the windows never come back inside the reference", () => {
    const spikeEnd = T0 + 100_000;
    assert.equal(recoverySeconds([win(10, 900), win(11, 800)], spikeEnd, 300), undefined);
  });

  it("a storm needs at least 5 5xx responses and more than 1 % of the window", () => {
    assert.equal(isStorm(win(0, 100, 100, 5)), true);
    assert.equal(isStorm(win(0, 100, 100, 4)), false);
  });

  it("a window with 5xx under 1 % of its requests is not a storm", () => {
    assert.equal(isStorm(win(0, 100, 1000, 5)), false);
  });
});
