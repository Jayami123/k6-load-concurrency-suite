// The soak profile (plan Phase 4b task 7 §6.2): the steady rate of the knee bound, held for SOAK_DURATION_MIN minutes.
import { steadyRateFor, type KneeBoundProduct, type KneeBounds } from "../knee/bounds.ts";
import type { LoadCase, LoadProfile } from "../types.ts";

export const SOAK_DURATIONS_MIN = [30, 120] as const;

/** The soak rate is written over 10 s, as the steady rate is (4a Task 5 §3.5). */
export const SOAK_TIME_UNIT_SEC = 10;

/** The slowest single iteration in ms per product: the input of the Little's-law sizing (plan Task 7 §6.2). */
export const SOAK_MAX_LATENCY_MS: Record<KneeBoundProduct, number> = {
  // 4000 for Cal (task 7 probe, 2026-10-26): a recycled iteration (book, poll, cancel) took about 3.9 s with the VUs saturated,
  // so 2000 dropped 190 of 7200 iterations (INVALID). The pool is 1.25 x 4 x 4 = 20 VUs.
  cal: 4000,
  medusa: 5000,
  documenso: 12000,
};

/** The soak duration in seconds. SOAK_DURATION_MIN must be 30 or 120; anything else throws before any setup (ENV). */
export function soakDurationSec(raw: string | undefined): number {
  const min = Number(raw);
  if (raw === undefined || !SOAK_DURATIONS_MIN.some((m) => m === min))
    throw new Error(`ENV: SOAK_DURATION_MIN must be 30 or 120 (got "${raw ?? ""}")`);
  return min * 60;
}

/** A copy of the case whose soak profile runs at steadyRateFor(bounds, product) for durationSec. The label becomes the soak one. */
export function withSoakProfile(
  caseDef: LoadCase,
  bounds: KneeBounds,
  durationSec: number,
): LoadCase {
  const product = caseDef.product as KneeBoundProduct;
  const soak: LoadProfile = {
    rate: steadyRateFor(bounds, product),
    durationSec,
    maxLatencyMs: SOAK_MAX_LATENCY_MS[product],
    timeUnitSec: SOAK_TIME_UNIT_SEC,
  };
  return {
    ...caseDef,
    label: "soak, environment-bound",
    profiles: { ...caseDef.profiles, soak },
  };
}
