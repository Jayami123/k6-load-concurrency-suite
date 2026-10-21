# P6 CI job summary: plan

Status: plan only. No code until the maintainer approves this plan.
Date: 2026-10-21.
Build branch (after approval): `ci/2026-10-21-p6-ci-job-summary`, cut from main `d75379a`.
This plan lives on `plan/2026-10-20-p6-phase1`. That branch is never PR'd and never deleted.

## 0. What was checked, and where

Line numbers refer to main `d75379a`, not to the plan branch. The plan branch does not contain `d75379a`, and its
`perf.yml` differs from main (its Cal and Documenso line numbers are 3 lower; the Medusa lines match). The build starts from main, so do not
build on the plan branch.

| Fact                                                                                                                                                                                                                                                                              | Evidence                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| P6 reporter is `"list"` only                                                                                                                                                                                                                                                      | `playwright.config.ts:10` on main                                                                                                           |
| Ad-hoc summary lines to remove: L145, L174, L339, L377, L391, L396 (`node -e`), L563, L591, L596 (`node -e`)                                                                                                                                                                      | `grep` of `.github/workflows/perf.yml` on main. L394–397 is the `if [ -f ... ]` wrapper around L396; L593–598 is the `for` loop around L596 |
| `test.fail()` specs: `P6-CAL-RACE-003` (mapped, `tests/cal/races/cal-race-003-overlap.spec.ts:65`), the "extra (unmapped)" test in `tests/cal/races/cal-race-001-identical-slot.spec.ts:114`, `P6-DOC-RACE-001` (`tests/documenso/races/doc-race-001-last-recipients.spec.ts:63`) | the three `test.fail();` lines                                                                                                              |
| Current annotations use `type: "P6-OBS-CAL-002"` and `"P6-OBS-DOC-002"`; `P6-CAL-RACE-001`'s bug has no annotation                                                                                                                                                                | `annotations.push` sites at cal-race-003 L52, doc-race-001 L41                                                                              |
| Source formatter reads only annotations of `type: "issue"`, and takes the id as the text before the first colon                                                                                                                                                                   | source `src/core/playwright-json-summary.ts` L54, L64–68                                                                                    |
| Playwright's JSON reporter stores `test.fail()` specs as `status: "expected"`, `expectedStatus: "failed"`, and keeps annotations                                                                                                                                                  | verified with a throwaway spec in a scratch directory outside the repo, using the repo's `@playwright/test`                                 |
| The source `titleId()` takes the first word of the title, so the unmapped CAL-001 bug would print as "extra"                                                                                                                                                                      | same scratch run; title is "extra (unmapped): concurrent losers get 409, never 400/5xx"                                                     |
| Histogram fields: `caseId, trials, verdict, perTrial[], oracle{}, invariantViolations[]`. Per-trial: `ok, oracle{}, requests[{startedAtMs, endedAtMs, status}]`. Medusa keys are per trial, not top level                                                                         | the `p6-phase1` release zips, real files (see §6)                                                                                           |
| `tsconfig.json` only includes `scripts/**/*.mjs`. A new `.ts` script is not type-checked unless `tsconfig.races.json` includes it                                                                                                                                                 | both tsconfig files on main                                                                                                                 |
| Baseline `npm run check` on main passes: 276 tests                                                                                                                                                                                                                                | run on a checkout of main at `d75379a`, Node v22.23.3                                                                                       |
| `actionlint` is not installed here                                                                                                                                                                                                                                                | `which actionlint` returned nothing                                                                                                         |

Source: `Jayami123/playwright-e2e-ci-framework` at `main` commit **`2d714c7a65c22136c845461ed31a2503dfa8c20a`**
(2026-10-20). Files read: `src/core/playwright-json-summary.ts` (237 lines), `scripts/write-ci-job-summary.mts`,
`tests/unit/playwright-json-summary.spec.ts`.

## 1. Decisions

1. **Port, do not share.** Copy the two source files into P6 under `src/ci/`, with a header naming the source repo,
   path and commit. Reason: the source is about 240 lines and P6 needs only the parser and formatter. A shared
   package would need a publish or vendor step, a version pin, and cross-repo CI access, and that costs more than
   the copy. The two repos also use different test runners (P1 uses Playwright, P6 uses `node:test`), so the tests
   would not run unchanged anyway. **What would change this:** a third consumer, or a change that has to land in
   both repos and then drifts. At that point extract a small versioned package.
2. **JSON reporter: always on, next to `list`.** Local and CI runs then have the same config, the file lands under
   `results/` (already gitignored by `results/*`), and a maintainer can reproduce the job summary locally. A
   CI-only switch (`process.env.CI`) would hide the file in local runs and let the two drift.
   **Deviation from the brief:** one JSON file per race invocation, not per project. The Cal job runs the
   `cal-race` project three times (self-test, 001, 003), and a per-project name would overwrite the earlier run.
   Files: `results/playwright/<name>.json`, names in §3.2.
3. **Annotations:** change to `type: "issue"`, with the description starting `P6-OBS-<id>: `. Assertions, `test.fail()`
   placement and trial counts do not change. The CAL-001 annotation goes in the unmapped extra test, where that
   `test.fail()` lives.
4. **Known-bugs line lists issue ids only** (`P6-OBS-CAL-001, ...`). The source line uses the title's first word,
   which prints "extra" for the CAL-001 row (see §0). The bullet list keeps `title (id)`.
