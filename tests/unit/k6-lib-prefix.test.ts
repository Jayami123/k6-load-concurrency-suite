import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertRunPrefix,
  attendeeEmail,
  caseDataPrefix,
  iterationId,
} from "../../k6/lib/pure/prefix.js";

const PREFIX = "p6-qa-20261024T010203Z-3fa9c0d1";

describe("k6 lib prefix", () => {
  it("accepts a real run prefix", () => {
    assert.equal(assertRunPrefix(PREFIX), PREFIX);
  });

  it("rejects anything that is not a run prefix", () => {
    for (const bad of [
      "p6-qa-2026",
      "P6-qa-20261024T010203Z-3fa9c0d1",
      "p6-qa-20261024T010203Z-3FA9C0D1",
    ]) {
      assert.throws(() => assertRunPrefix(bad), /not a P6 run prefix/);
    }
  });

  it("caseDataPrefix is lower-case [a-z0-9-]", () => {
    const p = caseDataPrefix(PREFIX, "P6-X-LOAD-001");
    assert.equal(p, "p6-qa-20261024t010203z-3fa9c0d1-p6-x-load-001");
    assert.match(p, /^[a-z0-9-]+$/);
  });

  it("iterationId and attendeeEmail build the expected names", () => {
    assert.equal(iterationId("p6-x", 7), "p6-x-i7");
    assert.equal(attendeeEmail("p6-x", "a1"), "p6-x-a1@example.com");
  });
});
