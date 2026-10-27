// Writes k6/thresholds/tolerance.json from downloaded A/A arm folders (plan Phase 4b task 11 §6.4). Usage:
//   node scripts/write-tolerance.ts --release p6-phase4b --out k6/thresholds/tolerance.json \
//     cal=<dir>,<dir>,<dir> medusa=<dir>,<dir>,<dir>
// Each folder holds verdict.json, run-meta.json and k6-main-summary.json. Exits 2 when a product has fewer than three VALID steady arms
// or the A/A rule refuses the values, and 1 when the file would hold a secret-like string.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runValues, type RunFolder } from "../src/load/baseline-band.ts";
import { aaArmsFor, type AaArm, type AaCaseId } from "../src/load/gate/aa-noise.ts";
import {
  parseTolerance,
  TOLERANCE_METRICS,
  toleranceOf,
  type Tolerance,
  type ToleranceFile,
  type ToleranceMetric,
} from "../src/load/gate/tolerance.ts";
import { parseKneeBounds, steadyRateFor, type KneeBoundProduct } from "../src/load/knee/bounds.ts";
import { selectPublishable } from "../src/load/medians.ts";
import { validateRunMeta } from "../src/load/run-meta.ts";
import { findHits } from "./evidence-token-scan.mjs";

const AA_PRODUCT_CASE: Record<KneeBoundProduct, AaCaseId> = {
  cal: "P6-CAL-LOAD-003",
  medusa: "P6-MED-LOAD-002",
};

const args = process.argv.slice(2);
const flag = (name: string): string => {
  const i = args.indexOf(name);
  if (i === -1 || args[i + 1] === undefined) throw new Error(`missing ${name}`);
  return args[i + 1]!;
};
const release = flag("--release");
const out = flag("--out");
const pairs = args.filter((a) => /^(cal|medusa)=/.test(a));
const bounds = parseKneeBounds(JSON.parse(readFileSync("k6/thresholds/knee-bounds.json", "utf8")));

function readFolder(dir: string): RunFolder {
  return {
    verdict: JSON.parse(readFileSync(path.join(dir, "verdict.json"), "utf8")),
    meta: validateRunMeta(JSON.parse(readFileSync(path.join(dir, "run-meta.json"), "utf8"))),
    summary: JSON.parse(readFileSync(path.join(dir, "k6-main-summary.json"), "utf8")),
    bins: [],
  };
}

const products: ToleranceFile["products"] = {};
const report: string[] = [];
for (const pair of pairs) {
  const [product, dirs] = pair.split("=") as [KneeBoundProduct, string];
  const caseId = AA_PRODUCT_CASE[product];
  const expectedRate = steadyRateFor(bounds, product);
  const folders = dirs.split(",").map(readFolder);

  // Folders of another case or profile are left out before selection, as in write-baseline-band.ts.
  const eligible = folders.filter((f) => f.meta.caseId === caseId && f.meta.profile === "steady");
  const { used, excluded } = selectPublishable(
    eligible.map((f) => ({ verdict: f.verdict, meta: f.meta })),
  );
  const usedIds = new Set(used.map((r) => r.verdict.runId ?? r.meta.runId));
  const kept = eligible.filter((f) => usedIds.has(f.verdict.runId ?? f.meta.runId));
  const reasons = [
    ...folders
      .filter((f) => !eligible.includes(f))
      .map((f) => `${f.verdict.runId ?? f.meta.runId}: not ${caseId} steady`),
    ...excluded.map((e) => `${e.runId}: ${e.why.join("; ")}`),
  ];
  if (kept.length < 3) {
    console.error(
      `${product} (${caseId}): ${kept.length} VALID steady arm(s), need at least 3. Excluded: ${reasons.join(" | ") || "none"}`,
    );
    process.exit(2);
  }
  if (reasons.length > 0) console.error(`${product}: excluded ${reasons.join(" | ")}`);

  // The arm id is "<runId>-<attempt>-<armIndex>": the counted arms of one run, numbered from 1 by their start time.
  const byStart = [...kept].sort((a, b) => a.meta.startedAt.localeCompare(b.meta.startedAt));
  const armIndexOf = new Map<string, number>();
  const arms: AaArm[] = byStart.map((f) => {
    const v = runValues(f);
    const index = (armIndexOf.get(v.runId) ?? 0) + 1;
    armIndexOf.set(v.runId, index);
    return {
      runId: v.runId,
      armId: `${v.runId}-${f.meta.environment.attempt ?? 1}-${index}`,
      utcDay: f.meta.startedAt.slice(0, 10),
      caseId: f.meta.caseId,
      profile: f.meta.profile,
      rate: f.meta.rate,
      medians: { p50Ms: v.p50Ms, p95Ms: v.p95Ms, requestsPerSec: v.requestsPerSec },
    };
  });

  const metrics: Partial<Record<ToleranceMetric, Tolerance>> = {};
  for (const metric of TOLERANCE_METRICS) {
    try {
      const values = aaArmsFor(caseId, arms, expectedRate, metric);
      const t = toleranceOf(metric, values);
      metrics[metric] = t;
      report.push(
        `| ${product} | ${metric} | ${values.map((v) => v.value).join(" / ")} | ${(t.spread * 100).toFixed(2)} % | ${(t.tolerance * 100).toFixed(2)} % | ${t.runIds.join(", ")} |`,
      );
    } catch (err) {
      console.error(`${product} ${metric}: ${(err as Error).message}`);
      process.exit(2);
    }
  }
  products[product] = metrics;
}

const file: ToleranceFile = {
  schema: 1,
  metric: "A/A tolerance",
  unit: "fraction of the median (relative)",
  release,
  products,
};
// The committed file must pass parseTolerance: at least three counted arms, and runs on at least two UTC days (Q-TOLRULE).
let checked: ToleranceFile;
try {
  checked = parseTolerance(file);
} catch (err) {
  console.error(`refusing to write: ${(err as Error).message}`);
  process.exit(2);
}
const text = `${JSON.stringify(checked, null, 2)}\n`;
const hits = findHits(text);
if (hits.length > 0) {
  console.error(`refusing to write: secret-like text on line(s) ${hits.join(", ")}`);
  process.exit(1);
}
writeFileSync(out, text);
console.log(
  "| product | metric | arm values (ms or per s) | spread S | tolerance T | run ids |\n|---|---|---|---|---|---|",
);
for (const row of report) console.log(row);
