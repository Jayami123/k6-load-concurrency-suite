// Pure: the concurrent pair share of P6-DOC-LOAD-003 (plan Phase 4b task 9 §6.3). No k6 import.

/**
 * The pair stream's rate: rate × pairShare, run in addition to the sequential stream at `rate`. The scenario rates of the sequential
 * stream never change with the share.
 * @param {number} rate the sequential steady rate (per second)
 * @param {number} pairShare the concurrent share, above 0 and at most 1 (proposal 0.1)
 */
export function pairRateFor(rate, pairShare) {
  if (!(pairShare > 0 && pairShare <= 1))
    throw new Error("TEST BUG: pairShare must be above 0 and at most 1");
  return Math.round(rate * pairShare * 1000) / 1000;
}

/**
 * The fraction of all documents that are pairs: pairShare / (1 + pairShare). A share of 0.1 gives 9.1 %, not 10 %.
 * @param {number} pairShare
 */
export function pairFraction(pairShare) {
  return pairShare / (1 + pairShare);
}
