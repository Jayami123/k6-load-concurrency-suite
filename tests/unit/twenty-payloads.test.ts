import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyName, freshPassword, throwawayAddress } from "../../src/twenty/payloads.ts";

describe("twenty race payloads", () => {
  it("companyName keeps the prefix and the side, and is stable", () => {
    assert.equal(companyName("p6-qa-x", 3, "A"), "p6-qa-x-3-A");
    assert.equal(companyName("p6-qa-x", 3, "A"), companyName("p6-qa-x", 3, "A"));
  });

  it("throwawayAddress starts with the lower-cased prefix and differs between calls", () => {
    const a = throwawayAddress("P6-QA-X", 1);
    assert.ok(a.startsWith("p6-qa-x-t1-"));
    assert.ok(a.endsWith("@apple.dev"));
    assert.notEqual(a, throwawayAddress("P6-QA-X", 1));
  });

  it("freshPassword is long enough and different on every call", () => {
    const p = freshPassword();
    assert.ok(p.length >= 16);
    assert.notEqual(p, freshPassword());
  });
});
