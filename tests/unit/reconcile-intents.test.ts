import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditByIntent, parseIntentLog, type IntentLog } from "../../src/load/knee/intents.ts";

const LINE = (intent: number, outcome: string, extra = "") =>
  `msg="${`{"intent":${intent},"outcome":"${outcome}"${extra}}`.replace(/"/g, '\\"')}" source=console`;

function log(lines: string[], started: number): IntentLog {
  return parseIntentLog(lines.join("\n"), started);
}

function rows(entries: Array<[number, number]>): Map<number, number> {
  return new Map(entries);
}

describe("reconcile per intent", () => {
  it("a duplicate that the old count slack would have hidden is a finding", () => {
    const l = log([LINE(0, "ok"), LINE(1, "ok")], 2);
    const a = auditByIntent({
      started: 2,
      log: l,
      rowsByIntent: rows([
        [0, 1],
        [1, 2],
      ]),
      ghostRows: 0,
      interrupted: 5,
    });
    assert.equal(a.counts.duplicateRows, 1);
    assert.ok(a.findings.some((f) => f.kind === "PRODUCT BUG" && /duplicate/.test(f.text)));
  });

  it("a ghost row is a finding: an intent never started, or a label that maps to no intent", () => {
    const l = log([LINE(0, "ok")], 1);
    const never = auditByIntent({
      started: 1,
      log: l,
      rowsByIntent: rows([
        [0, 1],
        [7, 1],
      ]),
      ghostRows: 0,
      interrupted: 0,
    });
    assert.ok(never.findings.some((f) => /ghost/.test(f.text)));
    const label = auditByIntent({
      started: 1,
      log: l,
      rowsByIntent: rows([[0, 1]]),
      ghostRows: 2,
      interrupted: 0,
    });
    assert.equal(label.counts.ghostRows, 2);
    assert.ok(label.findings.some((f) => /ghost/.test(f.text)));
  });

  it("an indeterminate intent with 0 or 1 row passes", () => {
    const l = log([LINE(0, "fail", ',"net":true')], 2);
    const none = auditByIntent({
      started: 2,
      log: l,
      rowsByIntent: rows([]),
      ghostRows: 0,
      interrupted: 1,
    });
    assert.equal(none.findings.length, 0, JSON.stringify(none.findings));
    const one = auditByIntent({
      started: 2,
      log: l,
      rowsByIntent: rows([[0, 1]]),
      ghostRows: 0,
      interrupted: 1,
    });
    assert.equal(one.findings.length, 0, JSON.stringify(one.findings));
    assert.equal(one.counts.indeterminate, 2);
  });

  it("an ok intent with 0 rows is a finding", () => {
    const l = log([LINE(0, "ok")], 1);
    const a = auditByIntent({
      started: 1,
      log: l,
      rowsByIntent: rows([]),
      ghostRows: 0,
      interrupted: 0,
    });
    assert.ok(a.findings.some((f) => /told ok but has no row/.test(f.text)));
  });

  it("a fail intent with 1 row is counted under the known bug only with failWithRowKnownBugId and ghost: true", () => {
    const l = log([LINE(0, "fail", ',"ghost":true')], 1);
    const known = auditByIntent({
      started: 1,
      log: l,
      rowsByIntent: rows([[0, 1]]),
      ghostRows: 0,
      interrupted: 0,
      failWithRowKnownBugId: "F-M2",
    });
    assert.deepEqual(
      known.findings.map((f) => f.knownBugId),
      ["F-M2"],
    );
  });

  it("a fail intent with 1 row and no ghost flag is a finding, even when failWithRowKnownBugId is set", () => {
    const l = log([LINE(0, "fail")], 1);
    const plain = auditByIntent({
      started: 1,
      log: l,
      rowsByIntent: rows([[0, 1]]),
      ghostRows: 0,
      interrupted: 0,
      failWithRowKnownBugId: "F-M2",
    });
    assert.equal(plain.findings.length, 1);
    assert.equal(plain.findings[0]!.knownBugId, undefined);
    assert.equal(plain.findings[0]!.kind, "PRODUCT BUG");
  });

  it("more intents with no line than interrupted is a TEST BUG", () => {
    const l = log([], 3);
    const a = auditByIntent({
      started: 3,
      log: l,
      rowsByIntent: rows([]),
      ghostRows: 0,
      interrupted: 2,
    });
    assert.ok(a.findings.some((f) => f.kind === "TEST BUG" && /no outcome line/.test(f.text)));
    const within = auditByIntent({
      started: 3,
      log: l,
      rowsByIntent: rows([]),
      ghostRows: 0,
      interrupted: 3,
    });
    assert.equal(within.findings.length, 0);
  });
});
