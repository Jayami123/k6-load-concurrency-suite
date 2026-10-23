import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkConfirmCancel,
  checkConfirmConfirm,
  checkLinkCap,
  checkSignedDeliveries,
} from "../../src/cal/state-invariants.ts";

describe("checkLinkCap (F-C1)", () => {
  it("passes when a cap-1 link admits one booking and its counter reads 1", () => {
    const f = checkLinkCap({ cap: 1, accepted: 1, usageCount: 1, statuses: [200, 400, 400] });
    assert.deepEqual(f, { testGuards: [], suspected: [] });
  });

  it("flags F-C1 when 10 bookings are accepted through a cap-1 link", () => {
    const f = checkLinkCap({ cap: 1, accepted: 10, usageCount: 1, statuses: Array(10).fill(200) });
    assert.equal(f.suspected.length, 1);
    assert.match(
      f.suspected[0]!,
      /SUSPECTED PRODUCT BUG: link maxUsageCount 1: 10 bookings accepted.*\(F-C1\)/,
    );
  });

  it("flags F-C1 when a cap-3 counter stops at 3 but 10 bookings are accepted", () => {
    const f = checkLinkCap({ cap: 3, accepted: 10, usageCount: 3, statuses: Array(10).fill(200) });
    assert.equal(f.suspected.length, 1);
    assert.match(f.suspected[0]!, /10 bookings accepted/);
  });
});

describe("checkConfirmCancel (F-C2)", () => {
  it("passes for accepted with one BOOKING_CREATED and no cancel webhook", () => {
    const f = checkConfirmCancel({ finalStatus: "accepted", createdCount: 1, cancelledCount: 0 });
    assert.deepEqual(f.suspected, []);
  });

  it("flags F-C2 when both side-effect sets fired", () => {
    const f = checkConfirmCancel({ finalStatus: "accepted", createdCount: 1, cancelledCount: 1 });
    assert.equal(f.suspected.length, 1);
    assert.match(f.suspected[0]!, /\(F-C2\)/);
  });
});

describe("checkConfirmConfirm (F-C3)", () => {
  it("flags F-C3 when two BOOKING_CREATED webhooks arrived", () => {
    const f = checkConfirmConfirm({
      finalStatus: "accepted",
      createdCount: 2,
      statuses: [200, 200],
    });
    assert.equal(f.suspected.length, 1);
    assert.match(f.suspected[0]!, /BOOKING_CREATED 2 \(F-C3\)/);
  });
});

describe("checkSignedDeliveries", () => {
  it("flags a delivery whose signature does not match as a TEST BUG", () => {
    assert.deepEqual(checkSignedDeliveries([{ secretMatches: true }, { secretMatches: false }]), [
      "TEST BUG: 1 webhook delivery(ies) failed the x-cal-signature-256 check",
    ]);
  });
});
