// The Medusa knee's stock (plan task 3 §6.2). Pure.
import type { KneePlanSpec } from "../types.ts";

/**
 * ceil(1.05 x sum of rate x holdSec over the steps) + 20: more units than the plan can order, so a stock-out never ends a run.
 * The sum is taken in whole tenths of a rate, so 0.5 steps add exactly.
 */
export function stockForKnee(p: KneePlanSpec): number {
  let tenths = 0;
  for (let i = 0; i < p.maxSteps; i += 1) {
    const rate = Math.round((p.startRate + i * p.stepRate) * 10);
    tenths += rate * p.holdSec;
  }
  return Math.ceil((tenths * 105) / 1000) + 20;
}
