// Writes k6/thresholds/smoke-p95.json from downloaded LOAD run folders (plan §6.5). Usage:
//   node scripts/write-smoke-baseline.ts --release p6-phase3 --out k6/thresholds/smoke-p95.json \
//     P6-CAL-LOAD-001=<dir>,<dir>,<dir> P6-MED-LOAD-001=<dir>,... P6-DOC-LOAD-001=<dir>,...
// Exits 2 when a case has fewer than three usable runs, or when the file would hold a secret-like string.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type LoadRunRecord } from "../src/load/medians.ts";
import { validateRunMeta } from "../src/load/run-meta.ts";
import {
  buildSmokeBaseline,
  parseSmokeBaseline,
  SMOKE_CASES,
  selectSmokeRuns,
  type SmokeCaseId,
} from "../src/load/smoke-baseline.ts";
import { findHits } from "./evidence-token-scan.mjs";

const args = process.argv.slice(2);
const flag = (name: string): string => {
  const i = args.indexOf(name);
  if (i === -1 || args[i + 1] === undefined) throw new Error(`missing ${name}`);
  return args[i + 1]!;
};
const release = flag("--release");
const out = flag("--out");
const pairs = args.filter((a) => /^P6-[A-Z0-9-]+=/.test(a));

const runs = {} as Record<SmokeCaseId, LoadRunRecord[]>;
for (const caseId of Object.keys(SMOKE_CASES) as SmokeCaseId[]) runs[caseId] = [];
for (const pair of pairs) {
  const [caseId, dirs] = pair.split("=") as [SmokeCaseId, string];
  if (!(caseId in SMOKE_CASES)) throw new Error(`unknown case ${caseId}`);
  for (const dir of dirs.split(",")) {
    runs[caseId].push({
      verdict: JSON.parse(readFileSync(path.join(dir, "verdict.json"), "utf8")),
      meta: validateRunMeta(JSON.parse(readFileSync(path.join(dir, "run-meta.json"), "utf8"))),
    });
  }
}

for (const caseId of Object.keys(SMOKE_CASES) as SmokeCaseId[]) {
  const { excluded } = selectSmokeRuns(caseId, runs[caseId]);
  for (const e of excluded) console.log(`- excluded ${caseId} run ${e.runId}: ${e.why.join("; ")}`);
}

let baseline;
try {
  baseline = buildSmokeBaseline({ release, runs });
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}
const text = `${JSON.stringify(parseSmokeBaseline(baseline), null, 2)}\n`;
const hits = findHits(text);
if (hits.length > 0) {
  console.error(`refusing to write: secret-like text on line(s) ${hits.join(", ")}`);
  process.exit(1);
}
writeFileSync(out, text);
console.log("| case | median p95 (ms) | n | run ids |\n|---|---|---|---|");
for (const caseId of Object.keys(SMOKE_CASES) as SmokeCaseId[]) {
  const c = baseline.cases[caseId];
  console.log(`| ${caseId} | ${c.medianP95Ms} | ${c.n} | ${c.runIds.join(", ")} |`);
}
