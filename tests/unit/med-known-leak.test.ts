import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeLeakClause } from "../../src/load/med/known-leak.ts";

const ID = "P6-OBS-MED-002";

describe("medusa cancel-race known leak", () => {
  it("reconcile excess equal to the leak is KNOWN FAIL with both counts, and the clause stays green", () => {
    const v = judgeLeakClause({
      label: "reconcile reservations",
      knownId: ID,
      leak: 4,
      observed: 4,
      onlyLeak: true,
    });
    assert.equal(v.status, "KNOWN");
    assert.equal(
      v.status === "KNOWN" ? v.text : "",
      "KNOWN FAIL P6-OBS-MED-002 (reconcile reservations: 4 = leak 4)",
    );
  });

  it("reconcile excess different from the leak fails, even under the marker", () => {
    const v = judgeLeakClause({
      label: "reconcile reservations",
      knownId: ID,
      leak: 4,
      observed: 5,
      onlyLeak: true,
    });
    assert.equal(v.status, "FAIL");
  });

  it("a live-order reservation in the cleanup fails under the marker", () => {
    const v = judgeLeakClause({
      label: "cleanup reservations",
      knownId: ID,
      leak: 4,
      observed: 5,
      onlyLeak: false,
    });
    assert.equal(v.status, "FAIL");
    assert.match(v.status === "FAIL" ? v.text : "", /PRODUCT BUG: cleanup reservations/);
  });

  it("a failed reservation delete fails under the marker even when the counts match", () => {
    const v = judgeLeakClause({
      label: "cleanup reservations",
      knownId: ID,
      leak: 4,
      observed: 4,
      onlyLeak: false,
    });
    assert.equal(v.status, "FAIL");
  });

  it("a leak of 0 under the marker fails loudly, so the marker cannot go stale", () => {
    const v = judgeLeakClause({
      label: "cleanup reservations",
      knownId: ID,
      leak: 0,
      observed: 0,
      onlyLeak: true,
    });
    assert.equal(v.status, "FAIL");
    assert.match(
      v.status === "FAIL" ? v.text : "",
      /known bug no longer reproduces: remove the known-fail marker \(P6-OBS-MED-002\)/,
    );
  });

  it("the cancel-race clause is KNOWN when the leaked count is the known count alone", () => {
    const v = judgeLeakClause({
      label: "cancel race",
      knownId: ID,
      leak: 8,
      observed: 8,
      onlyLeak: true,
    });
    assert.equal(v.status, "KNOWN");
  });

  it("without a marker any unexpected observation is a product failure, and none passes", () => {
    const fail = judgeLeakClause({
      label: "reconcile reservations",
      leak: 3,
      observed: 3,
      onlyLeak: true,
    });
    assert.equal(fail.status, "FAIL");
    assert.equal(
      fail.status === "FAIL" ? fail.text : "",
      "PRODUCT BUG: reconcile reservations: 3 unexpected",
    );
    assert.equal(
      judgeLeakClause({ label: "cleanup reservations", leak: 0, observed: 0, onlyLeak: true })
        .status,
      "PASS",
    );
  });
});
