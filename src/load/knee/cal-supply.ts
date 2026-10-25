// The Cal knee's slot supply (plan task 2 §6.4): how many slots a plan needs, how many days of getSchedule hold them, and which
// starts are picked. Pure.
import type { KneePlanSpec } from "../types.ts";

/** ceil(1.05 x sum of rate x holdSec over the steps): the slots the plan can book, with a 5 % margin. */
export function slotsNeeded(p: KneePlanSpec): number {
  let sum = 0;
  for (let i = 0; i < p.maxSteps; i += 1) sum += (p.startRate + i * p.stepRate) * p.holdSec;
  return Math.ceil(sum * 1.05);
}

/** Days of getSchedule that hold S slots: ceil(S / 11.4) + 14 (about 11.4 free slots a day, probe of 2026-10-25). */
export function supplyWindowDays(slots: number): number {
  return Math.ceil(slots / 11.4) + 14;
}

/** Ascending, unique ISO starts, the first `count`. Throws "TEST BUG: slot supply ..." when fewer are free. */
export function pickSlotStarts(offered: string[], count: number): string[] {
  const starts = [...new Set(offered.map((s) => new Date(s).toISOString()))].sort();
  if (starts.length < count)
    throw new Error(`TEST BUG: slot supply ${starts.length} < needed ${count}`);
  return starts.slice(0, count);
}
