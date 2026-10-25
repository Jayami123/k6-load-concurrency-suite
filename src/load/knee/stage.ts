// The knee stage (plan task 1 §6.4): for every run that has a knee plan, the step statistics, the stop rule, the first saturated
// resource and the report. Runs in the reconcile slot, after the k6 runs and the sampler.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findHits } from "../../../scripts/evidence-token-scan.mjs";
import { summaryCounter } from "../reconcile/index.ts";
import type { LoadContext, RunMeta, Stage, StageResult } from "../types.ts";
import { firstSaturated, type RuleSample, type Window } from "./first-saturated.ts";
import { buildKneeReport, formatKneeTable, kneeInvalidReasons } from "./knee-report.ts";
import { stepStatsFromSummary } from "./step-stats.ts";
import { evaluateStopRule, STOP_DEFAULTS, type StopRule } from "./stop-rule.ts";

interface TelemetryFile {
  samples?: RuleSample[];
  sources?: Record<string, { present: boolean; errors?: number }>;
  limits?: { maxConnections?: number; fdsSoftLimit?: number };
}

/** The knee summary of one run, written for the LOAD table (plan task 1 §6.4). Counts and rates only. */
export interface KneeSummary {
  label: string;
  caseId: string;
  runId: string;
  verdict: string;
  lowerRate?: number;
  upperRate?: number;
  firstSaturated: string;
  /** The stop rested on fewer than minRequests requests (an error-rate abort on a small step). */
  lowSampleStop?: boolean;
}

