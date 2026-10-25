// The knee lower bounds that the steady baselines are sized from (plan Phase 4 task 5 §6.2). Same conventions as smoke-baseline.ts:
// selection with reasons, the median from medians.ts, a parse check for the committed file.
import { medianOf, runIdOf, selectPublishable, type LoadRunRecord } from "../medians.ts";
import type { KneeReport } from "./knee-report.ts";

export const KNEE_BOUND_CASES = {
  cal: "P6-CAL-LOAD-005",
  medusa: "P6-MED-LOAD-004",
  documenso: "P6-DOC-LOAD-005",
} as const;
export type KneeBoundProduct = keyof typeof KNEE_BOUND_CASES;

export interface KneeBound {
  caseId: string;
  profile: "full";
  lowerBoundRate: number; // the minimum lower-step rate over the used runs: 50 % of it is safe for every run (plan Q1)
  medianLowerRate: number; // context only: the steady rate does not use it
  upperBoundRate: number; // the maximum upper-step rate over the used runs (context)
  n: number;
  runIds: string[]; // GitHub Actions run ids, ascending, unique
  environment: string; // "ubuntu24 20261023.334.3, 4 vCPU" when every run agrees; "mixed" when they do not
  environments: Record<string, string>; // run id -> runner environment, for every contributing run
  notes: string[]; // empty when the environments agree; otherwise one line per run id
}

export interface KneeBounds {
  schema: 1;
  metric: "knee range lower bound";
  unit: "iterations per second";
  release: string; // "p6-phase4a"
  products: Partial<Record<KneeBoundProduct, KneeBound>>;
}

export type KneeRunRecord = LoadRunRecord & { report: KneeReport };

/** The runs of one product that may enter the bounds, with the reasons of every one that may not (the shape of selectSmokeRuns). */
export function selectKneeRuns(
  caseId: string,
  runs: KneeRunRecord[],
): { used: KneeRunRecord[]; excluded: Array<{ runId: string; why: string[] }> } {
  const eligible: KneeRunRecord[] = [];
  const excluded: Array<{ runId: string; why: string[] }> = [];
  for (const run of runs) {
    const why: string[] = [];
    const id = runIdOf(run.meta) ?? run.verdict.runId ?? run.meta.runId;
    if (run.meta.caseId !== caseId) why.push(`case ${run.meta.caseId} is not ${caseId}`);
    if (run.meta.profile !== "full") why.push(`profile ${run.meta.profile} is not full`);
    if (!["workflow_dispatch", "schedule"].includes(run.meta.environment.event ?? ""))
      why.push(
        `event ${run.meta.environment.event ?? "missing"} is not workflow_dispatch or schedule`,
      );
    if (runIdOf(run.meta) === undefined) why.push("no GitHub Actions run id");
    if (run.report.verdict !== "KNEE") why.push(`knee verdict ${run.report.verdict} is not KNEE`);
    if (run.report.range === undefined) why.push("knee report has no range");
    if (why.length === 0) eligible.push(run);
    else excluded.push({ runId: id, why });
  }
  const { used, excluded: notPublishable } = selectPublishable(eligible);
  return {
    used: used as KneeRunRecord[],
    excluded: [...excluded, ...notPublishable],
  };
}

/** The runner environment of one run, as the bounds state it. */
function environmentOf(run: LoadRunRecord): string {
  const e = run.meta.environment;
  return `${e.runnerImage} ${e.imageVersion}, ${e.nproc} vCPU`;
}

/**
 * Per product: keep the runs that selectKneeRuns accepts and take the minimum and the median of the lower-step rates. Throws with the
 * product and the reasons when fewer than three remain, or when two runs share a run id.
 */
