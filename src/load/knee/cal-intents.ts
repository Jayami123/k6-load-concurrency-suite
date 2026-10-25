// Cal bookings by intent (plan task 2 §6.4b): the intent of a booking is the number in its attendee email. Pure.

/** Same two tables and the same LIKE on a.email as CASE_LIVE_BOOKINGS_SQL (src/cal/oracle.ts); read-only through selectRows. */
export const CAL_INTENT_ROWS_SQL = `SELECT DISTINCT b.id, a.email FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id WHERE a.email LIKE $1 AND b.status IN ('accepted', 'pending')`;

const DOMAIN = "@example.com";

/** "<prefix>-i<n>@example.com" → n; undefined when the email is not of this prefix or n is not a whole number (k6/lib/pure/prefix.js attendeeEmail). */
export function calIntentOf(prefix: string, email: string): number | undefined {
  const head = `${prefix}-i`;
  if (!email.startsWith(head) || !email.endsWith(DOMAIN)) return undefined;
  const digits = email.slice(head.length, email.length - DOMAIN.length);
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
}

/** Rows per intent; a row that maps to no intent is a ghost row. Counts booking ids, so one booking with two attendee rows is one row. */
export function calRowsByIntent(
  rows: Array<{ id: number; email: string }>,
  prefix: string,
): { rowsByIntent: Map<number, number>; ghostRows: number } {
  const rowsByIntent = new Map<number, number>();
  const seenGhost = new Set<number>();
  const seenIntent = new Set<string>();
  let ghostRows = 0;
  for (const row of rows) {
    const intent = calIntentOf(prefix, row.email);
    if (intent === undefined) {
      if (!seenGhost.has(row.id)) {
        seenGhost.add(row.id);
        ghostRows += 1;
      }
      continue;
    }
    const key = `${row.id}:${intent}`;
    if (seenIntent.has(key)) continue;
    seenIntent.add(key);
    rowsByIntent.set(intent, (rowsByIntent.get(intent) ?? 0) + 1);
  }
  return { rowsByIntent, ghostRows };
}
