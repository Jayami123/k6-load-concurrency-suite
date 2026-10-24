import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinStages, STAGES, summariseLag, type StageInput } from "../../src/load/pipeline-lag.ts";

const DOC = { documentId: 1, envelopeId: "env-1", completedAtMs: 1_000, lastSignedMs: 1_000 };

/** One document through every stage, 1 s after its last signature (the lags are 1 000, 2 000, ...). */
function full(): StageInput {
  return {
    documents: [DOC],
    sealJobs: [{ documentId: 1, status: "COMPLETED", completedAtMs: 2_000 }],
    webhookJobs: [{ documentId: 1, status: "COMPLETED", retried: 0, completedAtMs: 3_000 }],
    webhookCalls: [{ documentId: 1, status: "SUCCESS", responseCode: 200, createdAtMs: 4_000 }],
    deliveries: [{ documentId: 1, receivedAtMs: 5_000, status: 200 }],
    emailJobs: [{ envelopeId: "env-1", status: "COMPLETED", completedAtMs: 6_000 }],
    emails: [{ envelopeId: "env-1", postedMs: 7_000 }],
  };
}

const empty: StageInput = {
  documents: [],
  sealJobs: [],
  webhookJobs: [],
  webhookCalls: [],
  deliveries: [],
  emailJobs: [],
  emails: [],
};

describe("documenso pipeline join", () => {
  it("a document through every stage reaches each stage once", () => {
    const [d] = joinStages(full());
    assert.ok(d);
    for (const s of STAGES) assert.equal(d.reached[s], true, s);
    assert.deepEqual(d.counts, { seal: 1, webhookJob: 1, receiverOk: 1, emailJob: 1 });
  });

  it("lag is measured from the last signature", () => {
    const input = full();
    input.documents[0] = { ...DOC, lastSignedMs: 500 };
    const [d] = joinStages(input);
    assert.equal(d?.lagMs.seal, 1_500);
    assert.equal(d?.lagMs.email, 6_500);
  });

  it("a missing seal is not reached and has no lag", () => {
    const input = full();
    input.sealJobs = [];
    const [d] = joinStages(input);
    assert.equal(d?.reached.seal, false);
    assert.equal(d?.lagMs.seal, undefined);
  });

  it("a missing receiver delivery is not reached", () => {
    const input = full();
    input.deliveries = [];
    const [d] = joinStages(input);
    assert.equal(d?.reached.receiver, false);
    assert.equal(d?.counts.receiverOk, 0);
  });

  it("a duplicated email job is counted, not hidden", () => {
    const input = full();
    input.emailJobs.push({ envelopeId: "env-1", status: "COMPLETED", completedAtMs: 6_500 });
    const [d] = joinStages(input);
    assert.equal(d?.counts.emailJob, 2);
  });

  it("a delivery that answered 500 is not counted as receiverOk", () => {
    const input = full();
    input.deliveries = [{ documentId: 1, receivedAtMs: 5_000, status: 500 }];
    const [d] = joinStages(input);
    assert.equal(d?.counts.receiverOk, 0);
    assert.equal(d?.reached.receiver, false);
  });

  it("an email is matched to its document by envelope, not by document id", () => {
    const input = full();
    input.emails = [{ envelopeId: "env-2", postedMs: 7_000 }];
    const [d] = joinStages(input);
    assert.equal(d?.reached.email, false);
  });

  it("a document without completedAt is not completed", () => {
    const input = full();
    input.documents[0] = { ...DOC, completedAtMs: null };
    const [d] = joinStages(input);
    assert.equal(d?.reached.completed, false);
  });

  it("summariseLag gives the percentiles of a fixed list", () => {
    const docs = [1_000, 2_000, 3_000, 4_000, 5_000].map((ms, i) => ({
      documentId: i,
      reached: Object.fromEntries(STAGES.map((s) => [s, true])) as Record<
        (typeof STAGES)[number],
        boolean
      >,
      lagMs: { seal: ms },
      counts: { seal: 1, webhookJob: 1, receiverOk: 1, emailJob: 1 },
    }));
    const s = summariseLag(docs, 30_000);
    assert.equal(s.p50.seal, 3_000);
    assert.equal(s.p95.seal, 5_000);
    assert.equal(s.max.seal, 5_000);
  });

  it("overContract counts a stage whose lag is over the contract", () => {
    const input = full();
    input.sealJobs[0] = { documentId: 1, status: "COMPLETED", completedAtMs: 40_000 };
    const s = summariseLag(joinStages(input), 30_000);
    assert.equal(s.overContract, 1);
  });

  it("missing and duplicated counts add up over the documents", () => {
    const a = joinStages(full());
    const b = joinStages({ ...full(), sealJobs: [] });
    const s = summariseLag([...a, ...b], 30_000);
    assert.equal(s.documents, 2);
    assert.equal(s.missing.seal, 1);
    assert.equal(s.duplicated.seal, 0);
  });

  it("empty input gives zero documents, the signal the stage turns into a TEST BUG", () => {
    const s = summariseLag(joinStages(empty), 30_000);
    assert.equal(s.documents, 0);
  });
});
