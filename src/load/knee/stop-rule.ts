import type { StepStat } from "./step-stats.ts";

/** The stop rule of a knee run (plan D2): a step with enough requests stops the run when its error rate or its p95 trips. */
export interface StopRule {
  smokeP95Ms: number;
  p95Factor: number; // 10 (D2)
  errorRate: number; // 0.01 (D2), a step stops when errorRate > this
  minRequests: number; // 20: a step with fewer requests cannot trip the rule
}

export const STOP_DEFAULTS = { p95Factor: 10, errorRate: 0.01, minRequests: 20 } as const;

export interface StopVerdict {
  stopStep: number | null;
  reasons: Array<"error_rate" | "p95">; // all that tripped at the stop step; D2 order puts error_rate first
  limitMs: number; // p95Factor x smokeP95Ms
}

/** First step (by index) that has >= minRequests and errorRate > rule.errorRate, or p95Ms >= p95Factor x smokeP95Ms. */
export function evaluateStopRule(stats: StepStat[], rule: StopRule): StopVerdict {
  const limitMs = rule.p95Factor * rule.smokeP95Ms;
  for (const step of [...stats].sort((a, b) => a.index - b.index)) {
    if (step.requests < rule.minRequests) continue;
    const reasons: StopVerdict["reasons"] = [];
    if (step.errorRate > rule.errorRate) reasons.push("error_rate");
    if (step.p95Ms !== undefined && step.p95Ms >= limitMs) reasons.push("p95");
    if (reasons.length > 0) return { stopStep: step.index, reasons, limitMs };
  }
  return { stopStep: null, reasons: [], limitMs };
}
