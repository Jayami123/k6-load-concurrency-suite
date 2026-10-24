import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findGaps } from "./gaps.ts";
import { readGroupStats, type AppProcess, type GroupStats } from "./proc-group.ts";
import type { LoadProduct } from "../types.ts";

export interface TelemetrySample {
  t: number;
  proc?: GroupStats;
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
 * Samples every intervalMs until stop(). The timestamp t is taken first; the next sample is scheduled at startedAt + n x interval (no drift).
 * A source that throws becomes absent for that sample only and is counted in sources[...].errors. Writes telemetry-<label>.json and .csv
 * into outDir on stop.
 */
export function startSampler(opts: SamplerOptions): Sampler {
  const intervalMs = opts.intervalMs ?? 1000;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const readGroup = opts.readGroup ?? ((pgid: number) => readGroupStats(pgid));
  const startedAtMs = now();
  const samples: TelemetrySample[] = [];
  const procErrors = { count: 0 };
  let running = true;
  let injected = false;

  const sources: TelemetryFile["sources"] = {
    proc: opts.appProcess ? { present: true } : { present: false, reason: "no app process record" },
  };

  const readSample = (): void => {
    const t = now();
    const sampleStart = t;
    const sample: TelemetrySample = { t, sampleCostMs: 0 };
    if (opts.appProcess) {
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
        procErrors.count += 1;
      }
    }
    sample.sampleCostMs = now() - sampleStart;
    samples.push(sample);
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
      readSample();
      n += 1;
    }
  })();

  return {
    async stop(): Promise<TelemetryFile> {
      running = false;
      await loop;
      if (opts.appProcess) sources.proc = { present: true, errors: procErrors.count };
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
