import type pg from "pg";
import { selectRows, waitForStable } from "../oracles/pg.ts";

export const HOST_SETUP_SQL = `
SELECT u.id AS "userId", e.id AS "eventTypeId", e.length, e."seatsPerTimeSlot",
  e."requiresConfirmation", e."periodType"::text AS "periodType"
FROM users u JOIN "EventType" e ON e."userId" = u.id
WHERE u.username = $1 AND e.slug = $2
`;

// "Booking" times are timestamp without time zone, stored as UTC (DB TimeZone Etc/UTC).
export const SLOT_ACCEPTED_SQL = `
SELECT id, uid, status::text AS status,
  to_char("startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS start,
  to_char("endTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "end",
  ("idempotencyKey" IS NOT NULL) AS "hasKey"
FROM "Booking"
WHERE "userId" = $1 AND "startTime" = $2::timestamp AND "endTime" = $3::timestamp
  AND status = 'accepted'
ORDER BY id
`;

// Bookings of this case still holding a slot (the sweep cancels them; the leak check wants 0).
export const CASE_LIVE_BOOKINGS_SQL = `
SELECT DISTINCT b.id, b.uid, b.status::text AS status,
  to_char(b."startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS start,
  to_char(b."endTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "end"
FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id
WHERE a.email LIKE $1 AND b.status IN ('accepted', 'pending')
ORDER BY b.id
`;

export type SlotRow = { id: number; uid: string; status: string; start: string; end: string };

/** "2026-11-03T09:00:00Z" | "…00.000Z" | "…00+00:00" → "2026-11-03 09:00:00.000". Throws TEST BUG otherwise. */
export function toDbTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (!/(Z|\+00:00)$/.test(iso) || Number.isNaN(ms)) {
    throw new Error(`TEST BUG: not a UTC instant: ${iso}`);
  }
  return new Date(ms).toISOString().replace("T", " ").replace("Z", "");
}

/** Evidence text for a violation: ids, uids, status and times only. */
export function rowEvidence(rows: SlotRow[]): string {
  return rows
    .map((r) => `id=${r.id} uid=${r.uid} status=${r.status} ${r.start}..${r.end}`)
    .join(" | ");
}

export async function resolveHostSetup(
  pool: pg.Pool,
): Promise<{ userId: number; eventTypeId: number }> {
  const rows = await selectRows<{
    userId: number;
    eventTypeId: number;
    length: number;
    seatsPerTimeSlot: number | null;
    requiresConfirmation: boolean;
    periodType: string;
  }>(pool, HOST_SETUP_SQL, ["pro", "30min"]);
  const r = rows[0];
  if (
    rows.length !== 1 ||
    !r ||
    r.length !== 30 ||
    r.seatsPerTimeSlot !== null ||
    r.requiresConfirmation ||
    r.periodType !== "unlimited"
  ) {
    throw new Error(`TEST BUG: seed changed: pro/30min ${JSON.stringify(rows)}`);
  }
  return { userId: r.userId, eventTypeId: r.eventTypeId };
}

export async function readSlotAccepted(
  pool: pg.Pool,
  userId: number,
  start: string,
  end: string,
): Promise<Array<SlotRow & { hasKey: boolean }>> {
  return waitForStable(() =>
    selectRows<SlotRow & { hasKey: boolean }>(pool, SLOT_ACCEPTED_SQL, [
      userId,
      toDbTimestamp(start),
      toDbTimestamp(end),
    ]),
  );
}

export async function caseLiveBookings(pool: pg.Pool, likePattern: string): Promise<SlotRow[]> {
  return selectRows<SlotRow>(pool, CASE_LIVE_BOOKINGS_SQL, [likePattern]);
}

/** [] when no live booking of the case remains, else one TEST BUG line with ids/uids only. */
export async function leakCheck(pool: pg.Pool, likePattern: string): Promise<string[]> {
  const rows = await caseLiveBookings(pool, likePattern);
  if (rows.length === 0) return [];
  return [`TEST BUG: leak live bookings attendee LIKE ${likePattern}: ${rowEvidence(rows)}`];
}
