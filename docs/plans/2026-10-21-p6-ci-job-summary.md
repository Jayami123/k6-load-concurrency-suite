# P6 CI job summary: plan

Status: revision 2, after plan review. Approved to build by the maintainer's instruction (review changes in §9).
Date: 2026-10-21.
Build branch: `ci/2026-10-21-p6-ci-job-summary`, cut from main `d75379a`.
This plan lives on `plan/2026-10-20-p6-phase1`. That branch is never PR'd and never deleted.

## 0. What was checked, and where

Line numbers refer to main `d75379a`. The plan branch does not contain `d75379a`, and its `perf.yml` differs from
main (its Cal and Documenso line numbers are 3 lower; the Medusa lines match). The build starts from main.

| Fact                                                                                                                                                                                                                                                                              | Evidence                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P6 reporter is `"list"` only                                                                                                                                                                                                                                                      | `playwright.config.ts:10` on main                                                          |
| Ad-hoc summary lines to remove: L145, L174, L339, L377, L391, L394–397 (`node -e` block), L563, L591, L593–598 (`for` loop with `node -e`)                                                                                                                                        | `grep` of `.github/workflows/perf.yml` on main                                             |
| `test.fail()` specs: `P6-CAL-RACE-003` (mapped, `tests/cal/races/cal-race-003-overlap.spec.ts:65`), the "extra (unmapped)" test in `tests/cal/races/cal-race-001-identical-slot.spec.ts:114`, `P6-DOC-RACE-001` (`tests/documenso/races/doc-race-001-last-recipients.spec.ts:63`) | the three `test.fail();` lines                                                             |
| Current annotations use `type: "P6-OBS-CAL-002"` and `"P6-OBS-DOC-002"`; `P6-CAL-RACE-001`'s bug has no annotation                                                                                                                                                                | `annotations.push` sites at cal-race-003 L52, doc-race-001 L41                             |
| The source formatter reads only annotations of `type: "issue"`, and takes the id as the text before the first colon                                                                                                                                                               | source `src/core/playwright-json-summary.ts` L54, L64–68                                   |
| Playwright's JSON reporter stores `test.fail()` specs as `status: "expected"`, `expectedStatus: "failed"`, and keeps annotations                                                                                                                                                  | verified with a throwaway spec in a scratch directory, using the repo's `@playwright/test` |
| The source `titleId()` takes the first word of the title, so the unmapped CAL-001 bug would print as "extra"                                                                                                                                                                      | same scratch run                                                                           |
| Histogram top-level fields: `caseId, trials, verdict, startedAt, finishedAt, perTrial[], oracle{}, invariantViolations[]`                                                                                                                                                         | the `p6-phase1` release zips, real files (§6)                                              |
| Per-trial time is defined in the README as `(finishedAt − startedAt) / trials`                                                                                                                                                                                                    | main `README.md`, "Phase 1 results" section                                                |
| `tsconfig.json` only includes `scripts/**/*.mjs`, so a new `.ts` script is not type-checked unless `tsconfig.races.json` includes it                                                                                                                                              | both tsconfig files on main                                                                |
| Baseline `npm run check` on main passes: 276 tests                                                                                                                                                                                                                                | run on a checkout of main at `d75379a`, Node v22.23.3                                      |
| actionlint pinned at **v1.7.12**, linux/amd64 archive sha256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`, matched to the release's published `actionlint_1.7.12_checksums.txt`                                                                             | downloaded and checked in a scratch directory                                              |
| actionlint baseline on untouched main `perf.yml` and `evidence-release.yml`: exit 0, no output. shellcheck is not installed, so actionlint's shell checks do not run here                                                                                                         | run in a scratch copy                                                                      |

Source: `Jayami123/playwright-e2e-ci-framework` at `main` commit **`2d714c7a65c22136c845461ed31a2503dfa8c20a`**
(2026-10-20). Files read: `src/core/playwright-json-summary.ts` (237 lines), `scripts/write-ci-job-summary.mts`,
`tests/unit/playwright-json-summary.spec.ts`.

## 1. Decisions

1. **Port, do not share.** Copy the two source files into P6 under `src/ci/`, with a header naming the source repo,
   path and commit. Reason: the source is about 240 lines and P6 needs only the parser and formatter. A shared
   package would need a publish or vendor step, a version pin and cross-repo CI access, which costs more than the
   copy. The two repos also use different test runners (P1 uses Playwright, P6 uses `node:test`). **What would change
   this:** a third consumer, or a change that has to land in both repos and then drifts. At that point, extract a
   small versioned package.
2. **JSON reporter: always on, next to `list`.** Local and CI runs then have the same config, the file lands under
   `results/` (already gitignored by `results/*`), and a maintainer can reproduce the job summary locally. A
   CI-only switch (`process.env.CI`) would hide the file in local runs and let the two drift.
   **Deviation from the brief:** one JSON file per race invocation, not per project. The Cal job runs the
   `cal-race` project three times (self-test, 001, 003), and a per-project name would overwrite the earlier run.
3. **Annotations:** change to `type: "issue"`, with the description starting `P6-OBS-<id>: `. Assertions, `test.fail()`
   placement and trial counts do not change. The CAL-001 annotation goes in the unmapped extra test, where that
   `test.fail()` lives.
4. **Known-bugs line lists ids only** (`P6-OBS-CAL-001, ...`). The source line uses the title's first word, which
   prints "extra" for the CAL-001 row (see §0). The bullet list keeps `title (id)`.
5. **Harness-up time stays, folded into the summary.** Each up step writes `HARNESS_UP_SECONDS` to `$GITHUB_ENV`,
   and the single summary step prints it. Reason: the number is still useful when comparing runs, and it replaces
   the separate `echo` into the summary. If the up step fails, the value is never written and the line reads
   `n/a (not reached)`.
6. **Missing JSON = warning. Zero tests = fail. Malformed = fail.** Same as P1 for Playwright. For race histograms,
   no file means "No race histograms were written by this job". That is not a failure, because the race step itself
   fails if its case did not run.
7. **Race table is driven by exact case ids** (sets in §3.5). Prefix matching is wrong: `extra-same-attendee`
   starts with `extra-s`, which is a Medusa prefix.
8. **Step condition: `if: ${{ !cancelled() }}`** on the summary steps in the medusa and cal jobs (the repo's
   convention). `always()` would also run on a cancelled run. The Documenso summary has a stricter condition (item 11).
9. **Timing column: "Per-trial time", as the README defines it.** The value is `(finishedAt − startedAt) / trials`
   from the histogram's top-level fields, in seconds, to 2 decimals (the README's own rule). The README's definition
   is the only one used. Not a request-window median. It is labelled as a CI wall-clock figure and is not a
   performance claim. AGENTS.md requires a median of at least 3 GitHub Actions runs for any published number, so the
   summary never publishes a median.
10. **Medusa key counts.** `accepted per trial N` when every trial accepted N, otherwise `accepted per trial MIN-MAX`,
    then `oversold trials K` (trials where `available < 0`). This matches the README's "Accepted per trial" column.
11. **Documenso summary runs after the token scan**, with condition `!cancelled() && steps.web_log_check.outcome == 'success'`.
    Nothing reaches the public job summary before the scan. If the scan fails, the summary is not written. The other two
    jobs keep the `!cancelled()` condition.
12. **Precision: 2 decimals for every row, as the review asked.** The README is not uniform: its Cal rows use 3
    decimals, and its Medusa and Documenso rows use 2. So no single precision reproduces every run A cell exactly
    (§6.6). The Cal cells are the two that differ. The maintainer decides whether to change the README's Cal rows or
    the formatter's precision. This build uses 2 decimals.
13. **P1 test parity.** Every applicable P1 case from `tests/unit/playwright-json-summary.spec.ts` at `2d714c7` is ported
    to `node:test` (§3.8). One case is skipped (browser label and elapsed heading). Reason: P6 has no browser projects and
    no elapsed option.

## 2. Files touched

| File                                                         | Change                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `playwright.config.ts`                                       | reporter array with JSON (§3.1)                                            |
| `tests/cal/races/cal-race-001-identical-slot.spec.ts`        | add one `issue` annotation before the existing `test.fail()` (§3.3)        |
| `tests/cal/races/cal-race-003-overlap.spec.ts`               | change annotation type and prefix the id (§3.3)                            |
| `tests/documenso/races/doc-race-001-last-recipients.spec.ts` | same as above (§3.3)                                                       |
| `src/ci/playwright-json-summary.ts`                          | new: port of the source file (§3.4)                                        |
| `src/ci/race-table.ts`                                       | new: race row builder and formatter (§3.5)                                 |
| `scripts/write-ci-job-summary.ts`                            | new: thin CLI (§3.6)                                                       |
| `tsconfig.races.json`                                        | add `scripts/write-ci-job-summary.ts` to `include` (§3.7)                  |
| `tests/unit/playwright-json-summary.test.ts`                 | new (§3.8)                                                                 |
| `tests/unit/race-table.test.ts`                              | new (§3.8)                                                                 |
| `.github/workflows/perf.yml`                                 | env vars, harness-up lines, removed echo lines, three summary steps (§3.9) |

Not touched: race logic, oracles, trial counts, the artifact uploads, the Documenso token-scan step, `.gitignore`
(`results/*` already covers `results/playwright/`), `package.json` (no new scripts; `check` already runs the unit folder).

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

The reporter creates the directory (verified in the scratch run: `out/report.json` was written without a `mkdir`).

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
(the code after it is unchanged):

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

Check: `grep -rn 'type: "P6-OBS' tests` returns nothing afterwards.

### 3.4 `src/ci/playwright-json-summary.ts` (port)

Header (first lines of the file):

```ts
// Ported from Jayami123/playwright-e2e-ci-framework, src/core/playwright-json-summary.ts,
// at commit 2d714c7a65c22136c845461ed31a2503dfa8c20a (main, 2026-10-20). Keep in sync by hand.
// P6 changes: no browser label, no P1 report-id suffix, compact line lists issue ids, mergeSummaries and
// requireTests added.
```

Keep unchanged from the source: `isRecord`, `asString`, `issueIdFromDescription`, `collectIssueDescription`,
`walkSuites`, `parsePlaywrightJsonReport` (the whole status logic), `totalTestsInSummary`.

Remove: `PLAYWRIGHT_JSON_REPORT_FILE`, `P1_PW_REPORT_ID_ENV`, `resolvePlaywright*` (the P1 suffix logic), the
`browserLabel` and `elapsedSeconds` options, and `titleId`.

New functions:

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

// Throws when a report ran no tests. The CLI calls it once per report file.
export function requireTests(summary: PlaywrightJobSummary, path: string): void {
  if (totalTestsInSummary(summary) === 0) {
    throw new Error(`${path} contains zero tests`);
  }
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
  readonly perTrialTime: string;
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

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

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

// README definition: (finishedAt - startedAt) / trials, in seconds, to 2 decimals. Undefined means n/a.
export function perTrialTime(h: {
  startedAt?: unknown;
  finishedAt?: unknown;
  trials?: unknown;
}): string {
  if (typeof h.startedAt !== "string" || typeof h.finishedAt !== "string") return NA;
  const start = Date.parse(h.startedAt);
  const end = Date.parse(h.finishedAt);
  const trials = finiteNumber(h.trials);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return NA;
  if (trials === undefined || trials <= 0) return NA;
  return `${((end - start) / 1000 / trials).toFixed(2)} s`;
}

function acceptedPerTrial(accepted: readonly number[]): string {
  const lo = Math.min(...accepted);
  const hi = Math.max(...accepted);
  return lo === hi ? String(lo) : `${lo}-${hi}`;
}
```

Parsing (malformed = throw, missing = n/a):

```ts
interface ParsedRace {
  readonly caseId: string;
  readonly trials?: number;
  readonly verdict?: string;
  readonly startedAt?: unknown;
  readonly finishedAt?: unknown;
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
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
    perTrial: Array.isArray(raw.perTrial) ? raw.perTrial : [],
    oracle: isJson(raw.oracle) ? raw.oracle : {},
    invariantViolations: Array.isArray(raw.invariantViolations)
      ? raw.invariantViolations
      : undefined,
  };
}
```

Outcome rules (final wording; the §6 tables show the output):

```ts
function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome: string } {
  const total = h.trials ?? h.perTrial.length;
  if (MEDUSA_OVERSELL_CASES.has(caseId)) {
    const accepted = trialNumbers(h.perTrial, "httpWinnerCount");
    const available = trialNumbers(h.perTrial, "available");
    if (!accepted || !available) return { keyCounts: NA, outcome: NA };
    const oversold = available.filter((a) => a < 0).length;
    return {
      keyCounts: `accepted per trial ${acceptedPerTrial(accepted)}; oversold trials ${oversold}`,
      outcome:
        oversold > 0
          ? `Oversold in ${oversold} of ${total} trials (not a tracked bug yet)`
          : `No oversell in ${total} trials`,
    };
  }
  if (CAL_IDENTICAL_SLOT_CASES.has(caseId)) {
    const accepted = trialNumbers(h.perTrial, "acceptedCount");
    const redacted = trialNumbers(h.perTrial, "loser_db-unique-redacted");
    const unexpected = trialNumbers(h.perTrial, "loser_unexpected");
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

Row builder:

```ts
export function raceSummaryRow(file: string, raw: unknown): RaceSummaryRow {
  const h = parseRaceFile(raw, file);
  const { keyCounts, outcome } = outcomeFor(h.caseId, h);
  return {
    caseId: h.caseId,
    trials: h.trials === undefined ? NA : String(h.trials),
    verdict: h.verdict ?? NA,
    keyCounts,
    perTrialTime: perTrialTime(h),
    outcome,
  };
}
```

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
    "| Case | Trials | Verdict | Key counts | Per-trial time | Outcome |",
    "| --- | ---: | --- | --- | ---: | --- |",
  ];
  const body = rows.map(
    (r) =>
      `| ${[r.caseId, r.trials, r.verdict, r.keyCounts, r.perTrialTime, r.outcome].map(cell).join(" | ")} |`,
  );
  return [...header, ...body, ""].join("\n");
}
```

### 3.6 `scripts/write-ci-job-summary.ts` (thin CLI)

Behaviour: reads `<root>/results/playwright/*.json` and `<root>/results/races/*.json` (root defaults to `.`). It
writes the markdown to stdout, and appends it to `$GITHUB_STEP_SUMMARY` when set. It sets exit code 1 on any error.

```ts
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  formatPlaywrightJobSummary,
  mergeSummaries,
  parsePlaywrightJsonReport,
  requireTests,
} from "../src/ci/playwright-json-summary.ts";
import { formatRaceTable, raceSummaryRow } from "../src/ci/race-table.ts";

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

Note: `race-table.ts` also exports `trialNumbers`, `perTrialTime`, `parseRaceFile` and `outcomeFor` for tests (export
`outcomeFor` for tests as well, or test through `raceSummaryRow`).

### 3.7 `tsconfig.races.json`

Add `"scripts/write-ci-job-summary.ts"` to `include` (the array holds `src/**/*.ts`, `tests/**/*.ts`,
`playwright.config.ts`). This is in commit 4 (with the script), not commit 2, so every commit typechecks.

### 3.8 Unit tests (`node:test`, the P6 style)

**`tests/unit/playwright-json-summary.test.ts`**: P1 parity plus P6 cases.

| #   | Test                                                                                                      | Source                                       | Status                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | counts passed, failed, flaky, expected failures and skipped; lists the three known bugs in order; total 8 | P1 test 1, verbatim fixture and expectations | ported                                                                                                        |
| 2   | formats the job summary line (`\| 2 \| 1 \| 1 \| 3 \|`) and the compact line with ids only                | P1 test 2                                    | ported, **adapted**: compact line lists ids (`P1-CAL-DST-002`'s id is `P7-OBS-CAL-DST-002`), not `title (id)` |
| 3   | formats browser label and elapsed seconds in the heading                                                  | P1 test 3                                    | **skipped**: P6 has no browser projects and no elapsed option                                                 |
| 4   | does not list an expected failure that unexpectedly passed; the compact line says `none`                  | P1 test 4, verbatim                          | ported                                                                                                        |
| 5   | merges totals and dedupes bugs across reports                                                             | new                                          |                                                                                                               |
| 6   | ignores annotations whose type is not `issue`                                                             | new                                          |                                                                                                               |
| 7   | rejects a non-object root                                                                                 | new                                          |                                                                                                               |
| 8   | `requireTests` throws on zero tests and names the path                                                    | new                                          |                                                                                                               |

Code for the ported tests (fixture verbatim from P1, with P7 ids, because it tests the parser, not P6 data):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPlaywrightJobSummary,
  mergeSummaries,
  parsePlaywrightJsonReport,
  requireTests,
  totalTestsInSummary,
} from "../../src/ci/playwright-json-summary.ts";

// Fixture copied from P1's tests/unit/playwright-json-summary.spec.ts at 2d714c7 (same shape and values).
const sampleReport = {
  suites: [
    {
      title: "tests/cal/tz-i18n/dst.spec.ts",
      specs: [
        {
          title: "P1-CAL-DST-001 Spring-forward day shows no phantom slot",
          tests: [{ status: "expected", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous",
          tests: [
            {
              status: "expected",
              expectedStatus: "failed",
              annotations: [
                {
                  type: "issue",
                  description:
                    "P7-OBS-CAL-DST-002: both 01:30 instants listed, POST /api/book/event 409",
                },
              ],
            },
          ],
        },
        {
          title: "P1-CAL-DST-003 Cross-hemisphere viewer on DST day",
          tests: [
            {
              status: "expected",
              expectedStatus: "failed",
              annotations: [
                {
                  type: "issue",
                  description: "P7-OBS-CAL-DST-003: organiser slots one hour early",
                },
              ],
            },
          ],
        },
      ],
      suites: [
        {
          title: "nested",
          specs: [
            {
              title: "P1-CAL-TZ-003 Half-hour and 45-minute offsets (Asia/Kathmandu)",
              tests: [
                {
                  status: "expected",
                  expectedStatus: "failed",
                  annotations: [
                    {
                      type: "issue",
                      description: "P7-OBS-CAL-TZ-003: first slot 15 min off organiser grid",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "flaky-and-fail",
      specs: [
        {
          title: "unrelated pass",
          tests: [{ status: "expected", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "unexpected boom",
          tests: [{ status: "unexpected", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "flaky once",
          tests: [{ status: "flaky", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "skipped setup",
          tests: [{ status: "skipped", expectedStatus: "passed", annotations: [] }],
        },
      ],
    },
  ],
};

describe("parsePlaywrightJsonReport (P1 parity)", () => {
  it("counts passed, failed, flaky, expected failures and skipped", () => {
    const summary = parsePlaywrightJsonReport(sampleReport);
    assert.deepEqual(summary.totals, {
      passed: 2,
      failed: 1,
      flaky: 1,
      expectedFailures: 3,
      skipped: 1,
    });
    assert.equal(totalTestsInSummary(summary), 8);
    assert.deepEqual(
      summary.knownProductBugs.map((row) => `${row.title} (${row.issueId})`),
      [
        "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous (P7-OBS-CAL-DST-002)",
        "P1-CAL-DST-003 Cross-hemisphere viewer on DST day (P7-OBS-CAL-DST-003)",
        "P1-CAL-TZ-003 Half-hour and 45-minute offsets (Asia/Kathmandu) (P7-OBS-CAL-TZ-003)",
      ],
    );
  });

  it("formats a job summary line from the parsed report (ids only on the compact line)", () => {
    const markdown = formatPlaywrightJobSummary(parsePlaywrightJsonReport(sampleReport));
    assert.ok(markdown.includes("| 2 | 1 | 1 | 3 |"));
    assert.ok(
      markdown.includes(
        "Known product bugs still reproducing: P7-OBS-CAL-DST-002, P7-OBS-CAL-DST-003, P7-OBS-CAL-TZ-003",
      ),
    );
  });

  it("does not list an expected failure that unexpectedly passed", () => {
    const summary = parsePlaywrightJsonReport({
      suites: [
        {
          specs: [
            {
              title: "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous",
              tests: [
                {
                  status: "unexpected",
                  expectedStatus: "failed",
                  annotations: [
                    {
                      type: "issue",
                      description: "P7-OBS-CAL-DST-002: both 01:30 instants listed",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(summary.totals.failed, 1);
    assert.equal(summary.totals.expectedFailures, 0);
    assert.deepEqual(summary.knownProductBugs, []);
    assert.ok(
      formatPlaywrightJobSummary(summary).includes("Known product bugs still reproducing: none"),
    );
  });
});

// P6 cases (new).
describe("P6 additions", () => {
  const annotated = (type: string) => ({
    suites: [
      {
        specs: [
          {
            title: "P6-CAL-RACE-003 fake",
            tests: [
              {
                status: "expected",
                expectedStatus: "failed",
                annotations: [{ type, description: "P6-OBS-CAL-002: fake" }],
              },
            ],
          },
        ],
      },
    ],
  });

  it("merges totals and dedupes bugs across reports", () => {
    const one = parsePlaywrightJsonReport(annotated("issue"));
    const merged = mergeSummaries([one, one]);
    assert.equal(merged.totals.expectedFailures, 2);
    assert.equal(merged.knownProductBugs.length, 1);
  });

  it("ignores annotations whose type is not issue", () => {
    assert.deepEqual(parsePlaywrightJsonReport(annotated("P6-OBS-CAL-002")).knownProductBugs, []);
  });

  it("rejects a non-object root", () => {
    assert.throws(() => parsePlaywrightJsonReport([]), /root must be an object/);
  });

  it("requireTests throws on zero tests and names the path", () => {
    const empty = parsePlaywrightJsonReport({ suites: [] });
    assert.throws(
      () => requireTests(empty, "results/playwright/x.json"),
      /x\.json contains zero tests/,
    );
    assert.doesNotThrow(() => requireTests(parsePlaywrightJsonReport(sampleReport), "p"));
  });
});
```