5. **Harness-up time stays, folded into the summary.** Each up step writes `HARNESS_UP_SECONDS` to `$GITHUB_ENV`,
   and the single summary step prints it. Reason: the number is still useful when comparing runs, and it removes
   the separate `echo` into the summary. If the up step fails, the value is never written and the line reads
   `n/a (not reached)`.
6. **Missing JSON = warning. Zero tests = fail. Malformed = fail.** Same as P1 for Playwright. For race histograms,
   no file means "No race histograms were written by this job", which is not a failure, because the race step
   itself fails if its case did not run.
7. **Race table is driven by exact case ids** (sets in §3.5). Prefix matching is wrong: `extra-same-attendee`
   starts with `extra-s`, which is a Medusa prefix.
8. **The summary step runs with `if: ${{ always() }}`** after the race steps in all three jobs.
9. **The median is labelled as a CI wall-clock figure.** It is not a performance result. AGENTS.md says performance
   numbers come only from GitHub Actions runs (median of at least 3), so the column header says "Median trial"
   and the plan does not publish it anywhere else.

## 2. Files touched

| File                                                         | Change                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `playwright.config.ts`                                       | reporter array with JSON (§3.1)                                           |
| `tests/cal/races/cal-race-001-identical-slot.spec.ts`        | add one `issue` annotation before the existing `test.fail()` (§3.3)       |
| `tests/cal/races/cal-race-003-overlap.spec.ts`               | change annotation type and prefix the id (§3.3)                           |
| `tests/documenso/races/doc-race-001-last-recipients.spec.ts` | same as above (§3.3)                                                      |
| `src/ci/playwright-json-summary.ts`                          | new: port of the source file (§3.4)                                       |
| `src/ci/race-table.ts`                                       | new: race row builder and formatter (§3.5)                                |
| `scripts/write-ci-job-summary.ts`                            | new: thin CLI (§3.6)                                                      |
| `tsconfig.races.json`                                        | add `scripts/write-ci-job-summary.ts` to `include` (§3.7)                 |
| `tests/unit/playwright-json-summary.test.ts`                 | new (§3.8)                                                                |
| `tests/unit/race-table.test.ts`                              | new (§3.8)                                                                |
| `.github/workflows/perf.yml`                                 | env vars, harness-up line, removed echo lines, three summary steps (§3.9) |

Not touched: race logic, oracles, trial counts, the artifact uploads, the Documenso token scan, `.gitignore`
(`results/*` already covers `results/playwright/`), `package.json` (no new scripts, `check` already runs the unit
folder).

## 3. Steps, in order

### 3.0 Branch

```bash
cd /home/user/k6-load-concurrency-suite
export PATH="/usr/local/bin:$PATH"            # Node 22.23 first, per AGENTS.md
git fetch origin main
git checkout -B ci/2026-10-21-p6-ci-job-summary origin/main
git rev-parse --short HEAD                     # expect d75379a
```

### 3.1 `playwright.config.ts`

Replace line 10 (`  reporter: "list",`) with:

```ts
  // "list" stays on stdout. The JSON file feeds the CI job summary (scripts/write-ci-job-summary.ts).
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.P6_PLAYWRIGHT_JSON ?? "results/playwright/local.json" }],
  ],
```

The reporter creates the directory. Verified in the scratch run (`out/report.json` was created without a `mkdir`).

### 3.2 `.github/workflows/perf.yml` env per race invocation

Set `P6_PLAYWRIGHT_JSON` on each race step's `env:` block (the value must be unique per invocation):

| Job             | Step (main line)                     | Value                                    |
| --------------- | ------------------------------------ | ---------------------------------------- |
| medusa-smoke    | Race P6-MED-RACE-001 + extras (L166) | `results/playwright/medusa-race.json`    |
| cal-smoke       | Race self-test (L356)                | `results/playwright/cal-self-test.json`  |
| cal-smoke       | Race P6-CAL-RACE-001 (L366)          | `results/playwright/cal-race-001.json`   |
| cal-smoke       | Race P6-CAL-RACE-003 (L380)          | `results/playwright/cal-race-003.json`   |
| documenso-smoke | Documenso races (L580)               | `results/playwright/documenso-race.json` |

### 3.3 Annotations

**`tests/cal/races/cal-race-003-overlap.spec.ts`**, replace L52–55:

```ts
test.info().annotations.push({
  type: "issue",
  description: `P6-OBS-CAL-002: double-booked ${doubleBook.trialsDoubleBooked}/${trials} trials, clean ${doubleBook.trialsClean}, pairs by trial ${doubleBook.doubleBookedByTrial}`,
});
```

**`tests/cal/races/cal-race-001-identical-slot.spec.ts`**, insert immediately before the `test.fail();` at L114
(the code that follows is unchanged):

```ts
test.info().annotations.push({
  type: "issue",
  description: "P6-OBS-CAL-001: concurrent losers get 400 instead of 409 (redacted P2002)",
});
```

**`tests/documenso/races/doc-race-001-last-recipients.spec.ts`**, replace L41–44:

```ts
test.info().annotations.push({
  type: "issue",
  description: `P6-OBS-DOC-002: double seal in ${result.doubleSealTrials}/${trials} trials`,
});
```

Check: `grep -rn 'type: "P6-OBS' tests` must return nothing afterwards.

### 3.4 `src/ci/playwright-json-summary.ts` (port)

Header (first lines of the file):

