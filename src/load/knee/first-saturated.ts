// The "first saturated resource" rule (plan task 1 §3.6, §3.9 R2). Pure: the telemetry samples and the windows are passed in.

export const SATURATION = {
  appCores: 0.9, // floor; the level is also 0.85 x the run's peak step mean (R2)
  appPeakFraction: 0.85,
  hostBusy: 0.85,
  dbWaiting: 1,
  dbConnFraction: 0.8,
  dbCores: 0.9,
  fdsFraction: 0.8,
  probeFactor: 10,
} as const;
export const SATURATED_FRACTION = 0.5;
export const EDGE_TRIM_MS = 2000;

export type Resource =
  "app_cpu" | "runner_cpu" | "db_wait" | "db_conn" | "db_cpu" | "app_fds" | "probe_slow";

/** Tie-break order when two resources saturate at the same step. */
export const PRIORITY: Resource[] = [
  "app_cpu",
  "runner_cpu",
  "db_wait",
  "db_conn",
  "db_cpu",
  "app_fds",
  "probe_slow",
];

/** The telemetry source each resource is read from (plan §3.6). */
const SOURCE_OF: Record<Resource, string> = {
  app_cpu: "proc",
  runner_cpu: "host",
  db_wait: "db",
  db_conn: "db",
  db_cpu: "container",
  app_fds: "proc",
  probe_slow: "probe",
};

/** A window is a hold of one step, in absolute epoch ms (from `p6_knee_t0_ms` and the plan). */
export interface Window {
  index: number;
  fromMs: number;
  toMs: number;
}

export interface FirstSaturated {
  resource: Resource | "none_observed";
  step: number | null;
  perResource: Record<
    Resource,
    { observed: boolean; fractionByStep: number[]; firstSaturatedStep: number | null }
  >;
  absentSources: string[]; // sources the telemetry file marks present:false
}

/** The subset of a telemetry sample this rule reads (plan §3.6). */
export interface RuleSample {
  t: number;
  proc?: { cpuTicks: number; fds?: number };
  db?: { total: number; waiting: number; waitingLocks: number };
  container?: { cpuNs: number };
  probe?: { ok: boolean; ms: number };
  host?: { busyFraction: number };
}

/** Cores of the application group at sample i, from the cpu ticks of the previous sample (100 ticks per second). */
function appCoresAt(samples: RuleSample[], i: number): number | undefined {
  const cur = samples[i]?.proc;
  const prev = samples[i - 1];
  if (!cur || !prev?.proc) return undefined;
  const dtSec = (samples[i]!.t - prev.t) / 1000;
  if (!(dtSec > 0)) return undefined;
  return (cur.cpuTicks - prev.proc.cpuTicks) / 100 / dtSec;
}

