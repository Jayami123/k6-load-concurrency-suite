import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPublishedNumber } from "../../src/load/published.ts";
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
