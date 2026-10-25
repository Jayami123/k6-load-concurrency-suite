import type { RunMeta } from "../types.ts";
import type { StepStat } from "./step-stats.ts";
import type { StopRule, StopVerdict } from "./stop-rule.ts";
import type { FirstSaturated } from "./first-saturated.ts";
import type { ValidityInput } from "../validity.ts";

/** The knee report of one run (plan task 1 §6.4). The range is between step s and s+1, s being the last clean step. */
export interface KneeReport {
  schema: 1;
  ruleId: "P6-RULE-006";
  caseId: string;
  runId: string;
  label: "knee range, environment-bound";
  verdict: "KNEE" | "NO_KNEE" | "INVALID";
  range?: { lowerStep: number; upperStep: number; lowerRate: number; upperRate: number };
  stop?: { step: number; rate: number; reasons: string[]; limitMs: number };
  firstSaturated?: { resource: string; step: number | null };
  stopRule: { smokeP95Ms: number; p95Factor: number; errorRate: number; minRequests: number };
  steps: StepStat[];
  conflicts: number;
  invalid: Array<{ code: string; detail: string }>;
  environment: string; // "ubuntu24 20261023.334.3, 4 vCPU" or "local"
  runUrl?: string;
}

/**
 * The dropped-iteration allowance of a clean step: max(2, floor(3 % of planned)). The floor of 2 covers the interruption of the
 * last iterations at small plans (plan §3.3).
 */
export function droppedAllowance(planned: number): number {
  return Math.max(2, Math.floor(planned * 0.03));
}

/**
 * Pure: knee-mode validity (plan §3.3, §6.5). A clean step (before the stop step, or every step without a stop) that is short
 * of its plan by more than the allowance is `dropped_iterations`; no stop is `no_knee`. The stop step's own drops are ignored.
 */
export function kneeInvalidReasons(
  steps: StepStat[],
  stop: StopVerdict,
): Array<{ code: "dropped_iterations" | "no_knee"; detail: string }> {
  const reasons: Array<{ code: "dropped_iterations" | "no_knee"; detail: string }> = [];
  const clean =
    stop.stopStep === null ? steps : steps.filter((s) => s.index < (stop.stopStep as number));
  for (const s of clean) {
    const short = s.plannedIterations - s.startedIterations;
    const allowance = droppedAllowance(s.plannedIterations);
    if (short > allowance) {
      reasons.push({
        code: "dropped_iterations",
        detail: `step ${s.index}: ${s.startedIterations} of ${s.plannedIterations} planned iterations started (allowance ${allowance})`,
      });
      break;
    }
  }
  if (stop.stopStep === null) {
    const last = steps.length - 1;
    reasons.push({
      code: "no_knee",
      detail: `the plan ended without a stop: the knee is above step ${last}`,
    });
  }
  return reasons;
}

/**
 * The validity input of a knee run: the per-step rule replaces the dropped and VU codes (plan §6.5), so `dropped` and
 * `peakVus` are zeroed and the generator codes (k6 cpu, runner cpu and memory, telemetry, clock) still apply.
 */
export function kneeValidityInput(input: ValidityInput): ValidityInput {
  return { ...input, summary: { ...input.summary, dropped: 0, peakVus: 0 } };
}

/** Builds the report. A stop at step 0 is a plan error (`knee_below_start`, a TEST BUG finding), not a range. */
export function buildKneeReport(input: {
  caseId: string;
  runId: string;
  steps: StepStat[];
  stop: StopVerdict;
  rule: StopRule;
  saturated: FirstSaturated;
  meta: RunMeta;
  conflicts: number;
  /** The generator-limited reasons of validityStage (k6 cpu, runner cpu and memory, telemetry, clock). Any one makes the run INVALID. */
  generatorInvalid?: Array<{ code: string; detail: string }>;
}): KneeReport {
  const { stop, steps } = input;
  const invalid: Array<{ code: string; detail: string }> = [
    ...kneeInvalidReasons(steps, stop),
    ...(input.generatorInvalid ?? []),
  ];
  let range: KneeReport["range"];
  if (stop.stopStep === 0) {
    invalid.push({
      code: "knee_below_start",
      detail: "the stop rule tripped at the first step; lower the start rate",
    });
  } else if (stop.stopStep !== null) {
    const s = stop.stopStep;
    range = {
      lowerStep: s - 1,
      upperStep: s,
      lowerRate: steps[s - 1]!.rate,
      upperRate: steps[s]!.rate,
    };
  }
  const env = input.meta.environment;
  const invalidated = invalid.some((f) => f.code !== "no_knee");
  const verdict: KneeReport["verdict"] = invalidated
    ? "INVALID"
    : stop.stopStep === null
      ? "NO_KNEE"
      : "KNEE";
  return {
    schema: 1,
    ruleId: "P6-RULE-006",
    caseId: input.caseId,
    runId: input.runId,
    label: "knee range, environment-bound",
    verdict,
    range,
    stop:
      stop.stopStep === null
        ? undefined
        : {
            step: stop.stopStep,
            rate: steps[stop.stopStep]!.rate,
            reasons: stop.reasons,
            limitMs: stop.limitMs,
          },
    firstSaturated: { resource: input.saturated.resource, step: input.saturated.step },
    stopRule: {
      smokeP95Ms: input.rule.smokeP95Ms,
      p95Factor: input.rule.p95Factor,
      errorRate: input.rule.errorRate,
      minRequests: input.rule.minRequests,
    },
    steps,
    conflicts: input.conflicts,
    invalid,
    environment:
      env.kind === "github-actions"
        ? `${env.runnerImage} ${env.imageVersion}, ${env.nproc} vCPU`
        : "local",
  };
}

/**
 * Markdown: a header with the range or the lower bound, the stop rule reasons and the first saturated resource, then one row
 * per step. A plan that ended without a stop prints "no knee up to step N (rate R)" as a lower bound (plan Q6).
 */
export function formatKneeTable(r: KneeReport): string {
  const lines: string[] = [];
  lines.push(`### Knee report ${r.caseId} (${r.runId}): ${r.verdict}`);
  if (r.range) {
    const reasons = r.stop ? r.stop.reasons.join(", ") : "none";
    lines.push(
      `Knee range: between ${r.range.lowerRate} and ${r.range.upperRate} iterations/s (step ${r.range.lowerStep} to step ${r.range.upperStep}); stop rule: ${reasons}; first saturated: ${r.firstSaturated?.resource ?? "none_observed"}.`,
    );
  } else if (r.verdict === "NO_KNEE") {
    const last = r.steps[r.steps.length - 1];
    lines.push(
      `no knee up to step ${last?.index ?? "?"} (rate ${last?.rate ?? "?"}): the plan ended without a stop; the knee is above this lower bound.`,
    );
  }
  lines.push("");
  lines.push(
    "| step | rate | planned | started | requests | p95 ms | errors | error rate | reached |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const s of r.steps) {
    lines.push(
      `| ${s.index} | ${s.rate} | ${s.plannedIterations} | ${s.startedIterations} | ${s.requests} | ${s.p95Ms === undefined ? "" : Math.round(s.p95Ms)} | ${s.errors} | ${(s.errorRate * 100).toFixed(2)} % | ${s.reached ? "yes" : "no"} |`,
    );
  }
  for (const f of r.invalid) lines.push(`\nINVALID or finding: ${f.code}: ${f.detail}`);
  return lines.join("\n");
}
