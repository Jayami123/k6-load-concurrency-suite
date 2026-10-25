// The Medusa knee's stock (plan task 3 §6.2). Pure.
import type { KneePlanSpec } from "../types.ts";

/**
 * ceil(1.05 x arrivals) + 20: more units than the plan can order, so a stock-out never ends a run. Arrivals are the holds
 * (rate x holdSec) and the ramps before them (the mean of the previous and the next rate x rampSec; the first ramp starts at
 * startRate). The sum is taken in whole tenths of a rate, so 0.5 steps add exactly.
 */
export function stockForKnee(p: KneePlanSpec): number {
  let tenths = 0;
  let previous = Math.round(p.startRate * 10);
  for (let i = 0; i < p.maxSteps; i += 1) {
    const rate = Math.round((p.startRate + i * p.stepRate) * 10);
    tenths += rate * p.holdSec + ((previous + rate) * p.rampSec) / 2;
    previous = rate;
  }
  return Math.ceil((tenths * 105) / 1000) + 20;
}
