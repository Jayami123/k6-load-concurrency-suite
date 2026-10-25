// Writes k6/thresholds/knee-bounds.json from downloaded knee run folders (plan Phase 4 task 5 §6.2). Usage:
//   node scripts/write-knee-bounds.ts --release p6-phase4a --out k6/thresholds/knee-bounds.json \
//     cal=<dir>,<dir>,<dir> medusa=<dir>,<dir>,<dir> documenso=<dir>,...
// Each folder holds verdict.json, run-meta.json and knee-report-main.json. Exits 2 when a product has fewer than three usable runs,
// and 1 when the file would hold a secret-like string.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateRunMeta } from "../src/load/run-meta.ts";
import {
  buildKneeBounds,
  KNEE_BOUND_CASES,
  parseKneeBounds,
  selectKneeRuns,
  type KneeBoundProduct,
  type KneeRunRecord,
} from "../src/load/knee/bounds.ts";
import type { KneeReport } from "../src/load/knee/knee-report.ts";
import { findHits } from "./evidence-token-scan.mjs";

const args = process.argv.slice(2);
const flag = (name: string): string => {
  const i = args.indexOf(name);
  if (i === -1 || args[i + 1] === undefined) throw new Error(`missing ${name}`);
  return args[i + 1]!;
};
const release = flag("--release");
const out = flag("--out");
const pairs = args.filter((a) => /^(cal|medusa|documenso)=/.test(a));

const runs: Partial<Record<KneeBoundProduct, KneeRunRecord[]>> = {};
for (const pair of pairs) {
  const [product, dirs] = pair.split("=") as [KneeBoundProduct, string];
  runs[product] = dirs.split(",").map((dir) => ({
    verdict: JSON.parse(readFileSync(path.join(dir, "verdict.json"), "utf8")),
    meta: validateRunMeta(JSON.parse(readFileSync(path.join(dir, "run-meta.json"), "utf8"))),
    report: JSON.parse(readFileSync(path.join(dir, "knee-report-main.json"), "utf8")) as KneeReport,
  }));
}

for (const product of Object.keys(KNEE_BOUND_CASES) as KneeBoundProduct[]) {
  const { excluded } = selectKneeRuns(KNEE_BOUND_CASES[product], runs[product] ?? []);
  for (const e of excluded)
    console.log(`- excluded ${product} run ${e.runId}: ${e.why.join("; ")}`);
}

let bounds;
try {
  bounds = buildKneeBounds({ release, runs });
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}
const text = `${JSON.stringify(parseKneeBounds(bounds), null, 2)}\n`;
const hits = findHits(text);
if (hits.length > 0) {
  console.error(`refusing to write: secret-like text on line(s) ${hits.join(", ")}`);
  process.exit(1);
}
writeFileSync(out, text);
console.log(
  "| product | lower bound (iter/s) | median lower | upper bound | n | run ids |\n|---|---|---|---|---|---|",
);
for (const product of Object.keys(bounds.products) as KneeBoundProduct[]) {
  const c = bounds.products[product]!;
  console.log(
    `| ${product} | ${c.lowerBoundRate} | ${c.medianLowerRate} | ${c.upperBoundRate} | ${c.n} | ${c.runIds.join(", ")} |`,
  );
}
