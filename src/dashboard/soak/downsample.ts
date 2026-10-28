export interface Bucket {
  minute: number;
  n: number;
  rssMb: { min: number; mean: number; max: number };
  fds: { min: number; mean: number; max: number };
  dbTotal: { min: number; mean: number; max: number };
}

type Sample = {
  t: number;
  proc?: { rssMb?: number; fds?: number };
  db?: { total?: number };
};

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function minMeanMax(values: number[]): { min: number; mean: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, mean, max };
}

/** 1-minute buckets. intervalMs must be 1000 (TEST BUG if not). Slopes are NOT computed here. */
export function downsampleTelemetry(
  samples: Sample[],
  startedAtMs: number,
  intervalMs: number,
): Bucket[] {
  if (intervalMs !== 1000) throw new Error("TEST BUG: telemetry intervalMs is not 1000");
  const groups = new Map<number, { rssMb: number; fds: number; dbTotal: number }[]>();
  for (const sample of samples) {
    const rssMb = sample.proc?.rssMb;
    const fds = sample.proc?.fds;
    const dbTotal = sample.db?.total;
    if (!finite(sample.t) || !finite(rssMb) || !finite(fds) || !finite(dbTotal)) continue;
    const minute = Math.floor((sample.t - startedAtMs) / 60_000);
    const point = { rssMb, fds, dbTotal };
    const list = groups.get(minute);
    if (list) list.push(point);
    else groups.set(minute, [point]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, group]) => ({
      minute,
      n: group.length,
      rssMb: minMeanMax(group.map((s) => s.rssMb)),
      fds: minMeanMax(group.map((s) => s.fds)),
      dbTotal: minMeanMax(group.map((s) => s.dbTotal)),
    }));
}
