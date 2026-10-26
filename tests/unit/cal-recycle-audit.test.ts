import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCalRecycleAudit } from "../../src/load/reconcile/cal.ts";

const PREFIX = "p6-qa-test%";

describe("cal recycle audit", () => {
  it("passes when every accepted booking is cancelled once and none stays live", () => {
    const r = evaluateCalRecycleAudit(
      { cancelled: 5, live: 0, overlapPairs: 0, clientAccepted: 5, cancelsOk: 5 },
      PREFIX,
    );
    assert.deepEqual(r.violations, []);
    assert.ok(r.checks.every((c) => c.ok));
    assert.equal(r.rowsSeen, 5);
  });

  it("reports a booking still live after its cancel, and a count mismatch, as PRODUCT BUG", () => {
    const r = evaluateCalRecycleAudit(
      { cancelled: 4, live: 1, overlapPairs: 0, clientAccepted: 5, cancelsOk: 5 },
      PREFIX,
    );
    const texts = r.violations.map((v) => `${v.kind}: ${v.text}`);
    assert.ok(
      texts.some((t) => t.startsWith("PRODUCT BUG") && t.includes("still live")),
      texts.join("\n"),
    );
    assert.ok(
      texts.some((t) => t.includes("client was told ACCEPTED for 5 bookings")),
      texts.join("\n"),
    );
  });

  it("reports an audit that sees no bookings as a TEST BUG", () => {
    const r = evaluateCalRecycleAudit({ cancelled: 0, live: 0, overlapPairs: 0 }, PREFIX);
    assert.equal(r.violations.length, 1);
    assert.equal(r.violations[0]!.kind, "TEST BUG");
    assert.match(r.violations[0]!.text, /audit saw no bookings/);
  });
});
