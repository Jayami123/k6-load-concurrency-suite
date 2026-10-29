import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeBackground, type BackgroundCounts } from "../../src/load/reconcile/twenty.ts";

const even: BackgroundCounts = { created: 10, patched: 10, serverErrors: 0, limited429: 0 };

describe("twenty background reconcile", () => {
  it("equal counts give no finding", () => {
    assert.deepEqual(judgeBackground(even, { total: 10, updated: 10 }), []);
  });

  it("fewer rows than created is a PRODUCT BUG (lost write)", () => {
    const [finding] = judgeBackground(even, { total: 9, updated: 9 });
    assert.equal(finding?.kind, "PRODUCT BUG");
    assert.match(finding?.text ?? "", /lost write/);
  });

  it("more rows than created is a TEST BUG (phantom row)", () => {
    const [finding] = judgeBackground(even, { total: 11, updated: 10 });
    assert.equal(finding?.kind, "TEST BUG");
    assert.match(finding?.text ?? "", /phantom rows/);
  });

  it("patched and updated must match in both directions", () => {
    const lost = judgeBackground(even, { total: 10, updated: 8 });
    assert.deepEqual(
      lost.map((f) => f.kind),
      ["PRODUCT BUG"],
    );
    assert.match(lost[0]?.text ?? "", /lost update/);
    const extra = judgeBackground(even, { total: 10, updated: 12 });
    assert.deepEqual(
      extra.map((f) => f.kind),
      ["TEST BUG"],
    );
  });

  it("any 5xx is a SUSPECTED PRODUCT BUG", () => {
    const [finding] = judgeBackground({ ...even, serverErrors: 2 }, { total: 10, updated: 10 });
    assert.equal(finding?.kind, "PRODUCT BUG");
    assert.match(finding?.text ?? "", /SUSPECTED: 2 5xx/);
  });

  it("a 429 on a user token is a TEST BUG about the profile", () => {
    const [finding] = judgeBackground({ ...even, limited429: 1 }, { total: 10, updated: 10 });
    assert.equal(finding?.kind, "TEST BUG");
    assert.match(finding?.text ?? "", /limiter engaged on a user token/);
  });
});
