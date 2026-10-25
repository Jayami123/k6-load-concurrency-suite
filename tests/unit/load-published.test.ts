import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPublishedKnee, formatPublishedNumber } from "../../src/load/published.ts";
import type { KneeReport } from "../../src/load/knee/knee-report.ts";
import type { RunMeta } from "../../src/load/types.ts";

const publishable: RunMeta = {
  schema: 1,
  caseId: "P6-X-LOAD-001",
  runId: "r",
  profile: "full",
  label: "functional load, not capacity",
  rate: 40,
  durationSec: 60,
  plannedIterations: 2400,
  startedAt: "2026-10-24T01:02:03.000Z",
  environment: {
    kind: "github-actions",
    event: "push",
    ref: "main",
    runnerImage: "ubuntu24",
    imageVersion: "20261012.334.1",
    runnerOs: "Linux",
    runnerArch: "X64",
    nproc: 4,
    memTotalMb: 16000,
  },
  software: { k6: "2.3.0", harness: "v0.2.14", node: "v22.23.3", products: {} },
  limits: {},
};

describe("published numbers", () => {
  it("the format names the label, the environment and the run-meta link; a non-publishable meta throws", () => {
    const text = formatPublishedNumber(
      1200,
      "requests",
      publishable,
      "https://example.test/run-meta.json",
    );
    assert.match(text, /functional load, not capacity/);
    assert.match(text, /ubuntu24 20261012\.334\.1, 4 vCPU/);
    assert.match(text, /run-meta: https:\/\/example\.test\/run-meta\.json\)$/);
    assert.throws(
      () =>
        formatPublishedNumber(
          1,
          "x",
          { ...publishable, environment: { ...publishable.environment, kind: "local" } },
          "l",
        ),
      /not publishable/,
    );
  });
});

describe("published knee form", () => {
  const report = {
    schema: 1,
    ruleId: "P6-RULE-006",
    caseId: "P6-MED-LOAD-004",
    runId: "r",
    label: "knee range, environment-bound",
    verdict: "KNEE",
    range: { lowerStep: 1, upperStep: 2, lowerRate: 1, upperRate: 1.5 },
    stop: { step: 2, rate: 1.5, reasons: ["p95"], limitMs: 1000 },
    firstSaturated: { resource: "app_cpu", step: 2 },
    stopRule: { smokeP95Ms: 100, p95Factor: 10, errorRate: 0.01, minRequests: 20 },
    steps: [],
    conflicts: 0,
    invalid: [],
    environment: "ubuntu24 20261012.334.1, 4 vCPU",
  } as unknown as KneeReport;

  it("names the range, the rule, the resource and the environment", () => {
    const text = formatPublishedKnee(report, publishable, "https://example.test/meta");
    assert.match(text, /^1 to 1\.5 iterations\/s \(knee range, environment-bound;/);
    assert.match(
      text,
      /stop rule: p95; first saturated: app_cpu; environment: ubuntu24 20261012\.334\.1, 4 vCPU;/,
    );
    assert.match(text, /run-meta: https:\/\/example\.test\/meta\)$/);
  });

  it("refuses a report that is not a KNEE and a meta that is not publishable", () => {
    assert.throws(
      () => formatPublishedKnee({ ...report, verdict: "NO_KNEE" } as KneeReport, publishable, "x"),
      /not a knee range/,
    );
    const local = {
      ...publishable,
      environment: { ...publishable.environment, kind: "local" },
    } as RunMeta;
    assert.throws(() => formatPublishedKnee(report, local, "x"), /not publishable/);
  });
});
