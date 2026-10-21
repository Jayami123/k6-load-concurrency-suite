import { summariseBody } from "../races/fire-together.ts";
import type { ParsedResponse } from "./invariants.ts";

export const CAL_HOST_USERNAME = "pro";
export const CAL_EVENT_SLUG = "30min";
export const SLOT_MINUTES = 30;
export const CAL_EVENT_SLUG_60 = "60min";
export const LONG_SLOT_MINUTES = 60;

export function attendeeEmail(prefix: string, leaf: string): string {
  return `${prefix.toLowerCase()}-${leaf}@example.com`;
}

export function slotEnd(startIso: string, minutes = SLOT_MINUTES): string {
  return new Date(Date.parse(startIso) + minutes * 60_000).toISOString();
}

/** Same instant three ways: "…Z", "….000Z", "…+00:00". Input must be a UTC ISO string. */
export function timeSpellings(iso: string): [string, string, string] {
  const base = new Date(Date.parse(iso)).toISOString(); // ….000Z
  const z = base.replace(".000Z", "Z");
  return [z, base, base.replace("Z", "+00:00").replace(".000+", "+")];
}

export function bookingBody(input: {
  start: string;
  end: string;
  email: string;
  name: string;
  eventTypeId: number;
  eventTypeSlug?: string;
}): Record<string, unknown> {
  return {
    responses: {
      name: input.name,
      email: input.email,
      guests: [],
      location: { value: "integrations:daily", optionValue: "" },
    },
    user: CAL_HOST_USERNAME,
    start: input.start,
    end: input.end,
    eventTypeId: input.eventTypeId,
    eventTypeSlug: input.eventTypeSlug ?? CAL_EVENT_SLUG,
    timeZone: "UTC",
    language: "en",
    metadata: {},
    hasHashedBookingLink: false,
  };
}

/** Earliest slot not in `used` and not before notBeforeMs. Throws TEST BUG when none. */
/** Unused slot starts at or after notBeforeMs, normalised to ISO and sorted earliest first. */
export function freeSlotCandidates(
  slots: string[],
  used: Set<string>,
  notBeforeMs: number,
): string[] {
  return [...slots]
    .map((s) => new Date(Date.parse(s)).toISOString())
    .sort()
    .filter((s) => !used.has(s) && Date.parse(s) >= notBeforeMs);
}

export function pickFreeSlot(slots: string[], used: Set<string>, notBeforeMs: number): string {
  const [pick] = freeSlotCandidates(slots, used, notBeforeMs);
  if (!pick) throw new Error("TEST BUG: no free 30-min slot in window");
  return pick;
}

/** Never throws: non-JSON bodies give nulls. */
export function parseBookingResponse(status: number | null, body: string): ParsedResponse {
  const summary = summariseBody(status, body);
  try {
    const json = JSON.parse(body) as { uid?: unknown; status?: unknown; message?: unknown };
    const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
    return {
      status,
      uid: str(json.uid),
      bodyStatus: str(json.status),
      message: str(json.message),
      summary,
    };
  } catch {
    return { status, uid: null, bodyStatus: null, message: null, summary };
  }
}

export type OverlapShape = "same-start" | "inside";

export type OverlapLeg = {
  role: "60" | "30";
  eventTypeId: number;
  eventTypeSlug: string;
  start: string;
  end: string;
};

/** Odd trials share the start, even trials put the 30 in the second half (plan D3). */
export function overlapShapeForTrial(trial: number): OverlapShape {
  return trial % 2 === 1 ? "same-start" : "inside";
}

/** Leg 0 is always the 60 [T, T+60); leg 1 the 30 at T or T+30. T must be a UTC ISO instant. */
export function overlapLegs(
  windowStart: string,
  shape: OverlapShape,
  ids: { eventTypeId30: number; eventTypeId60: number },
): [OverlapLeg, OverlapLeg] {
  const t = new Date(Date.parse(windowStart)).toISOString();
  const start30 = shape === "same-start" ? t : slotEnd(t, SLOT_MINUTES);
  return [
    {
      role: "60",
      eventTypeId: ids.eventTypeId60,
      eventTypeSlug: CAL_EVENT_SLUG_60,
      start: t,
      end: slotEnd(t, LONG_SLOT_MINUTES),
    },
    {
      role: "30",
      eventTypeId: ids.eventTypeId30,
      eventTypeSlug: CAL_EVENT_SLUG,
      start: start30,
      end: slotEnd(start30, SLOT_MINUTES),
    },
  ];
}

/** Half-open overlap, the same predicate as OVERLAP_PAIRS_SQL. */
export function windowsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}