```ts
// Ported from Jayami123/playwright-e2e-ci-framework, src/core/playwright-json-summary.ts,
// at commit 2d714c7a65c22136c845461ed31a2503dfa8c20a (main, 2026-10-20). Keep in sync by hand.
// P6 changes: no browser label, no P1 report-id suffix, compact line lists issue ids, mergeSummaries added.
```

Keep unchanged from the source: `isRecord`, `asString`, `issueIdFromDescription`, `collectIssueDescription`,
`walkSuites`, `parsePlaywrightJsonReport` (the whole status logic), `totalTestsInSummary`.

Remove: `PLAYWRIGHT_JSON_REPORT_FILE`, `P1_PW_REPORT_ID_ENV`, `resolvePlaywright*` (the P1 suffix logic), and the
`browserLabel`/`elapsedSeconds` options. Drop `titleId`.

New function:

```ts
export function mergeSummaries(parts: readonly PlaywrightJobSummary[]): PlaywrightJobSummary {
  const totals = { passed: 0, failed: 0, flaky: 0, expectedFailures: 0, skipped: 0 };
  const seen = new Set<string>();
  const knownProductBugs: KnownProductBugRow[] = [];
  for (const part of parts) {
    totals.passed += part.totals.passed;
    totals.failed += part.totals.failed;
    totals.flaky += part.totals.flaky;
    totals.expectedFailures += part.totals.expectedFailures;
    totals.skipped += part.totals.skipped;
    for (const row of part.knownProductBugs) {
      const key = `${row.title}\n${row.issue}`;
      if (!seen.has(key)) {
        seen.add(key);
        knownProductBugs.push(row);
      }
    }
  }
  return { totals, knownProductBugs };
}
```

Replace `formatPlaywrightJobSummary`:

```ts
export function formatPlaywrightJobSummary(summary: PlaywrightJobSummary): string {
  const { totals, knownProductBugs } = summary;
  const compact =
    knownProductBugs.length === 0
      ? "Known product bugs still reproducing: none"
      : `Known product bugs still reproducing: ${knownProductBugs.map((row) => row.issueId).join(", ")}`;
  const lines = [
    "## Playwright results",
    "",
    "| passed | failed | flaky | expected failures |",
    "| ---: | ---: | ---: | ---: |",
    `| ${String(totals.passed)} | ${String(totals.failed)} | ${String(totals.flaky)} | ${String(totals.expectedFailures)} |`,
    "",
    compact,
  ];
  if (knownProductBugs.length > 0) {
    lines.push("");
    for (const row of knownProductBugs) {
      lines.push(`- ${row.title} (${row.issueId})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
```

### 3.5 `src/ci/race-table.ts` (new)

Only ids, counts and fixed phrases may reach the summary. Never print `bodySummary`, `requests` bodies or
`invariantViolations` text.

```ts
export interface RaceSummaryRow {
  readonly caseId: string;
  readonly trials: string;
  readonly verdict: string;
  readonly keyCounts: string;
  readonly medianTrial: string;
  readonly outcome: string;
}

type Json = Record<string, unknown>;
const NA = "n/a";

// Exact ids. Never match by prefix ("extra-same-attendee" starts with "extra-s").
const MEDUSA_OVERSELL_CASES = new Set([
  "P6-MED-RACE-001",
  "extra-mixed-qty",
  "extra-s0-n5",
  "extra-s1-n2",
  "extra-same-cart",
]);
const CAL_IDENTICAL_SLOT_CASES = new Set([
  "P6-CAL-RACE-001",
  "extra-loser-contract",
  "extra-same-attendee",
  "extra-time-spellings",
]);
const CAL_OVERLAP_CASES = new Set(["P6-CAL-RACE-003", "extra-overlap-sequential"]);
const DOC_SEAL_CASES = new Set([
  "P6-DOC-RACE-001",
  "P6-DOC-RACE-002",
  "extra-doc-sequential-control",
]);

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// One value per trial, or undefined if any trial lacks it (the row then shows n/a).
export function trialNumbers(trials: readonly unknown[], key: string): number[] | undefined {
  const out: number[] = [];
  for (const trial of trials) {
    const value =
      isJson(trial) && isJson(trial.oracle) ? finiteNumber(trial.oracle[key]) : undefined;
    if (value === undefined) return undefined;
    out.push(value);
  }
  return out;
}

