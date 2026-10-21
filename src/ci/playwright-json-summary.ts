// Ported from Jayami123/playwright-e2e-ci-framework, src/core/playwright-json-summary.ts,
// at commit 2d714c7a65c22136c845461ed31a2503dfa8c20a (main, 2026-10-20). Keep in sync by hand.
// P6 changes: no browser label, no P1 report-id suffix, compact line lists issue ids, mergeSummaries and
// requireTests added.

export interface PlaywrightRunTotals {
  readonly passed: number;
  readonly failed: number;
  readonly flaky: number;
  readonly expectedFailures: number;
  readonly skipped: number;
}

export interface KnownProductBugRow {
  readonly title: string;
  readonly issueId: string;
  readonly issue: string;
}

export interface PlaywrightJobSummary {
  readonly totals: PlaywrightRunTotals;
  readonly knownProductBugs: readonly KnownProductBugRow[];
}

const ISSUE_ANNOTATION_TYPE = "issue";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function issueIdFromDescription(description: string): string {
  const beforeColon = description.split(":")[0];
  const trimmed = (beforeColon ?? description).trim();
  return trimmed === "" ? description : trimmed;
}

function collectIssueDescription(annotations: unknown): string | undefined {
  if (!Array.isArray(annotations)) {
    return undefined;
  }
  for (const annotation of annotations) {
    if (!isRecord(annotation)) {
      continue;
    }
    if (asString(annotation.type) !== ISSUE_ANNOTATION_TYPE) {
      continue;
    }
    const description = asString(annotation.description);
    if (description !== undefined && description.trim() !== "") {
      return description;
    }
  }
  return undefined;
}

function walkSuites(
  suites: unknown,
  onSpec: (title: string, testNode: Record<string, unknown>) => void,
): void {
  if (!Array.isArray(suites)) {
    return;
  }
  for (const suite of suites) {
    if (!isRecord(suite)) {
      continue;
    }
    const specs = suite.specs;
    if (Array.isArray(specs)) {
      for (const spec of specs) {
        if (!isRecord(spec)) {
          continue;
        }
        const title = asString(spec.title) ?? "";
        const tests = spec.tests;
        if (!Array.isArray(tests)) {
          continue;
        }
        for (const testNode of tests) {
          if (isRecord(testNode)) {
            onSpec(title, testNode);
          }
        }
      }
    }
    walkSuites(suite.suites, onSpec);
  }
}

export function parsePlaywrightJsonReport(raw: unknown): PlaywrightJobSummary {
  if (!isRecord(raw)) {
    throw new Error("Playwright JSON report root must be an object");
  }
  const totals: {
    passed: number;
    failed: number;
    flaky: number;
    expectedFailures: number;
    skipped: number;
  } = {
    passed: 0,
    failed: 0,
    flaky: 0,
    expectedFailures: 0,
    skipped: 0,
  };
  const knownProductBugs: KnownProductBugRow[] = [];
  const seenBugs = new Set<string>();

  walkSuites(raw.suites, (title, testNode) => {
    const status = asString(testNode.status);
    const expectedStatus = asString(testNode.expectedStatus);
    if (status === "skipped") {
      totals.skipped += 1;
      return;
    }
    if (status === "flaky") {
      totals.flaky += 1;
      return;
    }
    if (status === "unexpected") {
      totals.failed += 1;
      return;
    }
    if (status === "expected" && expectedStatus === "failed") {
      totals.expectedFailures += 1;
      const issue = collectIssueDescription(testNode.annotations);
      if (issue !== undefined) {
        const key = `${title}\n${issue}`;
        if (!seenBugs.has(key)) {
          seenBugs.add(key);
          knownProductBugs.push({
            title,
            issueId: issueIdFromDescription(issue),
            issue,
          });
        }
      }
      return;
    }
    if (status === "expected") {
      totals.passed += 1;
    }
  });

  return { totals, knownProductBugs };
}

export function totalTestsInSummary(summary: PlaywrightJobSummary): number {
  const { totals } = summary;
  return totals.passed + totals.failed + totals.flaky + totals.expectedFailures + totals.skipped;
}

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
