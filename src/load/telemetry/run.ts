import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { readPointsGz, readPointsGzStream } from "../chart/k6-points.ts";

/** Above this size the points file is read as a stream (plan task 1 §6.6). */
const POINTS_STREAM_BYTES = 20 * 1024 * 1024;
/** Knee runs keep their points file only up to this size. */
const POINTS_KEEP_BYTES = 25 * 1024 * 1024;
import { renderChartHtml, type ChartSample } from "../chart/render-chart.ts";
import type { CgroupKind } from "./cgroup-stats.ts";
import type { TwentyContainer } from "./docker-stats.ts";
import { startSampler, type Sampler, type SamplerOptions } from "./sampler.ts";
import { readStatementSnapshot, topQueryDeltas, type StatementSnapshot } from "./pg-top-queries.ts";
import { perSecondMaxP99, readElWindow, type ElWindow } from "./event-loop.ts";
import { judgeSkew, offsetsFromSummary, startMarkerServer } from "./markers.ts";
import type { AppProcess } from "./proc-group.ts";
import type {
  K6RunResult,
  K6RunSpec,
  LoadContext,
  LoadProduct,
  TelemetrySummary,
} from "../types.ts";

export const SKEW_LIMIT_MS = 100;

/** What the sampler can read for one product. A missing entry is an absent source, with the reason the sampler reports. */
export interface ProductSources {
  product: LoadProduct;
  pool?: pg.Pool;
  container?: { id: string; kind: CgroupKind };
  logFile?: string;
  probeUrl?: string;
  appProcess?: AppProcess[];
  /** The Twenty containers the sampler reads each tick (Twenty plan §6.4). Absent for every other product. */
  containers?: TwentyContainer[];
}

export interface RunTelemetry {
  marker: { url: string; close(): Promise<void> };
  sampler: Sampler;
  label: string;
  pool?: pg.Pool;
  statementsStart?: StatementSnapshot;
  statementsError?: string;
}

/** HARNESS_PG_STATS=1 turns the top-query rows on; any other value (or an empty one) is off (harness Task 1). */
const pgStatsOn = () => process.env.HARNESS_PG_STATS === "1";

/** Starts the marker server (with the spec's skew, if any) and the sampler for one k6 run. `overrides` is for tests (clock, sleep). */
export async function startRunTelemetry(
  ctx: LoadContext,
  spec: K6RunSpec,
  sources: ProductSources,
  overrides: Partial<SamplerOptions> = {},
): Promise<RunTelemetry> {
  const marker = await startMarkerServer({ skewMs: spec.markerSkewMs ?? 0 });
  const sampler = startSampler({
    ...sources,
    intervalMs: 1000,
    outDir: ctx.outDir,
    label: spec.label,
    injectGapMs: spec.injectGapMs,
    ...overrides,
  });
  const run: RunTelemetry = { marker, sampler, label: spec.label, pool: sources.pool };
  if (pgStatsOn() && sources.pool) {
    // The first snapshot is taken before k6 starts; a failure is recorded in the block, never thrown into the run.
    try {
      run.statementsStart = await readStatementSnapshot(sources.pool);
    } catch (err) {
      run.statementsError = (err as Error).message;
    }
  }
  return run;
}

/** The run's top statements (plan §6). INCONCLUSIVE on a negative delta, an eviction or a snapshot that failed. */
async function topQueriesBlock(run: RunTelemetry): Promise<Record<string, unknown> | undefined> {
  if (!run.pool || (!run.statementsStart && !run.statementsError)) return undefined;
  if (!run.statementsStart) {
    return { schema: 1, status: "INCONCLUSIVE", topN: 10, reason: run.statementsError, rows: [] };
  }
  let end: StatementSnapshot;
  try {
    end = await readStatementSnapshot(run.pool);
  } catch (err) {
    return {
      schema: 1,
      status: "INCONCLUSIVE",
      topN: 10,
      reason: (err as Error).message,
      rows: [],
    };
  }
  const delta = topQueryDeltas(run.statementsStart, end);
  const status = delta.droppedNegative > 0 || delta.evicted ? "INCONCLUSIVE" : "PASS";
  return {
    schema: 1,
    status,
    topN: 10,
    droppedNegative: delta.droppedNegative,
    evicted: delta.evicted,
    rows: delta.rows,
  };
}

/** The preload rows of this run (plan §6): FAIL on a broken row, INCONCLUSIVE when a server pid is short or none is present. */
function eventLoopBlock(el: ElWindow): Record<string, unknown> {
  const status =
    el.invalid > 0
      ? "FAIL"
      : !el.present || el.pids === 0 || el.shortPids.length > 0
        ? "INCONCLUSIVE"
        : "PASS";
  return {
    schema: 1,
    status,
    unit: "ms",
    pids: el.pids,
    shortPids: el.shortPids,
    invalid: el.invalid,
    ...(el.firstBad ? { firstBad: el.firstBad } : {}),
    rows: el.rows,
  };
}

