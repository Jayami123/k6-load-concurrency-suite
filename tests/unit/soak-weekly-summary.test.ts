import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSummarySize,
  buildSummary,
  latestWeeklyWeek,
  parseSummary,
  weeklyDecision,
  weeklyIsoWeek,
  type WeeklyDecision,
  type WeeklyRunFacts,
} from "../../src/load/soak/weekly-summary.ts";

/** The refuse flag of a decision that is not weekly (a weekly decision never refuses). */
function refusal(decision: WeeklyDecision): boolean {
  return !decision.weekly && decision.refuse;
}

const SHA = "fcfa8f615095d0ead8f68377b0bf63e58a857461";
const PRODUCT_SHA = "c2b7ac44c66f24ffef1662b276f0653988a609a3";
const RUN_URL = "https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40796699639";

/**
 * Section 6.4's example summary, with the two fields that make it a weekly point made consistent: a 7200 s duration and a
 * created_at in its week (2026-w44). The numbers are the nightly probe's; the schema is the contract.
 */
function exampleSummary(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    product: "cal",
    isoWeek: "2026-w44",
    tag: "p6-soak-2026-w44",
    caseId: "P6-CAL-LOAD-008",
    runId: "20261029T005400Z-e2eab4d1",
    githubRunId: "40796699639",
    runUrl: RUN_URL,
    soakHeadSha: SHA,
    event: "schedule",
    createdAt: "2026-11-01T19:29:00Z",
    durationSec: 7200,
    warmupSec: 360,
    productSha: PRODUCT_SHA,
    harnessTag: "v0.2.15",
    k6Version: "2.3.0",
    valid: true,
    invalidReason: null,
    verdict: "NO THRESHOLD YET",
    reasons: ["no soak-bounds.json entry for this product"],
    statistics: {
      rssMb: { slopePerMin: 0.497, theilSenPerMin: 0.507, plateauRatio: 1.0009 },
      fds: { slopePerMin: -0.0016, theilSenPerMin: 0, plateauRatio: 1 },
      dbConnections: { slopePerMin: 0.00065, theilSenPerMin: 0, plateauRatio: 1 },
    },
    healthProbeMs: { p95: 12, slopePerMin: 0, samples: 1441 },
  };
}

function soakJson(verdict: string, reasons: string[] = []): Record<string, unknown> {
  const metric = { slope: { slopePerMin: 0.1, theilSenPerMin: 0.1 }, plateau: { ratio: 1 } };
  return {
    verdict,
    reasons,
    statistics: {
      durationSec: 7200,
      warmupSec: 360,
      rssMb: metric,
      fds: metric,
      dbConnections: metric,
    },
  };
}

function runMeta(): Record<string, unknown> {
  return {
    runId: "20261029T005400Z-e2eab4d1",
    durationSec: 7200,
    environment: { event: "schedule" },
    software: { k6: "2.3.0", harness: "v0.2.15", products: { cal: PRODUCT_SHA } },
  };
}

const IDENTITY = {
  product: "cal" as const,
  githubRunId: "40796699639",
  runUrl: RUN_URL,
  soakHeadSha: SHA,
  createdAt: "2026-11-01T19:29:00Z",
};

