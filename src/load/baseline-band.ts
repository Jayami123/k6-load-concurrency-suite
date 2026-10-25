// The steady baseline band (plan Phase 4 task 5 §6.4): the spread of the run-level values and of the 10-second window p95s over the
// VALID steady runs. Conventions of smoke-baseline.ts and knee/bounds.ts. The band is a record, not a gate: no k6 script reads it.
import { medianOf, runIdOf, selectPublishable, type LoadRunRecord } from "./medians.ts";
import type { SecondBin } from "./chart/k6-points.ts";
import type { RunMeta } from "./types.ts";

export const WINDOW_SEC = 10;
export const MIN_WINDOW_REQUESTS = 40;

/** The run-level values of one steady run (the whole-run k6 summary; the warm-up is not cut from it, plan §6.4). */
export interface RunValues {
  runId: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  requestsPerSec: number;
}

/** A folder of one steady run: its verdict and meta, the whole-run k6 summary and the per-second bins of its points file. */
export interface RunFolder {
  verdict: LoadRunRecord["verdict"];
  meta: RunMeta;
  summary: { metrics?: Record<string, { values?: Record<string, number>; rate?: number }> };
  bins: SecondBin[];
}

export interface Band {
  min: number;
  median: number;
  max: number;
  n: number;
}

export type BandMetric = "p50Ms" | "p95Ms" | "p99Ms" | "errorRate" | "requestsPerSec";

export interface BandProduct {
  caseId: string;
  profile: "steady";
  rate: number;
  durationSec: number;
  n: number;
  runIds: string[];
  environment: string;
  environments: Record<string, string>;
  notes: string[];
  metrics: Record<BandMetric, Band>;
  windowP95: Band & { windows: number };
}

export interface BaselineBand {
  schema: 1;
  metric: "steady baseline band";
  unit: "ms for latencies; per second for rates; fraction for error rate";
  release: string; // "p6-phase4a"
  windowSec: typeof WINDOW_SEC;
  minWindowRequests: typeof MIN_WINDOW_REQUESTS;
  products: Record<string, BandProduct>;
}

function requireNumber(value: number | undefined, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`baseline band: ${what} is missing from the k6 summary`);
  return value;
}

/** The run-level values of one folder: the http_req_duration percentiles, the error rate and the request rate of the k6 summary. */
export function runValues(folder: RunFolder): RunValues {
  const m = folder.summary.metrics ?? {};
  const duration = m.http_req_duration?.values;
  return {
    runId: runIdOf(folder.meta) ?? folder.meta.runId,
    p50Ms: requireNumber(duration?.med, "http_req_duration med"),
    p95Ms: requireNumber(duration?.["p(95)"], "http_req_duration p(95)"),
    p99Ms: requireNumber(duration?.["p(99)"], "http_req_duration p(99)"),
    errorRate: requireNumber(m.http_req_failed?.values?.rate ?? 0, "http_req_failed rate"),
    requestsPerSec: requireNumber(m.http_reqs?.values?.rate, "http_reqs rate"),
  };
}

/**
 * The p95 of each 10-second window inside the hold (from holdFromSec to holdToSec, both measured from the first bin): a window with
 * fewer than MIN_WINDOW_REQUESTS requests is dropped. The p95 is taken over the per-second p95s of the window, not the per-request
 * values (the points file keeps one p95 per second).
 */
export function windowP95s(bins: SecondBin[], holdFromSec: number, holdToSec: number): number[] {
  if (bins.length === 0) return [];
  const t0 = bins[0]!.t;
  const out: number[] = [];
  for (let start = holdFromSec; start + WINDOW_SEC <= holdToSec; start += WINDOW_SEC) {
    const inWindow = bins.filter((b) => {
      const sec = (b.t - t0) / 1000;
      return sec >= start && sec < start + WINDOW_SEC;
    });
    const requests = inWindow.reduce((sum, b) => sum + b.requests, 0);
    const p95s = inWindow.flatMap((b) => (b.p95Ms === undefined ? [] : [b.p95Ms]));
    if (requests < MIN_WINDOW_REQUESTS || p95s.length === 0) continue;
    const sorted = [...p95s].sort((a, b) => a - b);
    out.push(sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!);
  }
  return out;
}

