import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLoadTable } from "../../src/ci/load-table.ts";

describe("LOAD table", () => {
  it("an INVALID row shows the reason codes and no latency", () => {
    const text = formatLoadTable([
      {
        path: "results/load/P6-X-LOAD-004/r/verdict.json",
        verdict: {
          caseId: "P6-X-LOAD-004",
          profile: "pr",
          outcome: "INVALID",
          validity: {
            verdict: "INVALID",
            reasons: [{ code: "dropped_iterations" }, { code: "vu_exhausted" }],
          },
          k6: [
            { requests: 1032, dropped: 168, vusMax: 5, p95Ms: 999, resources: { k6CoresAvg: 0.5 } },
          ],
        },
      },
    ]);
    assert.match(text, /dropped_iterations, vu_exhausted/);
    assert.doesNotMatch(text, /999/);
    assert.match(text, /functional load, not capacity/);
  });
});
