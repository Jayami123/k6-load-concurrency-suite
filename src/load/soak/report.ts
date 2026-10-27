import { d33Growth, type D33Result } from "./d33.ts";
import { plateauRatio, type PlateauResult } from "./plateau.ts";
import { soakSlope, warmupSecFor, type SlopeResult, type SoakPoint } from "./slope.ts";

/** The part of telemetry-main.json that a soak reads: the sample time and the three metrics. */
export interface SoakTelemetry {
  samples: Array<{ t: number; proc?: { rssMb?: number; fds?: number }; db?: { total?: number } }>;
}

export interface SoakMetricStats {
  slope: SlopeResult;
  plateau: PlateauResult;
}

export interface SoakStatistics {
  durationSec: number;
  warmupSec: number;
  rssMb: SoakMetricStats;
  fds: SoakMetricStats;
  dbConnections: SoakMetricStats;
  /** D33 (owner decision): the growth check of RSS over the last 60 minutes only. A flag is an investigation, not a verdict. */
  rssD33: D33Result;
}

/** The (time, value) points of the samples that have a numeric value for the picked metric. */
function pointsOf(
  samples: SoakTelemetry["samples"],
  pick: (s: SoakTelemetry["samples"][number]) => number | undefined,
): SoakPoint[] {
  const out: SoakPoint[] = [];
  for (const s of samples) {
    const value = pick(s);
    if (typeof value === "number") out.push({ tMs: s.t, value });
  }
  return out;
}

/**
 * The statistics of a soak's telemetry: RSS, open fds and pg connections, each with its least-squares and Theil–Sen slope
 * after warm-up and its plateau ratio. Only statistics: the points are not written (L5).
 */
export function soakStatistics(
  telemetry: SoakTelemetry,
  startMs: number,
  durationSec: number,
): SoakStatistics {
  const warmupSec = warmupSecFor(durationSec);
  const stats = (points: SoakPoint[]): SoakMetricStats => ({
    slope: soakSlope(points, startMs, warmupSec),
    plateau: plateauRatio(points, startMs, warmupSec),
  });
  return {
    durationSec,
    warmupSec,
    rssMb: stats(pointsOf(telemetry.samples, (s) => s.proc?.rssMb)),
    fds: stats(pointsOf(telemetry.samples, (s) => s.proc?.fds)),
    dbConnections: stats(pointsOf(telemetry.samples, (s) => s.db?.total)),
    rssD33: d33Growth(pointsOf(telemetry.samples, (s) => s.proc?.rssMb)),
  };
}
