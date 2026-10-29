// Writes the flags-on versus flags-off A/A verdict (P6-X-LOAD-009) for the arm folders of tier-aa.yml. Usage:
//   node scripts/load/aa-flags-verdict.ts results/load/aa-flags --order off-first
// Arm folders are named "<off|on>-<n>" and hold verdict.json, run-meta.json and k6-main-summary.json. The tolerances are read from
// k6/thresholds/tolerance.json at run time. A missing arm is INCONCLUSIVE, never PASS. The job summary gets one line.
import { appendFileSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { runValues, type RunFolder } from "../../src/load/baseline-band.ts";
import { armRunFolder } from "../../src/load/tier-aa/arm-folder.ts";
import { validateRunMeta } from "../../src/load/run-meta.ts";
import { aaFlagsVerdict, medusaTolerances, type AaArm } from "../../src/load/tier-aa/verdict.ts";

const args = process.argv.slice(2);
const dir = args[0];
if (!dir) throw new Error("usage: aa-flags-verdict.ts <dir> --order <off-first|on-first>");
const orderAt = args.indexOf("--order");
const order = orderAt === -1 ? "off-first" : (args[orderAt + 1] ?? "off-first");

/** The arm's one run folder (<arm>/P6-MED-LOAD-002/<runId>/), then its three files. */
function readFolder(armDir: string): RunFolder {
  const folder = armRunFolder(armDir);
  return {
    verdict: JSON.parse(readFileSync(path.join(folder, "verdict.json"), "utf8")),
    meta: validateRunMeta(JSON.parse(readFileSync(path.join(folder, "run-meta.json"), "utf8"))),
    summary: JSON.parse(readFileSync(path.join(folder, "k6-main-summary.json"), "utf8")),
    bins: [],
  };
}

const arms: AaArm[] = readdirSync(dir)
  .filter((name) => /^(off|on)-\d+$/.test(name) && statSync(path.join(dir, name)).isDirectory())
  .sort()
  .map((name) => {
    const folder = readFolder(path.join(dir, name));
    const values = runValues(folder);
    return {
      state: name.startsWith("on-") ? "on" : "off",
      valid: folder.verdict.validity?.verdict === "VALID",
      values: { p50Ms: values.p50Ms, p95Ms: values.p95Ms, requestsPerSec: values.requestsPerSec },
    };
  });

const tolerances = medusaTolerances(
  JSON.parse(readFileSync("k6/thresholds/tolerance.json", "utf8")),
);
const { verdict, metrics } = aaFlagsVerdict(arms, tolerances);
const result = { schema: 1, case: "P6-X-LOAD-009", product: "medusa", order, verdict, metrics };
writeFileSync(path.join(dir, "verdict.json"), `${JSON.stringify(result, null, 2)}\n`);

const part = (m: keyof typeof metrics) => {
  const r = metrics[m];
  return `${m} rel ${r.relDiff.toFixed(4)} of tol ${r.tolerance} ${r.verdict}`;
};
const line = `P6-X-LOAD-009 A/A flags (${order}): ${verdict} (${part("p50Ms")}; ${part("p95Ms")}; ${part("requestsPerSec")})`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