// Wall time of one trial: earliest request start to latest request end, in seconds.
export function trialSeconds(trial: unknown): number | undefined {
  const requests = isJson(trial) && Array.isArray(trial.requests) ? trial.requests : [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (const r of requests) {
    const start = isJson(r) ? finiteNumber(r.startedAtMs) : undefined;
    const end = isJson(r) ? finiteNumber(r.endedAtMs) : undefined;
    if (start === undefined || end === undefined) return undefined;
    starts.push(start);
    ends.push(end);
  }
  if (starts.length === 0) return undefined;
  return (Math.max(...ends) - Math.min(...starts)) / 1000;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
```

Tests pin `median` at lengths 1, 2 and 3.

Row builder. The rules below are final, and the wording is what the table in §6 shows.

```ts
export function raceSummaryRow(file: string, raw: unknown): RaceSummaryRow {
  const h = parseRaceFile(raw, file);
  const seconds = h.perTrial.map(trialSeconds).filter((s): s is number => s !== undefined);
  const med = median(seconds);
  const { keyCounts, outcome } = outcomeFor(h.caseId, h);
  return {
    caseId: h.caseId,
    trials: h.trials === undefined ? NA : String(h.trials),
    verdict: h.verdict ?? NA,
    keyCounts,
    medianTrial: med === undefined ? NA : `${med.toFixed(1)} s`,
    outcome,
  };
}

function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome: string } {
  const trials = h.perTrial;
  const total = h.trials ?? trials.length;
  if (MEDUSA_OVERSELL_CASES.has(caseId)) {
    const accepted = trialNumbers(trials, "httpWinnerCount");
    const available = trialNumbers(trials, "available");
    if (!accepted || !available) return { keyCounts: NA, outcome: NA };
    const oversold = available.filter((a) => a < 0).length;
    return {
      keyCounts: `accepted ${sum(accepted)}; oversold trials ${oversold}`,
      outcome:
        oversold > 0
          ? `Oversold in ${oversold} of ${total} trials (not a tracked bug yet)`
          : `No oversell in ${total} trials`,
    };
  }
  if (CAL_IDENTICAL_SLOT_CASES.has(caseId)) {
    const accepted = trialNumbers(trials, "acceptedCount");
    const redacted = trialNumbers(trials, "loser_db-unique-redacted");
    const unexpected = trialNumbers(trials, "loser_unexpected");
    if (!accepted || !redacted || !unexpected) return { keyCounts: NA, outcome: NA };
    const doubleAccepted = accepted.filter((n) => n > 1).length;
    const losers400 = sum(redacted) + sum(unexpected);
    const first =
      doubleAccepted > 0
        ? `Double-accepted in ${doubleAccepted} of ${total} trials`
        : `One ACCEPTED per slot in ${total} trials`;
    const second =
      losers400 > 0
        ? `Reproduces P6-OBS-CAL-001: ${losers400} losers got 400 not 409`
        : "Did not reproduce P6-OBS-CAL-001: losers got 409";
    return {
      keyCounts: `double-accepted trials ${doubleAccepted}; non-409 losers ${losers400}`,
      outcome: `${first}; ${second}`,
    };
  }
  if (CAL_OVERLAP_CASES.has(caseId)) {
    const doubleBooked = finiteNumber(h.oracle.trialsDoubleBooked);
    const clean = finiteNumber(h.oracle.trialsClean);
    if (doubleBooked === undefined || clean === undefined) return { keyCounts: NA, outcome: NA };
    return {
      keyCounts: `double-booked trials ${doubleBooked}; clean ${clean}`,
      outcome:
        doubleBooked > 0
          ? `Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in ${doubleBooked} of ${total} trials`
          : `Did not reproduce: no overlapping pair accepted together in ${total} trials`,
    };
  }
  if (DOC_SEAL_CASES.has(caseId)) {
    const doubleSealed = finiteNumber(h.oracle.trialsDoubleSeal);
    if (doubleSealed === undefined) return { keyCounts: NA, outcome: NA };
    const violations = h.invariantViolations?.length;
    return {
      keyCounts: `double-sealed trials ${doubleSealed}; invariant violations ${violations ?? NA}`,
      outcome:
        doubleSealed > 0
          ? `Reproduces P6-OBS-DOC-002: sealed twice in ${doubleSealed} of ${total} trials`
          : `Did not reproduce: sealed once in ${total} trials`,
    };
  }
  // Self-tests and unknown ids: verdict only.
  return {
    keyCounts: NA,
    outcome:
      h.verdict === "pass" ? "Passed" : h.verdict === "fail" ? "Failed: see the job log" : NA,
  };
}
```

Parsing (malformed = throw, missing = n/a):

```ts
interface ParsedRace {
  readonly caseId: string;
  readonly trials?: number;
  readonly verdict?: string;
  readonly perTrial: readonly unknown[];
  readonly oracle: Json;
  readonly invariantViolations?: readonly unknown[];
}

export function parseRaceFile(raw: unknown, file: string): ParsedRace {
  if (!isJson(raw)) throw new Error(`${file}: race histogram root must be an object`);
  if (typeof raw.caseId !== "string" || raw.caseId === "") {
    throw new Error(`${file}: caseId must be a non-empty string`);
  }
  if (raw.perTrial !== undefined && !Array.isArray(raw.perTrial)) {
    throw new Error(`${file}: perTrial must be an array when present`);
  }
  if (raw.oracle !== undefined && !isJson(raw.oracle)) {
    throw new Error(`${file}: oracle must be an object when present`);
  }
  return {
    caseId: raw.caseId,
    trials: finiteNumber(raw.trials),
    verdict: typeof raw.verdict === "string" ? raw.verdict : undefined,
    perTrial: Array.isArray(raw.perTrial) ? raw.perTrial : [],
    oracle: isJson(raw.oracle) ? raw.oracle : {},
    invariantViolations: Array.isArray(raw.invariantViolations)
      ? raw.invariantViolations
      : undefined,
  };
}
```

Median per row: `median(h.perTrial.map(trialSeconds).filter(isNumber))`, formatted `${m.toFixed(1)} s`, or `n/a`
when the list is empty.

Formatter and cell escaping:

```ts
function cell(value: string): string {
  return value.replaceAll("|", "\\|");
}

export function formatRaceTable(rows: readonly RaceSummaryRow[]): string {
  if (rows.length === 0) {
    return "## Race results\n\nNo race histograms were written by this job.\n";
  }
  const header = [
    "## Race results",
    "",
    "| Case | Trials | Verdict | Key counts | Median trial | Outcome |",
    "| --- | ---: | --- | --- | ---: | --- |",
  ];
  const body = rows.map(
    (r) =>
      `| ${[r.caseId, r.trials, r.verdict, r.keyCounts, r.medianTrial, r.outcome].map(cell).join(" | ")} |`,
  );
  return [...header, ...body, ""].join("\n");
}
```

### 3.6 `scripts/write-ci-job-summary.ts` (thin CLI)

Behaviour: reads `<root>/results/playwright/*.json` and `<root>/results/races/*.json` (root defaults to `.`),
writes the markdown to stdout and appends it to `$GITHUB_STEP_SUMMARY` when set, and sets exit code 1 on any error.

```ts
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  formatPlaywrightJobSummary,
  mergeSummaries,
  parsePlaywrightJsonReport,
  totalTestsInSummary,
} from "../src/ci/playwright-json-summary.ts";
import { formatRaceTable, parseRaceFile, raceSummaryRow } from "../src/ci/race-table.ts";

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
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
  const upSeconds = up === undefined || up === "" ? undefined : Number(up);
  const harnessLine =
    upSeconds === undefined || !Number.isFinite(upSeconds)
      ? "**Harness up:** n/a (not reached)"
      : `**Harness up:** ${Math.round(upSeconds)} s`;

  const pwFiles = jsonFiles(join(root, "results", "playwright"));
  let playwright: string;
  if (pwFiles.length === 0) {
    process.stdout.write("::warning::Playwright JSON report missing; job summary is incomplete.\n");
    playwright =
      "## Playwright results\n\nNo Playwright JSON report was written; known product bugs cannot be listed.\n";
  } else {
    const parts = pwFiles.map((path) => {
      const summary = parsePlaywrightJsonReport(readJson(path));
      if (totalTestsInSummary(summary) === 0) throw new Error(`${path} contains zero tests`);
      return summary;
    });
    playwright = formatPlaywrightJobSummary(mergeSummaries(parts));
  }

  const raceFiles = jsonFiles(join(root, "results", "races"));
  const races = formatRaceTable(raceFiles.map((path) => raceSummaryRow(path, readJson(path))));
  return [harnessLine, "", playwright, races].join("\n");
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
```

`raceSummaryRow(path, raw)` = `parseRaceFile` + per-row median + `outcomeFor` (§3.5). Keep the `race-table.ts`
exports to: `parseRaceFile`, `raceSummaryRow`, `formatRaceTable`, plus `trialNumbers`, `trialSeconds`, `median` for tests.

### 3.7 `tsconfig.races.json`

Add `"scripts/write-ci-job-summary.ts"` to `include` (the array currently holds `src/**/*.ts`, `tests/**/*.ts`,
`playwright.config.ts`). Without this, `npm run typecheck` never sees the new script.

### 3.8 Unit tests (`node:test`, the P6 style)

`tests/unit/playwright-json-summary.test.ts`, six tests:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPlaywrightJobSummary,
  mergeSummaries,
  parsePlaywrightJsonReport,
  totalTestsInSummary,
} from "../../src/ci/playwright-json-summary.ts";

const report = {
  suites: [
    {
      title: "tests/cal/races/cal-race-003-overlap.spec.ts",
      specs: [
        {
          title: "P6-CAL-RACE-003 fake overlap case",
          tests: [
            {
              status: "expected",
              expectedStatus: "failed",
              annotations: [{ type: "issue", description: "P6-OBS-CAL-002: fake counts 2/2" }],
            },
          ],
        },
        {
          title: "fake pass",
          tests: [{ status: "expected", expectedStatus: "passed", annotations: [] }],
        },
      ],
    },
  ],
};

describe("parsePlaywrightJsonReport", () => {
  it("counts expected failures and keeps issue annotations", () => {
    const s = parsePlaywrightJsonReport(report);
    assert.deepEqual(s.totals, { passed: 1, failed: 0, flaky: 0, expectedFailures: 1, skipped: 0 });
    assert.equal(s.knownProductBugs[0]?.issueId, "P6-OBS-CAL-002");
    assert.equal(totalTestsInSummary(s), 2);
  });
  it("does not list an expected failure that unexpectedly passed", () => {
    const s = parsePlaywrightJsonReport({
      suites: [
        {
          specs: [
            {
              title: "P6-CAL-RACE-003 x",
              tests: [
                {
                  status: "unexpected",
                  expectedStatus: "failed",
                  annotations: [{ type: "issue", description: "P6-OBS-CAL-002: y" }],
                },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(s.totals.failed, 1);
    assert.deepEqual(s.knownProductBugs, []);
  });
  it("ignores annotations whose type is not issue", () => {
    const s = parsePlaywrightJsonReport({
      suites: [
        {
          specs: [
            {
              title: "P6-CAL-RACE-003 x",
              tests: [
                {
                  status: "expected",
                  expectedStatus: "failed",
                  annotations: [{ type: "P6-OBS-CAL-002", description: "P6-OBS-CAL-002: y" }],
                },
              ],
            },
          ],
        },
      ],
    });
    assert.deepEqual(s.knownProductBugs, []);
  });
  it("rejects a non-object root", () => {
    assert.throws(() => parsePlaywrightJsonReport([]), /root must be an object/);
  });
});

describe("mergeSummaries and formatPlaywrightJobSummary", () => {
  it("sums totals and dedupes bugs across reports", () => {
    const one = parsePlaywrightJsonReport(report);
    const merged = mergeSummaries([one, one]);
    assert.equal(merged.totals.expectedFailures, 2);
    assert.equal(merged.knownProductBugs.length, 1);
  });
  it("lists ids only on the compact line", () => {
    const md = formatPlaywrightJobSummary(parsePlaywrightJsonReport(report));
    assert.ok(md.includes("Known product bugs still reproducing: P6-OBS-CAL-002\n"));
    assert.ok(md.includes("| 1 | 0 | 0 | 1 |"));
  });
});
```

Each test above asserts the behaviour named in its title. The build adds no other assertions.

`tests/unit/race-table.test.ts`, eleven tests. Build every fixture in the test (no files). Values are fake and only
the shape follows the real files:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRaceTable,
  median,
  parseRaceFile,
  raceSummaryRow,
  trialSeconds,
} from "../../src/ci/race-table.ts";

