// Windows, reference, recovery and storms for the spike cases (Phase 4 Task 6 §6.3). Pure: the bins come from k6-points.ts.
import { nearestRankP95, type SecondBin, type StatusCounts } from "./chart/k6-points.ts";

export const WINDOW_SEC = 10;
export const MIN_WINDOW_REQUESTS = 40;

export interface Window {
  index: number;
  fromMs: number;
  toMs: number;
  requests: number;
  p95Ms?: number; // undefined under MIN_WINDOW_REQUESTS
  status: StatusCounts;
}

const NONE: StatusCounts = { ok: 0, r4xx: 0, r429: 0, r5xx: 0, transport: 0 };

function sumStatus(a: StatusCounts, b: StatusCounts): StatusCounts {
  return {
    ok: a.ok + b.ok,
    r4xx: a.r4xx + b.r4xx,
    r429: a.r429 + b.r429,
    r5xx: a.r5xx + b.r5xx,
    transport: a.transport + b.transport,
  };
}

/**
 * 10-second windows from the per-second bins, counted from t0Ms. A window with fewer than MIN_WINDOW_REQUESTS keeps its counts and has
 * no p95. The p95 is the nearest-rank p95 of the window's per-second p95s (the points file keeps one p95 per second). Windows with no
 * bins are kept, with zero requests, so a gap shows.
 */
export function windowsFromBins(bins: SecondBin[], t0Ms: number, windowSec = WINDOW_SEC): Window[] {
  const inRange = bins.filter((b) => b.t >= t0Ms);
  if (inRange.length === 0) return [];
  const last = Math.max(...inRange.map((b) => Math.floor((b.t - t0Ms) / 1000 / windowSec)));
  const windows: Window[] = [];
  for (let index = 0; index <= last; index++) {
    const fromMs = t0Ms + index * windowSec * 1000;
    const inWindow = inRange.filter((b) => b.t >= fromMs && b.t < fromMs + windowSec * 1000);
    const requests = inWindow.reduce((sum, b) => sum + b.requests, 0);
    const p95s = inWindow.flatMap((b) => (b.p95Ms === undefined ? [] : [b.p95Ms]));
    const status = inWindow.reduce((acc, b) => sumStatus(acc, b.status ?? NONE), NONE);
    windows.push({
      index,
      fromMs,
      toMs: fromMs + windowSec * 1000,
      requests,
      p95Ms: requests >= MIN_WINDOW_REQUESTS ? nearestRankP95(p95s) : undefined,
      status,
    });
  }
  return windows;
}

/**
 * The reference upper bound: the largest p95 of the pre-spike windows, the first window skipped (its warm-up), and the Task 5 band's
 * windowP95.max when a band is given. Throws when there is no reference window at all.
 */
export function referenceUpper(preSpike: Window[], band?: { max: number }): number {
  const values = preSpike
    .filter((w) => w.index >= 1 && w.p95Ms !== undefined)
    .map((w) => w.p95Ms as number);
  if (band) values.push(band.max);
  if (values.length === 0)
    throw new Error("recovery: no reference window (no pre-spike window has a p95)");
  return Math.max(...values);
}

/**
 * Seconds from spikeEndMs to the end of the first run of `consecutive` windows (starting at or after spikeEndMs) whose p95 is at or below
 * `upper`. A window with no p95 breaks the run. Undefined when the run never happens.
 */
export function recoverySeconds(
  windows: Window[],
  spikeEndMs: number,
  upper: number,
  consecutive = 2,
): number | undefined {
  const after = windows.filter((w) => w.fromMs >= spikeEndMs).sort((a, b) => a.fromMs - b.fromMs);
  let streak = 0;
  for (const w of after) {
    streak = w.p95Ms !== undefined && w.p95Ms <= upper ? streak + 1 : 0;
    if (streak === consecutive) return (w.toMs - spikeEndMs) / 1000;
  }
  return undefined;
}

/** A storm: at least 5 window responses with status 5xx and more than 1 % of the window's requests. */
export function isStorm(w: Window): boolean {
  return w.status.r5xx >= 5 && w.requests > 0 && w.status.r5xx / w.requests > 0.01;
}

/** One timed answer: the ms of the request and its HTTP status (the rate-limit recovery probe, Twenty plan P6-TW-LOAD-006). */
export interface Sample {
  tMs: number;
  status: number;
}

/** Ms from stopMs to the first 200 at or after stopMs, or null when none. Pure. */
export function firstOkAfter(samples: Sample[], stopMs: number): number | null {
  const ok = samples.filter((s) => s.tMs >= stopMs && s.status === 200).map((s) => s.tMs);
  if (ok.length === 0) return null;
  return Math.min(...ok) - stopMs;
}
