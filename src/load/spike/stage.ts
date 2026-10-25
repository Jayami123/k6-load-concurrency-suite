// The spike stage (Phase 4 Task 6 §6.3): for every spike run, the windows of its points file, the pre-spike reference, the response
// counts, the contract, and the report. Runs in the reconcile slot. A violated check is a PRODUCT BUG (SUSPECTED); INVALID reasons go
// to ctx.invalid; an unreadable run is that run's TEST BUG.
import { createReadStream, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import path from "node:path";
import { findHits } from "../../../scripts/evidence-token-scan.mjs";
import { readPointsGzStream } from "../chart/k6-points.ts";
import { parseBaselineBand } from "../baseline-band.ts";
import { windowsFromBins } from "../recovery.ts";
import type { LoadContext, Stage, StageResult } from "../types.ts";
import {
  evaluateSpike,
  type SpikeCounts,
  type SpikeProduct,
  type SpikeResult,
} from "./contract.ts";

/** The steady case whose band is the reference of each product (Q3: the band when it exists). */
const BAND_CASE: Record<SpikeProduct, string> = {
  cal: "P6-CAL-LOAD-003",
  medusa: "P6-MED-LOAD-002",
  documenso: "",
};
const BAND_FILE = "k6/thresholds/baseline-band.json";

function count(summary: Record<string, any>, name: string): number {
  return Number(summary.metrics?.[name]?.count ?? 0);
}

/** The 429 counts of the points file by route and body, read line by line (the summary has no tag split). */
async function limitedTags(
  pointsPath: string,
): Promise<{ limitedNoBody: number; byRoute: Record<string, number> }> {
  const lines = createInterface({
    input: createReadStream(pointsPath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const byRoute: Record<string, number> = {};
  let limitedNoBody = 0;
  for await (const line of lines) {
    if (!line.includes('"p6_resp_429"')) continue;
    const point = JSON.parse(line) as {
      type?: string;
      metric?: string;
      data?: { tags?: Record<string, string> };
    };
    if (point.type !== "Point" || point.metric !== "p6_resp_429") continue;
    const route = point.data?.tags?.route ?? "unknown";
    byRoute[route] = (byRoute[route] ?? 0) + 1;
    if (point.data?.tags?.body === "no") limitedNoBody += 1;
  }
  return { limitedNoBody, byRoute };
}

/** The Task 5 band's windowP95.max for the product's steady case, when the band file exists. */
function bandFor(product: SpikeProduct): { max: number } | undefined {
  const caseId = BAND_CASE[product];
  if (!caseId || !existsSync(BAND_FILE)) return undefined;
  const band = parseBaselineBand(JSON.parse(readFileSync(BAND_FILE, "utf8")));
  const entry = band.products[caseId];
  return entry ? { max: entry.windowP95.max } : undefined;
}

/** The report of one spike run: the verdict, the recovery and the checks, as text (no ids beyond the run's own, no secrets). */
function formatSpike(label: string, r: SpikeResult): string {
  const rows = r.checks
    .map((c) => `| ${c.name} | ${c.ok ? "ok" : "FINDING"} | ${c.detail} |`)
    .join("\n");
  const recovery =
    r.recoverySec === undefined ? "not reached in the watch period" : `${r.recoverySec} s`;
  return `### Spike ${label}: ${r.label}\n\nVerdict: ${r.verdict}${r.invalidReason ? ` (${r.invalidReason})` : ""}. Recovery: ${recovery}.\n\n| check | result | detail |\n| --- | --- | --- |\n${rows}\n`;
}

export const spikeStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const specs = ctx.caseDef.runs(ctx).filter((s) => s.spike);
  if (specs.length === 0) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  const results: Array<{ label: string; verdict: string; recoverySec?: number }> = [];
  let kind: StageResult["kind"];
  const fail = (k: "TEST BUG" | "PRODUCT BUG", why: string) => {
    kind = kind ?? k;
    reasons.push(why);
  };

  for (const spec of specs) {
    const label = spec.label;
    try {
      const sp = spec.spike!;
      const run = ctx.k6.find((k) => k.label === label);
      if (!run || !existsSync(run.summaryPath)) {
        fail("TEST BUG", `${label}: no k6 summary for the spike run`);
        continue;
      }
      const summary = JSON.parse(readFileSync(run.summaryPath, "utf8")) as Record<string, any>;
      const t0 = Number(summary.metrics?.p6_spike_t0_ms?.value);
      if (!Number.isFinite(t0)) {
        fail("TEST BUG", `${label}: no spike origin (p6_spike_t0_ms) in the summary`);
        continue;
      }
      const bins = await readPointsGzStream(run.pointsPath);
      const windows = windowsFromBins(bins, t0);
      const spikeStartMs = t0 + (sp.steadySec + sp.rampSec) * 1000;
      const spikeEndMs = spikeStartMs + sp.spikeSec * 1000;
      const tags = await limitedTags(run.pointsPath);
      const counts: SpikeCounts = {
        ok: count(summary, "p6_resp_ok"),
        refusedWithBody: count(summary, "p6_resp_4xx_body"),
        refusedNoBody: count(summary, "p6_resp_4xx_nobody"),
        limited: count(summary, "p6_resp_429"),
        limitedNoBody: tags.limitedNoBody,
        serverError: count(summary, "p6_resp_5xx"),
        transport: count(summary, "p6_resp_transport"),
        droppedIterations: count(summary, "dropped_iterations"),
        limitedByRoute: tags.byRoute,
      };
      const result = evaluateSpike({
        product: sp.product,
        windows,
        preSpike: windows.filter((w) => w.toMs <= spikeStartMs),
        spikeEndMs,
        band: bandFor(sp.product),
        counts,
      });

      const text = formatSpike(label, result);
      const json = `${JSON.stringify({ schema: 1, run: label, caseId: ctx.caseDef.id, runId: ctx.runId, ...result, counts }, null, 2)}\n`;
      const jsonPath = path.join(ctx.outDir, `spike-report-${label}.json`);
      const mdPath = path.join(ctx.outDir, `spike-report-${label}.md`);
      if (findHits(json).length > 0 || findHits(text).length > 0) {
        rmSync(jsonPath, { force: true });
        rmSync(mdPath, { force: true });
        fail("TEST BUG", `${label}: spike report matched a token pattern; not kept`);
        continue;
      }
      writeFileSync(jsonPath, json);
      writeFileSync(mdPath, text);

      results.push({ label, verdict: result.verdict, recoverySec: result.recoverySec });
      if (result.verdict === "INVALID") ctx.invalid.push(`${label}: spike ${result.invalidReason}`);
      else if (result.verdict !== "PASS") {
        const failed = result.checks.filter((c) => !c.ok).map((c) => c.name);
        fail("PRODUCT BUG", `${label}: ${failed.join(", ")} (suspected; the owner labels it)`);
      }
    } catch (err) {
      fail("TEST BUG", `${label}: spike stage failed: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  return { ok: kind === undefined, kind, reasons, data: { spikes: results } };
};
