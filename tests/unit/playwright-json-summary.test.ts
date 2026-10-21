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