function request(startedAtMs: number, endedAtMs: number) {
  return { index: 0, status: 200, bodySummary: "200: {}", startedAtMs, endedAtMs };
}

function trial(
  n: number,
  oracle: Record<string, number | string>,
  requests = [request(1000, 2500)],
) {
  return {
    trial: n,
    ok: true,
    statuses: [200],
    statusCounts: { "200": 1 },
    dispatchSpreadMs: 1,
    oracle,
    invariantViolations: [],
    requests,
  };
}

function histogram(caseId: string, trials: unknown[], extra: Record<string, unknown> = {}) {
  return {
    caseId,
    title: "fake",
    product: "cal",
    commitSha: "0".repeat(40),
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    trials: trials.length,
    concurrency: 2,
    statusCounts: {},
    perTrial: trials,
    oracle: {},
    dispatchSpreadMs: { min: 0, max: 0, mean: 0 },
    invariantViolations: [],
    verdict: "pass",
    ...extra,
  };
}
```

Tests (names, then what each asserts):

1. `CAL-003 double-booked wording` – oracle `trialsDoubleBooked: 2, trialsClean: 0`, expect outcome
   `Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in 2 of 2 trials`, keyCounts
   `double-booked trials 2; clean 0`, median `1.5 s`.
2. `CAL-003 clean wording` – `trialsDoubleBooked: 0` → `Did not reproduce: no overlapping pair accepted together in N trials`.
3. `identical slot, double-accept clean with 400 losers` – `acceptedCount: 1`, `loser_db-unique-redacted: 19`,
   `loser_unexpected: 0` → `One ACCEPTED per slot in N trials; Reproduces P6-OBS-CAL-001: 19 losers got 400 not 409`.
4. `identical-slot family uses exact ids` – a `P6-CAL-RACE-001`-shaped Cal histogram whose caseId is
   `extra-same-attendee` gets the CAL rule (`double-accepted trials …`), not the Medusa rule.
5. `Medusa oversell counts available < 0` – `httpWinnerCount: 2`, `available: -1` → `Oversold in 1 of 2 trials (not a tracked bug yet)`.
6. `Medusa clean` – `available: 0` → `No oversell in N trials`.
7. `Documenso double seal` – `trialsDoubleSeal: 2` → `Reproduces P6-OBS-DOC-002: sealed twice in 2 of 2 trials`.
8. `unknown case uses verdict` – caseId `framework-self-test`, verdict `pass` → `Passed`, keyCounts `n/a`.
9. `missing fields render n/a, never throw` – a trial without `acceptedCount` → `n/a` for keyCounts and outcome.
10. `median of trial wall times` – `median([1,3])` = 2; `median([1,2,3])` = 2; `median([])` undefined;
    `trialSeconds` = (max end − min start)/1000; `trialSeconds` of a trial with no `requests` is undefined.
11. `malformed files throw with the file name` – array root, missing caseId, `perTrial: "x"` → each throws with the path in the message.
12. `formatRaceTable` – empty input prints the no-histograms line; a pipe in outcome is escaped as `\|`.

Count: 6 playwright tests + 12 race tests = 18 new. Expected unit total after the build: **276 + 18 = 294**. The
build reports the actual number.

### 3.9 `.github/workflows/perf.yml` (main line numbers)

**Harness-up lines** (replace the `echo "### … harness up" >> "$GITHUB_STEP_SUMMARY"` with the GITHUB_ENV write):

- L145 (Medusa), L339 (Cal), L563 (Documenso):

```yaml
          npm run up:medusa          # or up:cal / up:documenso
          echo "HARNESS_UP_SECONDS=${SECONDS}" >> "$GITHUB_ENV"
