// The A/B gate verdict of one product (plan Phase 4b task 12 §6.3). Reads the arm folders (run-load output), counts the VALID PASS arms with
// their run-level p95, and decides with abGate against the product's p95 tolerance in tolerance.json (the base checkout's file). Usage:
//   node scripts/load/gate-ab.ts --product cal|medusa --a <dir,dir,...> --b <dir,dir,...> [--tolerance <file>] [--out <file>]
// Exit codes: 0 PASS or INVALID (no_reference is by design until the tolerance file exists); 1 FAIL or TEST BUG; 2 ENV, when an arm did not
// produce a result (its reason is printed; an arm that did not run is never a gate result).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readAbArm, type ArmRead } from "../../src/load/gate/ab-arms.ts";
import { abGate, type GateVerdict } from "../../src/load/gate/ab-gate.ts";
import { parseTolerance } from "../../src/load/gate/tolerance.ts";

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

function readSide(list: string | undefined): ArmRead[] {
  return (list ?? "")
    .split(",")
    .filter(Boolean)
    .map((dir) => readAbArm(dir, caseId));
}

const sideA = readSide(flag("--a"));
const sideB = readSide(flag("--b"));
const arms = [...sideA, ...sideB];
const counted = (side: ArmRead[]) =>
  side.flatMap((arm) => (arm.counted ? [arm.counted.p95Ms] : []));
const tolerance = existsSync(toleranceFile)
  ? parseTolerance(JSON.parse(readFileSync(toleranceFile, "utf8"))).products[product]?.p95Ms
  : undefined;
const verdict: GateVerdict = abGate({
  caseId,
  aMedians: counted(sideA),
  bMedians: counted(sideB),
  toleranceRel: tolerance?.tolerance,
  // An arm whose own outcome is FAIL failed an audit or a threshold: that is not a regression sample (plan §6.7).
  auditOk: !arms.some((arm) => arm.outcome === "FAIL"),
});
const envArms = arms.filter((arm) => arm.excluded?.env);
const reasons = [
  ...verdict.reasons,
  ...arms.flatMap((arm) => (arm.excluded ? [`${arm.dir}: ${arm.excluded.reason}`] : [])),
];
const exitCode =
  envArms.length > 0 ? 2 : verdict.verdict === "PASS" || verdict.verdict === "INVALID" ? 0 : 1;
const result = {
  product,
  caseId,
  a: counted(sideA),
  b: counted(sideB),
  tolerance,
  ...verdict,
  reasons,
  excluded: arms.flatMap((arm) =>
    arm.excluded ? [{ dir: arm.dir, env: arm.excluded.env, reason: arm.excluded.reason }] : [],
  ),
  exitCode,
};
if (out) writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `${caseId} A/B ${product}: verdict ${verdict.verdict}; A p95 ${
    counted(sideA)
      .map((v) => v.toFixed(1))
      .join(" / ") || "none"
  }; B p95 ${
    counted(sideB)
      .map((v) => v.toFixed(1))
      .join(" / ") || "none"
  }; ratios ${verdict.ratios.map((r) => r.toFixed(3)).join(" / ") || "none"}; tolerance ${tolerance ? `${(tolerance.tolerance * 100).toFixed(1)} %` : "none (no_reference)"}`,
);
for (const reason of reasons) console.log(`  ${reason}`);
if (envArms.length > 0)
  console.log(`  ENV: ${envArms.length} arm(s) did not produce a result; exit 2`);
process.exit(exitCode);
