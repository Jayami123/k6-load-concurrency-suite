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
import { probeEmailOf } from "../knee/med-intents.ts";
import { closePool, createReadOnlyPool } from "../../oracles/pg.ts";
import { readOversellSnapshot } from "../../medusa/oracle.ts";
import { completeCart, prepareReadyCart } from "../../medusa/store.ts";
import { medusaAbandonVerdict, type MedAbandonVerdict } from "./med-abandon.ts";
import { WINDOW_SEC, windowsFromBins } from "../recovery.ts";
import { inOneWindow } from "../../../k6/lib/pure/spike.js";
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

/**
 * P6-MED-LOAD-010 (the abandoned-cart judgement) for a Medusa spike run: the snapshot after the spike, then one probe purchase through the
 * store API (a cart, a line item of the case variant, complete). The probe is made after the snapshot, so it is not counted in it.
 */
async function medusaAbandon(ctx: LoadContext, abandoned: number): Promise<MedAbandonVerdict> {
  const audit = ctx.config.audit as Record<string, unknown> | undefined;
  if (!audit) throw new Error("TEST BUG: no audit config for the medusa spike");
  const cfg = ctx.config as Record<string, string>;
  const pool = createReadOnlyPool();
  let snapshot;
  try {
    snapshot = await readOversellSnapshot(
      pool,
      String(audit.variantId),
      String(audit.inventoryItemId),
      String(audit.locationId),
    );
  } finally {
    await closePool(pool);
  }
  const probe = await prepareReadyCart({
    publishableKey: String(cfg.publishableKey),
    regionId: String(cfg.regionId),
    salesChannelId: String(cfg.salesChannelId),
    variantId: String(cfg.variantId),
    email: probeEmailOf(String(audit.prefix)),
    quantity: 1,
  });
  // A refused line item is the probe's answer (the stock is out, or the variant refuses it); otherwise complete the cart.
  const probeStatus =
    probe.lineItemStatus !== 200
      ? probe.lineItemStatus
      : (await completeCart(String(cfg.publishableKey), probe.cartId, String(cfg.baseUrl))).status;
  return medusaAbandonVerdict({ abandoned, snapshot, stock: Number(audit.stock), probeStatus });
}

/** The P6-MED-LOAD-010 verdict as report text (numbers and the judgement's own lines only). */
function formatAbandon(a: MedAbandonVerdict): string {
  const lines = a.findings.length > 0 ? a.findings.map((f) => `- ${f}`).join("\n") : "- none";
  return `\n### P6-MED-LOAD-010 abandoned carts\n\nVerdict: ${a.verdict}. Abandoned ${a.abandoned}, orders ${a.orders}.\n\n${lines}\n`;
}

/** The report of one spike run: the verdict, the recovery and the checks, as text (no ids beyond the run's own, no secrets). */
function formatSpike(label: string, r: SpikeResult): string {
  const rows = r.checks
    .map((c) => `| ${c.name} | ${c.ok ? "ok" : "FINDING"} | ${c.detail} |`)
    .join("\n");
  const recovery =
    r.recoveryReason === "no_reference"
      ? "no reference (no pre-spike window has a p95)"
      : r.recoverySec === undefined
        ? "not reached in the watch period"
        : `${r.recoverySec} s`;
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
      const windows = windowsFromBins(bins, t0, sp.windowSec ?? WINDOW_SEC);
      const spikeStartMs = t0 + (sp.steadySec + sp.rampSec) * 1000;
      const spikeEndMs = spikeStartMs + sp.spikeSec * 1000;
      if (sp.alignToMinute && !inOneWindow(spikeStartMs, spikeEndMs)) {
        fail(
          "TEST BUG",
          `${label}: the spike crosses a limiter window (its start is not on a minute boundary)`,
        );
        continue;
      }
      const tags = await limitedTags(run.pointsPath);
      const counts: SpikeCounts & { abandoned?: number } = {
        ok: count(summary, "p6_resp_ok"),
        refusedWithBody: count(summary, "p6_resp_4xx_body"),
        refusedNoBody: count(summary, "p6_resp_4xx_nobody"),
        limited: count(summary, "p6_resp_429"),
        limitedNoBody: tags.limitedNoBody,
        serverError: count(summary, "p6_resp_5xx"),
        transport: count(summary, "p6_resp_transport"),
        droppedIterations: count(summary, "dropped_iterations"),
        abandoned: count(summary, "p6_abandoned"),
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

      const abandon =
        sp.product === "medusa" ? await medusaAbandon(ctx, counts.abandoned ?? 0) : undefined;
      const text = `${formatSpike(label, result)}${abandon ? formatAbandon(abandon) : ""}`;
      const json = `${JSON.stringify({ schema: 1, run: label, caseId: ctx.caseDef.id, runId: ctx.runId, ...result, counts, ...(abandon ? { abandon } : {}) }, null, 2)}\n`;
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

      results.push({
        label,
        verdict: result.verdict,
        recoverySec: result.recoverySec,
        ...(abandon ? { abandon: abandon.verdict } : {}),
      });
      if (abandon?.verdict === "INVALID")
        ctx.invalid.push(`${label}: abandoned carts: ${abandon.findings.join("; ")}`);
      else if (abandon && abandon.verdict !== "PASS")
        fail(
          "PRODUCT BUG",
          `${label}: abandoned carts: ${abandon.findings.join("; ")} (suspected; the owner labels it)`,
        );
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
