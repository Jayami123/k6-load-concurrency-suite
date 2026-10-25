// Host cpu and memory of the box the run shares (plan task 1 §3.9 R2). Reads /proc only; no writes, no process signals.
import { readFileSync } from "node:fs";

/** Jiffies of the whole machine: `busy` is user, nice, system, irq, softirq and steal; `total` adds idle and iowait. */
export interface CpuTimes {
  busy: number;
  total: number;
}

export interface HostSample {
  busyFraction?: number; // share of busy jiffies since the previous sample; absent on the first sample
  memAvailableKb?: number;
}

/** The first `cpu ` line of /proc/stat. Undefined when the line is missing or short. */
export function parseProcStatCpu(text: string): CpuTimes | undefined {
  const line = text.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) return undefined;
  const f = line.trim().split(/\s+/).slice(1).map(Number);
  if (f.length < 8 || f.some((n) => !Number.isFinite(n))) return undefined;
  const [user, nice, system, idle, iowait, irq, softirq, steal] = f as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const busy = user + nice + system + irq + softirq + steal;
  return { busy, total: busy + idle + iowait };
}

/** Busy share between two reads. Undefined when no jiffy passed. */
export function busyFraction(prev: CpuTimes, cur: CpuTimes): number | undefined {
  const dTotal = cur.total - prev.total;
  if (!(dTotal > 0)) return undefined;
  return (cur.busy - prev.busy) / dTotal;
}

/** MemAvailable from /proc/meminfo, in kB. */
export function parseMemAvailableKb(text: string): number | undefined {
  const m = /^MemAvailable:\s+(\d+)\s+kB/m.exec(text);
  return m ? Number(m[1]) : undefined;
}

export interface HostReaders {
  stat: () => string;
  meminfo: () => string;
}

const realReaders: HostReaders = {
  stat: () => readFileSync("/proc/stat", "utf8"),
  meminfo: () => readFileSync("/proc/meminfo", "utf8"),
};

/**
 * One host sample. `prev` is the cpu reading of the previous sample (absent on the first); the returned `cpu` is the reading to pass
 * on. A read that fails leaves its field out: no number is invented.
 */
export function readHostSample(
  prev?: CpuTimes,
  readers: HostReaders = realReaders,
): { sample: HostSample; cpu?: CpuTimes } {
  const sample: HostSample = {};
  let cpu: CpuTimes | undefined;
  try {
    cpu = parseProcStatCpu(readers.stat());
    if (cpu && prev) sample.busyFraction = busyFraction(prev, cpu);
  } catch {
    cpu = undefined;
  }
  try {
    sample.memAvailableKb = parseMemAvailableKb(readers.meminfo());
  } catch {
    // absent for this sample
  }
  if (sample.memAvailableKb === undefined) delete sample.memAvailableKb;
  if (sample.busyFraction === undefined) delete sample.busyFraction;
  return { sample, cpu };
}
