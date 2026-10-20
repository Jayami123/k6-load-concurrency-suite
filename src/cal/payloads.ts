import { summariseBody } from "../races/fire-together.ts";
import type { ParsedResponse } from "./invariants.ts";

export const CAL_HOST_USERNAME = "pro";
export const CAL_EVENT_SLUG = "30min";
export const SLOT_MINUTES = 30;

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
    eventTypeSlug: CAL_EVENT_SLUG,
    timeZone: "UTC",
    language: "en",
    metadata: {},
    hasHashedBookingLink: false,
  };
}

/** Earliest slot not in `used` and not before notBeforeMs. Throws TEST BUG when none. */
export function pickFreeSlot(slots: string[], used: Set<string>, notBeforeMs: number): string {
  const pick = [...slots]
    .map((s) => new Date(Date.parse(s)).toISOString())
    .sort()
    .find((s) => !used.has(s) && Date.parse(s) >= notBeforeMs);
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
