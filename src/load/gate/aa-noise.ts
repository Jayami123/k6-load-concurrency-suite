// The A/A noise statistics (plan Phase 4b task 11 §6.2): the spread of the arm values of one A/A set, per metric. Only the steady
// profile counts (L3): a non-steady or wrong-rate arm is a TEST BUG and throws. Conventions of baseline-band.ts and medians.ts.
import { medianOf } from "../medians.ts";

export const AA_CASES = ["P6-CAL-LOAD-003", "P6-MED-LOAD-002"] as const;
export type AaCaseId = (typeof AA_CASES)[number];

/**
 * One A/A arm: its GitHub run id, its arm id "<runId>-<attempt>-<armIndex>" (unique per counted arm), its UTC day, case, profile,
 * rate and the run-level medians (the values of its whole-run k6 summary).
 */
export interface AaArm {
  runId: string;
  armId: string;
  utcDay: string; // "YYYY-MM-DD", the UTC day of the arm's start
  caseId: string;
  profile: string;
  rate: number;
  medians: Record<string, number>;
}

/** The value of one arm for one metric, with the identity the tolerance cites. */
export interface ArmMedian {
  runId: string;
  armId: string;
  utcDay: string;
  value: number;
}

/**
 * The relative spread (max - min) / median of the arm values. Throws with fewer than three arms, or with a value that is not finite
 * and above 0 (so the median is never 0 and the division is safe, L7).
 */
export function spreadOf(values: number[]): number {
  if (values.length < 3)
    throw new Error(`a/a noise: ${values.length} arm value(s), need at least 3`);
  if (values.some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error("a/a noise: every arm value must be finite and above 0");
  const median = medianOf(values);
  return (Math.max(...values) - Math.min(...values)) / median;
}

/**
 * The values of one metric of the arms of one case, in the given order. Arms of other cases are left out. Throws on a non-steady arm,
 * an arm at another rate than expectedRate (both TEST BUG, §6.4) or an arm without the metric.
 */
export function aaArmsFor(
  caseId: string,
  arms: AaArm[],
  expectedRate: number,
  metric: string,
): ArmMedian[] {
  return arms
    .filter((arm) => arm.caseId === caseId)
    .map((arm) => {
      if (arm.profile !== "steady")
        throw new Error(`a/a noise: ${arm.runId} is ${arm.profile}, not steady`);
      if (arm.rate !== expectedRate)
        throw new Error(
          `a/a noise: ${arm.runId} ran at ${arm.rate}/s, the steady rate is ${expectedRate}/s`,
        );
      const value = arm.medians[metric];
      if (value === undefined) throw new Error(`a/a noise: ${arm.runId} has no ${metric} value`);
      return { runId: arm.runId, armId: arm.armId, utcDay: arm.utcDay, value };
    });
}
