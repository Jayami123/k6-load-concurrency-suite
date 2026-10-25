import type { MedianMetric } from "./medians.ts";

export const MEDIAN_METRICS: MedianMetric[] = ["requests", "dropped", "iterations", "p95"];

export const MEDIAN_USAGE =
  "usage: load-medians.ts <folder>... --metric requests|dropped|iterations|p95 [--json]";

export type MedianArgs =
  | { ok: true; metric: MedianMetric; asJson: boolean; folders: string[] }
  | { ok: false; reason: string };

/**
 * Reads the command line of load-medians: one optional --metric with one of the metric names, an optional --json, and one or more
 * run folders. Any other option, a repeated --metric, or no folder is refused with a reason.
 */
export function parseMedianArgs(args: string[]): MedianArgs {
  const metricIndices = args.flatMap((a, i) => (a === "--metric" ? [i] : []));
  if (metricIndices.length > 1) return { ok: false, reason: "--metric may be given only once" };
  const metricIndex = metricIndices[0] ?? -1;
  const unknown = args.find((a, i) => a.startsWith("--") && a !== "--json" && i !== metricIndex);
  if (unknown !== undefined) return { ok: false, reason: `unknown option ${unknown}` };
  const metric = metricIndex === -1 ? "requests" : args[metricIndex + 1];
  if (!MEDIAN_METRICS.includes(metric as MedianMetric))
    return { ok: false, reason: `--metric must be one of ${MEDIAN_METRICS.join(", ")}` };
  const valueIndex = metricIndex === -1 ? -1 : metricIndex + 1;
  const folders = args.filter((a, i) => !a.startsWith("--") && i !== valueIndex);
  if (folders.length === 0) return { ok: false, reason: "no run folder given" };
  return { ok: true, metric: metric as MedianMetric, asJson: args.includes("--json"), folders };
}
