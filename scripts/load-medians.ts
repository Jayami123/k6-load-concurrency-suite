// Median of one metric over LOAD artefact folders (P6-RULE-005). Usage:
//   node scripts/load-medians.ts <folder> [<folder> ...] --metric requests|dropped|iterations|p95 [--json]
// Exits 2 when fewer than 3 valid runs exist. --json prints the summary as JSON instead of the table.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  pickMetric,
  runIdOf,
  summarizeMedian,
  type LoadRunRecord,
  type MedianMetric,
} from "../src/load/medians.ts";
import { validateRunMeta } from "../src/load/run-meta.ts";

const METRICS: MedianMetric[] = ["requests", "dropped", "iterations", "p95"];
const args = process.argv.slice(2);
const metricIndex = args.indexOf("--metric");
const metric = (metricIndex === -1 ? "requests" : args[metricIndex + 1]) as MedianMetric;
const asJson = args.includes("--json");
const folders = args.filter((a, i) => {
  if (a === "--json") return false;
  if (metricIndex === -1) return true;
  return i !== metricIndex && i !== metricIndex + 1;
});
if (folders.length === 0 || !METRICS.includes(metric)) {
  console.error(
    "usage: load-medians.ts <folder>... --metric requests|dropped|iterations|p95 [--json]",
  );
  process.exit(2);
}

const runs: LoadRunRecord[] = folders.map((folder) => ({
  verdict: JSON.parse(readFileSync(path.join(folder, "verdict.json"), "utf8")),
  meta: validateRunMeta(JSON.parse(readFileSync(path.join(folder, "run-meta.json"), "utf8"))),
}));
const s = summarizeMedian(runs, (r) => pickMetric(metric, r));
const runIds = runs
  .filter(
    (r) =>
      !s.excluded.some((e) => e.runId === (r.verdict.runId ?? r.meta.runId)) &&
      pickMetric(metric, r) !== undefined,
  )
  .map((r) => runIdOf(r.meta))
  .filter((id): id is string => id !== undefined)
  .sort((a, b) => Number(a) - Number(b));

if (asJson) {
  console.log(
    JSON.stringify(
      {
        metric,
        median: s.median ?? null,
        n: s.n,
        runIds,
        excluded: s.excluded.map((e) => ({ runId: e.runId, why: e.why.join("; ") })),
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `| metric | median | n | excluded |\n|---|---|---|---|\n| ${metric} | ${s.median ?? "n/a"} | ${s.n} | ${s.excludedCount} |`,
  );
  for (const e of s.excluded) console.log(`- excluded ${e.runId}: ${e.why.join("; ")}`);
}
process.exit(s.insufficient ? 2 : 0);
