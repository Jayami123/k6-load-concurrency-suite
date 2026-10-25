// Median of one metric over LOAD artefact folders (P6-RULE-005). Usage:
//   node scripts/load-medians.ts <folder> [<folder> ...] --metric requests|dropped|iterations|p95 [--json]
// Exits 2 when fewer than 3 valid runs exist. --json prints the summary as JSON instead of the table.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  pickMetric,
  runIdOf,
  selectPublishable,
  summarizeMedian,
  type LoadRunRecord,
} from "../src/load/medians.ts";
import { validateRunMeta } from "../src/load/run-meta.ts";
import { MEDIAN_USAGE, parseMedianArgs } from "../src/load/median-args.ts";

const parsed = parseMedianArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`${parsed.reason}\n${MEDIAN_USAGE}`);
  process.exit(2);
}
const { metric, asJson, folders } = parsed;

const runs: LoadRunRecord[] = folders.map((folder) => ({
  verdict: JSON.parse(readFileSync(path.join(folder, "verdict.json"), "utf8")),
  meta: validateRunMeta(JSON.parse(readFileSync(path.join(folder, "run-meta.json"), "utf8"))),
}));
const s = summarizeMedian(runs, (r) => pickMetric(metric, r));
// The runs that entered the median, taken by record, so two folders with one run id are not confused.
const runIds = selectPublishable(runs)
  .used.filter((r) => pickMetric(metric, r) !== undefined)
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
