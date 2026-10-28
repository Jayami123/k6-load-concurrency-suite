import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { KNEE_CASE_IDS } from "../site-model.ts";

export interface KneeStep {
  index: number;
  rate: number;
  p95Ms: number;
  errors: number;
  errorRate: number;
  requests: number;
  reached: boolean;
  plannedIterations: number;
  startedIterations: number;
}
export interface KneeCurve {
  githubRunId: string;
  caseId: string;
  runId: string;
  product: string;
  verdict: "KNEE" | "INVALID" | string;
  range: { lowerStep: number; upperStep: number; lowerRate: number; upperRate: number };
  stop: { step: number; rate: number; reasons: string[] };
  firstSaturated: { resource: string; step: number } | null;
  limitation: string | null;
  steps: KneeStep[];
  invalid: Array<{ code: string; detail: string }>;
}

const KNEE_PRODUCT: Record<(typeof KNEE_CASE_IDS)[number], string> = {
  "P6-CAL-LOAD-005": "cal",
  "P6-MED-LOAD-004": "medusa",
  "P6-DOC-LOAD-005": "documenso",
};

function productOf(caseId: string): string {
  return KNEE_PRODUCT[caseId as keyof typeof KNEE_PRODUCT] ?? caseId;
}

function finiteNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function requiredNum(v: unknown, field: string): number {
  const n = finiteNum(v);
  if (n === undefined) throw new Error(`TEST BUG: knee report ${field} is not a finite number`);
  return n;
}

function asSteps(raw: unknown): KneeStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, i) => {
    const s = row as Record<string, unknown>;
    const p95 = finiteNum(s.p95Ms);
    return {
      index: requiredNum(s.index, `steps[${i}].index`),
      rate: requiredNum(s.rate, `steps[${i}].rate`),
      p95Ms: p95 ?? Number.NaN,
      errors: requiredNum(s.errors, `steps[${i}].errors`),
      errorRate: requiredNum(s.errorRate, `steps[${i}].errorRate`),
      requests: requiredNum(s.requests, `steps[${i}].requests`),
      reached: Boolean(s.reached),
      plannedIterations: requiredNum(s.plannedIterations, `steps[${i}].plannedIterations`),
      startedIterations: requiredNum(s.startedIterations, `steps[${i}].startedIterations`),
    };
  });
}

function asRange(raw: unknown): KneeCurve["range"] {
  const r = raw as Record<string, unknown> | null;
  if (r === null || typeof r !== "object")
    throw new Error("TEST BUG: knee report range is missing");
  return {
    lowerStep: requiredNum(r.lowerStep, "range.lowerStep"),
    upperStep: requiredNum(r.upperStep, "range.upperStep"),
    lowerRate: requiredNum(r.lowerRate, "range.lowerRate"),
    upperRate: requiredNum(r.upperRate, "range.upperRate"),
  };
}

function asStop(raw: unknown): KneeCurve["stop"] {
  const s = raw as Record<string, unknown> | null;
  if (s === null || typeof s !== "object") throw new Error("TEST BUG: knee report stop is missing");
  return {
    step: requiredNum(s.step, "stop.step"),
    rate: requiredNum(s.rate, "stop.rate"),
    reasons: Array.isArray(s.reasons) ? s.reasons.map(String) : [],
  };
}

function asFirstSaturated(raw: unknown): KneeCurve["firstSaturated"] {
  const f = raw as Record<string, unknown> | null;
  if (f === null || typeof f !== "object") return null;
  if (typeof f.resource !== "string") return null;
  const step = finiteNum(f.step);
  if (step === undefined) return null;
  return { resource: f.resource, step };
}

function asInvalid(raw: unknown): KneeCurve["invalid"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = row as Record<string, unknown>;
    return { code: String(o.code ?? ""), detail: String(o.detail ?? "") };
  });
}

function toCurve(raw: Record<string, unknown>, githubRunId: string): KneeCurve {
  const caseId = String(raw.caseId ?? "");
  const limitation = typeof raw.limitation === "string" ? raw.limitation : null;
  return {
    githubRunId,
    caseId,
    runId: String(raw.runId ?? ""),
    product: productOf(caseId),
    verdict: String(raw.verdict ?? ""),
    range: asRange(raw.range),
    stop: asStop(raw.stop),
    firstSaturated: asFirstSaturated(raw.firstSaturated),
    limitation,
    steps: asSteps(raw.steps),
    invalid: asInvalid(raw.invalid),
  };
}

/**
 * Finds knee-report-main.json under dir. Does not plot; the renderer skips verdict !== "KNEE".
 * Product is the caseId map: P6-CAL-LOAD-005 cal, P6-MED-LOAD-004 medusa, P6-DOC-LOAD-005 documenso
 * (site-model.ts KNEE_CASE_IDS).
 */
export function readKneeCurves(dir: string, githubRunId: string): KneeCurve[] {
  const out: KneeCurve[] = [];
  const visit = (current: string) => {
    for (const name of readdirSync(current)) {
      const p = path.join(current, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name === "knee-report-main.json") {
        const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
        out.push(toCurve(raw, githubRunId));
      }
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}
