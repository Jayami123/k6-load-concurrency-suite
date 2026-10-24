import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeKnownBugGate, type GateCheck } from "../../src/load/known-bug-gate.ts";

const DUP = ["one-seal-per-document", "one-completed-audit-row", "one-email-per-recipient"];

/** The retry judgement of a run with the duplicate seal: the storm and the hard checks pass, the duplicate checks fail. */
function duplicateRun(over: Partial<Record<string, boolean>> = {}): GateCheck[] {
  const hard = ["storm", "no-5xx", "document-completed", "recipients-signed"].map((name) => ({
    name,
    ok: over[name] ?? true,
    kind: "PRODUCT BUG" as const,
    detail: name,
  }));
  const dup = DUP.map((name) => ({
    name,
    ok: over[name] ?? false,
    kind: "PRODUCT BUG" as const,
    detail: `${name} duplicated`,
  }));
  return [...hard, ...dup];
}

describe("known bug gate", () => {
  it("a declared known bug that is observed, with nothing else wrong, passes as KNOWN BUG", () => {
    const r = judgeKnownBugGate({
      declared: ["P6-OBS-DOC-005"],
      checks: duplicateRun(),
      hasAudit: true,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.observed["P6-OBS-DOC-005"], DUP);
    assert.match(r.reasons[0] ?? "", /^KNOWN BUG P6-OBS-DOC-005 observed/);
  });

  it("a declared known bug that is not observed fails: the product is fixed, the marker must go", () => {
    const r = judgeKnownBugGate({
      declared: ["P6-OBS-DOC-005"],
      checks: duplicateRun(Object.fromEntries(DUP.map((n) => [n, true]))),
      hasAudit: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.kind, "TEST BUG");
    assert.match(r.reasons[0] ?? "", /not observed/);
  });

  it("any other violation next to the known bug fails as PRODUCT BUG", () => {
    const r = judgeKnownBugGate({
      declared: ["P6-OBS-DOC-005"],
      checks: duplicateRun({ "no-5xx": false }),
      hasAudit: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.kind, "PRODUCT BUG");
    assert.ok(r.reasons.some((x) => x.includes("no-5xx")));
  });

  it("a missing audit fails as TEST BUG", () => {
    const r = judgeKnownBugGate({
      declared: ["P6-OBS-DOC-005"],
      checks: duplicateRun(),
      hasAudit: false,
    });
    assert.equal(r.ok, false);
    assert.equal(r.kind, "TEST BUG");
    assert.match(r.reasons[0] ?? "", /audit.json is missing/);
  });
});