/** Stops the sampler, closes the marker (even when a file write fails), writes the chart and returns the run's own summary. */
export async function finishRunTelemetry(
  ctx: LoadContext,
  run: RunTelemetry,
  result: K6RunResult,
): Promise<TelemetrySummary> {
  let file;
  try {
    file = await run.sampler.stop();
  } finally {
    await run.marker.close();
  }
  const topQueries = await topQueriesBlock(run);
  const elDir = process.env.HARNESS_EL_OUT;
  const el = elDir
    ? readElWindow(
        elDir,
        file.startedAtMs,
        file.stoppedAtMs,
        (file.stoppedAtMs - file.startedAtMs) / 1000,
      )
    : undefined;
  if (topQueries || el) {
    // The sampler wrote the JSON; the two keys are added after it, and only when a flag is on.
    const jsonPath = path.join(ctx.outDir, `telemetry-${run.label}.json`);
    const doc = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
    const elBlock = el ? eventLoopBlock(el) : undefined;
    if (topQueries) doc.topQueries = topQueries;
    if (elBlock) doc.eventLoop = elBlock;
    writeFileSync(jsonPath, `${JSON.stringify(doc, null, 2)}\n`);
    // The job-summary lines of P6-X-LOAD-002 (plan §9), one per block that is on.
    const summaryLines = [
      topQueries &&
        `P6-X-LOAD-002 top queries: ${topQueries.status} (${(topQueries.rows as unknown[]).length} rows, ${topQueries.droppedNegative ?? 0} dropped, ${topQueries.evicted ? "evicted" : "not evicted"})`,
      el && `P6-X-LOAD-002 event loop: ${elBlock?.status} (${el.rows.length} rows, server role)`,
    ].filter((line): line is string => typeof line === "string");
    if (process.env.GITHUB_STEP_SUMMARY && summaryLines.length > 0)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join("\n")}\n`);
  }
  const summary = existsSync(result.summaryPath)
    ? (JSON.parse(readFileSync(result.summaryPath, "utf8")) as unknown)
    : undefined;
  const skew = judgeSkew(offsetsFromSummary(summary), SKEW_LIMIT_MS);
  const gaps = file.gaps.map((g) => `${g.lengthMs} ms at +${g.fromMs - file.startedAtMs} ms`);
  // Plan task 1 §6.6: a points file over 20 MB is read as a stream; the bins are the same either way.
  const pointsBytes = existsSync(result.pointsPath) ? statSync(result.pointsPath).size : 0;
  const bins =
    pointsBytes === 0
      ? []
      : pointsBytes > POINTS_STREAM_BYTES
        ? await readPointsGzStream(result.pointsPath)
        : readPointsGz(result.pointsPath);
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
      probeMs: s.probe?.ms,
    };
  });
  const chartName = `chart-${run.label}.html`;
  const kneeSpec = ctx.caseDef.runs(ctx).find((s) => s.label === run.label)?.knee;
  const t0 = Number(
    (summary as { metrics?: Record<string, { value?: number }> } | undefined)?.metrics
      ?.p6_knee_t0_ms?.value,
  );
  const steps =
    kneeSpec && Number.isFinite(t0)
      ? Array.from({ length: kneeSpec.maxSteps }, (_, index) => {
          const from = index * (kneeSpec.rampSec + kneeSpec.holdSec) + kneeSpec.rampSec;
          const rate = Math.round((kneeSpec.startRate + index * kneeSpec.stepRate) * 10) / 10;
          return {
            index,
            rate,
            fromMs: t0 + from * 1000,
            toMs: t0 + (from + kneeSpec.holdSec) * 1000,
          };
        })
      : undefined;
  writeFileSync(
    path.join(ctx.outDir, chartName),
    renderChartHtml({
      title: `${ctx.caseDef.id} ${run.label}`,
      bins,
      samples,
      gaps: file.gaps,
      steps,
      eventLoop: el && el.rows.length > 0 ? perSecondMaxP99(el.rows) : undefined,
    }),
  );
  // Knee runs keep the points file only up to 25 MB (plan §6.6); a larger one is removed after its chart.
  if (kneeSpec && pointsBytes > POINTS_KEEP_BYTES) rmSync(result.pointsPath, { force: true });
  return {
    gaps,
    skewMs: skew.skewMs,
    skewLimitMs: SKEW_LIMIT_MS,
    files: [`telemetry-${run.label}.json`, `telemetry-${run.label}.csv`, chartName],
    sources: Object.fromEntries(Object.entries(file.sources).map(([k, v]) => [k, v.present])),
  };
}
