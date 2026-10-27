// The A/A tolerance rule (plan Phase 4b task 11 §6.2, Q-TOLRULE (a)) and the parse check of k6/thresholds/tolerance.json. The rule:
// T = max(FLOOR, K x S) where S is the relative spread of the counted A/A arms. Conventions of baseline-band.ts and knee/bounds.ts.
import { spreadOf, type ArmMedian } from "./aa-noise.ts";

export const K = 2;
export const FLOOR = 0.1;
export const MIN_ARMS = 3;
export const MIN_RUNS = 2;
export const TOLERANCE_METRICS = ["p50Ms", "p95Ms", "requestsPerSec"] as const;
export type ToleranceMetric = (typeof TOLERANCE_METRICS)[number];

/**
 * The tolerance of one metric of one product, from its counted A/A arms.
 * - arms: the arm ids "<runId>-<attempt>-<armIndex>" (ascending, unique). The arm count is what the rule needs (at least three).
 * - runIds: the distinct GitHub Actions runs the arms came from (ascending, digits only): the citation.
 * - utcDays: the distinct UTC days of those runs (ascending). The committed set needs at least two runs on different days (Q-TOLRULE).
 */
export interface Tolerance {
  metric: ToleranceMetric;
  spread: number; // (max - min) / median of the arm values
  tolerance: number; // max(FLOOR, K x spread)
  runIds: string[];
  utcDays: string[];
  arms: string[];
}

export interface ToleranceFile {
  schema: 1;
  metric: "A/A tolerance";
  unit: "fraction of the median (relative)";
  release: string; // "p6-phase4b"
  products: Record<string, Partial<Record<ToleranceMetric, Tolerance>>>;
}

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The tolerance of one metric from its counted A/A arms (one ArmMedian per arm). Throws with fewer than three arms, with a value that is
 * not finite and above 0, with two arms that share an arm id, or with a run id that is not digits only. Arms of one run are allowed: the
 * committed file is checked by parseTolerance, which needs two runs on different UTC days.
 */
export function toleranceOf(metric: ToleranceMetric, arms: ArmMedian[]): Tolerance {
  const spread = spreadOf(arms.map((a) => a.value));
  const armIds = arms.map((a) => a.armId);
  if (new Set(armIds).size !== armIds.length)
    throw new Error(`a/a tolerance: ${metric} has two arms with the same arm id`);
  const runIds = [...new Set(arms.map((a) => a.runId))];
  if (!runIds.every((id) => /^\d+$/.test(id)))
    throw new Error(`a/a tolerance: ${metric} has a run id that is not digits only`);
  return {
    metric,
    spread,
    tolerance: Math.max(FLOOR, K * spread),
    runIds: runIds.sort((a, b) => Number(a) - Number(b)),
    utcDays: [...new Set(arms.map((a) => a.utcDay))].sort(),
    arms: [...armIds].sort(),
  };
}

/**
 * Validates a parsed tolerance file: schema 1, the metric and unit, per entry a known metric; at least MIN_ARMS unique arm ids; at least
 * MIN_RUNS unique digit-only run ids in ascending order, on at least MIN_RUNS distinct UTC days; a finite spread ≥ 0; and a tolerance
 * equal to max(FLOOR, K x spread). A file with three arms from one run is refused here.
 */
export function parseTolerance(value: unknown): ToleranceFile {
  const t = value as ToleranceFile;
  if (!t || t.schema !== 1) throw new Error("a/a tolerance: schema must be 1");
  if (t.metric !== "A/A tolerance" || t.unit !== "fraction of the median (relative)")
    throw new Error("a/a tolerance: metric or unit is wrong");
  for (const [product, metrics] of Object.entries(t.products ?? {})) {
    for (const [metric, c] of Object.entries(metrics)) {
      const where = `${product} ${metric}`;
      if (!(TOLERANCE_METRICS as readonly string[]).includes(metric) || c.metric !== metric)
        throw new Error(`a/a tolerance: ${product} has an unknown metric ${metric}`);
      if (!Array.isArray(c.arms) || new Set(c.arms).size !== c.arms.length)
        throw new Error(`a/a tolerance: ${where} arm ids are missing or repeated`);
      if (c.arms.length < MIN_ARMS)
        throw new Error(
          `a/a tolerance: ${where} needs at least ${MIN_ARMS} counted arms, has ${c.arms.length}`,
        );
      if (new Set(c.runIds).size !== c.runIds.length || !c.runIds.every((id) => /^\d+$/.test(id)))
        throw new Error(`a/a tolerance: ${where} has duplicate or non-numeric run ids`);
      for (let i = 1; i < c.runIds.length; i++)
        if (Number(c.runIds[i]) <= Number(c.runIds[i - 1]))
          throw new Error(`a/a tolerance: ${where} run ids are not strictly ascending`);
      if (c.runIds.length < MIN_RUNS)
        throw new Error(
          `a/a tolerance: ${where} needs at least ${MIN_RUNS} distinct runIds, has ${c.runIds.length}`,
        );
      if (
        new Set(c.utcDays).size !== c.utcDays.length ||
        !c.utcDays.every((d) => UTC_DAY.test(d)) ||
        c.utcDays.some((d, i) => i > 0 && d <= c.utcDays[i - 1]!)
      )
        throw new Error(`a/a tolerance: ${where} utcDays must be ascending YYYY-MM-DD values`);
      if (c.utcDays.length < MIN_RUNS)
        throw new Error(
          `a/a tolerance: ${where} needs runs on at least ${MIN_RUNS} different UTC days, has ${c.utcDays.length}`,
        );
      if (!Number.isFinite(c.spread) || c.spread < 0)
        throw new Error(`a/a tolerance: ${where} spread must be a finite number ≥ 0`);
      if (c.tolerance !== Math.max(FLOOR, K * c.spread))
        throw new Error(`a/a tolerance: ${where} tolerance is not max(FLOOR, K x spread)`);
    }
  }
  return t;
}
