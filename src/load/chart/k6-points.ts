import { gunzipSync, createGunzip } from "node:zlib";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

export interface SecondBin {
  t: number; // epoch ms of the second
  requests: number;
  p95Ms?: number;
}

/** Nearest-rank p95 of a list of values (the same rule a reader expects from a percentile). */
export function nearestRankP95(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
}

/**
 * Per-second bins of http_reqs (count) and http_req_duration (values), fed one line at a time. Other metrics are ignored.
 * Memory is the bins: a second's durations, not the lines of the whole file.
 */
function pointBins() {
  const bins = new Map<number, { requests: number; durations: number[] }>();
  return {
    add(line: string): void {
      if (!line.includes('"Point"')) return;
      const point = JSON.parse(line) as {
        type?: string;
        metric?: string;
        data?: { time?: string; value?: number };
      };
      if (point.type !== "Point" || !point.data?.time) return;
      if (point.metric !== "http_reqs" && point.metric !== "http_req_duration") return;
      const second = Math.floor(Date.parse(point.data.time) / 1000) * 1000;
      const bin = bins.get(second) ?? { requests: 0, durations: [] };
      if (point.metric === "http_reqs") bin.requests += 1;
      if (point.metric === "http_req_duration" && typeof point.data.value === "number")
        bin.durations.push(point.data.value);
      bins.set(second, bin);
    },
    done(): SecondBin[] {
      return [...bins.entries()]
        .sort(([a], [b]) => a - b)
        .map(([t, b]) => ({ t, requests: b.requests, p95Ms: nearestRankP95(b.durations) }));
    },
  };
}

/** Bins http_reqs and http_req_duration per second. Input: k6 JSON-lines output. */
export function aggregatePoints(lines: Iterable<string>): SecondBin[] {
  const bins = pointBins();
  for (const line of lines) bins.add(line);
  return bins.done();
}

/** Reads a k6 --out json=<file>.json.gz file (gzip) and aggregates it per second. */
export function readPointsGz(path: string): SecondBin[] {
  const text = gunzipSync(readFileSync(path)).toString("utf8");
  return aggregatePoints(text.split("\n"));
}

/**
 * Same bins as readPointsGz, read line by line (plan task 1 §6.6): memory stays at the per-second bins plus the two metric lines
 * per request, however large the file is. Used for the knee runs, whose points files can be tens of MB.
 */
export async function readPointsGzStream(path: string): Promise<SecondBin[]> {
  const lines = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const bins = pointBins();
  for await (const line of lines) bins.add(line);
  return bins.done();
}
