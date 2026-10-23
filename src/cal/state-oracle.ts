import type pg from "pg";
import { selectRows } from "../oracles/pg.ts";

/** Usage row of the case's own link (the link id is unique per attempt, so one row at most). */
export const LINK_STATE_SQL = `
SELECT "usageCount"::int AS "usageCount", "maxUsageCount"::int AS "maxUsageCount"
FROM "HashedLink"
WHERE "eventTypeId" = $1 AND link = $2
`;

/** Accepted bookings whose attendee email matches the case's LIKE pattern. */
export const CASE_ACCEPTED_SQL = `
SELECT count(DISTINCT b.id)::int AS n
FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id
WHERE a.email LIKE $1 AND b.status = 'accepted'
`;

/** Every link of one event type, so a shared fixture's links can be put back after a race. */
export const EVENT_LINKS_SQL = `
SELECT link, "maxUsageCount"::int AS "maxUsageCount", "usageCount"::int AS "usageCount", "expiresAt"
FROM "HashedLink"
WHERE "eventTypeId" = $1
ORDER BY id
`;

/** Status of one booking by id. */
export const BOOKING_STATUS_SQL = `
SELECT status::text AS status FROM "Booking" WHERE id = $1
`;

/** The booking id and uid for one attendee email (the case creates one booking per email). */
export const BOOKING_BY_EMAIL_SQL = `
SELECT b.id, b.uid
FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id
WHERE a.email = $1
`;

/** The usage row of the case's own link. Throws TEST BUG when the row is missing. */
export async function readLinkState(
  pool: pg.Pool,
  eventTypeId: number,
  link: string,
): Promise<{ usageCount: number; maxUsageCount: number }> {
  const rows = await selectRows<{ usageCount: number; maxUsageCount: number }>(
    pool,
    LINK_STATE_SQL,
    [eventTypeId, link],
  );
  if (rows.length !== 1) throw new Error(`TEST BUG: link row missing for ${link}`);
  return rows[0]!;
}

/** Accepted bookings whose attendee email matches the case pattern. */
export async function readCaseAccepted(pool: pg.Pool, likePattern: string): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, CASE_ACCEPTED_SQL, [likePattern]);
  return rows[0]?.n ?? 0;
}

/** Every link of the event type, ordered by id. Read-only. */
export async function readEventLinks(
  pool: pg.Pool,
  eventTypeId: number,
): Promise<
  Array<{ link: string; maxUsageCount: number; usageCount: number; expiresAt: Date | null }>
> {
  return selectRows<{
    link: string;
    maxUsageCount: number;
    usageCount: number;
    expiresAt: Date | null;
  }>(pool, EVENT_LINKS_SQL, [eventTypeId]);
}

/** Reads the status of one booking. */
export async function readBookingStatus(pool: pg.Pool, bookingId: number): Promise<string> {
  const rows = await selectRows<{ status: string }>(pool, BOOKING_STATUS_SQL, [bookingId]);
  if (rows.length !== 1) throw new Error(`TEST BUG: booking ${bookingId} missing`);
  return rows[0]!.status;
}

/** The one booking of an attendee email. Throws TEST BUG unless exactly one exists. */
export async function readBookingByEmail(
  pool: pg.Pool,
  email: string,
): Promise<{ id: number; uid: string }> {
  const rows = await selectRows<{ id: number; uid: string }>(pool, BOOKING_BY_EMAIL_SQL, [email]);
  if (rows.length !== 1)
    throw new Error(`TEST BUG: expected one booking for ${email}, got ${rows.length}`);
  return rows[0]!;
}

/** The confirmation event type of the seed (`tennis-class`, 60 min, requires confirmation) and its host. */
export const CONFIRM_SETUP_SQL = `
SELECT e.id AS "eventTypeId", e.length, e."requiresConfirmation", u.username, u.id AS "userId"
FROM "EventType" e JOIN users u ON u.id = e."userId"
WHERE e.slug = 'tennis-class'
`;

/** The seeded confirmation event type and its host. Throws TEST BUG if the seed changed. */
export async function resolveConfirmSetup(
  pool: pg.Pool,
): Promise<{ eventTypeId: number; length: number; username: string; userId: number }> {
  const rows = await selectRows<{
    eventTypeId: number;
    length: number;
    requiresConfirmation: boolean;
    username: string;
    userId: number;
  }>(pool, CONFIRM_SETUP_SQL, []);
  const r = rows[0];
  if (rows.length !== 1 || !r || r.length !== 60 || !r.requiresConfirmation) {
    throw new Error(`TEST BUG: seed changed: tennis-class ${JSON.stringify(rows)}`);
  }
  return { eventTypeId: r.eventTypeId, length: r.length, username: r.username, userId: r.userId };
}
