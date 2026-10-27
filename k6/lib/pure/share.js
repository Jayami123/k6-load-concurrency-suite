// Pure: the share of iterations that take an option, deterministic by index (plan Phase 4b task 10 §6.3). No k6 import.

/**
 * Whether iteration i takes the option whose share is `share`: over any run of n iterations the count is floor or ceil of n × share,
 * so the share holds exactly without a random draw. The promotion of P6-MED-LOAD-008 is applied to this share of carts.
 * @param {number} i the iteration index (>= 0)
 * @param {number} share the fraction in [0, 1]
 * @returns {boolean}
 */
export function shareHit(i, share) {
  if (!Number.isInteger(i) || i < 0)
    throw new Error("TEST BUG: iteration index must be an integer >= 0");
  if (!(share >= 0 && share <= 1)) throw new Error(`TEST BUG: share ${share} is outside [0, 1]`);
  return Math.floor((i + 1) * share) > Math.floor(i * share);
}
