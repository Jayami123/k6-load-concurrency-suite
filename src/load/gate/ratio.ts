// The A/B ratios (plan Phase 4b task 12 §6.3): each B arm's median over the median of the A arms. A zero or non-finite median is a
// TEST BUG (L7: never a divide by zero). Conventions of medians.ts.
import { medianOf } from "../medians.ts";

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** One ratio: b over aMedian. Throws (TEST BUG) unless both are finite and above 0. */
export function ratioOf(b: number, aMedian: number): number {
  if (!positive(b) || !positive(aMedian))
    throw new Error("a/b ratio: TEST BUG: a median must be finite and above 0");
  return b / aMedian;
}

/** One ratio per B arm: each B value over the median of the A values. Throws (TEST BUG) on an A or B value that is not positive. */
export function ratiosOf(aValues: number[], bValues: number[]): number[] {
  if (aValues.length === 0 || aValues.some((v) => !positive(v)))
    throw new Error("a/b ratio: TEST BUG: every A value must be finite and above 0");
  const aMedian = medianOf(aValues);
  return bValues.map((b) => ratioOf(b, aMedian));
}
