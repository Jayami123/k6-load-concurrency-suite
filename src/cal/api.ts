import type pg from "pg";
import { calBaseUrlFromEnv } from "../races/env.ts";
import { readHostOverlaps, type SkippedWindow } from "./oracle.ts";
import {
  CAL_EVENT_SLUG,
  CAL_HOST_USERNAME,
  SLOT_MINUTES,
  freeSlotCandidates,
  slotEnd,
} from "./payloads.ts";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;
const MAX_WINDOWS = 6;
const CSRF_COOKIE = "calcom.csrf_token";

export async function getFreeSlots(
  fromIso: string,
  toIso: string,
  eventTypeId: number,
  eventTypeSlug: string = CAL_EVENT_SLUG,
): Promise<string[]> {
  const input = {
    json: {
      eventTypeId,
      startTime: fromIso,
      endTime: toIso,
      timeZone: "UTC",
      isTeamEvent: false,
      usernameList: [CAL_HOST_USERNAME],
      eventTypeSlug,
      orgSlug: null,
    },
  };
  const res = await fetch(
    `${calBaseUrlFromEnv()}/api/trpc/slots/getSchedule?input=${encodeURIComponent(JSON.stringify(input))}`,
  );
  const text = await res.text();
  if (res.status !== 200) {
    throw new Error(`TEST BUG: getSchedule HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const slots = JSON.parse(text).result.data.json.slots as Record<string, Array<{ time: string }>>;
  return Object.values(slots)
    .flat()
    .map((s) => s.time);
}

/** Never throws on an HTTP status; a network error propagates so fireTogether records null. */
export async function createBooking(body: unknown): Promise<{ status: number; body: string }> {
  const res = await fetch(`${calBaseUrlFromEnv()}/api/book/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

/** csrf cookie + token, then cancel. Throws `cancel <uid> HTTP <status>` unless 200. Never logs the token. */
export async function cancelBooking(uid: string): Promise<void> {
  const base = calBaseUrlFromEnv();
  const csrfRes = await fetch(`${base}/api/csrf`);
  const csrfText = await csrfRes.text();
  if (csrfRes.status !== 200) throw new Error(`cancel ${uid} csrf HTTP ${csrfRes.status}`);
  const csrfToken = (JSON.parse(csrfText) as { csrfToken?: string }).csrfToken;
  const cookie = csrfRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  if (!csrfToken || !cookie) throw new Error(`cancel ${uid} csrf cookie or token missing`);

  const res = await fetch(`${base}/api/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      uid,
      cancellationReason: "p6 cleanup",
      cancelledBy: "p6-qa@example.com",
      csrfToken,
    }),
  });
  await res.text();
  if (res.status !== 200) throw new Error(`cancel ${uid} HTTP ${res.status}`);
}

/**
 * One per spec file. next() = fresh getSchedule (28-day windows from UTC midnight today + 2 d, up to 6).
 * A slot is returned only after the read-only pool shows no non-cancelled booking of the host that
 * overlaps [start, end). Slots that fail that check are returned in `skipped`, never reused.
 */
export function createSlotAllocator(
  eventTypeId: number,
  opts: { pool: pg.Pool; userId: number; slug?: string; minutes?: number },
): {
  next(): Promise<{ start: string; end: string; skipped: SkippedWindow[] }>;
} {
  const slug = opts.slug ?? CAL_EVENT_SLUG;
  const minutes = opts.minutes ?? SLOT_MINUTES;
  const used = new Set<string>();
  return {
    async next() {
      const now = Date.now();
      const firstFrom = Math.floor(now / DAY_MS) * DAY_MS + 2 * DAY_MS;
      const skipped: SkippedWindow[] = [];
      for (let w = 0; w < MAX_WINDOWS; w++) {
        const from = firstFrom + w * WINDOW_DAYS * DAY_MS;
        const to = from + WINDOW_DAYS * DAY_MS;
        const slots = await getFreeSlots(
          new Date(from).toISOString(),
          new Date(to).toISOString(),
          eventTypeId,
          slug,
        );
        for (const start of freeSlotCandidates(slots, used, from)) {
          used.add(start);
          const end = slotEnd(start, minutes);
          const overlaps = await readHostOverlaps(opts.pool, opts.userId, start, end);
          if (overlaps.length === 0) return { start, end, skipped };
          skipped.push({ slotStart: start, slotEnd: end, overlaps });
        }
      }
      throw new Error(`TEST BUG: no free ${minutes}-min slot`);
    },
  };
}
