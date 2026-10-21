import type pg from "pg";
import { selectRows, waitForStable } from "../oracles/pg.ts";
import { CAL_HOST_USERNAME } from "./payloads.ts";

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

export const OVERLAP_PAIRS_SQL = `
SELECT a.id AS "aId", a.uid AS "aUid", a."eventTypeId" AS "aEventTypeId",
  to_char(a."startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "aStart",
  to_char(a."endTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "aEnd",
  b.id AS "bId", b.uid AS "bUid", b."eventTypeId" AS "bEventTypeId",
  to_char(b."startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "bStart",
  to_char(b."endTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "bEnd"
FROM "Booking" a
JOIN "Booking" b ON b."userId" = a."userId" AND a.id < b.id
  AND a."startTime" < b."endTime" AND b."startTime" < a."endTime"
WHERE a."userId" = $1 AND a.status = 'accepted' AND b.status = 'accepted'
  AND EXISTS (SELECT 1 FROM "Attendee" x WHERE x."bookingId" = a.id AND x.email LIKE $2)
  AND EXISTS (SELECT 1 FROM "Attendee" y WHERE y."bookingId" = b.id AND y.email LIKE $2)
ORDER BY a.id, b.id
`;

// Accepted bookings of a trial pattern that touch [from, to).
export const WINDOW_ACCEPTED_SQL = `
SELECT b.id, b.uid, b.status::text AS status,
  to_char(b."startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS start,
  to_char(b."endTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "end"
FROM "Booking" b
WHERE b."userId" = $1 AND b.status = 'accepted'
  AND b."startTime" < $3::timestamp AND b."endTime" > $2::timestamp
  AND EXISTS (SELECT 1 FROM "Attendee" x WHERE x."bookingId" = b.id AND x.email LIKE $4)
ORDER BY b.id
`;

// Every non-cancelled booking of the host that touches [from, to), whoever booked it (seed bookings too).
export const HOST_OVERLAP_SQL = `
SELECT b.id, b.uid, b.status::text AS status,
  to_char(b."startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS start,
  to_char(b."endTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "end"
FROM "Booking" b
WHERE b."userId" = $1 AND b.status NOT IN ('cancelled', 'rejected')
  AND b."startTime" < $3::timestamp AND b."endTime" > $2::timestamp
ORDER BY b.id
`;

export type OverlapPair = {
  aId: number;
  aUid: string;
  aEventTypeId: number | null;
  aStart: string;
  aEnd: string;
  bId: number;
  bUid: string;
  bEventTypeId: number | null;
  bStart: string;
  bEnd: string;
};

/** "1261/uid(et3 s..e) x 1262/uid(et4 s..e) | …" — ids, uids, event types and times only. */
export function pairEvidence(pairs: OverlapPair[]): string {
  return pairs
    .map(
      (p) =>
        `${p.aId}/${p.aUid}(et${p.aEventTypeId} ${p.aStart}..${p.aEnd}) x ` +
        `${p.bId}/${p.bUid}(et${p.bEventTypeId} ${p.bStart}..${p.bEnd})`,
    )
    .join(" | ");
}

export async function resolveHostSetup(
  pool: pg.Pool,
  slug = "30min",
  length = 30,
): Promise<{ userId: number; eventTypeId: number }> {
  const rows = await selectRows<{
    userId: number;
    eventTypeId: number;
    length: number;
    seatsPerTimeSlot: number | null;
    requiresConfirmation: boolean;
    periodType: string;
  }>(pool, HOST_SETUP_SQL, [CAL_HOST_USERNAME, slug]);
  const r = rows[0];
  if (
    rows.length !== 1 ||
    !r ||
    r.length !== length ||
    r.seatsPerTimeSlot !== null ||
    r.requiresConfirmation ||
    r.periodType !== "unlimited"
  ) {
    throw new Error(`TEST BUG: seed changed: pro/${slug} ${JSON.stringify(rows)}`);
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

export async function readOverlapPairs(
  pool: pg.Pool,
  userId: number,
  likePattern: string,
): Promise<OverlapPair[]> {
  return waitForStable(() =>
    selectRows<OverlapPair>(pool, OVERLAP_PAIRS_SQL, [userId, likePattern]),
  );
}

export async function readWindowAccepted(
  pool: pg.Pool,
  userId: number,
  from: string,
  to: string,
  likePattern: string,
): Promise<SlotRow[]> {
  return waitForStable(() =>
    selectRows<SlotRow>(pool, WINDOW_ACCEPTED_SQL, [
      userId,
      toDbTimestamp(from),
      toDbTimestamp(to),
      likePattern,
    ]),
  );
}

/** Non-cancelled bookings of the host that overlap [from, to). Read-only (pool is default_transaction_read_only). */
export async function readHostOverlaps(
  pool: pg.Pool,
  userId: number,
  from: string,
  to: string,
): Promise<SlotRow[]> {
  return selectRows<SlotRow>(pool, HOST_OVERLAP_SQL, [
    userId,
    toDbTimestamp(from),
    toDbTimestamp(to),
  ]);
}

/** "" when nothing overlaps, else the window and the overlapping rows (ids, uids, status, times). */
export function overlapEvidence(from: string, to: string, rows: SlotRow[]): string {
  return rows.length === 0 ? "" : `window ${from}..${to} overlaps ${rowEvidence(rows)}`;
}

/** A slot the allocator passed over because the host already had an overlapping booking. */
export type SkippedWindow = { slotStart: string; slotEnd: string; overlaps: SlotRow[] };

/** "" when nothing was skipped, else one overlapEvidence() per skipped slot. */
export function skippedEvidence(skipped: SkippedWindow[]): string {
  return skipped.map((s) => overlapEvidence(s.slotStart, s.slotEnd, s.overlaps)).join(" | ");
}