function bandOf(values: number[]): Band {
  return {
    min: Math.min(...values),
    median: medianOf(values),
    max: Math.max(...values),
    n: values.length,
  };
}

/**
 * One product: the VALID steady runs (selectPublishable), their run-level values and window p95s. Throws with the case id and the
 * reasons when fewer than three remain, or when two runs share a run id.
 */
export function buildBand(input: {
  release: string;
  caseId: string;
  folders: RunFolder[];
}): BandProduct {
  const records = input.folders.map((f) => ({ verdict: f.verdict, meta: f.meta }));
  const { used, excluded } = selectPublishable(records);
  const usedIds = new Set(used.map((r) => r.verdict.runId ?? r.meta.runId));
  const kept = input.folders.filter((f) => usedIds.has(f.verdict.runId ?? f.meta.runId));
  if (kept.length < 3) {
    const reasons = excluded.map((e) => `${e.runId}: ${e.why.join("; ")}`).join(" | ");
    throw new Error(
      `${input.caseId}: ${kept.length} VALID steady run(s), need at least 3. Excluded: ${reasons || "none"}`,
    );
  }
  const ids = kept.map((f) => runIdOf(f.meta)!);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length > 0)
    throw new Error(
      `${input.caseId}: duplicate GitHub Actions run id(s): ${duplicates.join(", ")}`,
    );

  const values = kept.map(runValues);
  const metrics = {} as Record<BandMetric, Band>;
  for (const key of ["p50Ms", "p95Ms", "p99Ms", "errorRate", "requestsPerSec"] as const)
    metrics[key] = bandOf(values.map((v) => v[key]));

  const duration = kept[0]!.meta.durationSec;
  const windows = kept.flatMap((f) => windowP95s(f.bins, WINDOW_SEC, duration));
  if (windows.length === 0)
    throw new Error(`${input.caseId}: no 10-second window has ${MIN_WINDOW_REQUESTS} requests`);

  const environments = Object.fromEntries(
    kept.map((f) => {
      const e = f.meta.environment;
      return [runIdOf(f.meta)!, `${e.runnerImage} ${e.imageVersion}, ${e.nproc} vCPU`];
    }),
  );
  const distinct = [...new Set(Object.values(environments))];
  return {
    caseId: input.caseId,
    profile: "steady",
    rate: kept[0]!.meta.rate,
    durationSec: duration,
    n: kept.length,
    runIds: [...new Set(ids)].sort((a, b) => Number(a) - Number(b)),
    environment: distinct.length === 1 ? distinct[0]! : "mixed",
    environments,
    notes:
      distinct.length === 1
        ? []
        : Object.keys(environments).map((id) => `run ${id}: ${environments[id]}`),
    metrics,
    windowP95: { ...bandOf(windows), windows: windows.length },
  };
}

/** The checks of parseSmokeBaseline, per product: schema 1, n = runIds.length ≥ 3, unique digit-only ascending run ids, finite bands. */
export function parseBaselineBand(value: unknown): BaselineBand {
  const b = value as BaselineBand;
  if (!b || b.schema !== 1) throw new Error("baseline band: schema must be 1");
  if (b.metric !== "steady baseline band") throw new Error("baseline band: metric is wrong");
  for (const [product, c] of Object.entries(b.products ?? {})) {
    if (c.n !== c.runIds.length || c.n < 3)
      throw new Error(`baseline band: ${product} has n ${c.n} for ${c.runIds.length} run ids`);
    if (new Set(c.runIds).size !== c.runIds.length || !c.runIds.every((id) => /^\d+$/.test(id)))
      throw new Error(`baseline band: ${product} has duplicate or non-numeric run ids`);
    for (let i = 1; i < c.runIds.length; i++)
      if (Number(c.runIds[i]) <= Number(c.runIds[i - 1]))
        throw new Error(`baseline band: ${product} run ids are not strictly ascending`);
    for (const band of [...Object.values(c.metrics), c.windowP95]) {
      if (
        ![band.min, band.median, band.max].every((v) => Number.isFinite(v)) ||
        band.min > band.max
      )
        throw new Error(`baseline band: ${product} has a band that is not ordered and finite`);
    }
  }
  return b;
}
