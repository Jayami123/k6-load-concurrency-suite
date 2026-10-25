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
  limits?: { maxConnections?: number };
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
        windows.push({ index, fromMs: t0 + from * 1000, toMs: t0 + (from + plan.holdSec) * 1000 });
      }
    }
    const telemetryPath = path.join(ctx.outDir, `telemetry-${label}.json`);
    const telemetry: TelemetryFile = existsSync(telemetryPath)
      ? (JSON.parse(readFileSync(telemetryPath, "utf8")) as TelemetryFile)
      : {};
    const saturated = firstSaturated({
      samples: telemetry.samples ?? [],
      windows,
      limits: { maxConnections: telemetry.limits?.maxConnections },
      sources: telemetry.sources ?? {},
    });

    const meta: RunMeta = ctx.meta ?? ({ environment: { kind: "local" } } as unknown as RunMeta);
    const report = buildKneeReport({
      caseId: ctx.caseDef.id,
      runId: ctx.runId,
      steps: stats,
      stop,
      rule,
      saturated,
      meta,
      conflicts: summaryCounter(summary, "p6_conflict_responses") ?? 0,
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

    // The expectation of the self-test: the range and the first saturated resource (plan §6.4).
    const expect = plan.expect;
    if (expect) {
      const got = report.range ? [report.range.lowerRate, report.range.upperRate] : undefined;
      const resource = report.firstSaturated?.resource;
      if (
        !got ||
        got[0] !== expect.lowerRate ||
        got[1] !== expect.upperRate ||
        (expect.firstSaturated !== undefined && resource !== expect.firstSaturated)
      ) {
        fail(
          "TEST BUG",
          `${label}: expected range ${expect.lowerRate}..${expect.upperRate} with ${expect.firstSaturated ?? "any"}, got ${got ? got.join("..") : "none"} with ${resource ?? "none"}`,
        );
      }
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
    });
  }

  return kind
    ? { ok: false, kind, reasons, data: { knee: knees } }
    : { ok: true, reasons, data: { knee: knees } };
};
