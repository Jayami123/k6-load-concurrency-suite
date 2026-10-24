import type { K6Summary } from "./summary.ts";
import type { InvalidReason, ResourceSummary, ValidityVerdict } from "./types.ts";

/** Each limit has its probe value in the Task 4 plan §3.2 and §3.6. Changing one needs new probe data and an owner decision. */
export const VALIDITY_LIMITS = {
  droppedIterationsMax: 0, // normal 0, saturated >= 4
  peakVusFractionOfMax: 1.0, // peak vus.max >= maxVUs
  k6CoresMaxFractionOfNproc: 0.5, // 0.75 cores at 4000 requests/s = 19 % of 4
  runnerBusyPctMax: 85,
  memAvailablePctMin: 10,
} as const;

export interface ValidityInput {
  summary: K6Summary;
  maxVUs: number;
  nproc: number;
  /** Absent when the sampler could not read /proc: no CPU or memory reason is invented. */
  resources?: ResourceSummary;
  /** Filled by Task 5; absent = no telemetry reason. */
  telemetry?: { gaps: string[]; skewMs?: number; skewLimitMs?: number };
}

/** Pure. Reasons come out in a fixed order: dropped, vus, k6 cpu, runner cpu, memory, telemetry gap, clock skew. */
export function judgeValidity(input: ValidityInput, limits = VALIDITY_LIMITS): ValidityVerdict {
  const reasons: InvalidReason[] = [];
  if (input.summary.dropped > limits.droppedIterationsMax) {
    reasons.push({
      code: "dropped_iterations",
      detail: `${input.summary.dropped} iterations dropped (limit ${limits.droppedIterationsMax})`,
    });
  }
  if (input.summary.peakVus >= input.maxVUs * limits.peakVusFractionOfMax) {
    reasons.push({
      code: "vu_exhausted",
      detail: `peak ${input.summary.peakVus} VUs of ${input.maxVUs} allowed`,
    });
  }
  const r = input.resources;
  if (r) {
    if (r.k6CoresAvg > input.nproc * limits.k6CoresMaxFractionOfNproc) {
      reasons.push({
        code: "k6_cpu",
        detail: `k6 used ${r.k6CoresAvg.toFixed(2)} cores on average of ${input.nproc}`,
      });
    }
    if (r.runnerBusyPctAvg > limits.runnerBusyPctMax) {
      reasons.push({
        code: "runner_cpu",
        detail: `runner ${r.runnerBusyPctAvg.toFixed(0)} % busy on average`,
      });
    }
    if (r.memAvailablePctMin < limits.memAvailablePctMin) {
      reasons.push({
        code: "runner_memory",
        detail: `memory available fell to ${r.memAvailablePctMin.toFixed(0)} %`,
      });
    }
  }
  const t = input.telemetry;
  if (t && t.gaps.length > 0) {
    reasons.push({
      code: "telemetry_gap",
      detail: `${t.gaps.length} gap(s) longer than 2 intervals`,
    });
  }
  if (
    t &&
    t.skewMs !== undefined &&
    t.skewLimitMs !== undefined &&
    Math.abs(t.skewMs) > t.skewLimitMs
  ) {
    reasons.push({
      code: "clock_skew",
      detail: `clock skew ${Math.round(t.skewMs)} ms (limit ${t.skewLimitMs})`,
    });
  }
  return { verdict: reasons.length === 0 ? "VALID" : "INVALID", reasons };
}
