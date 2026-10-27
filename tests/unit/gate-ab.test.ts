import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { abGate, type GateInput } from "../../src/load/gate/ab-gate.ts";

const base: GateInput = {
  caseId: "P6-MED-LOAD-002",
  aMedians: [10, 10, 10],
  bMedians: [10, 10, 10],
  toleranceRel: 0.2,
  auditOk: true,
};

describe("a/b gate decision", () => {
  it("passes when one B arm is noisy but another is within the tolerance (no single-arm failure)", () => {
    const v = abGate({ ...base, bMedians: [13, 11, 13] });
    assert.equal(v.verdict, "PASS");
    assert.deepEqual(v.reasons, []);
  });

  it("fails with REGRESSION only when every B arm is above 1 + tolerance", () => {
    const v = abGate({ ...base, bMedians: [13, 13.5, 12.9] });
    assert.equal(v.verdict, "FAIL (REGRESSION)");
    assert.equal(v.ratios.length, 3);
  });

  it("is INVALID with no_reference when the tolerance is missing, and INVALID with fewer than three arms", () => {
    const none = abGate({ ...base, toleranceRel: undefined, bMedians: [13, 13, 13] });
    assert.equal(none.verdict, "INVALID");
    assert.match(none.reasons[0]!, /no_reference/);
    const two = abGate({ ...base, bMedians: [13, 13] });
    assert.equal(two.verdict, "INVALID");
  });

  it("reports a failed audit as PRODUCT BUG, and a zero A median as TEST BUG", () => {
    const audit = abGate({ ...base, bMedians: [13, 13, 13], auditOk: false });
    assert.equal(audit.verdict, "FAIL (PRODUCT BUG)");
    const zero = abGate({ ...base, aMedians: [0, 10, 10], bMedians: [13, 13, 13] });
    assert.equal(zero.verdict, "TEST BUG");
  });
});
