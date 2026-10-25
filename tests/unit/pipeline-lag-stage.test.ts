import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findHits } from "../../scripts/evidence-token-scan.mjs";
import { evaluatePipeline, makePipelineStage, CONTRACT_MS } from "../../src/load/pipeline-stage.ts";
import { STAGES, type StageInput } from "../../src/load/pipeline-lag.ts";
import type { LoadContext } from "../../src/load/types.ts";

/** One document through every stage, 1 s after its signature. */
function full(): StageInput {
  return {
    documents: [{ documentId: 1, envelopeId: "env-1", completedAtMs: 1_000, lastSignedMs: 1_000 }],
    sealJobs: [{ documentId: 1, status: "COMPLETED", completedAtMs: 2_000 }],
    webhookJobs: [{ documentId: 1, status: "COMPLETED", retried: 0, completedAtMs: 3_000 }],
    webhookCalls: [{ documentId: 1, status: "SUCCESS", responseCode: 200, createdAtMs: 4_000 }],
    deliveries: [{ documentId: 1, receivedAtMs: 5_000, status: 200 }],
    emailJobs: [{ envelopeId: "env-1", status: "COMPLETED", completedAtMs: 6_000 }],
    emails: [],
  };
}

describe("pipeline stage", () => {
  it("an undrained backlog is a PRODUCT BUG and names the drain time", () => {
    const v = evaluatePipeline(full(), { drained: false, drainMs: 30_000 });
    assert.equal(v.ok, false);
    assert.equal(v.kind, "PRODUCT BUG");
    assert.ok(v.reasons.some((r) => r.includes("backlog not drained after 30000 ms")));
  });

  it("the pipeline json holds numbers only and passes the token scanner", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "pipe-"));
    const stage = makePipelineStage({
      openPool: () => ({ end: async () => {} }) as never,
      readInput: async () => ({ input: full(), expectedEmails: new Map() }),
      drain: async () => ({ drained: true, drainMs: 120 }),
    });
    const ctx = {
      outDir: dir,
      config: { audit: { product: "documenso", prefixLike: "p%", sequentialCompletions: true } },
      handles: { documensoRun: { webhookId: "w", receiver: { deliveries: [] } } },
    } as unknown as LoadContext;
    const r = await stage(ctx);
    assert.equal(r.ok, true, r.reasons.join("; "));
    const text = readFileSync(path.join(dir, "pipeline-lag.json"), "utf8");
    assert.deepEqual(findHits(text), []);
    assert.equal(JSON.parse(text).documents, 1);
    for (const s of STAGES) assert.ok(s.length > 0);
    assert.equal(CONTRACT_MS, 30_000);
  });
});
