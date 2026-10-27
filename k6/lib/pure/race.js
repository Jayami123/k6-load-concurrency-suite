// Pure: the race injected into an iteration of P6-MED-LOAD-009 (plan Phase 4b task 10 §6.4). No k6 import.

/**
 * The race of iteration i, decided by index so the counts are exact: every 20th iteration (i mod 20 = 19) cancels and fulfils the
 * order at the same moment, every 10th (i mod 10 = 9) cancels it twice. Other iterations get no race.
 * @param {number} i the iteration index (>= 0)
 * @returns {"cancel-fulfil" | "double-cancel" | null}
 */
export function raceFor(i) {
  if (!Number.isInteger(i) || i < 0)
    throw new Error("TEST BUG: iteration index must be an integer >= 0");
  if (i % 20 === 19) return "cancel-fulfil";
  if (i % 10 === 9) return "double-cancel";
  return null;
}
