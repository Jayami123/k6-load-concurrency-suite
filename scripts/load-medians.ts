// Median of one metric over LOAD artefact folders (P6-RULE-005). Usage:
//   node scripts/load-medians.ts <folder> [<folder> ...] --metric requests|dropped|iterations
// Exits 2 when fewer than 3 valid runs exist.
import { readFileSync } from "node:fs";
import path from "node:path";
import { summarizeMedian, type LoadRunRecord } from "../src/load/medians.ts";
import { validateRunMeta } from "../src/load/run-meta.ts";

const args = process.argv.slice(2);
const metricIndex = args.indexOf("--metric");
const metric = metricIndex === -1 ? "requests" : args[metricIndex + 1];
const folders = args.filter((a, i) => a !== "--metric" && i !== metricIndex + 1);
if (folders.length === 0 || !["requests", "dropped", "iterations"].includes(metric ?? "")) {
  console.error("usage: load-medians.ts <folder>... --metric requests|dropped|iterations");
  process.exit(2);
}

const runs: LoadRunRecord[] = folders.map((folder) => ({
  verdict: JSON.parse(readFileSync(path.join(folder, "verdict.json"), "utf8")),
  meta: validateRunMeta(JSON.parse(readFileSync(path.join(folder, "run-meta.json"), "utf8"))),
}));
const pick = (r: LoadRunRecord) => {
  const k6 = (r.verdict as { k6?: Array<Record<string, number>> }).k6?.[0];
  return k6?.[metric === "iterations" ? "requests" : (metric ?? "requests")];
};
const s = summarizeMedian(runs, pick);
console.log(
  `| metric | median | n | excluded |\n|---|---|---|---|\n| ${metric} | ${s.median ?? "n/a"} | ${s.n} | ${s.excludedCount} |`,
);
for (const e of s.excluded) console.log(`- excluded ${e.runId}: ${e.why.join("; ")}`);
process.exit(s.insufficient ? 2 : 0);
