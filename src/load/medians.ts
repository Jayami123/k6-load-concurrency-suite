import { isPublishable } from "./run-meta.ts";
import type { RunMeta } from "./types.ts";

/** The part of verdict.json the publication rule reads. */
export interface VerdictFile {
  runId?: string;
  outcome: string;
  validity?: { verdict: string; reasons?: Array<{ code: string; detail: string }> };
}

export interface LoadRunRecord {
  verdict: VerdictFile;
  meta: RunMeta;
}

/** A run counts when its meta is publishable, its outcome is PASS and its validity is VALID. Everything else is excluded with its reasons. */
export function selectPublishable(runs: LoadRunRecord[]): {
  used: LoadRunRecord[];
  excluded: Array<{ runId: string; why: string[] }>;
} {
  const used: LoadRunRecord[] = [];
  const excluded: Array<{ runId: string; why: string[] }> = [];
  for (const run of runs) {
    const why = [...isPublishable(run.meta).reasons];
    if (run.verdict.outcome !== "PASS") why.push(`outcome ${run.verdict.outcome}`);
    if (run.verdict.validity?.verdict !== "VALID") why.push("validity INVALID or missing");
    if (why.length === 0) used.push(run);
    else excluded.push({ runId: run.verdict.runId ?? run.meta.runId, why });
  }
  return { used, excluded };
}

/** Median; an even count gives the mean of the two middle values. Throws on an empty list. */
export function medianOf(values: number[]): number {
  if (values.length === 0) throw new Error("medianOf needs at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function summarizeMedian(
  runs: LoadRunRecord[],
  pick: (r: LoadRunRecord) => number | undefined,
  minRuns = 3,
): {
  median?: number;
  n: number;
  excludedCount: number;
  excluded: Array<{ runId: string; why: string[] }>;
  insufficient: boolean;
} {
  const { used, excluded } = selectPublishable(runs);
  const values = used.map(pick).filter((v): v is number => v !== undefined);
  return {
    median: values.length > 0 ? medianOf(values) : undefined,
    n: values.length,
    excludedCount: excluded.length,
    excluded,
    insufficient: used.length < minRuns,
  };
}
