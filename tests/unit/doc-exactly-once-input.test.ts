import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExactlyOnceInput,
  exactlyOnceVerdictOf,
  type DocRows,
  type IterationLine,
} from "../../src/load/doc/exactly-once-input.ts";

/** One document that is exact: one COMPLETED seal, one audit row, one webhook call, one token per recipient. */
const exact = (documentId: number, tokens = ["t1", "t2"]): DocRows => ({
  envelopeId: `env-${documentId}`,
  documentId,
  recipients: 2,
  sealStatuses: ["COMPLETED"],
  audit: 1,
  webhookEnvelopeIds: [`env-${documentId}`],
  webhookStatuses: ["SENT"],
  matchedTokens: tokens,
});

const seq = (documentId: number): IterationLine => ({
  intent: `p6-qa-x-i${documentId} sequential`,
  pairId: null,
  documentId,
  completed: true,
  failedStep: null,
});
const pair = (documentId: number, pairId: string): IterationLine => ({
  intent: `p6-qa-x-i${documentId} pair`,
  pairId,
  documentId,
  completed: true,
  failedStep: null,
});

describe("exactly-once input", () => {
  it("joins a clean sequential document and a pair document into a PASS with no invalid reason", () => {
    const input = buildExactlyOnceInput({
      docs: [exact(1), exact(2)],
      lines: [seq(1), pair(2, "0")],
      droppedIterations: 0,
    });
    assert.deepEqual(input.invalidReasons, []);
    assert.deepEqual(input.testBugReasons, []);
    assert.equal(input.sequential.length, 1);
    assert.equal(exactlyOnceVerdictOf(input).verdict, "PASS");
  });

  it("counts a duplicate seal in a pair as a known bug, not a failure", () => {
    const dup: DocRows = { ...exact(2), sealStatuses: ["COMPLETED", "COMPLETED"] };
    const input = buildExactlyOnceInput({
      docs: [exact(1), dup],
      lines: [seq(1), pair(2, "0")],
      droppedIterations: 0,
    });
    assert.equal(exactlyOnceVerdictOf(input).verdict, "PASS (P6-OBS-DOC-002 counted)");
  });

  it("reports a missing sequential document row as an L9 mismatch, INVALID and never a pass", () => {
    const input = buildExactlyOnceInput({
      docs: [exact(1)],
      lines: [seq(1), seq(2)],
      droppedIterations: 0,
    });
    assert.ok(
      input.invalidReasons.some((r) => r.startsWith("iteration") && r.includes("no document row")),
    );
    assert.equal(exactlyOnceVerdictOf(input).verdict, "INVALID");
  });

  it("treats an iteration that did not complete and a dropped iteration as INVALID", () => {
    const failed: IterationLine = { ...seq(1), completed: false, failedStep: "distribute" };
    const input = buildExactlyOnceInput({
      docs: [exact(1)],
      lines: [failed],
      droppedIterations: 2,
    });
    assert.ok(input.invalidReasons.some((r) => r.includes("did not complete")));
    assert.ok(input.invalidReasons.includes("2 dropped iteration(s)"));
    assert.equal(exactlyOnceVerdictOf(input).verdict, "INVALID");
  });

  it("reports a run with no P6_DOC lines as a TEST BUG", () => {
    const input = buildExactlyOnceInput({ docs: [exact(1)], lines: [], droppedIterations: 0 });
    assert.ok(input.testBugReasons.some((r) => r.startsWith("TEST BUG: no P6_DOC")));
    assert.equal(exactlyOnceVerdictOf(input).verdict, "TEST BUG");
  });
});