/** Cores of the database container at sample i, from its cgroup cpu time (nanoseconds). */
function containerCoresAt(samples: RuleSample[], i: number): number | undefined {
  const cur = samples[i]?.container;
  const prev = samples[i - 1];
  if (!cur || !prev?.container) return undefined;
  const dtSec = (samples[i]!.t - prev.t) / 1000;
  if (!(dtSec > 0)) return undefined;
  return (cur.cpuNs - prev.container.cpuNs) / 1e9 / dtSec;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function firstSaturated(input: {
  samples: RuleSample[];
  windows: Window[];
  limits: { maxConnections?: number; fdsSoftLimit?: number };
  sources: Record<string, { present: boolean; errors?: number }>;
}): FirstSaturated {
  const samples = [...input.samples].sort((a, b) => a.t - b.t);
  const windows = [...input.windows].sort((a, b) => a.index - b.index);
  const absentSources = Object.keys(input.sources)
    .filter((name) => input.sources[name]!.present === false)
    .sort();
  const absent = new Set(absentSources);
  const steps = windows.map((w) => w.index);

  // The samples of each window, with the cores of the application group and of the database container per sample.
  const perWindow = windows.map((w) => {
    const picks = samples
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.t >= w.fromMs + EDGE_TRIM_MS && s.t <= w.toMs - EDGE_TRIM_MS);
    return picks;
  });

  // The baseline of probe_slow: the median probe time of the first window that has any probe reading.
  const probeBaseline = (() => {
    for (const picks of perWindow) {
      const ms = picks.flatMap(({ s }) => (s.probe?.ok ? [s.probe.ms] : []));
      const m = median(ms);
      if (m !== undefined) return m;
    }
    return undefined;
  })();

  // The application mean cores per window; app_cpu is judged per step against the run's peak step mean (R2).
  const appMeans = perWindow.map((picks) => {
    const values = picks.flatMap(({ i }) => {
      const c = appCoresAt(samples, i);
      return c === undefined ? [] : [c];
    });
    return values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0) / values.length;
  });
  const peakMean = Math.max(0, ...appMeans.map((m) => m ?? 0));

  const perResource = {} as FirstSaturated["perResource"];
  for (const resource of PRIORITY) {
    const sourceAbsent = absent.has(SOURCE_OF[resource]);
    const fractionByStep: number[] = [];
    const saturatedAt: Array<boolean | undefined> = [];
    let observed = false;

    perWindow.forEach((picks, w) => {
      if (resource === "app_cpu") {
        const mean = appMeans[w];
        if (sourceAbsent || mean === undefined) {
          fractionByStep.push(0);
          saturatedAt.push(undefined);
          return;
        }
        observed = true;
        const ratio = peakMean > 0 ? mean / peakMean : 0;
        fractionByStep.push(ratio);
        saturatedAt.push(
          mean >= SATURATION.appPeakFraction * peakMean && mean >= SATURATION.appCores,
        );
        return;
      }
      let defined = 0;
      let over = 0;
      for (const { s, i } of picks) {
        const level = overLevel(resource, s, i, samples, input.limits, probeBaseline);
        if (level === undefined) continue;
        defined += 1;
        if (level) over += 1;
      }
      if (sourceAbsent || defined === 0) {
        fractionByStep.push(0);
        saturatedAt.push(undefined);
        return;
      }
      observed = true;
      const fraction = over / defined;
      fractionByStep.push(fraction);
      saturatedAt.push(fraction >= SATURATED_FRACTION);
    });

    perResource[resource] = {
      observed: observed && !sourceAbsent,
      fractionByStep,
      firstSaturatedStep: firstStepSaturatedToTheEnd(saturatedAt, steps),
    };
  }

  // The winner: the smallest first saturated step; ties go to the fixed priority order.
  let best: { resource: Resource; step: number } | undefined;
  for (const resource of PRIORITY) {
    const step = perResource[resource].firstSaturatedStep;
    if (step === null || !perResource[resource].observed) continue;
    if (!best || step < best.step) best = { resource, step };
  }
  return {
    resource: best ? best.resource : "none_observed",
    step: best ? best.step : null,
    perResource,
    absentSources,
  };
}

/** true or false when the resource's level can be read from this sample, undefined when it cannot. */
function overLevel(
  resource: Exclude<Resource, "app_cpu">,
  s: RuleSample,
  i: number,
  samples: RuleSample[],
  limits: { maxConnections?: number; fdsSoftLimit?: number },
  probeBaseline: number | undefined,
): boolean | undefined {
  switch (resource) {
    case "runner_cpu":
      return s.host ? s.host.busyFraction >= SATURATION.hostBusy : undefined;
    case "db_wait":
      return s.db
        ? s.db.waiting >= SATURATION.dbWaiting || s.db.waitingLocks >= SATURATION.dbWaiting
        : undefined;
    case "db_conn":
      if (!s.db || !limits.maxConnections) return undefined;
      return s.db.total >= SATURATION.dbConnFraction * limits.maxConnections;
    case "db_cpu": {
      const cores = containerCoresAt(samples, i);
      return cores === undefined ? undefined : cores >= SATURATION.dbCores;
    }
    case "app_fds":
      if (!s.proc || s.proc.fds === undefined || !limits.fdsSoftLimit) return undefined;
      return s.proc.fds >= SATURATION.fdsFraction * limits.fdsSoftLimit;
    case "probe_slow":
      if (!s.probe?.ok || probeBaseline === undefined) return undefined;
      return s.probe.ms >= SATURATION.probeFactor * probeBaseline;
  }
}

/** The first step from which the resource is saturated in every observed step to the end; null when there is none. */
function firstStepSaturatedToTheEnd(
  saturatedAt: Array<boolean | undefined>,
  steps: number[],
): number | null {
  const observedIdx = saturatedAt.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0);
  let first: number | null = null;
  for (let k = observedIdx.length - 1; k >= 0; k--) {
    const i = observedIdx[k]!;
    if (saturatedAt[i] !== true) break;
    first = steps[i]!;
  }
  return first;
}
