// Writes k6/thresholds/baseline-band.json from downloaded steady run folders (plan Phase 4 task 5 §6.4). Usage:
//   node scripts/write-baseline-band.ts --release p6-phase4a --out k6/thresholds/baseline-band.json \
//     P6-CAL-LOAD-003=<dir>,<dir>,<dir> P6-MED-LOAD-002=<dir>,...
// Each folder holds verdict.json, run-meta.json, k6-main-summary.json and k6-main.json.gz. Exits 2 when a product has fewer than three
// VALID runs, and 1 when the file would hold a secret-like string.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readPointsGzStream } from "../src/load/chart/k6-points.ts";
import {
  buildBand,
  parseBaselineBand,
  type BandProduct,
  type RunFolder,
} from "../src/load/baseline-band.ts";
import { validateRunMeta } from "../src/load/run-meta.ts";
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

const products: Record<string, BandProduct> = {};
for (const pair of pairs) {
  const [caseId, dirs] = pair.split("=") as [string, string];
  const folders: RunFolder[] = [];
  for (const dir of dirs.split(",")) {
    folders.push({
      verdict: JSON.parse(readFileSync(path.join(dir, "verdict.json"), "utf8")),
      meta: validateRunMeta(JSON.parse(readFileSync(path.join(dir, "run-meta.json"), "utf8"))),
      summary: JSON.parse(readFileSync(path.join(dir, "k6-main-summary.json"), "utf8")),
      bins: await readPointsGzStream(path.join(dir, "k6-main.json.gz")),
    });
  }
  try {
    products[caseId] = buildBand({ release, caseId, folders });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
}

const file = {
  schema: 1,
  metric: "steady baseline band",
  unit: "ms for latencies; per second for rates; fraction for error rate",
  release,
  windowSec: 10,
  minWindowRequests: 40,
  products,
};
const text = `${JSON.stringify(parseBaselineBand(file), null, 2)}\n`;
const hits = findHits(text);
if (hits.length > 0) {
  console.error(`refusing to write: secret-like text on line(s) ${hits.join(", ")}`);
  process.exit(1);
}
writeFileSync(out, text);
console.log("| case | n | p95 min / median / max (ms) | run ids |\n|---|---|---|---|");
for (const [caseId, c] of Object.entries(products)) {
  const p = c.metrics.p95Ms;
  console.log(
    `| ${caseId} | ${c.n} | ${p.min} / ${p.median} / ${p.max} | ${c.runIds.join(", ")} |`,
  );
}
