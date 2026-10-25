import { isPublishable } from "./run-meta.ts";
import type { KneeReport } from "./knee/knee-report.ts";
import type { RunMeta } from "./types.ts";

/** "<value> <unit> (functional load, not capacity; environment: <image> <version>, <n> vCPU; run-meta: <link>)". Throws if meta is not publishable. */
export function formatPublishedNumber(
  value: number,
  unit: string,
  meta: RunMeta,
  metaLink: string,
): string {
  const check = isPublishable(meta);
  if (!check.ok) throw new Error(`not publishable: ${check.reasons.join("; ")}`);
  const env = meta.environment;
  return `${value} ${unit} (functional load, not capacity; environment: ${env.runnerImage} ${env.imageVersion}, ${env.nproc} vCPU; run-meta: ${metaLink})`;
}

/**
 * "<lower> to <upper> iterations/s (knee range, environment-bound; stop rule: <reasons>; first saturated: <resource>; environment:
 * <image> <version>, <n> vCPU; run-meta: <link>)". Throws if meta is not publishable or the report is not a KNEE.
 */
export function formatPublishedKnee(report: KneeReport, meta: RunMeta, metaLink: string): string {
  if (report.verdict !== "KNEE" || !report.range || !report.stop) {
    throw new Error(`not a knee range: verdict ${report.verdict}`);
  }
  if (report.caseId !== meta.caseId || report.runId !== meta.runId) {
    throw new Error(
      `report ${report.caseId} ${report.runId} does not belong to run-meta ${meta.caseId} ${meta.runId}`,
    );
  }
  const check = isPublishable(meta);
  if (!check.ok) throw new Error(`not publishable: ${check.reasons.join("; ")}`);
  const env = meta.environment;
  const resource = report.firstSaturated?.resource ?? "none_observed";
  return `${report.range.lowerRate} to ${report.range.upperRate} iterations/s (knee range, environment-bound; stop rule: ${report.stop.reasons.join(", ")}; first saturated: ${resource}; environment: ${env.runnerImage} ${env.imageVersion}, ${env.nproc} vCPU; run-meta: ${metaLink})`;
}
