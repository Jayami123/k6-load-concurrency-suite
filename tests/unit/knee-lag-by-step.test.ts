import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentLag, Stage } from "../../src/load/pipeline-lag.ts";
import { lagByStep, lagMarker, type StepLag } from "../../src/load/knee/lag-by-step.ts";

const ALL: Record<Stage, boolean> = {
  completed: true,
  seal: true,
  webhookJob: true,
  webhookCall: true,
  receiver: true,
  emailJob: true,
  email: true,
};

function doc(
  id: number,
  lastSignedMs: number | null,
  sealLag: number,
): DocumentLag & { lastSignedMs: number | null } {
  return {
    documentId: id,
    reached: ALL,
    lagMs: { seal: sealLag },
    counts: { seal: 1, webhookJob: 1, receiverOk: 1, emailJob: 1 },
    lastSignedMs,
  };
}

const WINDOWS = [
  { index: 0, fromMs: 0, toMs: 1000 },
  { index: 1, fromMs: 2000, toMs: 3000 },
];

describe("seal lag per step", () => {
  it("buckets by last signature into the hold windows; a signature in a ramp belongs to no step", () => {
    const docs = [doc(1, 500, 10), doc(2, 1500, 10), doc(3, 2500, 10)];
    const table = lagByStep(docs, WINDOWS);
    assert.equal(table[0]?.documents, 1);
    assert.equal(table[1]?.documents, 1);
  });

  it("unfinished documents (no last signature) are in no bucket", () => {
    const table = lagByStep([doc(1, null, 10), doc(2, 500, 10)], WINDOWS);
    assert.equal(table[0]?.documents, 1);
    assert.equal(table[1]?.documents, 0);
  });

  it("nearest-rank p50, p95 and max per stage per step", () => {
    const lags = [10, 20, 30, 40];
    const table = lagByStep(
      lags.map((l, i) => doc(i, 500, l)),
      WINDOWS,
    );
    assert.equal(table[0]?.p50.seal, 20);
    assert.equal(table[0]?.p95.seal, 40);
    assert.equal(table[0]?.max.seal, 40);
  });

  it("the marker is the first step at or above 10 times the step-0 seal p95; steps under 20 documents are skipped", () => {
    const step = (index: number, documents: number, p95: number): StepLag => ({
      index,
      documents,
      p50: {},
      p95: { seal: p95 },
      max: {},
    });
    // step 1 is 10x the base but has only 5 documents: skipped; step 2 is 10x with 25 documents: the marker
    const table = [step(0, 30, 100), step(1, 5, 1000), step(2, 25, 1000)];
    assert.equal(lagMarker(table), 2);
    assert.equal(lagMarker([step(0, 30, 100), step(1, 30, 999)]), null);
  });

  it("an empty step yields empty percentiles", () => {
    const table = lagByStep([doc(1, 500, 10)], WINDOWS);
    assert.deepEqual(table[1]?.p95, {});
    assert.equal(table[1]?.documents, 0);
  });
});
