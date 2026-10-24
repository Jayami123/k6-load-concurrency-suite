import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { findGaps } from "./gaps.ts";
import { readGroupStats, type AppProcess, type GroupStats } from "./proc-group.ts";
import { readPgSample, type PgSample } from "./pg-stats.ts";
import { readContainerStats, type CgroupKind } from "./cgroup-stats.ts";
import { createLogCounter, type LogCounts, type LogIo } from "./log-grep.ts";
import { timedProbe, type ProbeResult } from "./probe.ts";
import type { LoadProduct } from "../types.ts";

export interface TelemetrySample {
  t: number;
  proc?: GroupStats;
  db?: PgSample;
  container?: { cpuNs: number; memBytes: number };
  log?: LogCounts;
  probe?: ProbeResult;
  sampleCostMs: number;
}

export interface TelemetryFile {
  schema: 1;
  product: LoadProduct;
  startedAtMs: number;
  stoppedAtMs: number;
  intervalMs: number;
  sources: Record<string, { present: boolean; reason?: string; errors?: number }>;
  samples: TelemetrySample[];
  gaps: Array<{ fromMs: number; toMs: number; lengthMs: number }>;
}

export interface SamplerOptions {
  product: LoadProduct;
  intervalMs?: number;
  appProcess?: AppProcess[];
  /** The case database (a pool of max 1, owned by the caller). Absent when undefined. */
  pool?: pg.Pool;
  /** The database container and its cgroup kind (discovered once at start). */
  container?: { id: string; kind: CgroupKind };
  /** The product's health URL (the first READINESS URL). */
  probeUrl?: string;
  /** The product's log file; counts only are kept. */
  logFile?: string;
  logIo?: LogIo;
  /** Self-test only: the loop stalls once for this long, after three samples. */
  injectGapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  readGroup?: (pgid: number) => GroupStats;
  outDir?: string;
  label?: string;
}

export interface Sampler {
  stop(): Promise<TelemetryFile>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Samples every intervalMs until stop(). The timestamp t is taken first; the next sample is scheduled at startedAt + n x interval
 * (no drift). The sources of one sample are read in parallel; a source that throws is absent for that sample only and counted in
 * sources[...].errors. Writes telemetry-<label>.json and .csv into outDir on stop.
 */
export function startSampler(opts: SamplerOptions): Sampler {
  const intervalMs = opts.intervalMs ?? 1000;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const readGroup = opts.readGroup ?? ((pgid: number) => readGroupStats(pgid));
  const startedAtMs = now();
  const samples: TelemetrySample[] = [];
  const errors: Record<string, number> = { proc: 0, db: 0, container: 0, log: 0, probe: 0 };
  const logCounter = opts.logFile
    ? createLogCounter(opts.logFile, opts.product, opts.logIo)
    : undefined;
  let running = true;
  let injected = false;

  const sources: TelemetryFile["sources"] = {
    proc: opts.appProcess ? { present: true } : { present: false, reason: "no app process record" },
    db: opts.pool ? { present: true } : { present: false, reason: "no database pool" },
    container:
      opts.container && opts.container.kind !== "absent"
        ? { present: true }
        : { present: false, reason: "no database container" },
    log: opts.logFile ? { present: true } : { present: false, reason: "no log file" },
    probe: opts.probeUrl ? { present: true } : { present: false, reason: "no probe url" },
  };

  const readProc = (sample: TelemetrySample): void => {
    if (!opts.appProcess) return;
    try {
      const total: GroupStats = { cpuTicks: 0, rssMb: 0, fds: 0, members: 0 };
      for (const app of opts.appProcess) {
        const g = readGroup(app.pgid);
        total.cpuTicks += g.cpuTicks;
        total.rssMb += g.rssMb;
        total.fds += g.fds;
        total.members += g.members;
      }
      sample.proc = total;
    } catch {
      errors.proc = (errors.proc ?? 0) + 1;
    }
  };

  const readAll = async (sample: TelemetrySample): Promise<void> => {
    readProc(sample);
    const tasks: Array<Promise<void>> = [];
    if (opts.pool) {
      const pool = opts.pool;
      tasks.push(
        readPgSample(pool).then(
          (db) => {
            sample.db = db;
          },
          () => {
            errors.db = (errors.db ?? 0) + 1;
          },
        ),
      );
    }
    if (opts.container && opts.container.kind !== "absent") {
      const { id, kind } = opts.container;
      tasks.push(
        Promise.resolve()
          .then(() => readContainerStats(kind, id))
          .then(
            (c) => {
              if (c) sample.container = c;
              else errors.container = (errors.container ?? 0) + 1;
            },
            () => {
              errors.container = (errors.container ?? 0) + 1;
            },
          ),
      );
    }
    if (logCounter) {
      tasks.push(
        Promise.resolve().then(
          () => {
            sample.log = logCounter.poll();
          },
          () => {
            errors.log = (errors.log ?? 0) + 1;
          },
        ),
      );
    }
    if (opts.probeUrl) {
      const url = opts.probeUrl;
      tasks.push(
        timedProbe(url).then(
          (p) => {
            sample.probe = p;
          },
          () => {
            errors.probe = (errors.probe ?? 0) + 1;
          },
        ),
      );
    }
    await Promise.all(tasks);
  };

  const loop = (async () => {
    let n = 0;
    while (running) {
      const target = startedAtMs + n * intervalMs;
      const wait = Math.max(0, target - now());
      await sleep(wait);
      if (!running) break;
      if (opts.injectGapMs && !injected && samples.length === 3) {
        injected = true;
        await sleep(opts.injectGapMs);
      }
      const sampleStart = now();
      const sample: TelemetrySample = { t: sampleStart, sampleCostMs: 0 };
      await readAll(sample);
      sample.sampleCostMs = now() - sampleStart;
      samples.push(sample);
      n += 1;
    }
  })();

  return {
    async stop(): Promise<TelemetryFile> {
      running = false;
      await loop;
      if (opts.appProcess) sources.proc = { present: true, errors: errors.proc ?? 0 };
      if (opts.pool) sources.db = { present: true, errors: errors.db ?? 0 };
      if (opts.container && opts.container.kind !== "absent")
        sources.container = { present: true, errors: errors.container ?? 0 };
      if (opts.logFile) sources.log = { present: true, errors: errors.log ?? 0 };
      if (opts.probeUrl) sources.probe = { present: true, errors: errors.probe ?? 0 };
      const stoppedAtMs = now();
      const file: TelemetryFile = {
        schema: 1,
        product: opts.product,
        startedAtMs,
        stoppedAtMs,
        intervalMs,
        sources,
        samples,
        gaps: findGaps(
          samples.map((s) => s.t),
          intervalMs,
        ),
      };
      if (opts.outDir) {
        mkdirSync(opts.outDir, { recursive: true });
        const label = opts.label ?? "run";
        writeFileSync(
          path.join(opts.outDir, `telemetry-${label}.json`),
          `${JSON.stringify(file, null, 2)}\n`,
        );
        // The CSV twin keeps the process columns only (its contract, pinned by the sampler test); every source is in the JSON.
        const rows = samples.map((s) =>
          [
            s.t,
            s.proc?.cpuTicks ?? "",
            s.proc?.rssMb ?? "",
            s.proc?.fds ?? "",
            s.proc?.members ?? "",
            s.sampleCostMs,
          ].join(","),
        );
        writeFileSync(
          path.join(opts.outDir, `telemetry-${label}.csv`),
          ["t,cpuTicks,rssMb,fds,members,sampleCostMs", ...rows].join("\n") + "\n",
        );
      }
      return file;
    },
  };
}
