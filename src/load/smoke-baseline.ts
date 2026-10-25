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
  environment: string; // "ubuntu24 20261023.334.3, 4 vCPU" (the first run's; runs on other images are listed in notes)
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

/**
 * Per case: keep runs that selectSmokeRuns accepts and take the median of verdict.k6[0].p95Ms. Throws with the case id and the reasons
 * when fewer than three remain.
 */
export function buildSmokeBaseline(input: {
  release: string;
  runs: Record<SmokeCaseId, LoadRunRecord[]>;
}): SmokeBaseline {
  const cases = {} as Record<SmokeCaseId, SmokeCaseBaseline>;
  for (const caseId of Object.keys(SMOKE_CASES) as SmokeCaseId[]) {
    const { used, excluded } = selectSmokeRuns(caseId, input.runs[caseId] ?? []);
    const values = used
      .map((r) => pickMetric("p95", r))
      .filter((v): v is number => v !== undefined);
    if (values.length < 3) {
      const reasons = excluded.map((e) => `${e.runId}: ${e.why.join("; ")}`).join(" | ");
      throw new Error(
        `${caseId}: ${values.length} usable run(s), need at least 3. Excluded: ${reasons || "none"}`,
      );
    }
    const first = used[0]!;
    const ids = used.map((r) => runIdOf(r.meta)!);
    cases[caseId] = {
      product: SMOKE_CASES[caseId],
      profile: "full",
      rate: first.meta.rate,
      durationSec: first.meta.durationSec,
      medianP95Ms: medianOf(values),
      n: ids.length,
      runIds: [...new Set(ids)].sort((a, b) => Number(a) - Number(b)),
      environment: `${first.meta.environment.runnerImage} ${first.meta.environment.imageVersion}, ${first.meta.environment.nproc} vCPU`,
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

/** Validates a parsed file: schema 1, three known cases, n = runIds.length and ≥ 3, unique digit-only run ids, medianP95Ms > 0. */
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
    if (!(c.medianP95Ms > 0)) throw new Error(`smoke baseline: ${caseId} medianP95Ms must be > 0`);
  }
  return b;
}

export function smokeP95For(b: SmokeBaseline, caseId: SmokeCaseId): number {
  return b.cases[caseId].medianP95Ms;
}
