// Reads one A/B arm folder for the gate (plan Phase 4b task 12 §6.3). An arm that did not run to a result (ENV: no folder, no summary,
// an unreadable file, or an ENV outcome) and an arm that is INVALID or failed is excluded with its reason; it never stops the gate. Only a
// secret-shaped value in run-meta.json stops the read (a real stop, not an environment problem).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runValues, type RunFolder } from "../baseline-band.ts";
import { validateRunMeta } from "../run-meta.ts";

export interface ArmRead {
  dir: string;
  outcome: string; // the arm's own outcome (PASS, FAIL, INVALID, ENV) or "missing"
  counted?: { runId: string; p95Ms: number };
  excluded?: { reason: string; env: boolean }; // env: the arm did not produce a result (an environment problem, not a gate result)
}

function excluded(dir: string, outcome: string, reason: string, env: boolean): ArmRead {
  return { dir, outcome, excluded: { reason, env } };
}

/** One arm folder: counted when it is a VALID PASS run with its summary; otherwise excluded with the reason. */
export function readAbArm(dir: string, caseId: string): ArmRead {
  const verdictPath = path.join(dir, "verdict.json");
  const metaPath = path.join(dir, "run-meta.json");
  const summaryPath = path.join(dir, "k6-main-summary.json");
  if (!existsSync(verdictPath))
    return excluded(dir, "missing", "no verdict.json: the arm did not write its folder", true);
  let verdict: {
    outcome?: string;
    validity?: { verdict?: string; reasons?: Array<{ code: string }> };
  };
  try {
    verdict = JSON.parse(readFileSync(verdictPath, "utf8"));
  } catch {
    return excluded(dir, "missing", "verdict.json is not valid JSON", true);
  }
  const outcome = verdict.outcome ?? "missing";
  if (!existsSync(metaPath))
    return excluded(dir, outcome, "no run-meta.json: the arm did not finish its metadata", true);
  let meta: ReturnType<typeof validateRunMeta>;
  try {
    meta = validateRunMeta(JSON.parse(readFileSync(metaPath, "utf8")));
  } catch (err) {
    if (/secret-shaped/.test((err as Error).message)) throw err;
    return excluded(dir, outcome, `run-meta.json is incomplete (${(err as Error).message})`, true);
  }
  if (meta.caseId !== caseId)
    return excluded(dir, outcome, `case ${meta.caseId} is not ${caseId}`, false);
  if (outcome === "ENV")
    return excluded(
      dir,
      outcome,
      `the arm's own outcome is ENV (${(verdict.validity?.reasons ?? []).map((r) => r.code).join(", ") || "no reason recorded"})`,
      true,
    );
  if (verdict.validity?.verdict !== "VALID" || outcome !== "PASS")
    return excluded(
      dir,
      outcome,
      `not counted: outcome ${outcome}, validity ${verdict.validity?.verdict ?? "missing"}`,
      false,
    );
  if (!existsSync(summaryPath))
    return excluded(
      dir,
      outcome,
      "no k6-main-summary.json: the run stopped before its summary was written",
      true,
    );
  try {
    const folder: RunFolder = {
      verdict: verdict as RunFolder["verdict"],
      meta,
      summary: JSON.parse(readFileSync(summaryPath, "utf8")),
      bins: [],
    };
    const values = runValues(folder);
    return { dir, outcome, counted: { runId: values.runId, p95Ms: values.p95Ms } };
  } catch (err) {
    return excluded(
      dir,
      outcome,
      `k6-main-summary.json cannot be read (${(err as Error).message})`,
      true,
    );
  }
}
