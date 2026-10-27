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
