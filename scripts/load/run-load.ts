// CLI of the LOAD runner: node scripts/load/run-load.ts --case P6-X-LOAD-001 [--profile pr|full|steady|soak] [--out results/load]
// The soak profile reads SOAK_DURATION_MIN (30 or 120) and writes soak.json next to verdict.json (plan Phase 4b task 7 §6.7).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CASES } from "../../src/load/cases.ts";
import { loadRepoEnv } from "../../src/load/env.ts";
import { parseKneeBounds } from "../../src/load/knee/bounds.ts";
import { runLoad } from "../../src/load/runner.ts";
import { withSteadyProfile } from "../../src/load/steady.ts";
import { soakDurationSec, withSoakProfile } from "../../src/load/soak/profile.ts";
import { soakStatistics, type SoakTelemetry } from "../../src/load/soak/report.ts";
import { soakVerdict } from "../../src/load/soak/verdict.ts";
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
if (!found || !["pr", "full", "steady", "soak"].includes(profile))
  fail(
    `unknown case or profile. Cases: ${Object.keys(CASES).join(", ")}; profiles: pr, full, steady, soak`,
  );
if (profile !== "steady" && profile !== "soak" && found.profiles[profile] === undefined)
  fail(`ENV: case ${found.id} has no ${profile} profile`);

// The steady and soak profiles are sized from the knee bounds: without the file they are not defined (plan task 5 §6.5, Task 7 §6.2).
let caseDef: LoadCase = found;
let soakSec = 0;
if (profile === "soak") {
  try {
    soakSec = soakDurationSec(process.env.SOAK_DURATION_MIN);
  } catch (err) {
    fail((err as Error).message);
  }
}
if (profile === "steady" || profile === "soak") {
  let text: string;
  try {
    text = readFileSync(KNEE_BOUNDS_FILE, "utf8");
  } catch {
    fail(
      `ENV: knee bounds missing or unreadable (${KNEE_BOUNDS_FILE}; Phase 4 Tasks 2 and 3 not evidenced)`,
    );
  }
  // The reason is fixed text: the parse error can carry file-controlled values.
  let bounds;
  try {
    bounds = parseKneeBounds(JSON.parse(text));
  } catch (err) {
    const reason = err instanceof SyntaxError ? "invalid JSON" : "schema validation failed";
    fail(
      `ENV: knee bounds invalid (${KNEE_BOUNDS_FILE}: ${reason}; Phase 4 Tasks 2 and 3 not evidenced)`,
    );
  }
  try {
    caseDef =
      profile === "steady"
        ? withSteadyProfile(found, bounds)
        : withSoakProfile(found, bounds, soakSec);
  } catch (err) {
    fail(`ENV: ${(err as Error).message}`);
  }
}

loadRepoEnv();
const result = await runLoad(caseDef, { profile, outRoot: arg("--out") });
if (profile === "soak") writeSoakReport(result.verdictPath, soakSec, result.exitCode);
console.log(`${caseDef.id} ${result.outcome} ${result.verdictPath}`);
process.exit(result.exitCode);

/** soak.json: the statistics of the run's telemetry and the soak verdict (no thresholds yet: NO THRESHOLD YET). Points are not written (L5). */
function writeSoakReport(verdictPath: string, durationSec: number, runExit: number): void {
  const dir = path.dirname(verdictPath);
  const telemetry = JSON.parse(
    readFileSync(path.join(dir, "telemetry-main.json"), "utf8"),
  ) as SoakTelemetry & {
    startedAtMs: number;
    gaps: unknown[];
  };
  const statistics = soakStatistics(telemetry, telemetry.startedAtMs, durationSec);
  const { verdict, reasons } = soakVerdict({
    auditOk: runExit === 0,
    invalidReasons:
      telemetry.gaps.length > 0
        ? [`telemetry gaps over two intervals: ${telemetry.gaps.length}`]
        : [],
    testBugReasons: [],
    slopeRpm: statistics.rssMb.slope,
    plateau: statistics.rssMb.plateau,
    thresholds: null,
  });
  writeFileSync(
    path.join(dir, "soak.json"),
    `${JSON.stringify({ verdict, reasons, statistics }, null, 2)}\n`,
  );
}
