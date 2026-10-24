import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readPointsGz } from "../chart/k6-points.ts";
import { renderChartHtml, type ChartSample } from "../chart/render-chart.ts";
import { startSampler, type Sampler } from "./sampler.ts";
import { judgeSkew, offsetsFromSummary, startMarkerServer } from "./markers.ts";
import type {
  K6RunResult,
  K6RunSpec,
  LoadContext,
  LoadProduct,
  TelemetrySummary,
} from "../types.ts";

export const SKEW_LIMIT_MS = 100;

export interface RunTelemetry {
  marker: { url: string; close(): Promise<void> };
  sampler: Sampler;
  label: string;
}

/** Starts the marker server (with the spec's skew, if any) and the sampler for one k6 run. */
export async function startRunTelemetry(
  ctx: LoadContext,
  spec: K6RunSpec,
  product: LoadProduct,
): Promise<RunTelemetry> {
  const marker = await startMarkerServer({ skewMs: spec.markerSkewMs ?? 0 });
  const sampler = startSampler({
    product,
    intervalMs: 1000,
    outDir: ctx.outDir,
    label: spec.label,
    injectGapMs: spec.injectGapMs,
  });
  return { marker, sampler, label: spec.label };
}

/** Stops the sampler, closes the marker, writes the chart and returns the run's own telemetry summary. */
export async function finishRunTelemetry(
  ctx: LoadContext,
  run: RunTelemetry,
  result: K6RunResult,
): Promise<TelemetrySummary> {
  const file = await run.sampler.stop();
  await run.marker.close();
  const summary = existsSync(result.summaryPath)
    ? (JSON.parse(readFileSync(result.summaryPath, "utf8")) as unknown)
    : undefined;
  const skew = judgeSkew(offsetsFromSummary(summary), SKEW_LIMIT_MS);
  const gaps = file.gaps.map((g) => `${g.fromMs}-${g.toMs} (${g.lengthMs} ms)`);
  const bins = existsSync(result.pointsPath) ? readPointsGz(result.pointsPath) : [];
  const samples: ChartSample[] = file.samples.map((s, i) => {
    const prev = file.samples[i - 1];
    const dt = prev ? (s.t - prev.t) / 1000 : 0;
    const cpuCores =
      s.proc && prev?.proc && dt > 0
        ? (s.proc.cpuTicks - prev.proc.cpuTicks) / 100 / dt
        : undefined;
    return {
      t: s.t,
      cpuCores,
      rssMb: s.proc?.rssMb,
      fds: s.proc?.fds,
      sampleCostMs: s.sampleCostMs,
    };
  });
  const chartName = `chart-${run.label}.html`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    path.join(ctx.outDir, chartName),
    renderChartHtml({ title: `${ctx.caseDef.id} ${run.label}`, bins, samples, gaps: file.gaps }),
  );
  return {
    gaps,
    skewMs: skew.skewMs,
    skewLimitMs: SKEW_LIMIT_MS,
    files: [`telemetry-${run.label}.json`, `telemetry-${run.label}.csv`, chartName],
    sources: { proc: file.sources.proc?.present ?? false },
  };
}
