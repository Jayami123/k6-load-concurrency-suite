/** One telemetry sample of a soak: the epoch time and the value of one metric (rssMb, fds, db.total, ...). */
export interface SoakPoint {
  tMs: number; // epoch milliseconds, the telemetry field `t`
  value: number;
}

export interface SlopeResult {
  n: number; // points after warm-up
  slopePerMin: number | null; // least-squares slope, units per minute; null when n < 2
  theilSenPerMin: number | null; // median of pairwise slopes (robust to one step); null when n < 2
  stepsOver: number; // consecutive pairs whose change is more than 10 % of the window's median (a step, M-F2)
  reason: "ok" | "no samples" | "too few samples";
}

/** Above this many points, Theil–Sen uses an evenly strided subset, so the pairwise work stays bounded. */
export const THEIL_SEN_MAX_POINTS = 600;

/** Warm-up in seconds for a soak of durationSec: max(300, 0.2 x durationSec). */
export function warmupSecFor(durationSec: number): number {
  return Math.max(300, 0.2 * durationSec);
}

/** The points at or after the end of warm-up, in time order. */
export function postWarmup(points: SoakPoint[], startMs: number, warmupSec: number): SoakPoint[] {
  const from = startMs + warmupSec * 1000;
  return points.filter((p) => p.tMs >= from).sort((a, b) => a.tMs - b.tMs);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Least-squares slope of value against time (minutes) over the points at or after warm-up, with the Theil–Sen slope and a
 * step count next to it. n = 0 returns reason "no samples" and never divides by zero (L7); n = 1 returns "too few samples".
 */
export function soakSlope(points: SoakPoint[], startMs: number, warmupSec: number): SlopeResult {
  const pts = postWarmup(points, startMs, warmupSec);
  const n = pts.length;
  if (n === 0)
    return { n, slopePerMin: null, theilSenPerMin: null, stepsOver: 0, reason: "no samples" };
  if (n < 2)
    return { n, slopePerMin: null, theilSenPerMin: null, stepsOver: 0, reason: "too few samples" };

  const x = pts.map((p) => (p.tMs - pts[0]!.tMs) / 60_000);
  const y = pts.map((p) => p.value);
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - meanX) * (y[i]! - meanY);
    sxx += (x[i]! - meanX) ** 2;
  }
  if (sxx === 0)
    return { n, slopePerMin: null, theilSenPerMin: null, stepsOver: 0, reason: "too few samples" };

  const stride = Math.max(1, Math.ceil(n / THEIL_SEN_MAX_POINTS));
  const idx = Array.from({ length: Math.ceil(n / stride) }, (_, k) => k * stride);
  const pairwise: number[] = [];
  for (let a = 0; a < idx.length; a++) {
    for (let b = a + 1; b < idx.length; b++) {
      const i = idx[a]!;
      const j = idx[b]!;
      if (x[j] !== x[i]) pairwise.push((y[j]! - y[i]!) / (x[j]! - x[i]!));
    }
  }

  const medianY = median(y);
  const threshold = 0.1 * Math.abs(medianY);
  let stepsOver = 0;
  for (let i = 1; i < n; i++) {
    if (Math.abs(y[i]! - y[i - 1]!) > threshold) stepsOver++;
  }

  return {
    n,
    slopePerMin: sxy / sxx,
    theilSenPerMin: pairwise.length > 0 ? median(pairwise) : null,
    stepsOver,
    reason: "ok",
  };
}
