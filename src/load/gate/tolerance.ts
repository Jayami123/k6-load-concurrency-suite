// The A/A tolerance rule (plan Phase 4b task 11 §6.2, Q-TOLRULE (a)) and the parse check of k6/thresholds/tolerance.json. The rule:
// T = max(FLOOR, K x S) where S is the relative spread of the three A/A arms. Conventions of baseline-band.ts and knee/bounds.ts.
import { spreadOf, type ArmMedian } from "./aa-noise.ts";

export const K = 2;
export const FLOOR = 0.1;
export const TOLERANCE_METRICS = ["p50Ms", "p95Ms", "requestsPerSec"] as const;
export type ToleranceMetric = (typeof TOLERANCE_METRICS)[number];

/**
 * The tolerance of one metric of one product, from its A/A arms. runIds are the GitHub Actions run ids that the arms came from
 * (ascending, unique, digits only: the citation). Several arms can share one run id (the arms of one dispatch), so arms counts the
 * arms, and it is the minimum of three that the rule needs.
 */
export interface Tolerance {
  metric: ToleranceMetric;
  spread: number; // (max - min) / median of the arm values
  tolerance: number; // max(FLOOR, K x spread)
  runIds: string[];
  arms: number; // >= 3
}

export interface ToleranceFile {
  schema: 1;
  metric: "A/A tolerance";
  unit: "fraction of the median (relative)";
  release: string; // "p6-phase4b"
  products: Record<string, Partial<Record<ToleranceMetric, Tolerance>>>;
}

/**
 * The tolerance of one metric from its A/A arms (one ArmMedian per arm). Throws with fewer than three arms, with a value that is not
 * finite and above 0, or with a run id that is not digits only.
 */
export function toleranceOf(metric: ToleranceMetric, arms: ArmMedian[]): Tolerance {
  const spread = spreadOf(arms.map((a) => a.value));
  const ids = [...new Set(arms.map((a) => a.runId))];
  if (!ids.every((id) => /^\d+$/.test(id)))
    throw new Error(`a/a tolerance: ${metric} has a run id that is not digits only`);
  return {
    metric,
    spread,
    tolerance: Math.max(FLOOR, K * spread),
    runIds: ids.sort((a, b) => Number(a) - Number(b)),
    arms: arms.length,
  };
}

/**
 * Validates a parsed tolerance file: schema 1, the metric and unit, per entry a known metric, at least three arms, unique digit-only
 * ascending run ids (at least one), a finite spread ≥ 0, and a tolerance equal to max(FLOOR, K x spread).
 */
export function parseTolerance(value: unknown): ToleranceFile {
  const t = value as ToleranceFile;
  if (!t || t.schema !== 1) throw new Error("a/a tolerance: schema must be 1");
  if (t.metric !== "A/A tolerance" || t.unit !== "fraction of the median (relative)")
    throw new Error("a/a tolerance: metric or unit is wrong");
  for (const [product, metrics] of Object.entries(t.products ?? {})) {
    for (const [metric, c] of Object.entries(metrics)) {
      if (!(TOLERANCE_METRICS as readonly string[]).includes(metric) || c.metric !== metric)
        throw new Error(`a/a tolerance: ${product} has an unknown metric ${metric}`);
      if (c.arms < 3 || c.runIds.length === 0)
        throw new Error(
          `a/a tolerance: ${product} ${metric} has ${c.arms} arms and ${c.runIds.length} run ids`,
        );
      if (new Set(c.runIds).size !== c.runIds.length || !c.runIds.every((id) => /^\d+$/.test(id)))
        throw new Error(`a/a tolerance: ${product} ${metric} has duplicate or non-numeric run ids`);
      for (let i = 1; i < c.runIds.length; i++)
        if (Number(c.runIds[i]) <= Number(c.runIds[i - 1]))
          throw new Error(`a/a tolerance: ${product} ${metric} run ids are not strictly ascending`);
      if (!Number.isFinite(c.spread) || c.spread < 0)
        throw new Error(`a/a tolerance: ${product} ${metric} spread must be a finite number ≥ 0`);
      if (c.tolerance !== Math.max(FLOOR, K * c.spread))
        throw new Error(
          `a/a tolerance: ${product} ${metric} tolerance is not max(FLOOR, K x spread)`,
        );
    }
  }
  return t;
}
