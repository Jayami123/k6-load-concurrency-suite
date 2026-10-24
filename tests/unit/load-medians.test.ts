import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  medianOf,
  selectPublishable,
  summarizeMedian,
  type LoadRunRecord,
} from "../../src/load/medians.ts";
import type { RunMeta } from "../../src/load/types.ts";

const meta = (over: Partial<RunMeta["environment"]> = {}, runId = "r"): RunMeta => ({
  schema: 1,
  caseId: "P6-X-LOAD-001",
  runId,
  profile: "pr",
  label: "functional load, not capacity",
  rate: 40,
  durationSec: 30,
  plannedIterations: 1200,
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
    ...over,
  },
  software: { k6: "2.3.0", harness: "v0.2.14", node: "v22.23.3", products: {} },
  limits: {},
});

const run = (
  runId: string,
  requests: number,
  over: Partial<LoadRunRecord["verdict"]> = {},
  env: Partial<RunMeta["environment"]> = {},
): LoadRunRecord => ({
  verdict: {
    runId,
    outcome: "PASS",
    validity: { verdict: "VALID" },
    ...over,
    k6: [{ requests }],
  } as LoadRunRecord["verdict"],
  meta: meta(env, runId),
});

describe("load medians", () => {
  it("median of an odd and of an even count; an empty list throws", () => {
    assert.equal(medianOf([3, 1, 2]), 2);
    assert.equal(medianOf([1, 2, 3, 4]), 2.5);
    assert.throws(() => medianOf([]));
  });

  it("selectPublishable splits a fixture into used and excluded runs", () => {
    const out = selectPublishable([
      run("ok", 1200),
      run("invalid", 900, { validity: { verdict: "INVALID" } }),
      run("local", 1200, {}, { kind: "local" }),
    ]);
    assert.deepEqual(
      out.used.map((r) => r.verdict.runId),
      ["ok"],
    );
    assert.deepEqual(
      out.excluded.map((e) => e.runId),
      ["invalid", "local"],
    );
  });

  it("summarizeMedian is insufficient under three valid runs", () => {
    const s = summarizeMedian(
      [run("a", 1), run("b", 2)],
      (r) => (r.verdict as { k6?: Array<{ requests: number }> }).k6?.[0]?.requests,
    );
    assert.equal(s.insufficient, true);
    assert.equal(s.n, 2);
  });

  it("excluded runs list their reasons", () => {
    const s = summarizeMedian([run("bad", 1, { outcome: "FAIL" })], () => 1);
    assert.equal(s.excludedCount, 1);
    assert.match(s.excluded[0]!.why.join(" "), /outcome FAIL/);
  });
});
