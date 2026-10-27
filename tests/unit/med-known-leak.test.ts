import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeLeak } from "../../src/load/med/known-leak.ts";

const ID = "P6-OBS-MED-002";

describe("medusa cancel-race known leak", () => {
  it("a leak present under the marker is KNOWN FAIL with its count, and the case stays green", () => {
    const v = judgeLeak({ leaked: 8, otherFailing: false, knownId: ID });
    assert.equal(v.status, "KNOWN");
    assert.match(
      v.status === "KNOWN" ? v.text : "",
      /^KNOWN FAIL P6-OBS-MED-002: 8 canceled order\(s\)/,
    );
  });

  it("a leak of 0 under the marker fails loudly, so the marker cannot go stale", () => {
    const v = judgeLeak({ leaked: 0, otherFailing: false, knownId: ID });
    assert.equal(v.status, "FAIL");
    assert.match(
      v.status === "FAIL" ? v.text : "",
      /known bug no longer reproduces: remove the known-fail marker/,
    );
  });

  it("a leak with another failing clause fails, even under the marker", () => {
    const v = judgeLeak({ leaked: 8, otherFailing: true, knownId: ID });
    assert.equal(v.status, "FAIL");
  });

  it("without a marker a leak is a product failure, and no leak passes", () => {
    assert.equal(judgeLeak({ leaked: 3, otherFailing: false }).status, "FAIL");
    assert.equal(judgeLeak({ leaked: 0, otherFailing: false }).status, "PASS");
  });
});