```

**Remove** these lines: L174 (Medusa trials echo), L377 (CAL-001 trials echo), L391 (CAL-003 trials echo),
L394–397 (the `if [ -f results/races/P6-CAL-RACE-003.json ]` block with `node -e`), L591 (Documenso trials echo),
L593–598 (the `for` loop with `node -e`). Keep `status=$?` / `exit "$status"` logic as it is.

**Add `env: P6_PLAYWRIGHT_JSON`** to the race steps as listed in §3.2.

**Add a summary step** after the last race step in each job, before the artifact uploads:

```yaml
- name: Job summary (Playwright results, race table)
  if: ${{ always() }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    node scripts/write-ci-job-summary.ts
```

Placement: medusa-smoke after "Race P6-MED-RACE-001 + extras" (before its artifact upload at L177); cal-smoke after
"Race P6-CAL-RACE-003" (before the histogram upload at L400); documenso-smoke after "Documenso races" (before the
token-scan step at L601).

Do not add any new action, and do not change pins.

### 3.10 Order of commits (one PR, several small commits)

1. `test(p6): add issue annotations to the three test.fail() bugs` (§3.3)
2. `ci(p6): write the JSON reporter per race invocation` (§3.1, §3.2 env lines, tsconfig)
3. `feat(ci): port the Playwright JSON job-summary parser` (§3.4, its tests)
4. `feat(ci): race histogram table and summary script` (§3.5–3.8)
5. `ci(p6): replace the ad-hoc job-summary lines` (§3.9)

Commit message trailers: none. Use the environment git identity; add no co-author or session lines.

## 4. Verification (the build, before any push)

Run in this order, from the repo root, with `export PATH="/usr/local/bin:$PATH"`.

```bash
npm run check                          # expect: format, typecheck, k6 inspect, unit tests all pass
npx tsc --noEmit -p tsconfig.races.json   # the new script and src/ci are type-checked
npx prettier --check .
node --test tests/unit/playwright-json-summary.test.ts tests/unit/race-table.test.ts
```

Expected: `# tests 294`, `# fail 0` at the end of `npm run check` (276 today plus 18). Record the actual counts in
the PR.

`actionlint` (not in `npm run check`; P6 has no lint script for it yet). Install the pinned release (the plan
names v1.7.7, but check the release page and its SHA256 before use), then:

```bash
actionlint .github/workflows/perf.yml  # expect: no output, exit 0
```

Baseline first: run `actionlint` on the untouched main `perf.yml` (copy it into the scratchpad, not the repo), so any
later finding is clearly new.

**Run the script against the real histograms** (outside the repo, so nothing is committed). Build a fake root from
the release zips, then run the CLI with that root:

```bash
mkdir -p "$SCRATCH/root/results/races"
cp "$SCRATCH/unz/a/race-histograms-cal/"*.json "$SCRATCH/root/results/races/"
node scripts/write-ci-job-summary.ts "$SCRATCH/root"
```

Expected: a warning line for the missing Playwright JSON, `**Harness up:** n/a (not reached)`, and the race table in
§6.2. Then the two negative checks:

```bash
echo '{}' > "$SCRATCH/bad/results/races/x.json"  && node scripts/write-ci-job-summary.ts "$SCRATCH/bad"
# expect: "...x.json: caseId must be a non-empty string" on stderr, exit 1
echo '{"suites":[]}' > "$SCRATCH/zero/results/playwright/z.json" && node scripts/write-ci-job-summary.ts "$SCRATCH/zero"
# expect: "...z.json contains zero tests", exit 1
```

The Playwright table is authoritative only in CI (the real cases need Cal, Medusa and Documenso running). Confirm it
on the PR's job summaries (§5).

## 5. After the PR's CI runs

The maintainer checks each job summary page:

- **medusa-smoke:** Playwright table (predicted 6 tests, 0 expected failures) and no known-bug line content;
  race table with 6 rows.
- **cal-smoke:** Playwright table predicted 8 tests with 2 expected failures; known bugs line `P6-OBS-CAL-001, P6-OBS-CAL-002`;
  race table with 7 rows (self-test, 001, 003, and four extras).
- **documenso-smoke:** Playwright table predicted 4 tests with 1 expected failure; known bugs line `P6-OBS-DOC-002`;
  race table with 4 rows.
- In each job: one "Harness up: N s" line at the top.
- Nothing printed from `bodySummary`, request bodies or invariant text.

Predicted counts come from the `test(` counts in the source specs (§0). Any mismatch goes back to the build, not
into the plan.

## 6. Expected output (from real histograms)

### 6.1 How it was produced

A scratch computation (not committed) applied the rules in §3.5 to the real files in the `p6-phase1` release run
`39577832657` (run A, full counts): `p6-39577832657-evidence.zip`, sha256
`83f6944597f70f50e349f4eae33d91a8ffd1207075fdba9bc422d4af62c5d69c`. The local download matches the release asset
digest from the GitHub API. Median trial is the wall time from the earliest `startedAtMs` to the latest `endedAtMs` of each trial,
then the median across trials.

The build's formatter must produce the same rows. Any difference is a bug in the build, unless the rules in §3.5
changed on purpose.

### 6.2 Cal job (race part)

```markdown
| Case                     | Trials | Verdict | Key counts                                   | Median trial | Outcome                                                                                   |
| ------------------------ | -----: | ------- | -------------------------------------------- | -----------: | ----------------------------------------------------------------------------------------- |
| P6-CAL-RACE-001          |     50 | pass    | double-accepted trials 0; non-409 losers 950 |        0.8 s | One ACCEPTED per slot in 50 trials; Reproduces P6-OBS-CAL-001: 950 losers got 400 not 409 |
| P6-CAL-RACE-003          |     30 | fail    | double-booked trials 30; clean 0             |        0.1 s | Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in 30 of 30 trials          |
| cal-self-test            |      3 | pass    | n/a                                          |        1.3 s | Passed                                                                                    |
| extra-loser-contract     |      3 | pass    | double-accepted trials 0; non-409 losers 57  |        0.8 s | One ACCEPTED per slot in 3 trials; Reproduces P6-OBS-CAL-001: 57 losers got 400 not 409   |
| extra-overlap-sequential |      4 | pass    | double-booked trials 0; clean 4              |        0.1 s | Did not reproduce: no overlapping pair accepted together in 4 trials                      |
| extra-same-attendee      |      3 | pass    | double-accepted trials 0; non-409 losers 57  |        0.8 s | One ACCEPTED per slot in 3 trials; Reproduces P6-OBS-CAL-001: 57 losers got 400 not 409   |
| extra-time-spellings     |      3 | pass    | double-accepted trials 0; non-409 losers 60  |        0.9 s | One ACCEPTED per slot in 3 trials; Reproduces P6-OBS-CAL-001: 60 losers got 400 not 409   |
```

The `extra-same-attendee` row shows that the exact-id sets are doing their job: the prefix rule would have sent it
to the Medusa branch.

### 6.3 Medusa job (race part)

```markdown
| Case                | Trials | Verdict | Key counts                      | Median trial | Outcome                  |
| ------------------- | -----: | ------- | ------------------------------- | -----------: | ------------------------ |
| P6-MED-RACE-001     |     50 | pass    | accepted 250; oversold trials 0 |        2.8 s | No oversell in 50 trials |
| extra-mixed-qty     |      3 | pass    | accepted 9; oversold trials 0   |        0.7 s | No oversell in 3 trials  |
| extra-s0-n5         |      3 | pass    | accepted 0; oversold trials 0   |        0.2 s | No oversell in 3 trials  |
| extra-s1-n2         |      3 | pass    | accepted 3; oversold trials 0   |        0.3 s | No oversell in 3 trials  |
| extra-same-cart     |      3 | pass    | accepted 30; oversold trials 0  |        2.9 s | No oversell in 3 trials  |
| framework-self-test |     50 | pass    | n/a                             |        0.0 s | Passed                   |
```

Note: Medusa's `framework-self-test` is in the medusa job's `race:medusa` run, so it appears here, not as a
separate job.

### 6.4 Documenso job (race part)

```markdown
| Case                         | Trials | Verdict | Key counts                                        | Median trial | Outcome                                                    |
| ---------------------------- | -----: | ------- | ------------------------------------------------- | -----------: | ---------------------------------------------------------- |
| P6-DOC-RACE-001              |     50 | fail    | double-sealed trials 50; invariant violations 400 |        0.3 s | Reproduces P6-OBS-DOC-002: sealed twice in 50 of 50 trials |
| P6-DOC-RACE-002              |     50 | pass    | double-sealed trials 0; invariant violations 0    |        0.3 s | Did not reproduce: sealed once in 50 trials                |
| documenso-self-test          |     50 | pass    | n/a                                               |        0.0 s | Passed                                                     |
| extra-doc-sequential-control |      5 | pass    | double-sealed trials 0; invariant violations 0    |        0.0 s | Did not reproduce: sealed once in 5 trials                 |
```

### 6.5 Playwright part (predicted, verify in CI)

From the source counts, if every test behaves as in run A: medusa `| 6 | 0 | 0 | 0 |`, no known-bug line content; cal
`| 6 | 0 | 0 | 2 |` with `Known product bugs still reproducing: P6-OBS-CAL-001, P6-OBS-CAL-002`; documenso
`| 3 | 0 | 0 | 1 |` with `Known product bugs still reproducing: P6-OBS-DOC-002`.

## 7. Risks and what stays out of scope

Risks:

- **Node type stripping.** `scripts/write-ci-job-summary.ts` runs as `.ts`. The repo already runs `node --test
tests/unit/*.test.ts` on Node 22, so the mechanism is in use; the job's Node version is `.nvmrc` (22) for medusa and
  cal and 24 for documenso. Both are fine.
- **A malformed or zero-test report turns the job red**, even when the race itself passed. That is intended, but it
  means the summary step can fail a job. Say so in the PR.
- **Outcome wording is a judgement.** The maintainer reviews the wording once, in the PR. The §3.5 rules are the
  contract, and the unit tests pin them.
- **Known-bug line tracks annotations.** Removing a `test.fail()` removes its row on the next run. That is the
  intent (the spec's comment says to remove both together).
- **The median is not a performance claim.** It is labelled "Median trial" and only appears on CI job pages. Do not
  copy it into docs; AGENTS.md requires a median of at least 3 GitHub Actions runs for any published number.
- **Token exposure.** The summary prints only ids, counts, fixed phrases and our own annotation text. The Documenso
  token scan covers `results/races` and the Documenso web log, not `results/playwright`, which is not uploaded.
  Keep it that way: do not add `results/playwright` to any artifact in this change.
- **Plan branch divergence.** The plan branch does not contain main `d75379a`. The build must start from main, and
  the plan file must not be merged into main with this change.

Out of scope (do not touch in this change):

- race logic, oracles, invariants, trial counts (including the `RACE_TRIALS` values and the 30-trial cap);
- the artifact uploads and the Documenso token-scan step (only the summary step is added nearby);
- `test.fail()` placement, or any new `test.fail()`. Only the three existing, proven bugs keep it;
- the P1 repo, the product forks, and `qa-portfolio-harness`;
- a shared package between P1 and P6 (see §1.1);
- `actionlint` as an `npm run check` step (possible follow-up, separate PR).

## 8. Done when

- `npm run check` passes with 294 tests (or the actual count, recorded in the PR).
- `actionlint` passes on `perf.yml`, and `tsc -p tsconfig.races.json` passes.
- The formatter output on the real Cal histograms matches §6.2, row for row.
- The two negative checks in §4 fail with the stated messages.
- On the PR's CI runs, the maintainer has checked the three job summaries (§5).
