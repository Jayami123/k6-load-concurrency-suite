/** Sampler overhead (P6-X-LOAD-006): the median of the runs with the sampler must stay within these margins of the runs without it. */
export const OVERHEAD_MARGINS = { requestsPct: 2, p95Pct: 10, droppedMax: 0 } as const; // probe noise: 0.1 % and 1.7 %

export interface OverheadRun {
  requests: number;
  p95Ms: number;
  dropped: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Medians of the "with" and "without" groups (at least 3 runs each); returns one line per broken margin. Empty = within margins. */
export function evaluateOverhead(
  without: OverheadRun[],
  withSampler: OverheadRun[],
  margins = OVERHEAD_MARGINS,
): string[] {
  const out: string[] = [];
  const reqA = median(without.map((r) => r.requests));
  const reqB = median(withSampler.map((r) => r.requests));
  const reqPct = (Math.abs(reqB - reqA) / reqA) * 100;
  if (reqPct > margins.requestsPct)
    out.push(`requests moved ${reqPct.toFixed(1)} % (limit ${margins.requestsPct} %)`);
  const pA = median(without.map((r) => r.p95Ms));
  const pB = median(withSampler.map((r) => r.p95Ms));
  const pPct = (Math.abs(pB - pA) / pA) * 100;
  if (pPct > margins.p95Pct) out.push(`p95 moved ${pPct.toFixed(1)} % (limit ${margins.p95Pct} %)`);
  const dropped = Math.max(...withSampler.map((r) => r.dropped));
  if (dropped > margins.droppedMax)
    out.push(`dropped iterations with the sampler: ${dropped} (limit ${margins.droppedMax})`);
  return out;
}
