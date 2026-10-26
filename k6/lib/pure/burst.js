// Pure: the schedule of one burst (plan Phase 4b task 8 §6.2). No k6 import.

export const BURST_WINDOW_MS = 100;

/**
 * The offsets, in ms from the burst start, of N simultaneous attempts. They are spread evenly over the 100 ms window, so the spread
 * rule of classifyBurst holds by construction.
 * @param {number} n attempts (>= 1)
 * @returns {number[]}
 */
export function burstOffsetsMs(n) {
  if (!Number.isInteger(n) || n < 1)
    throw new Error("TEST BUG: burst needs an integer of at least 1 attempt");
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((i * BURST_WINDOW_MS) / (n - 1)));
}

/**
 * The plan of the burst from the case config: attempts N and the start inside the steady hold (defaults 8 and 40 s, §6.2).
 * @param {{ burstAttempts?: number, burstAtSec?: number }} cfg
 */
export function burstPlan(cfg) {
  const attempts = cfg.burstAttempts ?? 8;
  const startSec = cfg.burstAtSec ?? 40;
  return { attempts, startSec, offsetsMs: burstOffsetsMs(attempts) };
}
