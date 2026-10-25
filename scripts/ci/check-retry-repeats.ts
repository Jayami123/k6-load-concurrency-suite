#!/usr/bin/env node
// Verification check of the medusa_retry_repeats dispatch (plan PRE-1): every repeat of P6-MED-LOAD-006 must be a VALID PASS
// with the storm present. Prints one line per run (run id, storm counts, storm timeout, measured minimum) and writes the same
// table to the job summary when one is set. Exit 1 on any other outcome or on a wrong number of runs.
// Usage: node scripts/ci/check-retry-repeats.mjs <case results directory> <expected run count>
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const [dir = "", expectedArg = ""] = process.argv.slice(2);
const expected = Number(expectedArg);
const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;

const runs = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let failures = runs.length === expected ? 0 : 1;
const lines = [
  "| run id | outcome | validity | storm (first timeouts / intents) | stormTimeoutMs | measured minimum (ms) |",
  "| --- | --- | --- | --- | --- | --- |",
];
if (runs.length !== expected) {
  console.error(`expected ${expected} runs of P6-MED-LOAD-006, found ${runs.length}`);
}
for (const run of runs) {
  const base = path.join(dir, run);
  const verdict = json(path.join(base, "verdict.json"));
  const audit = json(path.join(base, "retry-audit.json"));
  const config = json(path.join(base, "k6-config.json"));
  const metrics = json(path.join(base, "k6-main-summary.json")).metrics;
  const storm = (audit.findings as Array<{ check: string; ok: boolean }>).find(
    (finding) => finding.check === "storm",
  );
  const first = metrics.p6_first_timeouts?.count ?? 0;
  const intents = metrics.p6_intents?.count ?? 0;
  const ok =
    verdict.outcome === "PASS" && verdict.validity?.verdict === "VALID" && storm?.ok === true;
  if (!ok) failures += 1;
  lines.push(
    `| ${verdict.runId} | ${verdict.outcome} | ${verdict.validity?.verdict} | ${first} / ${intents} | ${config.stormTimeoutMs} | ${config.stormMinCompleteMs} |`,
  );
}
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
if (failures > 0) {
  console.error(`${failures} problem(s): every repeat must be PASS, VALID, with the storm present`);
  process.exit(1);
}
