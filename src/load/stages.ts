import { scanTree } from "../../scripts/evidence-token-scan.mjs";
import { runK6 } from "./k6-process.ts";
import type { LoadContext, Stage, StageSet } from "./types.ts";

const ok: Stage = async () => ({ ok: true, reasons: [] });

/** Runs every K6RunSpec of the case, one k6 at a time (no two generators on a shared runner). Expected exit codes are judged in the verdict. */
export const runAllK6: Stage = async (ctx: LoadContext) => {
  const specs = ctx.caseDef.runs(ctx);
  for (const spec of specs) {
    ctx.k6.push(await runK6({ spec, outDir: ctx.outDir, config: ctx.config, env: ctx.env }));
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
  samplerStart: ok,
  k6: runAllK6,
  samplerStop: ok,
  drain: ok,
  reconcile: ok,
  cleanup: ok,
  tokenScan: scanOutDir,
  verdict: ok,
};
