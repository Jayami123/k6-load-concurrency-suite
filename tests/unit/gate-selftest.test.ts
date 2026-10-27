import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkSelftest,
  SELFTEST_EXPECTED,
  SELFTEST_TOLERANCE,
} from "../../src/load/gate/selftest.ts";

describe("gate self-test expectations (P6-X-LOAD-008)", () => {
  it("passes only when the slowed candidate fails as a regression and the unchanged one passes, with the fixed test tolerance", () => {
    assert.equal(SELFTEST_TOLERANCE, 0.2);
    assert.deepEqual(SELFTEST_EXPECTED, { slowed: "FAIL (REGRESSION)", unchanged: "PASS" });
    assert.equal(checkSelftest("FAIL (REGRESSION)", "PASS").ok, true);
    assert.equal(checkSelftest("PASS", "PASS").ok, false);
    assert.equal(checkSelftest("FAIL (REGRESSION)", "FAIL (REGRESSION)").ok, false);
  });
});
