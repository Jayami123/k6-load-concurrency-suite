import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyExactlyOnce, type SequentialDoc } from "../../src/load/doc/exactly-once.ts";

const exact = (docId: string): SequentialDoc => ({
  docId,
  seal: 1,
  failedSeal: 0,
  pendingSeal: 0,
  audit: 1,
  webhook: 1,
  webhookPayloadMatched: true,
  matchedRecipientTokens: ["t-1", "t-2"],
  recipients: 2,
});
const input = (sequential: SequentialDoc[], extra = {}) => ({
  sequential,
  pairRows: [],
  invalidReasons: [] as string[],
  testBugReasons: [] as string[],
  ...extra,
});

describe("documenso exactly-once classifier", () => {
  it("passes when every sequential document is exact and no pair duplicates", () => {
    const v = classifyExactlyOnce(input([exact("d1"), exact("d2")]));
    assert.equal(v.verdict, "PASS");
    assert.equal(v.sequentialExact, 2);
  });

  it("passes with the P6-OBS-DOC-002 count when a pair has a duplicate seal and the sequential share is exact", () => {
    const v = classifyExactlyOnce(
      input([exact("d1")], {
        pairRows: [
          { documentId: "d9", pairId: "0", kind: "seal" },
          { documentId: "d9", pairId: "0", kind: "seal" },
        ],
      }),
    );
    assert.equal(v.verdict, "PASS (P6-OBS-DOC-002 counted)");
    assert.equal(v.pairKnownDuplicates, 1);
    assert.equal(v.pairDocs, 1);
  });

  it("fails as a product bug when a sequential document has two seal jobs", () => {
    const v = classifyExactlyOnce(input([{ ...exact("d1"), seal: 2 }]));
    assert.equal(v.verdict, "FAIL (PRODUCT BUG)");
    assert.match(v.reasons[0] ?? "", /seal 2/);
  });

  it("fails as a product bug on a payload mismatch and on a recipient with two completion emails", () => {
    const payload = classifyExactlyOnce(input([{ ...exact("d1"), webhookPayloadMatched: false }]));
    assert.equal(payload.verdict, "FAIL (PRODUCT BUG)");
    const twice = classifyExactlyOnce(
      input([{ ...exact("d1"), matchedRecipientTokens: ["t-1", "t-1"] }]),
    );
    assert.equal(twice.verdict, "FAIL (PRODUCT BUG)");
    assert.match(twice.reasons.join(" "), /two completion emails/);
  });

  it("is INVALID when an invalid reason is present, even with a failing document", () => {
    const v = classifyExactlyOnce(
      input([{ ...exact("d1"), audit: 2 }], { invalidReasons: ["telemetry gap"] }),
    );
    assert.equal(v.verdict, "INVALID");
    assert.deepEqual(v.reasons, ["telemetry gap"]);
  });

  it("is TEST BUG when a test-bug reason is present, above every other outcome", () => {
    const v = classifyExactlyOnce(
      input([{ ...exact("d1"), seal: 0 }], {
        testBugReasons: ["drain timed out"],
        invalidReasons: ["telemetry gap"],
      }),
    );
    assert.equal(v.verdict, "TEST BUG");
  });
});
