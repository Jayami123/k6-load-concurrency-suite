/** Pure: a gap is a difference between consecutive sample times larger than factor x intervalMs (default 2). Unsorted input is sorted first. */
export function findGaps(
  timesMs: number[],
  intervalMs: number,
  factor = 2,
): Array<{ fromMs: number; toMs: number; lengthMs: number }> {
  const sorted = [...timesMs].sort((a, b) => a - b);
  const gaps: Array<{ fromMs: number; toMs: number; lengthMs: number }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const length = sorted[i]! - sorted[i - 1]!;
    if (length > factor * intervalMs)
      gaps.push({ fromMs: sorted[i - 1]!, toMs: sorted[i]!, lengthMs: length });
  }
  return gaps;
}
