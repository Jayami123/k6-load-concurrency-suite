import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reserveSlotGate } from "../../src/load/gates/cal-hold.ts";

describe("cal slot-hold gate", () => {
  it("fails with the evidence when no journey or case calls reserveSlot", () => {
    const r = reserveSlotGate({ "k6/journeys/cal-book.js": "getSchedule(); POST /api/book/event" });
    assert.equal(r.passes, false);
    assert.equal(r.evidence, "the Cal journey calls getSchedule and POST /api/book/event only");
  });

  it("passes and names the file when a journey calls reserveSlot", () => {
    const r = reserveSlotGate({ "k6/journeys/cal-book.js": "reserveSlot(slot)" });
    assert.equal(r.passes, true);
    assert.equal(r.evidence, "reserveSlot is called in k6/journeys/cal-book.js");
  });
});
