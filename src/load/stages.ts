import { readFileSync } from "node:fs";
import os from "node:os";
import { scanTree } from "../../scripts/evidence-token-scan.mjs";
import { runK6 } from "./k6-process.ts";
import { startResourceSampler, type ResourceSampler } from "./proc-stats.ts";
import { samplerStart, samplerStop, type TelemetryHandle } from "./telemetry/stages.ts";
import { parseK6Summary } from "./summary.ts";
import { judgeValidity } from "./validity.ts";
import type { K6RunResult, LoadContext, Stage, StageSet } from "./types.ts";

const ok: Stage = async () => ({ ok: true, reasons: [] });

/**
 * Runs every K6RunSpec of the case, one k6 at a time (no two generators on a shared runner). Expected exit codes are judged in the verdict.
 * When samplerStart stored a telemetry handle, each run gets its own sampler and marker around its k6 process (Task 5).
 */
export const runAllK6: Stage = async (ctx: LoadContext) => {
  const specs = ctx.caseDef.runs(ctx);
  const telemetry = ctx.handles.telemetry as TelemetryHandle | undefined;
  for (const spec of specs) {
    const runSpec = (await telemetry?.beforeRun(spec)) ?? spec;
    let sampler: ResourceSampler | undefined;
    let result: K6RunResult;
    try {
      result = await runK6({
        spec: runSpec,
        outDir: ctx.outDir,
        config: ctx.config,
        env: ctx.env,
        secrets: ctx.secrets,
        onStart: (pid) => {
          sampler = startResourceSampler(pid);
        },
      });
    } catch (err) {
      sampler?.stop();
      throw err;
    }
    result.resources = sampler?.stop();
    await telemetry?.afterRun(spec, result);
    ctx.k6.push(result);
  }
  return { ok: true, reasons: [], data: { runs: specs.length } };
};

/** Scans the run directory for token-shaped values. Only file names are reported, never the matched text. */
export const scanOutDir: Stage = async (ctx: LoadContext) => {
  const hits = scanTree(ctx.outDir) as Array<{ file: string; lines: number[] }>;
  if (hits.length === 0) return { ok: true, reasons: [] };
  return {
    ok: false,
    kind: "TEST BUG",
    reasons: hits.map((h) => `token-like value in ${h.file} (${h.lines.length} line(s))`),
  };
};

/** Placeholders for the stages later tasks fill in. `verdict` is replaced by the runner's writer. */
export const defaultStages: StageSet = {
  setup: ok,
  preflight: ok,
  samplerStart,
  k6: runAllK6,
  samplerStop,
  drain: ok,
  reconcile: ok,
  cleanup: ok,
  tokenScan: scanOutDir,
  verdict: ok,
};

/**
 * Judges every run whose summary file exists and parses (a run without one is skipped, never invented). A run that expects VALID
 * (the default) puts its reasons into ctx.invalid. A run that expects INVALID must be INVALID and show its expectCodes; if not, TEST BUG.
 */
export const validityStage: Stage = async (ctx: LoadContext) => {
  const specs = ctx.caseDef.runs(ctx);
  const nproc = ctx.meta?.environment.nproc ?? os.cpus().length;
  const judged: string[] = [];
  const mismatch: string[] = [];
  for (const k of ctx.k6) {
    const spec = specs.find((s) => s.label === k.label);
    let summary;
    try {
      summary = parseK6Summary(JSON.parse(readFileSync(k.summaryPath, "utf8")));
    } catch {
      // A run that expects INVALID must show its evidence, so a missing or unreadable summary is a mismatch, not a skip.
      if ((spec?.expectValidity ?? "VALID") === "INVALID")
        mismatch.push(`${k.label} summary missing or unreadable, expected INVALID`);
      continue;
    }
    const verdict = judgeValidity({
      summary,
      maxVUs: spec?.maxVUs ?? Number.POSITIVE_INFINITY,
      nproc,
      resources: k.resources,
      telemetry: k.telemetry
        ? {
            gaps: k.telemetry.gaps,
            skewMs: k.telemetry.skewMs,
            skewLimitMs: k.telemetry.skewLimitMs,
          }
        : undefined,
    });
    k.validity = verdict;
    judged.push(k.label);
    const expected = spec?.expectValidity ?? "VALID";
    if (expected === "VALID") {
      for (const r of verdict.reasons) ctx.invalid.push(`${k.label}: ${r.code}: ${r.detail}`);
    } else {
      if (verdict.verdict !== "INVALID") mismatch.push(`${k.label} expected INVALID, was VALID`);
      for (const code of spec?.expectCodes ?? []) {
        if (!verdict.reasons.some((r) => r.code === code))
          mismatch.push(`${k.label} did not show ${code}`);
      }
    }
  }
  if (mismatch.length > 0)
    return { ok: false, kind: "TEST BUG", reasons: mismatch, data: { judged } };
  return { ok: true, reasons: [], data: { judged } };
};

/** Runs two stages in order; ok only when both are ok, the first failing kind wins, reasons and data are merged. */
export function seqStages(first: Stage, second: Stage): Stage {
  return async (ctx) => {
    const a = await first(ctx);
    const b = await second(ctx);
    return {
      ok: a.ok && b.ok,
      kind: a.ok ? b.kind : a.kind,
      reasons: [...a.reasons, ...b.reasons],
      data: { ...a.data, ...b.data },
    };
  };
}
