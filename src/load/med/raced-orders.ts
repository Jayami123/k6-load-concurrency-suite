// Which run orders a cancel race was injected into (plan Phase 4b task 10 §6.4). Pure: the caller reads the rows.
import { raceFor } from "../../../k6/lib/pure/race.js";

/** The iteration index of a run order. Its email is `<prefix>-i<n>@qa.local` (iterationId and the checkout journey), or null. */
export function iterationOfEmail(email: string): number | null {
  const m = /-i(\d+)@qa\.local$/.exec(email);
  return m ? Number(m[1]) : null;
}

/** True when raceFor injected a race into this order's iteration. Other orders never get a second request, so they are not judged. */
export function isRacedEmail(email: string): boolean {
  const i = iterationOfEmail(email);
  return i !== null && raceFor(i) !== null;
}

/**
 * Race-selected orders whose race was never sent: the completion response was lost, so the order is stored but no request
 * reached http.batch. Such an order is an unconfirmed injection, not a product failure.
 */
export function unconfirmedInjections(racedOrders: number, racesSent: number): number {
  return Math.max(0, racedOrders - racesSent);
}

/** The race an email's iteration was given by raceFor, or null for a plain checkout. */
export function raceOfEmail(email: string): "cancel-fulfil" | "double-cancel" | null {
  const i = iterationOfEmail(email);
  return i === null ? null : raceFor(i);
}

/**
 * The per-order race lines the k6 case logs (`P6-MED-LOAD-009 race <race> order <id> statuses <s1,s2>`): the HTTP status of each
 * race request, keyed by order id. Other lines are ignored.
 */
export function parseRaceLog(text: string): Map<string, { race: string; statuses: number[] }> {
  const out = new Map<string, { race: string; statuses: number[] }>();
  for (const m of text.matchAll(/P6-MED-LOAD-009 race (\S+) order (\S+) statuses ([0-9,]+)/g)) {
    const [, race = "", order = "", statuses = ""] = m;
    out.set(order, { race, statuses: statuses.split(",").map(Number) });
  }
  return out;
}
