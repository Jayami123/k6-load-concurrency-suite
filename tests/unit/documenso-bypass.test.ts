import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASES } from "../../src/load/cases.ts";
import { LIMITER_ON_CASES, documensoBypassFor } from "../../src/load/documenso-bypass.ts";

describe("documenso rate limiter per case", () => {
  it("the spike and limiter cases run with the limiter on", () => {
    assert.deepEqual([...LIMITER_ON_CASES], ["P6-DOC-LOAD-004", "P6-DOC-LOAD-009"]);
    for (const id of LIMITER_ON_CASES) assert.equal(documensoBypassFor(id), "false", id);
  });

  it("every other Documenso case keeps the bypass", () => {
    const others = Object.keys(CASES).filter(
      (id) => id.startsWith("P6-DOC-") && !LIMITER_ON_CASES.includes(id),
    );
    assert.ok(others.length > 0);
    for (const id of others) assert.equal(documensoBypassFor(id), "true", id);
  });

  it("a case the mapping does not name keeps the bypass", () => {
    assert.equal(documensoBypassFor("P6-CAL-LOAD-004"), "true");
  });
});
