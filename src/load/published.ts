import { isPublishable } from "./run-meta.ts";
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
