/** Quarter of the fastest measured complete latency, never above the old fixed 100 ms and never below 5 ms. */
export function stormTimeoutFor(minCompleteMs: number): number {
  if (!Number.isFinite(minCompleteMs) || minCompleteMs <= 0)
    throw new Error("TEST BUG: no complete latency measured");
  return Math.min(100, Math.max(5, Math.floor(minCompleteMs / 4)));
}
