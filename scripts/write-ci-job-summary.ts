import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  formatPlaywrightJobSummary,
  mergeSummaries,
  parsePlaywrightJsonReport,
  requireTests,
} from "../src/ci/playwright-json-summary.ts";
import { formatLoadTable } from "../src/ci/load-table.ts";
import { formatRaceTable, raceSummaryRow } from "../src/ci/race-table.ts";

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}

/** verdict.json files under results/load/<case>/<run>/ (LOAD runs, Task 3 onward). */
function verdictFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return verdictFiles(full);
    return entry.name === "verdict.json" ? [full] : [];
  });
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`${path} is not valid JSON`, { cause });
  }
}

function buildSummary(root: string, env: NodeJS.ProcessEnv): string {
  const up = env.HARNESS_UP_SECONDS?.trim();
  const upSeconds = up === undefined || up === "" ? NaN : Number(up);
  const harnessLine = Number.isFinite(upSeconds)
    ? `**Harness up:** ${Math.round(upSeconds)} s`
    : "**Harness up:** n/a (not reached)";

  const pwFiles = jsonFiles(join(root, "results", "playwright"));
  let playwright: string;
  if (pwFiles.length === 0) {
    process.stdout.write("::warning::Playwright JSON report missing; job summary is incomplete.\n");
    playwright =
      "## Playwright results\n\nNo Playwright JSON report was written; known product bugs cannot be listed.\n";
  } else {
    const parts = pwFiles.map((path) => {
      const summary = parsePlaywrightJsonReport(readJson(path));
      requireTests(summary, path);
      return summary;
    });
    playwright = formatPlaywrightJobSummary(mergeSummaries(parts));
  }

  const raceFiles = jsonFiles(join(root, "results", "races"));
  const races = formatRaceTable(raceFiles.map((path) => raceSummaryRow(path, readJson(path))));
  const loadFiles = verdictFiles(join(root, "results", "load")).sort();
  const load =
    loadFiles.length === 0
      ? ""
      : formatLoadTable(loadFiles.map((path) => ({ path, verdict: readJson(path) })));
  return [harnessLine, "", playwright, races, load].join("\n");
}

try {
  const markdown = buildSummary(process.argv[2] ?? ".", process.env);
  process.stdout.write(markdown);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath.trim() !== "") {
    appendFileSync(summaryPath, markdown, "utf8");
  }
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