export function buildKneeBounds(input: {
  release: string;
  runs: Partial<Record<KneeBoundProduct, KneeRunRecord[]>>;
}): KneeBounds {
  const products: KneeBounds["products"] = {};
  for (const product of Object.keys(KNEE_BOUND_CASES) as KneeBoundProduct[]) {
    // A product with no runs at all is left out; a product with some runs must have three usable ones.
    if (input.runs[product] === undefined) continue;
    const caseId = KNEE_BOUND_CASES[product];
    const { used, excluded } = selectKneeRuns(caseId, input.runs[product]);
    if (used.length < 3) {
      const reasons = excluded.map((e) => `${e.runId}: ${e.why.join("; ")}`).join(" | ");
      throw new Error(
        `${product} (${caseId}): ${used.length} usable knee run(s), need at least 3. Excluded: ${reasons || "none"}`,
      );
    }
    const ids = used.map((r) => runIdOf(r.meta)!);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicates.length > 0)
      throw new Error(`${product}: duplicate GitHub Actions run id(s): ${duplicates.join(", ")}`);
    const lowers = used.map((r) => r.report.range!.lowerRate);
    const uppers = used.map((r) => r.report.range!.upperRate);
    const environments = Object.fromEntries(used.map((r) => [runIdOf(r.meta)!, environmentOf(r)]));
    const distinct = [...new Set(Object.values(environments))];
    products[product] = {
      caseId,
      profile: "full",
      lowerBoundRate: Math.min(...lowers),
      medianLowerRate: medianOf(lowers),
      upperBoundRate: Math.max(...uppers),
      n: used.length,
      runIds: [...new Set(ids)].sort((a, b) => Number(a) - Number(b)),
      environment: distinct.length === 1 ? distinct[0]! : "mixed",
      environments,
      notes:
        distinct.length === 1
          ? []
          : Object.keys(environments).map((id) => `run ${id}: ${environments[id]}`),
    };
  }
  return {
    schema: 1,
    metric: "knee range lower bound",
    unit: "iterations per second",
    release: input.release,
    products,
  };
}

/**
 * Validates a parsed file: schema 1, the metric and unit, n = runIds.length and ≥ 3, unique digit-only run ids in strictly ascending
 * order, finite rates above 0, and one environment per run id.
 */
export function parseKneeBounds(value: unknown): KneeBounds {
  const b = value as KneeBounds;
  if (!b || b.schema !== 1) throw new Error("knee bounds: schema must be 1");
  if (b.metric !== "knee range lower bound" || b.unit !== "iterations per second")
    throw new Error("knee bounds: metric or unit is wrong");
  for (const [product, c] of Object.entries(b.products ?? {})) {
    if (!c) continue;
    if (c.n !== c.runIds.length || c.n < 3)
      throw new Error(`knee bounds: ${product} has n ${c.n} for ${c.runIds.length} run ids`);
    if (new Set(c.runIds).size !== c.runIds.length || !c.runIds.every((id) => /^\d+$/.test(id)))
      throw new Error(`knee bounds: ${product} has duplicate or non-numeric run ids`);
    for (let i = 1; i < c.runIds.length; i++)
      if (Number(c.runIds[i]) <= Number(c.runIds[i - 1]))
        throw new Error(`knee bounds: ${product} run ids are not strictly ascending`);
    for (const key of ["lowerBoundRate", "medianLowerRate", "upperBoundRate"] as const) {
      const v = c[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
        throw new Error(`knee bounds: ${product} ${key} must be a finite number > 0`);
    }
    const envs = c.environments ?? {};
    if (
      Object.keys(envs).length !== c.runIds.length ||
      !c.runIds.every((id) => typeof envs[id] === "string")
    )
      throw new Error(`knee bounds: ${product} needs one environment per run id`);
    const distinct = [...new Set(Object.values(envs))];
    if (distinct.length === 1 && c.environment !== distinct[0])
      throw new Error(`knee bounds: ${product} environment does not match its runs`);
    if (distinct.length > 1 && (c.environment !== "mixed" || c.notes.length !== c.runIds.length))
      throw new Error(
        `knee bounds: ${product} mixed environments need "mixed" and one note per run`,
      );
  }
  return b;
}

/**
 * 50 % of the lower bound, rounded DOWN to 0.1 (the resolution of timeUnitSec 10). Throws when the product is absent or the result is
 * under 0.1.
 */
export function steadyRateFor(bounds: KneeBounds, product: KneeBoundProduct): number {
  const c = bounds.products[product];
  if (!c)
    throw new Error(
      `knee bounds: no ${product} bound (run the knee for ${KNEE_BOUND_CASES[product]} first)`,
    );
  // Half of the bound, in tenths: floor(lower x 5) / 10. The epsilon keeps 2.0 x 5 from floating to 9.9999.
  const rate = Math.floor(c.lowerBoundRate * 5 + 1e-9) / 10;
  if (rate < 0.1) throw new Error(`knee bounds: ${product} steady rate ${rate} is under 0.1`);
  return rate;
}
