// Pure sizing helpers for the constant-arrival-rate scenarios. No k6 import: Node unit tests load this file.

/**
 * Little's law with headroom: VUs a constant-arrival-rate scenario must pre-allocate so k6 never grows the pool mid-run (plan §3.4 fact 4).
 * @param {{ rate: number, timeUnitSec?: number, maxLatencyMs: number, safety?: number, min?: number }} o
 * @returns {number}
 */
export function preAllocatedVUs({ rate, timeUnitSec = 1, maxLatencyMs, safety = 1.25, min = 1 }) {
  assertPositive("rate", rate);
  assertPositive("maxLatencyMs", maxLatencyMs);
  return Math.max(min, Math.ceil((rate / timeUnitSec) * (maxLatencyMs / 1000) * safety));
}

/**
 * @param {number} preAllocated
 * @param {number} [headroom]
 * @returns {number}
 */
export function maxVUs(preAllocated, headroom = 1.5) {
  return Math.ceil(preAllocated * headroom);
}

/**
 * @param {number} rate
 * @param {number} durationSec
 * @param {number} [timeUnitSec]
 * @returns {number}
 */
export function plannedIterations(rate, durationSec, timeUnitSec = 1) {
  return Math.round((rate / timeUnitSec) * durationSec);
}

/**
 * @param {string} name
 * @param {number} v
 */
function assertPositive(name, v) {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a positive number, got ${v}`);
}
