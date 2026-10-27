// The A/B gate verdict of one product (plan Phase 4b task 12 §6.3). Reads the arm folders (run-load output: verdict.json, run-meta.json,
// k6-main-summary.json), keeps the VALID arms, takes each arm's run-level p95 and decides with abGate against the product's p95 tolerance
// in tolerance.json. Usage:
//   node scripts/load/gate-ab.ts --product cal|medusa --tolerance <tolerance.json> --a <dir,dir,...> --b <dir,dir,...> [--out <file>]
// Exit 0 for PASS and INVALID (no_reference is by design until the tolerance file exists), 1 for FAIL and TEST BUG.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { runValues, type RunFolder } from "../../src/load/baseline-band.ts";
import { abGate, type GateVerdict } from "../../src/load/gate/ab-gate.ts";
import { parseTolerance } from "../../src/load/gate/tolerance.ts";
import { validateRunMeta } from "../../src/load/run-meta.ts";

const CASE: Record<string, string> = { cal: "P6-CAL-LOAD-003", medusa: "P6-MED-LOAD-002" };
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const product = flag("--product") ?? "";
if (!CASE[product]) throw new Error("gate-ab: --product must be cal or medusa");
const caseId = CASE[product]!;
const toleranceFile = flag("--tolerance") ?? "k6/thresholds/tolerance.json";
const out = flag("--out");

function readArm(dir: string): { folder: RunFolder; outcome: string; validity: string } {
  const verdict = JSON.parse(readFileSync(`${dir}/verdict.json`, "utf8"));
  const meta = validateRunMeta(JSON.parse(readFileSync(`${dir}/run-meta.json`, "utf8")));
  const summary = JSON.parse(readFileSync(`${dir}/k6-main-summary.json`, "utf8"));
  return {
    folder: { verdict, meta, summary, bins: [] },
    outcome: verdict.outcome,
    validity: verdict.validity?.verdict ?? "missing",
  };
}

function p95s(list: string | undefined): { values: number[]; notes: string[]; failed: boolean } {
  const values: number[] = [];
  const notes: string[] = [];
  let failed = false;
  for (const dir of (list ?? "").split(",").filter(Boolean)) {
    const arm = readArm(dir);
    if (arm.outcome === "FAIL") failed = true;
    if (arm.folder.meta.caseId !== caseId) {
      notes.push(`${dir}: case ${arm.folder.meta.caseId} is not ${caseId}`);
      continue;
    }
    if (arm.validity !== "VALID" || arm.outcome !== "PASS") {
      notes.push(`${dir}: ${arm.outcome} ${arm.validity}, not counted`);
      continue;
    }
    values.push(runValues(arm.folder).p95Ms);
  }
  return { values, notes, failed };
}

const a = p95s(flag("--a"));
const b = p95s(flag("--b"));
const tolerance = existsSync(toleranceFile)
  ? parseTolerance(JSON.parse(readFileSync(toleranceFile, "utf8"))).products[product]?.p95Ms
  : undefined;
const verdict: GateVerdict = abGate({
  caseId,
  aMedians: a.values,
  bMedians: b.values,
  toleranceRel: tolerance?.tolerance,
  // A failed arm outcome means a failed audit or threshold in that arm: it is not a regression sample (plan §6.7).
  auditOk: !a.failed && !b.failed,
});
const result = {
  product,
  caseId,
  a: a.values,
  b: b.values,
  notes: [...a.notes, ...b.notes],
  tolerance,
  ...verdict,
};
if (out) writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `${caseId} A/B ${product}: verdict ${verdict.verdict}; A p95 ${a.values.map((v) => v.toFixed(1)).join(" / ") || "none"}; B p95 ${b.values.map((v) => v.toFixed(1)).join(" / ") || "none"}; ratios ${verdict.ratios.map((r) => r.toFixed(3)).join(" / ") || "none"}; tolerance ${tolerance ? (tolerance.tolerance * 100).toFixed(1) + " %" : "none (no_reference)"}`,
);
for (const reason of verdict.reasons) console.log(`  ${reason}`);
process.exit(verdict.verdict === "PASS" || verdict.verdict === "INVALID" ? 0 : 1);
