// The flags-on versus flags-off A/A verdict for P6-X-LOAD-009 (plan §5.4, §6). Each metric: relDiff = |medOn - medOff| / pooled,
// compared with the stored tolerance (k6/thresholds/tolerance.json, products.medusa). Thresholds are read at run time, never copied.
import { medianOf } from "../medians.ts";
import { MIN_ARMS } from "../gate/tolerance.ts";

export const AA_METRICS = ["p50Ms", "p95Ms", "requestsPerSec"] as const;
export type AaMetric = (typeof AA_METRICS)[number];
export type AaVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface AaArm {
  state: "off" | "on";
  valid: boolean;
  values: Record<AaMetric, number>;
}

export interface AaMetricResult {
  medOff: number;
  medOn: number;
  pooled: number;
  relDiff: number;
  tolerance: number;
  verdict: AaVerdict;
}

/** The medusa entries of the tolerance file, metric by metric. Missing entries throw: a verdict never uses a guessed tolerance. */
export function medusaTolerances(file: unknown): Record<AaMetric, number> {
  const medusa = (file as { products?: { medusa?: Record<string, { tolerance?: number }> } })
    .products?.medusa;
  return Object.fromEntries(
    AA_METRICS.map((metric) => {
      const tolerance = medusa?.[metric]?.tolerance;
      if (typeof tolerance !== "number")
        throw new Error(`aa-flags: tolerance file has no medusa entry for ${metric}`);
      return [metric, tolerance];
    }),
  ) as Record<AaMetric, number>;
}

/** relDiff = |medOn - medOff| / pooled, with the tolerance from the file. Fewer than MIN_ARMS VALID arms in a state, or any INVALID
 *  arm, makes the metric INCONCLUSIVE (never PASS). The overall verdict is INCONCLUSIVE, then FAIL, then PASS. */
/** The verdict CLI's exit code: only PASS exits 0, so a FAIL or INCONCLUSIVE turns the tier-aa job red. */
export function aaExitCode(verdict: AaVerdict): 0 | 1 {
  return verdict === "PASS" ? 0 : 1;
}

export function aaFlagsVerdict(
  arms: AaArm[],
  tolerances: Record<string, number>,
): { verdict: AaVerdict; metrics: Record<AaMetric, AaMetricResult> } {
  const metrics = {} as Record<AaMetric, AaMetricResult>;
  for (const metric of AA_METRICS) {
    const tolerance = tolerances[metric];
    if (tolerance === undefined)
      throw new Error(`aa-flags: tolerance file has no medusa entry for ${metric}`);
    const off = arms.filter((a) => a.state === "off");
    const on = arms.filter((a) => a.state === "on");
    const validOff = off.filter((a) => a.valid).map((a) => a.values[metric]);
    const validOn = on.filter((a) => a.valid).map((a) => a.values[metric]);
    const anyInvalid = arms.some((a) => !a.valid);
    const pooled = medianOf([...validOff, ...validOn].length > 0 ? [...validOff, ...validOn] : [0]);
    const medOff = validOff.length > 0 ? medianOf(validOff) : 0;
    const medOn = validOn.length > 0 ? medianOf(validOn) : 0;
    const relDiff = pooled > 0 ? Math.abs(medOn - medOff) / pooled : Number.NaN;
    const enough = validOff.length >= MIN_ARMS && validOn.length >= MIN_ARMS;
    const verdict: AaVerdict =
      anyInvalid || !enough || !Number.isFinite(relDiff)
        ? "INCONCLUSIVE"
        : relDiff <= tolerance
          ? "PASS"
          : "FAIL";
    metrics[metric] = { medOff, medOn, pooled, relDiff, tolerance, verdict };
  }
  const all = AA_METRICS.map((m) => metrics[m].verdict);
  const verdict: AaVerdict = all.includes("INCONCLUSIVE")
    ? "INCONCLUSIVE"
    : all.includes("FAIL")
      ? "FAIL"
      : "PASS";
  return { verdict, metrics };
}
