// The Cal knee's slot supply (plan task 2 §6.4): how many slots a plan needs, how many days of getSchedule hold them, and which
// starts are picked. Pure.
import type { KneePlanSpec } from "../types.ts";

/**
 * ceil(1.05 x arrivals): the slots the plan can book, with a 5 % margin. Arrivals are the holds (rate x holdSec) and the ramps
 * before them (the mean of the previous and the next rate x rampSec; the first ramp starts at startRate). Every iteration, ramp or
 * hold, books one slot, so a late stop that reaches the last step must not run out.
 */
export function slotsNeeded(p: KneePlanSpec): number {
  let sum = 0;
  for (let i = 0; i < p.maxSteps; i += 1) {
    const rate = p.startRate + i * p.stepRate;
    const from = i === 0 ? p.startRate : rate - p.stepRate;
    sum += rate * p.holdSec + ((from + rate) / 2) * p.rampSec;
  }
  return Math.ceil(sum * 1.05);
}

/** Days of getSchedule that hold S slots: ceil(S / 11.4) + 14 (about 11.4 free slots a day, probe of 2026-10-25). */
export function supplyWindowDays(slots: number): number {
  return Math.ceil(slots / 11.4) + 14;
}

/** The length of a Cal slot (the event type is 30min, calSetupWith). */
export const SLOT_MS = 30 * 60_000;

/**
 * Drops every offered start that a host booking overlaps, by the predicate of HOST_OVERLAP_SQL (src/cal/oracle.ts) in exact ms:
 * bookingStart < slotStart + slotMs && bookingEnd > slotStart. Pending counts as busy, as the README says.
 */
export function freeOfHostBookings(
  offered: string[],
  busy: Array<{ start: string; end: string }>,
  slotMs = SLOT_MS,
): string[] {
  return offered.filter((s) => {
    const slot = Date.parse(s);
    return !busy.some((b) => Date.parse(b.start) < slot + slotMs && Date.parse(b.end) > slot);
  });
}

/** Ascending, unique ISO starts, the first `count`. Throws "TEST BUG: slot supply ..." when fewer are free. */
export function pickSlotStarts(offered: string[], count: number): string[] {
  const starts = [...new Set(offered.map((s) => new Date(s).toISOString()))].sort();
  if (starts.length < count)
    throw new Error(`TEST BUG: slot supply ${starts.length} < needed ${count}`);
  return starts.slice(0, count);
}
