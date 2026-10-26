import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pairCounts, pairKey } from "../../src/load/doc/pair-key.ts";

describe("documenso pair key", () => {
  it("joins the document id and the pair id", () => {
    assert.equal(pairKey("doc-7", "2"), "doc-7:2");
  });

  it("counts a duplicate seal or audit row beyond the first, and nothing for one row of each", () => {
    const counts = pairCounts([
      { documentId: "doc-7", pairId: "0", kind: "seal" },
      { documentId: "doc-7", pairId: "0", kind: "seal" },
      { documentId: "doc-7", pairId: "0", kind: "audit" },
    ]);
    assert.deepEqual(counts.get("doc-7:0"), { seal: 1, audit: 0 });
  });

  it("keeps two pairs of one document apart", () => {
    const counts = pairCounts([
      { documentId: "doc-7", pairId: "0", kind: "seal" },
      { documentId: "doc-7", pairId: "1", kind: "seal" },
    ]);
    assert.equal(counts.size, 2);
    assert.deepEqual(counts.get("doc-7:0"), { seal: 0, audit: 0 });
    assert.deepEqual(counts.get("doc-7:1"), { seal: 0, audit: 0 });
  });
});
