// Medusa orders by intent (plan task 3 §6.4b): the intent of an order is the number in its cart email. Pure.

/** `ORDERS_BY_EMAIL_SQL` (src/load/reconcile/medusa.ts) with the email column; read-only through selectRows. */
export const MED_INTENT_ROWS_SQL = `SELECT id, email FROM "order" WHERE email LIKE $1 AND deleted_at IS NULL`;

const DOMAIN = "@qa.local";

/** "<prefix>-i<n>@qa.local" → n (k6/journeys/med-checkout.js:39); undefined for another prefix or a leaf that is not a whole number. */
export function medIntentOf(prefix: string, email: string): number | undefined {
  const head = `${prefix}-i`;
  if (!email.startsWith(head) || !email.endsWith(DOMAIN)) return undefined;
  const digits = email.slice(head.length, email.length - DOMAIN.length);
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
}

/** The address of the spike's probe purchase (P6-MED-LOAD-010, spike/stage.ts): an order of the run that no k6 intent made. */
export function probeEmailOf(prefix: string): string {
  return `${prefix}-probe${DOMAIN}`;
}

/**
 * Orders per intent; an order of no intent is a ghost row. Each order counts once: two orders of one intent are two rows.
 * The spike's probe purchase is not a ghost: the stage makes it after the run and it has its own address.
 */
export function medRowsByIntent(
  rows: Array<{ id: string; email: string }>,
  prefix: string,
): { rowsByIntent: Map<number, number>; ghostRows: number } {
  const rowsByIntent = new Map<number, number>();
  let ghostRows = 0;
  for (const row of rows) {
    if (row.email === probeEmailOf(prefix)) continue;
    const intent = medIntentOf(prefix, row.email);
    if (intent === undefined) ghostRows += 1;
    else rowsByIntent.set(intent, (rowsByIntent.get(intent) ?? 0) + 1);
  }
  return { rowsByIntent, ghostRows };
}
