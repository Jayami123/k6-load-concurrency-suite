// The steady profile of a case (plan Phase 4 task 5 §6.3): 50 % of the knee's lower bound, held for 120 s on the full profile.
import { steadyRateFor, type KneeBoundProduct, type KneeBounds } from "./knee/bounds.ts";
import type { LoadCase } from "./types.ts";

export const STEADY_DURATION_SEC = { full: 120, pr: 30 } as const;

/** The rate of the steady profile is written over 10 s, so a half of a bound with one decimal is a whole number of starts. */
export const STEADY_TIME_UNIT_SEC = 10;

/**
 * A copy of the case whose steady profile runs at steadyRateFor(bounds, product), for 120 s, with twice the full profile's slowest
 * iteration. The label becomes the steady one. Throws when the bounds lack the product or the rate is under 0.1.
 */
export function withSteadyProfile(caseDef: LoadCase, bounds: KneeBounds): LoadCase {
  const rate = steadyRateFor(bounds, caseDef.product as KneeBoundProduct);
  return {
    ...caseDef,
    label: "steady baseline, environment-bound",
    profiles: {
      ...caseDef.profiles,
      steady: {
        rate,
        durationSec: STEADY_DURATION_SEC.full,
        maxLatencyMs: caseDef.profiles.full.maxLatencyMs * 2,
        timeUnitSec: STEADY_TIME_UNIT_SEC,
      },
    },
  };
}
