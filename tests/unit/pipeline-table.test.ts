import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPipelineRows } from "../../src/load/pipeline-table.ts";
import { joinStages, summariseLag, type StageInput } from "../../src/load/pipeline-lag.ts";

describe("pipeline table", () => {
  it("rows show p50, p95 and max per stage and the drain time", () => {
    const input: StageInput = {
      documents: [1, 2].map((id) => ({
        documentId: id,
        envelopeId: `e${id}`,
        completedAtMs: 1_000,
        lastSignedMs: 1_000,
      })),
      sealJobs: [
        { documentId: 1, status: "COMPLETED", completedAtMs: 2_000 },
        { documentId: 2, status: "COMPLETED", completedAtMs: 3_000 },
      ],
      webhookJobs: [],
      webhookCalls: [],
      deliveries: [],
      emailJobs: [],
      emails: [],
    };
    const summary = summariseLag(joinStages(input), 30_000);
    const rows = formatPipelineRows(summary, { drained: true, drainMs: 250 });
    const seal = rows.find((r) => r.startsWith("| seal |"));
    assert.equal(seal, "| seal | 1000 | 2000 | 2000 | 0 | 0 |");
    assert.equal(rows.at(-1), "drain: drained in 250 ms");
  });
});
