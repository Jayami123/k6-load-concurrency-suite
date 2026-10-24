import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCalAudit, type CalSnapshot } from "../../src/load/reconcile/cal.ts";

const clean: CalSnapshot = { liveBookings: 5, nonAccepted: 0, overlapPairs: 0, clientAccepted: 5 };
const SCOPE = "p6-qa-20261024t010203z-3fa9c0d1-cal-load-001-%";

describe("cal reconciliation", () => {
  it("a clean snapshot passes with no violations and no known bugs", () => {
    const r = evaluateCalAudit(clean, SCOPE);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.knownBugs, {});
    assert.equal(
      r.checks.every((c) => c.ok),
      true,
    );
  });

  it("an overlap pair is counted under P6-OBS-CAL-002, not a violation", () => {
    const r = evaluateCalAudit({ ...clean, overlapPairs: 2 }, SCOPE);
    assert.equal(r.knownBugs["P6-OBS-CAL-002"], 2);
    assert.deepEqual(r.violations, []);
  });

  it("the client told 5 ACCEPTED while the database holds 4 is a PRODUCT BUG", () => {
    const r = evaluateCalAudit({ ...clean, liveBookings: 4, clientAccepted: 5 }, SCOPE);
    assert.ok(
      r.violations.some((v) =>
        /client was told ACCEPTED for 5 bookings, the database holds 4/.test(v.text),
      ),
    );
  });

  it("the database holding more than the client was told is also a PRODUCT BUG", () => {
    const r = evaluateCalAudit({ ...clean, liveBookings: 6, clientAccepted: 5 }, SCOPE);
    assert.equal(r.violations.length >= 1, true);
    assert.equal(r.violations[0]!.kind, "PRODUCT BUG");
  });

  it("zero bookings is a TEST BUG (the scope saw nothing)", () => {
    const r = evaluateCalAudit({ liveBookings: 0, nonAccepted: 0, overlapPairs: 0 }, SCOPE);
    assert.equal(r.violations[0]!.kind, "TEST BUG");
    assert.match(r.violations[0]!.text, /scope LIKE/);
  });

  it("a booking that is not accepted is a PRODUCT BUG", () => {
    const r = evaluateCalAudit({ ...clean, nonAccepted: 1 }, SCOPE);
    assert.ok(r.violations.some((v) => /pending or in another live state/.test(v.text)));
  });

  it("the checks come in the fixed order", () => {
    const r = evaluateCalAudit(clean, SCOPE);
    assert.deepEqual(
      r.checks.map((c) => c.name),
      ["rows", "accepted-only", "client-matches-db", "no-overlap"],
    );
  });
});
