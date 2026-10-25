import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completionTokenOf,
  expectedEmailsOf,
  matchCompletionEmails,
  postedMsOf,
} from "../../src/load/pipeline-email.ts";
import { evaluatePipeline } from "../../src/load/pipeline-stage.ts";
import type { StageInput } from "../../src/load/pipeline-lag.ts";

// Shapes as captured from a live Documenso run (tokens are synthetic here).
const signingLink = { text: "Sign: http://127.0.0.1:3001/sign/TOKEN_A", html: "" };
const completionLink = { text: "", html: '<a href="http://127.0.0.1:3001/sign/TOKEN_A/complete">' };

describe("completion emails", () => {
  it("reads the token of a completion link and not of the signing request", () => {
    assert.equal(completionTokenOf(completionLink), "TOKEN_A");
    assert.equal(completionTokenOf(signingLink), undefined);
  });

  it("matches a completion email to the envelope of its recipient row", () => {
    const messages = [
      { body: signingLink, date: "2026-10-24T18:00:00.123456789Z" },
      { body: completionLink, date: "2026-10-24T18:00:05.987654321Z" },
      { body: { text: "unknown /sign/OTHER/complete", html: "" }, date: "2026-10-24T18:00:06Z" },
    ];
    const got = matchCompletionEmails(messages, new Map([["TOKEN_A", "envelope_1"]]));
    assert.deepEqual(got, [
      { envelopeId: "envelope_1", postedMs: Date.parse("2026-10-24T18:00:05.987Z") },
    ]);
  });

  it("refuses an unparseable message date as ENV rather than a zero time", () => {
    assert.throws(() => postedMsOf("not a date"), /ENV: Inbucket message date/);
  });

  it("counts one expected completion email per recipient of each envelope", () => {
    const rows = [
      { token: "a", envelopeId: "e1", email: "x@example.com" },
      { token: "b", envelopeId: "e1", email: "y@example.com" },
      { token: "c", envelopeId: "e2", email: "z@example.com" },
    ];
    assert.deepEqual(
      [...expectedEmailsOf(rows)],
      [
        ["e1", 2],
        ["e2", 1],
      ],
    );
  });
});

describe("the email check in evaluatePipeline", () => {
  const drained = { drained: true, drainMs: 0 };
  const input = (emails: StageInput["emails"]): StageInput => ({
    documents: [{ documentId: 1, envelopeId: "e1", completedAtMs: 1000, lastSignedMs: 0 }],
    sealJobs: [{ documentId: 1, status: "COMPLETED", completedAtMs: 1100 }],
    webhookJobs: [{ documentId: 1, status: "COMPLETED", retried: 0, completedAtMs: 1200 }],
    webhookCalls: [{ documentId: 1, status: "SUCCESS", responseCode: 200, createdAtMs: 1200 }],
    deliveries: [{ documentId: 1, receivedAtMs: 1300, status: 200 }],
    emailJobs: [{ envelopeId: "e1", status: "COMPLETED", completedAtMs: 1400 }],
    emails,
  });
  const expected = new Map([["e1", 1]]);

  it("is ok when the completion email of every recipient is matched once", () => {
    const v = evaluatePipeline(
      input([{ envelopeId: "e1", postedMs: 1500 }]),
      drained,
      30_000,
      expected,
    );
    assert.equal(v.ok, true, v.reasons.join("; "));
  });

  it("is a PRODUCT BUG when a recipient's completion email is missing", () => {
    const v = evaluatePipeline(input([]), drained, 30_000, expected);
    assert.equal(v.kind, "PRODUCT BUG");
    assert.match(v.reasons.join("\n"), /email missing for 1 of 1 documents/);
  });

  it("is a PRODUCT BUG when a completion email is duplicated", () => {
    const v = evaluatePipeline(
      input([
        { envelopeId: "e1", postedMs: 1500 },
        { envelopeId: "e1", postedMs: 1501 },
      ]),
      drained,
      30_000,
      expected,
    );
    assert.equal(v.kind, "PRODUCT BUG");
    assert.match(v.reasons.join("\n"), /email duplicated for 1 documents/);
  });
});
