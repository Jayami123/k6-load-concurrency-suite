import { medianOf, pickMetric, runIdOf, selectPublishable, type LoadRunRecord } from "./medians.ts";

export const SMOKE_CASES = {
  "P6-CAL-LOAD-001": "cal",
  "P6-MED-LOAD-001": "medusa",
  "P6-DOC-LOAD-001": "documenso",
} as const;
export type SmokeCaseId = keyof typeof SMOKE_CASES;

export interface SmokeCaseBaseline {
  product: "cal" | "medusa" | "documenso";
  profile: "full";
  rate: number;
  durationSec: number;
  medianP95Ms: number;
  n: number;
  runIds: string[]; // GitHub Actions run ids, ascending, unique
  environment: string; // "ubuntu24 20261023.334.3, 4 vCPU" when every run agrees; "mixed" when they do not
  environments: Record<string, string>; // run id -> runner environment, for every contributing run
  notes: string[]; // empty when the environments agree; otherwise one line per run id with its environment
}
export interface SmokeBaseline {
  schema: 1;
  metric: "http_req_duration p(95)";
  unit: "ms";
  release: string; // "p6-phase3"
  cases: Record<SmokeCaseId, SmokeCaseBaseline>;
}

/** The runs of one case that may enter the baseline, with the reasons of every one that may not. */
export function selectSmokeRuns(
  caseId: SmokeCaseId,
  runs: LoadRunRecord[],
): { used: LoadRunRecord[]; excluded: Array<{ runId: string; why: string[] }> } {
  const eligible: LoadRunRecord[] = [];
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
    if (why.length === 0) eligible.push(run);
    else excluded.push({ runId: id, why });
  }
  const { used, excluded: notPublishable } = selectPublishable(eligible);
  return { used, excluded: [...excluded, ...notPublishable] };
}

/** The runner environment of one run, as the baseline states it. */
function environmentOf(run: LoadRunRecord): string {
  const e = run.meta.environment;
  return `${e.runnerImage} ${e.imageVersion}, ${e.nproc} vCPU`;
}

/**
 * Per case: keep runs that selectSmokeRuns accepts and take the median of verdict.k6[0].p95Ms. Throws with the case id and the reasons
 * when fewer than three remain, or when two runs share a run id.
 */
export function buildSmokeBaseline(input: {
  release: string;
  runs: Record<SmokeCaseId, LoadRunRecord[]>;
}): SmokeBaseline {
  const cases = {} as Record<SmokeCaseId, SmokeCaseBaseline>;
  for (const caseId of Object.keys(SMOKE_CASES) as SmokeCaseId[]) {
    const { used, excluded } = selectSmokeRuns(caseId, input.runs[caseId] ?? []);
    // A run without a p95 value is left out of the median and out of n, the run ids and the environment alike.
    const scored = used.flatMap((r) => {
      const p95 = pickMetric("p95", r);
      return p95 === undefined || p95 <= 0 ? [] : [{ r, p95 }];
    });
    const noP95 = used
      .filter((r) => pickMetric("p95", r) === undefined)
      .map((r) => ({ runId: runIdOf(r.meta) ?? r.meta.runId, why: ["no k6[0].p95Ms"] }));
    if (scored.length < 3) {
      const reasons = [...excluded, ...noP95]
        .map((e) => `${e.runId}: ${e.why.join("; ")}`)
        .join(" | ");
      throw new Error(
        `${caseId}: ${scored.length} usable run(s), need at least 3. Excluded: ${reasons || "none"}`,
      );
    }
    const ids = scored.map((s) => runIdOf(s.r.meta)!);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicates.length > 0)
      throw new Error(`${caseId}: duplicate GitHub Actions run id(s): ${duplicates.join(", ")}`);
    const first = scored[0]!.r;
    const environments = Object.fromEntries(
      scored.map((s) => [runIdOf(s.r.meta)!, environmentOf(s.r)]),
    );
    const distinct = [...new Set(Object.values(environments))];
    cases[caseId] = {
      product: SMOKE_CASES[caseId],
      profile: "full",
      rate: first.meta.rate,
      durationSec: first.meta.durationSec,
      medianP95Ms: medianOf(scored.map((s) => s.p95)),
      n: ids.length,
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
    metric: "http_req_duration p(95)",
    unit: "ms",
    release: input.release,
    cases,
  };
}

/**
 * Validates a parsed file: schema 1, three known cases, n = runIds.length and ≥ 3, unique digit-only run ids in strictly ascending
 * order, medianP95Ms a finite number > 0, and one environment per run id.
 */
export function parseSmokeBaseline(value: unknown): SmokeBaseline {
  const b = value as SmokeBaseline;
  if (!b || b.schema !== 1) throw new Error("smoke baseline: schema must be 1");
  if (b.metric !== "http_req_duration p(95)" || b.unit !== "ms")
    throw new Error("smoke baseline: metric or unit is wrong");
  for (const caseId of Object.keys(SMOKE_CASES) as SmokeCaseId[]) {
    const c = b.cases?.[caseId];
    if (!c) throw new Error(`smoke baseline: case ${caseId} is missing`);
    if (c.n !== c.runIds.length || c.n < 3)
      throw new Error(`smoke baseline: ${caseId} has n ${c.n} for ${c.runIds.length} run ids`);
    if (new Set(c.runIds).size !== c.runIds.length || !c.runIds.every((id) => /^\d+$/.test(id)))
      throw new Error(`smoke baseline: ${caseId} has duplicate or non-numeric run ids`);
    for (let i = 1; i < c.runIds.length; i++)
      if (Number(c.runIds[i]) <= Number(c.runIds[i - 1]))
        throw new Error(`smoke baseline: ${caseId} run ids are not strictly ascending`);
    if (typeof c.medianP95Ms !== "number" || !Number.isFinite(c.medianP95Ms) || c.medianP95Ms <= 0)
      throw new Error(`smoke baseline: ${caseId} medianP95Ms must be a finite number > 0`);
    const envs = c.environments ?? {};
    if (
      Object.keys(envs).length !== c.runIds.length ||
      !c.runIds.every((id) => typeof envs[id] === "string")
    )
      throw new Error(`smoke baseline: ${caseId} needs one environment per run id`);
    const distinct = [...new Set(Object.values(envs))];
    if (distinct.length === 1 && c.environment !== distinct[0])
      throw new Error(`smoke baseline: ${caseId} environment does not match its runs`);
    if (distinct.length > 1 && (c.environment !== "mixed" || c.notes.length !== c.runIds.length))
      throw new Error(
        `smoke baseline: ${caseId} mixed environments need "mixed" and one note per run`,
      );
  }
  return b;
}

export function smokeP95For(b: SmokeBaseline, caseId: SmokeCaseId): number {
  return b.cases[caseId].medianP95Ms;
}
