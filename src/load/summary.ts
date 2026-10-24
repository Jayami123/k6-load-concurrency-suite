export interface K6Summary {
  requests: number;
  failedRate: number;
  iterations: number;
  dropped: number;
  vusMax: number;
  /** vus.max: the most VUs k6 had at once (Task 4). */
  peakVus: number;
  p95Ms: number;
  medMs: number;
  maxMs: number;
  checksPassed: number;
  checksFailed: number;
  thresholdsCrossed: string[];
}

type Metric = Record<string, unknown>;

function metric(json: unknown, name: string): Metric | undefined {
  const metrics = (json as { metrics?: Record<string, Metric> })?.metrics;
  return metrics?.[name];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Reads `k6 run --summary-export` JSON. A missing dropped_iterations is 0 (plan §3.4 fact 5). vus_max may be `{ value }` or `{ max }`.
 * A threshold entry whose value is `true` is crossed (checked live: exit 99).
 */
export function parseK6Summary(json: unknown): K6Summary {
  const httpDuration = metric(json, "http_req_duration");
  const thresholdsCrossed: string[] = [];
  const metrics = (json as { metrics?: Record<string, Metric> })?.metrics ?? {};
  for (const [name, m] of Object.entries(metrics)) {
    const thresholds = m.thresholds as Record<string, unknown> | undefined;
    for (const [expr, crossed] of Object.entries(thresholds ?? {})) {
      if (crossed === true) thresholdsCrossed.push(`${name}: ${expr}`);
    }
  }
  const vusMax = metric(json, "vus_max");
  return {
    requests: num(metric(json, "http_reqs")?.count),
    failedRate: num(metric(json, "http_req_failed")?.value),
    iterations: num(metric(json, "iterations")?.count),
    dropped: num(metric(json, "dropped_iterations")?.count),
    vusMax: num(vusMax?.value ?? vusMax?.max),
    peakVus: num(metric(json, "vus")?.max),
    p95Ms: num(httpDuration?.["p(95)"]),
    medMs: num(httpDuration?.med),
    maxMs: num(httpDuration?.max),
    checksPassed: num(metric(json, "checks")?.passes),
    checksFailed: num(metric(json, "checks")?.fails),
    thresholdsCrossed,
  };
}
