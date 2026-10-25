import type { KneePlanSpec } from "../types.ts";

/** One held step of a knee run, read from the k6 summary export (plan task 1 §6.4). */
export interface StepStat {
  index: number;
  rate: number;
  plannedIterations: number; // rate x holdSec
  startedIterations: number; // metrics["p6_step_started{step:i}"].count, 0 when absent
  requests: number; // http_reqs{step:i}.count
  p95Ms?: number; // undefined when the step has no requests
  errors: number; // p6_nonconflict_error{step:i}.passes
  errorRate: number; // errors / requests (0 when no requests)
  reached: boolean; // startedIterations > 0
}

type Metric = Record<string, unknown>;

function metricsOf(summary: unknown): Record<string, Metric> {
  const metrics = (summary as { metrics?: Record<string, Metric> } | null)?.metrics;
  return metrics ?? {};
}

function num(metric: Metric | undefined, key: string): number | undefined {
  const value = metric?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads the per-step submetrics of a k6 summary export (plan §3.1). Pure; a missing metric is 0, never an invented number.
 * @param summary the parsed `k6-<label>-summary.json`
 * @param spec the knee plan of the run
 */
export function stepStatsFromSummary(summary: unknown, spec: KneePlanSpec): StepStat[] {
  const metrics = metricsOf(summary);
  const stats: StepStat[] = [];
  for (let index = 0; index < spec.maxSteps; index++) {
    const rate = Math.round((spec.startRate + index * spec.stepRate) * 10) / 10;
    const started = num(metrics[`p6_step_started{step:${index}}`], "count") ?? 0;
    const requests = num(metrics[`http_reqs{step:${index}}`], "count") ?? 0;
    const p95 = num(metrics[`http_req_duration{step:${index}}`], "p(95)");
    const errors = num(metrics[`p6_nonconflict_error{step:${index}}`], "passes") ?? 0;
    stats.push({
      index,
      rate,
      plannedIterations: Math.round(rate * spec.holdSec),
      startedIterations: started,
      requests,
      p95Ms: requests > 0 ? p95 : undefined,
      errors,
      errorRate: requests > 0 ? errors / requests : 0,
      reached: started > 0,
    });
  }
  return stats;
}