/** The knee stage. Writes knee-report-<label>.json and .md; a token-like value in them removes both and is a TEST BUG. */
export const kneeStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const specs = ctx.caseDef.runs(ctx).filter((s) => s.knee);
  if (specs.length === 0) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  const knees: KneeSummary[] = [];
  let kind: StageResult["kind"];
  const fail = (k: "TEST BUG" | "PRODUCT BUG", why: string) => {
    kind = kind ?? k;
    reasons.push(why);
  };

  for (const spec of specs) {
    try {
      const label = spec.label;
      const plan = spec.knee!;
      const run = ctx.k6.find((k) => k.label === label);
      if (!run || !existsSync(run.summaryPath)) {
        fail("TEST BUG", `${label}: no k6 summary for the knee run`);
        continue;
      }
      const summary = JSON.parse(readFileSync(run.summaryPath, "utf8")) as Record<string, unknown>;
      const stats = stepStatsFromSummary(summary, plan);
      const rule: StopRule = { smokeP95Ms: plan.smokeP95Ms, ...STOP_DEFAULTS };
      const stop = evaluateStopRule(stats, rule);

      // The k6 abort and the post-run rule must agree (plan §6.4): exit 99 needs a stop step, exit 0 must not have one.
      if (run.exitCode === 99 && stop.stopStep === null)
        fail("TEST BUG", `${label}: k6 stopped (exit 99) but the post-run rule found no stop step`);
      if (run.exitCode === 0 && stop.stopStep !== null)
        fail("TEST BUG", `${label}: a stop step ${stop.stopStep} without a k6 stop (exit 0)`);

      const t0 = Number(
        (summary.metrics as Record<string, { value?: number }> | undefined)?.p6_knee_t0_ms?.value,
      );
      const windows: Window[] = [];
      if (Number.isFinite(t0)) {
        for (let index = 0; index < plan.maxSteps; index++) {
          const from = index * (plan.rampSec + plan.holdSec) + plan.rampSec;
          windows.push({
            index,
            fromMs: t0 + from * 1000,
            toMs: t0 + (from + plan.holdSec) * 1000,
          });
        }
      }
      const telemetryPath = path.join(ctx.outDir, `telemetry-${label}.json`);
      const telemetry: TelemetryFile = existsSync(telemetryPath)
        ? (JSON.parse(readFileSync(telemetryPath, "utf8")) as TelemetryFile)
        : {};
      const saturated = firstSaturated({
        samples: telemetry.samples ?? [],
        windows,
        limits: {
          maxConnections: telemetry.limits?.maxConnections,
          fdsSoftLimit: telemetry.limits?.fdsSoftLimit,
        },
        sources: telemetry.sources ?? {},
      });

      const meta: RunMeta = ctx.meta ?? ({ environment: { kind: "local" } } as unknown as RunMeta);
      const generatorInvalid = (run.validity?.reasons ?? []).map((r) => ({
        code: r.code,
        detail: r.detail,
      }));
      const report = buildKneeReport({
        caseId: ctx.caseDef.id,
        runId: ctx.runId,
        steps: stats,
        stop,
        rule,
        saturated,
        meta,
        conflicts: summaryCounter(summary, "p6_conflict_responses") ?? 0,
        generatorInvalid,
      });

      // Validity: a VALID run carries its reasons into ctx.invalid; an INVALID run must show its expected codes.
      const codes = kneeInvalidReasons(stats, stop).map((r) => r.code);
      if (report.invalid.some((f) => f.code === "knee_below_start"))
        fail("TEST BUG", `${label}: the stop rule tripped at the first step; lower the start rate`);
      if ((spec.expectValidity ?? "VALID") === "INVALID") {
        for (const code of spec.expectCodes ?? []) {
          if (!codes.includes(code as never)) fail("TEST BUG", `${label} did not show ${code}`);
        }
      } else {
        for (const f of report.invalid)
          if (f.code !== "knee_below_start") ctx.invalid.push(`${label}: ${f.code}: ${f.detail}`);
      }

      // The self-test's expectation (plan §6.4, owner decision on PR #73): machine-independent assertions only. No fixed rate range.
      const expect = plan.expect;
      if (expect) {
        const problems: string[] = [];
        const limitMs = stop.limitMs;
        if (stop.stopStep === null) problems.push("no knee found");
        if (stop.stopStep !== null && !stop.reasons.includes("p95"))
          problems.push(`stop reasons ${stop.reasons.join(",") || "none"}, expected p95`);
        if (stop.stopStep !== null && stop.reasons.includes("error_rate"))
          problems.push("stop on error_rate, expected p95");
        if (stop.stopStep !== null) {
          const st = stats[stop.stopStep]!;
          if (!(st.p95Ms !== undefined && st.p95Ms >= limitMs))
            problems.push(`stop step ${stop.stopStep} p95 is not over ${limitMs} ms`);
          for (const earlier of stats.filter(
            (x) => x.index < stop.stopStep! && x.requests >= rule.minRequests,
          )) {
            if (earlier.p95Ms !== undefined && earlier.p95Ms >= limitMs)
              problems.push(`step ${earlier.index} is over the limit before the stop step`);
          }
          const schedule = (i: number) =>
            Math.round((plan.startRate + i * plan.stepRate) * 10) / 10;
          for (const x of stats)
            if (x.rate !== schedule(x.index))
              problems.push(`step ${x.index} rate ${x.rate} is off the schedule`);
          if (
            !report.range ||
            report.range.lowerRate !== schedule(stop.stopStep - 1) ||
            report.range.upperRate !== schedule(stop.stopStep)
          )
            problems.push("range is not last clean rate to stop rate");
        }
        if (
          expect.firstSaturated !== undefined &&
          report.firstSaturated?.resource !== expect.firstSaturated
        )
          problems.push(
            `first saturated ${report.firstSaturated?.resource ?? "none"}, expected ${expect.firstSaturated}`,
          );
        if (problems.length > 0) fail("TEST BUG", `${label}: ${problems.join("; ")}`);
      }

      const json = `${JSON.stringify(report, null, 2)}\n`;
      const md = `${formatKneeTable(report)}\n`;
      const jsonPath = path.join(ctx.outDir, `knee-report-${label}.json`);
      const mdPath = path.join(ctx.outDir, `knee-report-${label}.md`);
      if (findHits(json).length > 0 || findHits(md).length > 0) {
        rmSync(jsonPath, { force: true });
        rmSync(mdPath, { force: true });
        fail("TEST BUG", `${label}: knee report matched a token pattern; not kept`);
        continue;
      }
      writeFileSync(jsonPath, json);
      writeFileSync(mdPath, md);

      knees.push({
        label,
        caseId: ctx.caseDef.id,
        runId: ctx.runId,
        verdict: report.verdict,
        lowerRate: report.range?.lowerRate,
        upperRate: report.range?.upperRate,
        firstSaturated: report.firstSaturated?.resource ?? "none_observed",
        lowSampleStop: report.stop?.lowSampleStop,
      });
    } catch (err) {
      // One run's unreadable file is that run's TEST BUG; the other runs still get their reports.
      fail(
        "TEST BUG",
        `${spec.label}: knee report failed: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }

  return kind
    ? { ok: false, kind, reasons, data: { knee: knees } }
    : { ok: true, reasons, data: { knee: knees } };
};