describe("weekly soak summary schema v1", () => {
  it("a valid v1 summary is accepted and returned unchanged", () => {
    const summary = exampleSummary();
    assert.deepEqual(parseSummary(summary), summary);
  });

  it("a missing field is rejected and the message names it", () => {
    const summary = exampleSummary();
    delete summary.productSha;
    assert.throws(() => parseSummary(summary), /productSha/);
  });

  it("a schemaVersion other than 1 is refused as unknown, never parsed loosely", () => {
    assert.throws(
      () => parseSummary({ ...exampleSummary(), schemaVersion: 2 }),
      /unknown schemaVersion 2/,
    );
  });

  it("a forbidden key is refused", () => {
    assert.throws(() => parseSummary({ ...exampleSummary(), token: "x" }), /forbidden key token/);
  });

  it("a valid run without a probe source keeps healthProbeMs null and stays valid", () => {
    const summary = buildSummary({
      ...IDENTITY,
      soakJson: soakJson("NO THRESHOLD YET", ["no soak-bounds.json entry for this product"]),
      runMeta: runMeta(),
      telemetry: null,
    });
    assert.equal(summary.valid, true);
    assert.equal(summary.healthProbeMs, null);
    assert.equal(summary.invalidReason, null);
    assert.equal(parseSummary(summary).tag, "p6-soak-2026-w44");
  });

  it("an invalid run has valid false, a reason and null statistics", () => {
    const summary = buildSummary({
      ...IDENTITY,
      soakJson: soakJson("INVALID", ["telemetry gaps over two intervals: 3"]),
      runMeta: runMeta(),
      telemetry: null,
    });
    assert.equal(summary.valid, false);
    assert.equal(summary.invalidReason, "telemetry gaps over two intervals: 3");
    assert.equal(summary.statistics, null);
    assert.equal(summary.productSha, null);
  });

  it("weeklyIsoWeek maps the owner's examples to their weeks", () => {
    assert.deepEqual(weeklyIsoWeek("2026-11-01T19:29:00Z"), {
      isoWeek: "2026-w44",
      tag: "p6-soak-2026-w44",
    });
    assert.equal(weeklyIsoWeek("2026-11-01T22:47:00Z").isoWeek, "2026-w44");
    assert.equal(weeklyIsoWeek("2026-11-02T05:00:00Z").isoWeek, "2026-w44");
    assert.equal(weeklyIsoWeek("2026-11-08T19:28:00Z").isoWeek, "2026-w44");
    assert.equal(weeklyIsoWeek("2026-11-08T19:29:00Z").isoWeek, "2026-w45");
    assert.equal(weeklyIsoWeek("2027-01-04T06:00:00Z").isoWeek, "2026-w53");
  });

  it("latestWeeklyWeek waits for the settle time", () => {
    assert.equal(latestWeeklyWeek(new Date("2026-11-02T20:00:00Z")), "2026-w44");
    assert.equal(latestWeeklyWeek(new Date("2026-11-02T18:00:00Z")), "2026-w43");
  });

  it("weeklyDecision: trigger mode is NOT RUN for everything but a weekly point; dispatch mode refuses", () => {
    const base: WeeklyRunFacts = {
      workflowId: "397232763",
      headBranch: "main",
      event: "schedule",
      conclusion: "success",
      createdAt: "2026-11-01T19:29:00Z",
      headSha: SHA,
      artefactNames: ["soak-cal-120", "soak-medusa-120", "soak-documenso-120"],
    };
    const nightly = { ...base, artefactNames: ["soak-cal-30", "soak-medusa-30"] };
    const cancelled = { ...base, conclusion: "cancelled" };
    const noArtefacts = { ...base, conclusion: "failure", artefactNames: [] };
    const dispatched = { ...base, event: "workflow_dispatch" };
    const forged = { ...base, workflowId: "1" };
    const branch = { ...base, headBranch: "feature/x" };
    const failedWeekly = { ...base, conclusion: "failure", artefactNames: ["soak-cal-120"] };

    assert.deepEqual(weeklyDecision(nightly, "trigger"), {
      weekly: false,
      refuse: false,
      reason: "no 120-minute soak artefact (failed before upload)",
    });
    assert.equal(weeklyDecision(cancelled, "trigger").weekly, false);
    assert.equal(refusal(weeklyDecision(cancelled, "trigger")), false);
    assert.equal(refusal(weeklyDecision(noArtefacts, "trigger")), false);
    assert.equal(refusal(weeklyDecision(dispatched, "dispatch")), true);
    assert.equal(refusal(weeklyDecision(forged, "dispatch")), true);
    assert.equal(refusal(weeklyDecision(branch, "dispatch")), true);
    assert.deepEqual(weeklyDecision(failedWeekly, "trigger"), {
      weekly: true,
      isoWeek: "2026-w44",
      tag: "p6-soak-2026-w44",
      products: ["cal"],
    });
    assert.deepEqual(weeklyDecision(base, "trigger"), {
      weekly: true,
      isoWeek: "2026-w44",
      tag: "p6-soak-2026-w44",
      products: ["cal", "medusa", "documenso"],
    });
  });

  it("a summary over 64 KiB is refused", () => {
    assert.throws(() => assertSummarySize(65537), /summary over 65536 bytes/);
    assert.doesNotThrow(() => assertSummarySize(65536));
  });
});
