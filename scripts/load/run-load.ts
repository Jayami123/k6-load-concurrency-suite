// CLI of the LOAD runner: node scripts/load/run-load.ts --case P6-X-LOAD-001 [--profile pr|full|steady] [--out results/load]
import { readFileSync } from "node:fs";
import { CASES } from "../../src/load/cases.ts";
import { loadRepoEnv } from "../../src/load/env.ts";
import { parseKneeBounds } from "../../src/load/knee/bounds.ts";
import { runLoad } from "../../src/load/runner.ts";
import { withSteadyProfile } from "../../src/load/steady.ts";
import type { LoadCase, LoadProfileName } from "../../src/load/types.ts";

const KNEE_BOUNDS_FILE = "k6/thresholds/knee-bounds.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const caseId = arg("--case");
const profile = (arg("--profile") ?? "pr") as LoadProfileName;
const found = caseId ? CASES[caseId] : undefined;
if (!found || !["pr", "full", "steady"].includes(profile))
  fail(
    `unknown case or profile. Cases: ${Object.keys(CASES).join(", ")}; profiles: pr, full, steady`,
  );
if (profile !== "steady" && found.profiles[profile] === undefined)
  fail(`ENV: case ${found.id} has no ${profile} profile`);

// The steady profile is sized from the knee bounds: without the file the steady baseline is not defined (plan task 5 §6.5).
let caseDef: LoadCase = found;
if (profile === "steady") {
  let bounds;
  try {
    bounds = parseKneeBounds(JSON.parse(readFileSync(KNEE_BOUNDS_FILE, "utf8")));
  } catch {
    fail(
      `ENV: knee bounds missing or unreadable (${KNEE_BOUNDS_FILE}; Phase 4 Tasks 2 and 3 not evidenced)`,
    );
  }
  try {
    caseDef = withSteadyProfile(found, bounds);
  } catch (err) {
    fail(`ENV: ${(err as Error).message}`);
  }
}

loadRepoEnv();
const result = await runLoad(caseDef, { profile, outRoot: arg("--out") });
console.log(`${caseDef.id} ${result.outcome} ${result.verdictPath}`);
process.exit(result.exitCode);
