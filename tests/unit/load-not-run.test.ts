import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASES, TW_LOAD_005 } from "../../src/load/cases.ts";
import { gateDecision, notRunReport } from "../../src/load/not-run.ts";
import type { LoadCase } from "../../src/load/types.ts";

const gatedWith = (open: boolean): LoadCase => ({
  ...TW_LOAD_005,
  id: "P6-TEST-GATE-001",
  gated: true,
  gate: () => (open ? { open: true } : { open: false, reason: "test gate closed" }),
});

describe("gated cases (run-load)", () => {
  it("runs a gated case whose gate check is open", () => {
    assert.deepEqual(gateDecision(gatedWith(true)), { kind: "run" });
  });

  it("reports NOT RUN, never PASS, when the gate check is closed", () => {
    const decision = gateDecision(gatedWith(false));
    assert.deepEqual(decision, { kind: "not-run", reason: "test gate closed" });
    if (decision.kind !== "not-run") assert.fail("expected not-run");
    const report = notRunReport(gatedWith(false), decision.reason, "full");
    assert.match(report.console, /NOT RUN/);
    assert.doesNotMatch(report.console, /PASS/);
    assert.match(report.summary, /### P6-TEST-GATE-001: NOT RUN \(full profile/);
    assert.match(report.summary, /- gate closed: test gate closed/);
    assert.doesNotMatch(report.summary, /PASS/);
    assert.ok(
      report.summary.endsWith("\n\n"),
      "the summary ends with a blank line, as the runner's does",
    );
  });

  it("refuses a gated case that has no gate check", () => {
    const withoutGate: LoadCase = { ...TW_LOAD_005, id: "P6-TEST-GATE-002", gated: true };
    assert.deepEqual(gateDecision(withoutGate), { kind: "refuse" });
  });

  it("keeps P6-TW-LOAD-008 and -010 refused", () => {
    assert.equal(CASES["P6-TW-LOAD-008"]?.gated, true);
    assert.deepEqual(gateDecision(CASES["P6-TW-LOAD-008"]!), { kind: "refuse" });
    assert.equal(CASES["P6-TW-LOAD-010"]?.gated, true);
    assert.deepEqual(gateDecision(CASES["P6-TW-LOAD-010"]!), { kind: "refuse" });
  });

  it("runs P6-TW-LOAD-011 and -009 while their gates are open", () => {
    for (const id of ["P6-TW-LOAD-011", "P6-TW-LOAD-009"]) {
      assert.equal(CASES[id]?.gated, true, `${id} is gated`);
      assert.deepEqual(gateDecision(CASES[id]!), { kind: "run" }, `${id} gate is open`);
    }
  });

  it("leaves an ungated case unchanged", () => {
    for (const id of ["P6-TW-LOAD-005", "P6-TW-LOAD-006"]) {
      assert.equal(CASES[id]?.gated, undefined, `${id} is not gated`);
      assert.deepEqual(gateDecision(CASES[id]!), { kind: "run" });
    }
  });
});
