import { readFileSync } from "node:fs";
import type { ResourceSummary } from "./types.ts";

/** After the closing ")" of the command name: [0]=state [1]=ppid [2]=pgrp ... [11]=utime [12]=stime (clock ticks). */
export function parseProcStat(text: string): { ticks: number; pgrp: number } {
  const f = text.slice(text.lastIndexOf(")") + 2).split(" ");
  return { ticks: Number(f[11]) + Number(f[12]), pgrp: Number(f[2]) };
}

/** First line of /proc/stat: "cpu user nice system idle iowait irq softirq steal ...". busy excludes idle and iowait. */
export function parseCpuLine(line: string): { total: number; idle: number } {
  const n = line.trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = n;
  return {
    total: user + nice + system + idle + iowait + irq + softirq + steal,
    idle: idle + iowait,
  };
}

/** Busy percentage between two readings of parseCpuLine. */
export function cpuBusyPct(
  prev: { total: number; idle: number },
  cur: { total: number; idle: number },
): number {
  const dTotal = cur.total - prev.total;
  const dIdle = cur.idle - prev.idle;
  return dTotal > 0 ? (1 - dIdle / dTotal) * 100 : 0;
}

export function memAvailablePct(meminfo: string): number {
  const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(meminfo)?.[1]);
  return (kb("MemAvailable") / kb("MemTotal")) * 100;
}

export interface ResourceSampler {
  /** One reading now. The interval timer calls it; tests call it directly. */
  sample(): void;
  stop(): ResourceSummary | undefined;
}

export interface SamplerOptions {
  intervalMs?: number;
  clockTicksPerSec?: number;
  readFile?: (p: string) => string;
  now?: () => number;
}

/**
 * Reads /proc every intervalMs (default 1000) for the k6 pid and the whole machine. A read that fails (no /proc, pid gone) skips
 * that sample; with zero samples stop() returns undefined and judgeValidity invents no reason.
 */
export function startResourceSampler(pid: number, opts: SamplerOptions = {}): ResourceSampler {
  const intervalMs = opts.intervalMs ?? 1000;
  const clk = opts.clockTicksPerSec ?? 100;
  const readFile = opts.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const now = opts.now ?? Date.now;
  let prev: { k6Ticks: number; wallMs: number; cpu: { total: number; idle: number } } | undefined;
  const cores: number[] = [];
  const busy: number[] = [];
  const mem: number[] = [];
  const max = (xs: number[]) => (xs.length === 0 ? 0 : Math.max(...xs));

  const sample = (): void => {
    try {
      const proc = parseProcStat(readFile(`/proc/${pid}/stat`));
      const cpu = parseCpuLine(readFile("/proc/stat").split("\n")[0] ?? "");
      const memPct = memAvailablePct(readFile("/proc/meminfo"));
      const wallMs = now();
      mem.push(memPct);
      if (prev) {
        const dt = (wallMs - prev.wallMs) / 1000;
        if (dt > 0) {
          cores.push((proc.ticks - prev.k6Ticks) / clk / dt);
          busy.push(cpuBusyPct(prev.cpu, cpu));
        }
      }
      prev = { k6Ticks: proc.ticks, wallMs, cpu };
    } catch {
      // A failed read skips this sample.
    }
  };

  const timer = setInterval(sample, intervalMs);
  return {
    sample,
    stop(): ResourceSummary | undefined {
      clearInterval(timer);
      if (mem.length === 0) return undefined;
      const avg = (xs: number[]) =>
        xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
      return {
        samples: mem.length,
        intervalMs,
        k6CoresAvg: avg(cores),
        k6CoresMax: max(cores),
        runnerBusyPctAvg: avg(busy),
        runnerBusyPctMax: max(busy),
        memAvailablePctMin: Math.min(...mem),
      };
    },
  };
}
