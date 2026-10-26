// Pure: the concurrent pair share of P6-DOC-LOAD-003 (plan Phase 4b task 9 §6.3). No k6 import.

/**
 * The pair stream's rate: rate × pairShare, run in addition to the sequential stream at `rate`. The scenario rates of the sequential
 * stream never change with the share. The pair stream is written over `timeUnitSec` (openModelScenario), so the share must give a
 * whole number of pair starts in that unit, at least one; otherwise the scenario cannot be built and the whole case fails to load.
 * @param {number} rate the sequential steady rate (per second)
 * @param {number} pairShare the concurrent share, above 0 and at most 1 (proposal 0.1)
 * @param {number} [timeUnitSec] the unit of the pair scenario, in seconds (the case uses 10)
 */
export function pairRateFor(rate, pairShare, timeUnitSec = 10) {
  if (!(pairShare > 0 && pairShare <= 1))
    throw new Error("TEST BUG: pairShare must be above 0 and at most 1");
  const starts = rate * pairShare * timeUnitSec;
  if (Math.abs(starts - Math.round(starts)) > 1e-9 || Math.round(starts) < 1)
    throw new Error(
      `TEST BUG: pairShare ${pairShare} gives ${starts} pair starts per ${timeUnitSec} s; it must give a whole number of at least 1`,
    );
  return Math.round(rate * pairShare * 1000) / 1000;
}

/**
 * The fraction of all documents that are pairs: pairShare / (1 + pairShare). A share of 0.1 gives 9.1 %, not 10 %.
 * @param {number} pairShare
 */
export function pairFraction(pairShare) {
  return pairShare / (1 + pairShare);
}
