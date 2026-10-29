// CLI of the LOAD runner: node scripts/load/run-load.ts --case P6-X-LOAD-001 [--profile pr|full|steady|soak] [--out results/load]
// The soak profile reads SOAK_DURATION_MIN (30 or 120) and writes soak.json next to verdict.json (plan Phase 4b task 7 §6.7).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CASES } from "../../src/load/cases.ts";
import { loadRepoEnv } from "../../src/load/env.ts";
import { judgeKnownFailure } from "../../src/load/known-failure.ts";
import { gateDecision, notRunReport } from "../../src/load/not-run.ts";
import { parseKneeBounds } from "../../src/load/knee/bounds.ts";
import { evaluateVerdict, runLoad } from "../../src/load/runner.ts";
import type { LoadContext } from "../../src/load/types.ts";
import { withSteadyProfile } from "../../src/load/steady.ts";
import { soakDurationSec, withSoakProfile } from "../../src/load/soak/profile.ts";
import { soakStatistics, type SoakTelemetry } from "../../src/load/soak/report.ts";
import { soakVerdict } from "../../src/load/soak/verdict.ts";
import { parseSoakBounds, thresholdsFor } from "../../src/load/soak/bounds.ts";
import type { LoadCase, LoadProfileName } from "../../src/load/types.ts";

const KNEE_BOUNDS_FILE = "k6/thresholds/knee-bounds.json";
const SOAK_BOUNDS_FILE = "k6/thresholds/soak-bounds.json";

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
// A gated case runs only when its gate check passes (Twenty plan §6.9, Q4). A closed gate is NOT RUN: exit 0, never PASS.
const decision = gateDecision(found);
if (decision.kind === "refuse") fail(`ENV: case ${found.id} is gated and has no gate check`);
if (decision.kind === "not-run") {
  const report = notRunReport(found, decision.reason, profile);
  console.log(report.console);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.summary);
  process.exit(0);
}

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
if (profile === "soak") writeSoakReport(result, soakSec, caseDef.product);
// A case with a known failure: its FAIL on a VALID run is expected (exit 0); the outcome in verdict.json stays FAIL.
const judged = judgeKnownFailure(
  caseDef.id,
  caseDef.knownFailure,
  result.outcome,
  result.ctx.invalid.length === 0,
  result.exitCode,
);
// A FINDING is printed with its detail; it exits 0 (an expected result, not a test failure).
const outcomeLine =
  result.outcome === "FINDING"
    ? `${caseDef.id} FINDING (${evaluateVerdict(result.ctx).reasons.join("; ")})`
    : `${caseDef.id} ${result.outcome}`;
console.log(`${judged.line ?? outcomeLine} ${result.verdictPath}`);
if (judged.summary && process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${judged.summary}\n\n`);
process.exit(judged.exitCode);

/** soak.json: the statistics of the run's telemetry and the soak verdict (no thresholds yet: NO THRESHOLD YET). Points are not written (L5). */
function writeSoakReport(
  result: { verdictPath: string; ctx: LoadContext },
  durationSec: number,
  product: string,
): void {
  const dir = path.dirname(result.verdictPath);
  const telemetryPath = path.join(dir, "telemetry-main.json");
  // A run that fails in setup or preflight never starts the sampler, so there is no telemetry to report.
  if (!existsSync(telemetryPath)) {
    console.warn(`soak.json not written: ${telemetryPath} is missing`);
    return;
  }
  const telemetry = JSON.parse(readFileSync(telemetryPath, "utf8")) as SoakTelemetry & {
    startedAtMs: number;
    gaps: unknown[];
  };
  const statistics = soakStatistics(telemetry, telemetry.startedAtMs, durationSec);
  // The run's own outcome decides the audit, so soak.json cannot disagree with verdict.json.
  const { outcome, reasons: runReasons } = evaluateVerdict(result.ctx);
  const testBugReasons = runReasons.filter((r) => r.includes("TEST BUG"));
  // A failed k6 check is not an audit finding: the soak cannot read it as a product verdict, so it is INVALID with its own reason.
  const checkFailReasons =
    outcome === "FAIL"
      ? runReasons.filter((r) => !r.startsWith("reconcile:") && !r.includes("TEST BUG"))
      : [];
  const invalidReasons = [
    ...result.ctx.invalid,
    ...(outcome === "INVALID" || outcome === "ENV" ? [`run outcome ${outcome}`] : []),
    ...checkFailReasons.map((r) => `run check failed: ${r}`),
    ...(telemetry.gaps.length > 0
      ? [`telemetry gaps over two intervals: ${telemetry.gaps.length}`]
      : []),
  ];
  const { verdict, reasons } = soakVerdict({
    auditOk: !runReasons.some((r) => r.startsWith("reconcile:") && !r.includes("TEST BUG")),
    invalidReasons,
    testBugReasons,
    slopeRpm: statistics.rssMb.slope,
    plateau: statistics.rssMb.plateau,
    thresholds: thresholdsFor(
      parseSoakBounds(JSON.parse(readFileSync(SOAK_BOUNDS_FILE, "utf8"))),
      product,
    ),
  });
  writeFileSync(
    path.join(dir, "soak.json"),
    `${JSON.stringify({ verdict, reasons, statistics }, null, 2)}\n`,
  );
}
