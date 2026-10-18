import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isP6RunPrefix, p6RunPrefix } from "../../src/races/prefix.ts";

describe("p6RunPrefix", () => {
  it("matches the documented format", () => {
    const fixed = new Date("2026-10-18T12:49:29.000Z");
    const prefix = p6RunPrefix(fixed);
    assert.match(prefix, /^p6-qa-20261018T124929Z-[0-9a-f]{8}$/);
    assert.equal(isP6RunPrefix(prefix), true);
  });

  it("rejects invalid prefixes", () => {
    assert.equal(isP6RunPrefix("p6-qa-not-valid"), false);
  });
});
