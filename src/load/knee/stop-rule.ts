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
  /** The stop step's own request and error counts, so a reader sees what the decision rested on. */
  stopRequests?: number;
  stopErrors?: number;
  /** True when the stop rested on fewer than minRequests requests (an error-rate abort on a small step). Owner decision, PR #73. */
  lowSampleStop?: boolean;
}

/**
 * The step k6 aborted on, from its log: k6 names the crossed threshold, e.g. `http_req_duration{step:4}`. k6 judges the running
 * p95 of the step, so the final p95 in the summary can settle under the limit: the abort is the decision, and the log is its record.
 */
export function abortedStepOf(log: string): { index: number; reason: "error_rate" | "p95" } | null {
  const m =
    /thresholds on metrics '(http_req_duration|p6_nonconflict_error)\{step:(\d+)\}' were crossed/.exec(
      log,
    );
  if (!m) return null;
  return { index: Number(m[2]), reason: m[1] === "http_req_duration" ? "p95" : "error_rate" };
}

/**
 * First step (by index) whose error rate is over rule.errorRate, or whose p95 is over p95Factor x smokeP95Ms.
 * An error-rate stop is always honoured, even on a step with fewer than minRequests requests: k6 aborts on the same rate, and the
 * report flags it (lowSampleStop). minRequests applies to p95 only: a p95 from a few requests is not evidence.
 */
export function evaluateStopRule(stats: StepStat[], rule: StopRule): StopVerdict {
  const limitMs = rule.p95Factor * rule.smokeP95Ms;
  for (const step of [...stats].sort((a, b) => a.index - b.index)) {
    const reasons: StopVerdict["reasons"] = [];
    if (step.requests > 0 && step.errorRate > rule.errorRate) reasons.push("error_rate");
    if (step.requests >= rule.minRequests && step.p95Ms !== undefined && step.p95Ms >= limitMs)
      reasons.push("p95");
    if (reasons.length > 0) {
      return {
        stopStep: step.index,
        reasons,
        limitMs,
        stopRequests: step.requests,
        stopErrors: step.errors,
        lowSampleStop: step.requests < rule.minRequests,
      };
    }
  }
  return { stopStep: null, reasons: [], limitMs };
}
