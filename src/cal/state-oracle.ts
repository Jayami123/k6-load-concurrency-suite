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

export async function readCaseAccepted(pool: pg.Pool, likePattern: string): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, CASE_ACCEPTED_SQL, [likePattern]);
  return rows[0]?.n ?? 0;
}

export async function readBookingStatus(pool: pg.Pool, bookingId: number): Promise<string> {
  const rows = await selectRows<{ status: string }>(pool, BOOKING_STATUS_SQL, [bookingId]);
  if (rows.length !== 1) throw new Error(`TEST BUG: booking ${bookingId} missing`);
  return rows[0]!.status;
}

export async function readBookingByEmail(
  pool: pg.Pool,
  email: string,
): Promise<{ id: number; uid: string }> {
  const rows = await selectRows<{ id: number; uid: string }>(pool, BOOKING_BY_EMAIL_SQL, [email]);
  if (rows.length !== 1)
    throw new Error(`TEST BUG: expected one booking for ${email}, got ${rows.length}`);
  return rows[0]!;
}
