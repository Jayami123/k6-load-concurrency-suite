import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickMetric, runIdOf, type LoadRunRecord } from "../../src/load/medians.ts";
import type { RunMeta } from "../../src/load/types.ts";

function record(over: { runUrl?: string; p95Ms?: number } = {}): LoadRunRecord {
  return {
    verdict: {
      outcome: "PASS",
      validity: { verdict: "VALID" },
      k6: [{ p95Ms: over.p95Ms ?? 120 }],
    } as never,
    meta: {
      environment: { kind: "github-actions", runUrl: over.runUrl },
    } as unknown as RunMeta,
  };
}

describe("p95 medians", () => {
  it("runIdOf parses the run id from a run URL", () => {
    assert.equal(
      runIdOf(record({ runUrl: "https://github.com/o/r/actions/runs/40171401693" }).meta),
      "40171401693",
    );
  });

  it("runIdOf returns undefined without a run URL", () => {
    assert.equal(runIdOf(record().meta), undefined);
  });

  it("pickMetric p95 reads k6[0].p95Ms", () => {
    assert.equal(pickMetric("p95", record({ p95Ms: 233 })), 233);
  });

  it("pickMetric leaves out a p95 that is not a finite number", () => {
    assert.equal(pickMetric("p95", record({ p95Ms: Number.NaN })), undefined);
    assert.equal(pickMetric("p95", record({ p95Ms: Number.POSITIVE_INFINITY })), undefined);
    const nullP95 = { verdict: { k6: [{ p95Ms: null }] }, meta: {} } as unknown as LoadRunRecord;
    assert.equal(pickMetric("p95", nullP95), undefined);
  });
});
