import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeCalLinkJoin, type JoinIntent } from "../../src/load/retry-audit/cal.ts";

const intent = (over: Partial<JoinIntent> = {}): JoinIntent => ({
  n: 0,
  email: "p6-qa-x-p6-cal-load-009-i0@example.com",
  link: "p6-qa-x-p6-cal-load-009-t0",
  usageBefore: 0,
  usageAfter: 1,
  bookings: [
    { id: 10, uid: "uid-10", status: "accepted", email: "p6-qa-x-p6-cal-load-009-i0@example.com" },
  ],
  ...over,
});

describe("retry audit: cal link join", () => {
  it("a booking with its link used once is clean", () => {
    const j = judgeCalLinkJoin([intent()]);
    assert.equal(j.rows[0]?.flag, "ok");
    assert.equal(j.rows[0]?.usedBy, 1);
    assert.ok(j.findings.every((f) => f.ok));
  });

  it("an accepted booking whose link shows no use is a PRODUCT BUG (SUSPECTED), named by its intent", () => {
    const j = judgeCalLinkJoin([intent({ usageAfter: 0 })]);
    assert.equal(j.rows[0]?.flag, "no-link-use");
    const f = j.findings.find((x) => x.check === "link-join-no-link-use");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.match(f?.detail ?? "", /rows: 0/);
  });

  it("a link used twice in one run is a PRODUCT BUG (SUSPECTED; related to F-C1)", () => {
    const j = judgeCalLinkJoin([intent({ usageAfter: 2 })]);
    assert.equal(j.rows[0]?.flag, "link-used-twice");
    const f = j.findings.find((x) => x.check === "link-join-used-twice");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.match(f?.detail ?? "", /F-C1/);
  });
});