**`tests/unit/race-table.test.ts`**: all fixtures built in the test, with fake values. Only the shape follows the
real files.

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRaceTable,
  parseRaceFile,
  perTrialTime,
  raceSummaryRow,
  trialNumbers,
} from "../../src/ci/race-table.ts";

function request(startedAtMs: number, endedAtMs: number) {
  return { index: 0, status: 200, bodySummary: "200: {}", startedAtMs, endedAtMs };
}

function trial(n: number, oracle: Record<string, number | string>) {
  return {
    trial: n,
    ok: true,
    statuses: [200],
    statusCounts: { "200": 1 },
    dispatchSpreadMs: 1,
    oracle,
    invariantViolations: [],
    requests: [request(1000, 2500)],
  };
}

function histogram(caseId: string, trials: unknown[], extra: Record<string, unknown> = {}) {
  return {
    caseId,
    title: "fake",
    product: "cal",
    commitSha: "0".repeat(40),
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
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

const rowOf = (h: Record<string, unknown>) => raceSummaryRow("fake.json", h);

describe("per-trial time (README definition)", () => {
  it("is (finishedAt - startedAt) / trials, to 2 decimals", () => {
    // 60 s over 50 trials = 1.20 s
    assert.equal(
      perTrialTime({
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:01:00.000Z",
        trials: 50,
      }),
      "1.20 s",
    );
  });
  it("is n/a when startedAt or finishedAt is missing or not a date", () => {
    assert.equal(perTrialTime({ finishedAt: "2026-01-01T00:01:00.000Z", trials: 50 }), "n/a");
    assert.equal(
      perTrialTime({ startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "soon", trials: 50 }),
      "n/a",
    );
  });
  it("is n/a when trials is 0, missing or negative", () => {
    const window = {
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
    };
    assert.equal(perTrialTime({ ...window, trials: 0 }), "n/a");
    assert.equal(perTrialTime({ ...window }), "n/a");
    assert.equal(perTrialTime({ ...window, trials: -3 }), "n/a");
  });
});

describe("race rows", () => {
  it("CAL-003 double-booked wording and key counts", () => {
    const row = rowOf(
      histogram("P6-CAL-RACE-003", [trial(1, {})], {
        oracle: { trialsDoubleBooked: 2, trialsClean: 0 },
      }),
    );
    assert.equal(row.keyCounts, "double-booked trials 2; clean 0");
    assert.equal(
      row.outcome,
      "Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in 2 of 1 trials",
    );
  });
  it("CAL-003 clean wording", () => {
    const row = rowOf(
      histogram("P6-CAL-RACE-003", [trial(1, {})], {
        oracle: { trialsDoubleBooked: 0, trialsClean: 1 },
      }),
    );
    assert.equal(
      row.outcome,
      "Did not reproduce: no overlapping pair accepted together in 1 trials",
    );
  });
  it("identical slot: one ACCEPTED, 400 losers reproduce P6-OBS-CAL-001", () => {
    const row = rowOf(
      histogram("P6-CAL-RACE-001", [
        trial(1, { acceptedCount: 1, "loser_db-unique-redacted": 19, loser_unexpected: 0 }),
      ]),
    );
    assert.equal(
      row.outcome,
      "One ACCEPTED per slot in 1 trials; Reproduces P6-OBS-CAL-001: 19 losers got 400 not 409",
    );
  });
  it("identical-slot family uses exact ids: extra-same-attendee gets the Cal rule", () => {
    const row = rowOf(
      histogram("extra-same-attendee", [
        trial(1, { acceptedCount: 2, "loser_db-unique-redacted": 0, loser_unexpected: 0 }),
      ]),
    );
    assert.equal(row.keyCounts, "double-accepted trials 1; non-409 losers 0");
  });
  it("Medusa: a single accepted-per-trial value is shown as one number", () => {
    const row = rowOf(
      histogram("P6-MED-RACE-001", [
        trial(1, { httpWinnerCount: 5, available: 0 }),
        trial(2, { httpWinnerCount: 5, available: 0 }),
      ]),
    );
    assert.equal(row.keyCounts, "accepted per trial 5; oversold trials 0");
    assert.equal(row.outcome, "No oversell in 2 trials");
  });
  it("Medusa: differing accepted counts show a min-max range and count oversold trials", () => {
    const row = rowOf(
      histogram("P6-MED-RACE-001", [
        trial(1, { httpWinnerCount: 2, available: -1 }),
        trial(2, { httpWinnerCount: 4, available: 0 }),
      ]),
    );
    assert.equal(row.keyCounts, "accepted per trial 2-4; oversold trials 1");
    assert.equal(row.outcome, "Oversold in 1 of 2 trials (not a tracked bug yet)");
  });
  it("Documenso double seal reproduces P6-OBS-DOC-002", () => {
    const row = rowOf(
      histogram("P6-DOC-RACE-001", [trial(1, {})], {
        oracle: { trialsDoubleSeal: 2 },
        invariantViolations: ["x"],
      }),
    );
    assert.equal(row.keyCounts, "double-sealed trials 2; invariant violations 1");
    assert.equal(row.outcome, "Reproduces P6-OBS-DOC-002: sealed twice in 2 of 1 trials");
  });
  it("unknown case id uses the verdict only, key counts n/a", () => {
    const row = rowOf(histogram("framework-self-test", [], { verdict: "pass" }));
    assert.equal(row.keyCounts, "n/a");
    assert.equal(row.outcome, "Passed");
  });
  it("missing per-trial fields render n/a and do not throw", () => {
    const row = rowOf(histogram("P6-CAL-RACE-001", [{ trial: 1, ok: true, oracle: {} }]));
    assert.equal(row.keyCounts, "n/a");
    assert.equal(row.outcome, "n/a");
  });
  it("trialNumbers returns undefined when any trial lacks the key", () => {
    assert.equal(trialNumbers([{ oracle: { a: 1 } }, { oracle: {} }], "a"), undefined);
    assert.deepEqual(trialNumbers([{ oracle: { a: 1 } }, { oracle: { a: 2 } }], "a"), [1, 2]);
  });
});

describe("parsing and formatting", () => {
  it("malformed files throw with the file name", () => {
    assert.throws(
      () => parseRaceFile([], "a.json"),
      /a\.json: race histogram root must be an object/,
    );
    assert.throws(() => parseRaceFile({}, "b.json"), /b\.json: caseId must be a non-empty string/);
    assert.throws(
      () => parseRaceFile({ caseId: "x", perTrial: "no" }, "c.json"),
      /c\.json: perTrial must be an array/,
    );
  });
  it("empty input prints the no-histograms line", () => {
    assert.equal(
      formatRaceTable([]),
      "## Race results\n\nNo race histograms were written by this job.\n",
    );
  });
  it("escapes a pipe in a cell", () => {
    const md = formatRaceTable([
      {
        caseId: "x",
        trials: "1",
        verdict: "pass",
        keyCounts: "n/a",
        perTrialTime: "n/a",
        outcome: "a | b",
      },
    ]);
    assert.ok(md.includes("a \\| b"));
  });
});
```

Count of new tests: playwright file 8 (ported 4 incl. 1 skipped = 3 ported + 4 new... see table: 8 rows, #3 skipped → 7 tests run?
Careful: the table lists 8 rows but row 3 is skipped (no test). So playwright file tests: rows 1, 2, 4, 5, 6, 7, 8 = 7 tests.
Race file: 3 per-trial time + 9 race rows (CAL-003 double, CAL-003 clean, identical, family, medusa single, medusa range, documenso, unknown, missing n/a, trialNumbers = 10) + 3 parse/format = 3 + 10 + 3 = 16.
Hmm the race describe "race rows" has 10 tests. Total new = 7 + 16 = 23. Expected total: 276 + 23 = 299. The build reports the real count. Let me count precisely after writing.

### 3.9 `.github/workflows/perf.yml` (main line numbers)

**Harness-up lines.** Replace the `echo "### … harness up" >> "$GITHUB_STEP_SUMMARY"` line with the GITHUB_ENV write.
Medusa L145, Cal L339, Documenso L563:

```yaml
          npm run up:medusa          # or up:cal / up:documenso
          echo "HARNESS_UP_SECONDS=${SECONDS}" >> "$GITHUB_ENV"
```

**Remove** these lines: L174 (Medusa trials echo), L377 (CAL-001 trials echo), L391 (CAL-003 trials echo),
L394–397 (the `if [ -f results/races/P6-CAL-RACE-003.json ]` block with `node -e`), L591 (Documenso trials echo),
L593–598 (the `for` loop with `node -e`). Keep the `status=$?` / `exit "$status"` logic.

**Add `env: P6_PLAYWRIGHT_JSON`** to the race steps as listed in §3.2.

**Add the summary steps:**

Medusa and Cal (after the last race step, before the artifact uploads):

```yaml
- name: Job summary (Playwright results, race table)
  if: ${{ !cancelled() }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    node scripts/write-ci-job-summary.ts
```

Documenso (after the token-scan step `web_log_check`, before its artifact uploads):

```yaml
- name: Job summary (Playwright results, race table)
  if: ${{ !cancelled() && steps.web_log_check.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    node scripts/write-ci-job-summary.ts
```

Placement: medusa-smoke after "Race P6-MED-RACE-001 + extras" (before its artifact upload at L177); cal-smoke after
"Race P6-CAL-RACE-003" (before the histogram upload at L400); documenso-smoke after "Check Documenso artefacts for
tokens" (L601–617), before the histogram upload at L619.

No new action. No changed pins.

### 3.10 Order of commits (one PR, several small commits)

1. `test(p6): add issue annotations to the three test.fail() bugs` (§3.3)
2. `ci(p6): write the JSON reporter per race invocation` (§3.1, §3.2 env lines)
3. `feat(ci): port the Playwright JSON job-summary parser` (§3.4, its tests)
4. `feat(ci): race table and summary script` (§3.5–3.8, tsconfig §3.7)
5. `ci(p6): replace the ad-hoc job-summary lines` (§3.9)

No commit trailers. Environment git identity only; no co-author or session lines.

## 4. Verification (before the PR is opened)

Run from the repo root, with `export PATH="/usr/local/bin:$PATH"`.

```bash
npm run check                              # format, typecheck, k6 inspect, unit tests
npx tsc --noEmit -p tsconfig.races.json    # the new script and src/ci are type-checked
npx prettier --check .
node --test tests/unit/playwright-json-summary.test.ts tests/unit/race-table.test.ts
```

Expected: `npm run check` ends with `# pass N` and `# fail 0`, with N = 276 + the new tests (plan: 299). The real
count is recorded in the PR and in §8.

**actionlint** (not in `npm run check`). Pinned release **v1.7.12**, linux/amd64 archive sha256
`8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`, verified against the published
`actionlint_1.7.12_checksums.txt`:

```bash
V=1.7.12; D="$SCRATCH/actionlint-$V"; mkdir -p "$D" && cd "$D"
curl -sSLf -o checksums.txt "https://github.com/rhysd/actionlint/releases/download/v$V/actionlint_${V}_checksums.txt"
curl -sSLf -o actionlint.tar.gz "https://github.com/rhysd/actionlint/releases/download/v$V/actionlint_${V}_linux_amd64.tar.gz"
grep "linux_amd64.tar.gz" checksums.txt | sed "s#  .*#  actionlint.tar.gz#" | sha256sum -c -   # expect: actionlint.tar.gz: OK
tar -xzf actionlint.tar.gz actionlint
cd /home/user/k6-load-concurrency-suite
"$D/actionlint" .github/workflows/perf.yml .github/workflows/evidence-release.yml; echo "exit=$?"   # expect: exit=0, no output
```

Baseline (done): exit 0, no output on untouched main. Shell checks need shellcheck, which is not installed; the
build records that limit in the PR.

**Run the CLI against the real run A histograms, for all three jobs.** `$SCRATCH` is the scratchpad. Each job gets
its own root, containing only that job's histograms (the release zips split them by job):

```bash
for job in medusa cal documenso; do
  root="$SCRATCH/job-$job"; mkdir -p "$root/results/races"
  cp "$SCRATCH/unz/a/race-histograms-$job/"*.json "$root/results/races/"
  node scripts/write-ci-job-summary.ts "$root"; echo "exit=$?"
done
```

Expected: a `::warning::` line for the missing Playwright JSON (these zips do not hold Playwright reports), the line
`**Harness up:** n/a (not reached)`, the race table for that job, and `exit=0`. The rendered markdown goes in the PR
description.

**Negative checks:**

```bash
mkdir -p "$SCRATCH/bad/results/races" && echo '{}' > "$SCRATCH/bad/results/races/x.json"
node scripts/write-ci-job-summary.ts "$SCRATCH/bad"; echo "exit=$?"
# expect on stderr: ".../x.json: caseId must be a non-empty string", exit=1

mkdir -p "$SCRATCH/zero/results/playwright" && echo '{"suites":[]}' > "$SCRATCH/zero/results/playwright/z.json"
node scripts/write-ci-job-summary.ts "$SCRATCH/zero"; echo "exit=$?"
# expect on stderr: ".../z.json contains zero tests", exit=1
```

The Playwright table is authoritative only in CI (the real cases need Cal, Medusa and Documenso running). The PR's
CI job summaries confirm it.

## 5. After the PR's CI runs

The maintainer checks each job summary page:

- **medusa-smoke:** Playwright table (predicted 6 tests, 0 expected failures) with no known-bug list; race table with
  6 rows; Medusa rows show `accepted per trial 5`.
- **cal-smoke:** Playwright table (predicted 8 tests, 2 expected failures); known bugs line
  `P6-OBS-CAL-001, P6-OBS-CAL-002`; race table with 7 rows.
- **documenso-smoke:** Playwright table (predicted 4 tests, 1 expected failure); known bugs line `P6-OBS-DOC-002`;
  race table with 4 rows. The summary appears only if the token scan passed.
- In each job: one `Harness up: N s` line at the top.
- Nothing printed from `bodySummary`, request bodies or invariant text.

Predicted counts come from the `test(` counts in the source specs. Any mismatch goes back to the build.

## 6. Expected output (from the real run A histograms)

### 6.1 How it was produced

A scratch computation, not committed, applied the rules in §3.5 to the real files of release run `39577832657`
(run A, full counts). Asset: `p6-39577832657-evidence.zip`, sha256
`83f6944597f70f50e349f4eae33d91a8ffd1207075fdba9bc422d4af62c5d69c`, which the local download matches (the GitHub API's
asset digest). Per-trial time is `(finishedAt − startedAt) / trials`, read from each histogram's top-level fields.

The build's formatter must produce the same rows. Any difference is a bug in the build, unless the §3.5 rules changed
on purpose.

### 6.2 Cal job (race part)

| Case                     | Trials | Verdict | Key counts                                   | Per-trial time | Outcome                                                                                   |
| ------------------------ | -----: | ------- | -------------------------------------------- | -------------: | ----------------------------------------------------------------------------------------- |
| P6-CAL-RACE-001          |     50 | pass    | double-accepted trials 0; non-409 losers 950 |         1.05 s | One ACCEPTED per slot in 50 trials; Reproduces P6-OBS-CAL-001: 950 losers got 400 not 409 |
| P6-CAL-RACE-003          |     30 | fail    | double-booked trials 30; clean 0             |         0.37 s | Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in 30 of 30 trials          |
| cal-self-test            |      3 | pass    | n/a                                          |         2.58 s | Passed                                                                                    |
| extra-loser-contract     |      3 | pass    | double-accepted trials 0; non-409 losers 57  |         0.99 s | One ACCEPTED per slot in 3 trials; Reproduces P6-OBS-CAL-001: 57 losers got 400 not 409   |
| extra-overlap-sequential |      4 | pass    | double-booked trials 0; clean 4              |         0.31 s | Did not reproduce: no overlapping pair accepted together in 4 trials                      |
| extra-same-attendee      |      3 | pass    | double-accepted trials 0; non-409 losers 57  |         0.99 s | One ACCEPTED per slot in 3 trials; Reproduces P6-OBS-CAL-001: 57 losers got 400 not 409   |
| extra-time-spellings     |      3 | pass    | double-accepted trials 0; non-409 losers 60  |         1.03 s | One ACCEPTED per slot in 3 trials; Reproduces P6-OBS-CAL-001: 60 losers got 400 not 409   |

### 6.3 Medusa job (race part)

| Case                | Trials | Verdict | Key counts                               | Per-trial time | Outcome                  |
| ------------------- | -----: | ------- | ---------------------------------------- | -------------: | ------------------------ |
| P6-MED-RACE-001     |     50 | pass    | accepted per trial 5; oversold trials 0  |        14.40 s | No oversell in 50 trials |
| extra-mixed-qty     |      3 | pass    | accepted per trial 3; oversold trials 0  |         4.31 s | No oversell in 3 trials  |
| extra-s0-n5         |      3 | pass    | accepted per trial 0; oversold trials 0  |         1.02 s | No oversell in 3 trials  |
| extra-s1-n2         |      3 | pass    | accepted per trial 1; oversold trials 0  |         1.95 s | No oversell in 3 trials  |
| extra-same-cart     |      3 | pass    | accepted per trial 10; oversold trials 0 |         3.98 s | No oversell in 3 trials  |
| framework-self-test |     50 | pass    | n/a                                      |         0.04 s | Passed                   |

The Medusa job also runs `framework-self-test`, because the `medusa-race` project includes it.

### 6.4 Documenso job (race part)

| Case                         | Trials | Verdict | Key counts                                        | Per-trial time | Outcome                                                    |
| ---------------------------- | -----: | ------- | ------------------------------------------------- | -------------: | ---------------------------------------------------------- |
| P6-DOC-RACE-001              |     50 | fail    | double-sealed trials 50; invariant violations 400 |         2.56 s | Reproduces P6-OBS-DOC-002: sealed twice in 50 of 50 trials |
| P6-DOC-RACE-002              |     50 | pass    | double-sealed trials 0; invariant violations 0    |         1.47 s | Did not reproduce: sealed once in 50 trials                |
| documenso-self-test          |     50 | pass    | n/a                                               |         0.03 s | Passed                                                     |
| extra-doc-sequential-control |      5 | pass    | double-sealed trials 0; invariant violations 0    |         2.69 s | Did not reproduce: sealed once in 5 trials                 |

### 6.5 Playwright part (predicted, verify in CI)

If every test behaves as in run A, using the source counts: medusa `| 6 | 0 | 0 | 0 |`, no known-bug list; cal
`| 6 | 0 | 0 | 2 |` with `Known product bugs still reproducing: P6-OBS-CAL-001, P6-OBS-CAL-002`; documenso
`| 3 | 0 | 0 | 1 |` with `Known product bugs still reproducing: P6-OBS-DOC-002`.

### 6.6 Check against the README's run A cells

| Case                                           | README run A (`39577832657`) | Rendered (2 dp)          | Result                                           |
| ---------------------------------------------- | ---------------------------- | ------------------------ | ------------------------------------------------ |
| Medusa accepted per trial / per-trial time     | 5 / 14.40                    | 5 / 14.40                | match                                            |
| Cal identical slot per-trial time              | 1.052                        | 1.05                     | **differs in precision** (README uses 3 dp here) |
| Cal overlap per-trial time                     | 0.374                        | 0.37                     | **differs in precision** (README uses 3 dp here) |
| Documenso `P6-DOC-RACE-001` / `-002` / control | 2.56 / 1.47 / 2.69           | 2.56 / 1.47 / 2.69       | match                                            |
| Cal identical slot accepted / redacted 400     | 1 / 950                      | 1 / 950 (non-409 losers) | match                                            |
| Cal overlap double-booked / clean              | 30 / 0                       | 30 / 0                   | match                                            |
| Documenso violations per run                   | 400                          | 400                      | match                                            |

No single precision reproduces every README cell exactly. The formatter uses 2 decimals, as requested. Decision 12 (§1)
records the choice. The maintainer chooses between changing the README's Cal rows to 2 decimals or giving the Cal rows 3.

## 7. Risks and what stays out of scope

Risks:

- **Node type stripping.** `scripts/write-ci-job-summary.ts` runs as `.ts`. The repo already runs `node --test
tests/unit/*.test.ts` on Node 22, so the mechanism is in use. Job Node versions: `.nvmrc` (22) for medusa and cal,
  24 for documenso. Both are fine.
- **A malformed or zero-test report turns the job red**, even when the race itself passed. That is intended. The PR says so.
- **Outcome wording is a judgement.** The maintainer reviews it in the PR. The §3.5 rules are the contract, and the unit
  tests pin them.
- **The known-bug list tracks annotations.** Removing a `test.fail()` removes its row on the next run, which is intended.
- **Per-trial time is not a performance claim.** It is labelled "Per-trial time" and appears only on CI job pages.
  AGENTS.md requires a median of at least 3 GitHub Actions runs for any published number.
- **Token exposure.** The summary prints only ids, counts, fixed phrases and our own annotation text. The Documenso summary
  is written only after the token scan passes. The scan covers `results/races` and the Documenso web log, not
  `results/playwright`, which is not uploaded. Do not add `results/playwright` to any artifact in this change.
- **actionlint does not run shellcheck here.** shellcheck is not installed, so the shell lint is not part of this check.
- **Plan branch divergence.** The plan branch does not contain main `d75379a`. The build starts from main, and the plan
  file is not merged into main with this change.

Out of scope (do not touch in this change):

- race logic, oracles, invariants and trial counts (including `RACE_TRIALS` and the 30-trial cap);
- the artifact uploads and the Documenso token-scan step (only the summary step is added nearby);
- `test.fail()` placement, and any new `test.fail()`. Only the three existing, proven bugs keep it;
- the P1 repo, the product forks, and `qa-portfolio-harness`;
- a shared package between P1 and P6 (§1.1);
- actionlint and shellcheck as a `npm run check` step (possible follow-up, separate PR).

## 8. Done when

- `npm run check` passes with the real test count (recorded in the PR and in this section after the build).
- actionlint passes on `perf.yml` and `evidence-release.yml`, and `tsc -p tsconfig.races.json` passes.
- The formatter output on the real run A histograms matches §6.2–6.4 row for row.
- The two negative checks in §4 fail with the stated messages.
- On the PR's CI runs, the maintainer has checked the three job summaries (§5).

Real results (filled in after the build): `npm run check` = **[pending]** tests, **[pending]** failing. Predicted 299.

## 9. Review changes (revision 2)

| Review item                                                                                                                           | Where it is in this revision |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1. Timing: README definition, "Per-trial time", 2 dp, `perTrialTime` with tests for normal, missing dates and trials 0; run A checked | §1.9, §3.5, §3.8, §6.1–6.6   |
| 2. Medusa key counts: `accepted per trial N` or `MIN-MAX`                                                                             | §1.10, §3.5, §6.3            |
| 3. Step condition `!cancelled()`                                                                                                      | §1.8, §3.9                   |
| 4. Documenso summary after the token scan, gated on the scan's outcome                                                                | §1.11, §3.9, §5              |
| 5. P1 parity: all applicable cases ported (3 of 4), one skipped with reason                                                           | §1.13, §3.8                  |
| 6. actionlint pinned at v1.7.12, sha256 recorded, baseline run on main                                                                | §0, §4                       |
| Extra: tsconfig change moved to the commit that adds the script (§3.10)                                                               | §3.7, §3.10                  |
| Extra: the run A precision difference against the README is recorded                                                                  | §1.12, §6.6                  |
