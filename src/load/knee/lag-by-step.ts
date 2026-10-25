// The seal lag of a knee, per step (plan task 4 §6.3). Pure.
import { summariseLag, type DocumentLag, type LagSummary } from "../pipeline-lag.ts";
import type { Window } from "./first-saturated.ts";

export interface StepLag {
  index: number;
  documents: number; // completed documents whose last signature fell inside the step's hold
  p50: LagSummary["p50"];
  p95: LagSummary["p95"];
  max: LagSummary["max"];
}

/** A lag marker needs this many documents in a step; a smaller step is skipped. */
const MIN_DOCUMENTS = 20;

/**
 * Buckets the completed documents by `lastSignedMs` into the hold windows (a document signed in a ramp belongs to no step) and
 * summarises each stage lag per step (nearest-rank percentiles, pipeline-lag.ts). Documents that never completed have no
 * `lastSignedMs` and are in no bucket; the caller matches them to intents (§6.4).
 */
export function lagByStep(
  docs: Array<DocumentLag & { lastSignedMs: number | null }>,
  windows: Window[],
): StepLag[] {
  return windows.map((w) => {
    const inStep = docs.filter(
      (d) => d.lastSignedMs !== null && d.lastSignedMs >= w.fromMs && d.lastSignedMs < w.toMs,
    );
    const s = summariseLag(inStep, 0);
    return { index: w.index, documents: inStep.length, p50: s.p50, p95: s.p95, max: s.max };
  });
}

/**
 * The reported (never stopping) lag marker: the first step whose seal-lag p95 is at least `factor` times the step-0 seal-lag p95,
 * or null. Steps with fewer than 20 documents are skipped. Printed beside the HTTP stop step, so the report says which came first.
 */
export function lagMarker(table: StepLag[], factor = 10): number | null {
  const base = table[0]?.p95.seal;
  if (base === undefined) return null;
  for (const step of table) {
    if (step.documents < MIN_DOCUMENTS) continue;
    const p = step.p95.seal;
    if (p !== undefined && p >= factor * base) return step.index;
  }
  return null;
}
