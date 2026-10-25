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

  it("a knee run gets a knee block with its range and first saturated resource", () => {
    const text = formatLoadTable([
      {
        path: "results/load/P6-X-LOAD-021/r/verdict.json",
        verdict: {
          caseId: "P6-X-LOAD-021",
          profile: "pr",
          outcome: "PASS",
          validity: { verdict: "VALID", reasons: [] },
          k6: [{ requests: 900, dropped: 0, vusMax: 40 }],
          stages: {
            reconcile: {
              data: {
                knee: [
                  {
                    caseId: "P6-X-LOAD-021",
                    verdict: "KNEE",
                    lowerRate: 140,
                    upperRate: 220,
                    firstSaturated: "app_cpu",
                  },
                ],
              },
            },
          },
        },
      },
    ]);
    assert.match(text, /## Knee runs/);
    assert.match(
      text,
      /\| P6-X-LOAD-021 \| KNEE \| between 140 and 220 iterations\/s \| app_cpu \|/,
    );
    assert.match(text, /environment-bound, not capacity/);
  });
});
