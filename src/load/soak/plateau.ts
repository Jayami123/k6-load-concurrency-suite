import { postWarmup, type SoakPoint } from "./slope.ts";

export interface PlateauResult {
  n: number;
  middleMedian: number | null; // median of the middle third after warm-up; null when n < 3
  lastMedian: number | null; // median of the last third; null when n < 3
  ratio: number | null; // lastMedian / middleMedian; null when either is null or middleMedian is 0
  reason: "ok" | "no samples" | "too few samples" | "zero middle median";
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Compares the median of the last third of the post-warm-up points with the median of the middle third. It states no
 * verdict: the caller applies the threshold from k6/thresholds/soak-bounds.json (Q-SOAKTHR).
 */
export function plateauRatio(
  points: SoakPoint[],
  startMs: number,
  warmupSec: number,
): PlateauResult {
  const pts = postWarmup(points, startMs, warmupSec);
  const n = pts.length;
  if (n === 0)
    return { n, middleMedian: null, lastMedian: null, ratio: null, reason: "no samples" };
  if (n < 3)
    return { n, middleMedian: null, lastMedian: null, ratio: null, reason: "too few samples" };

  const values = pts.map((p) => p.value);
  const third = Math.floor(n / 3);
  const middleMedian = median(values.slice(third, 2 * third));
  const lastMedian = median(values.slice(2 * third));
  if (middleMedian === 0)
    return { n, middleMedian, lastMedian, ratio: null, reason: "zero middle median" };
  return { n, middleMedian, lastMedian, ratio: lastMedian / middleMedian, reason: "ok" };
}
