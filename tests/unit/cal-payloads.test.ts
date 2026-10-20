import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attendeeEmail,
  bookingBody,
  parseBookingResponse,
  pickFreeSlot,
  slotEnd,
  timeSpellings,
} from "../../src/cal/payloads.ts";
import { LOSER_DB_REDACTED } from "../../src/cal/invariants.ts";

describe("bookingBody", () => {
  const body = bookingBody({
    start: "2026-11-03T09:00:00.000Z",
    end: "2026-11-03T09:30:00.000Z",
    email: "a@example.com",
    name: "p6 c00",
    eventTypeId: 3,
  }) as Record<string, any>;

  it("has exactly the 10 top-level keys of the §2.2 body", () => {
    assert.deepEqual(Object.keys(body).sort(), [
      "end",
      "eventTypeId",
      "eventTypeSlug",
      "hasHashedBookingLink",
      "language",
      "metadata",
      "responses",
      "start",
      "timeZone",
      "user",
    ]);
  });

  it("pins host, slug, zone and location", () => {
    assert.equal(body.user, "pro");
    assert.equal(body.eventTypeSlug, "30min");
    assert.equal(body.timeZone, "UTC");
    assert.equal(body.responses.location.value, "integrations:daily");
  });
});

describe("attendeeEmail", () => {
  it("lowercases the prefix", () => {
    assert.equal(
      attendeeEmail("P6-QA-20261020T120912Z-E0CCF836", "t1-c00"),
      "p6-qa-20261020t120912z-e0ccf836-t1-c00@example.com",
    );
  });
});

describe("slotEnd and timeSpellings", () => {
  it("adds 30 minutes and normalises to .000Z", () => {
    assert.equal(slotEnd("2026-11-03T09:00:00Z"), "2026-11-03T09:30:00.000Z");
  });

  it("writes one instant three ways", () => {
    const s = timeSpellings("2026-11-03T09:00:00Z");
    assert.deepEqual(s, [
      "2026-11-03T09:00:00Z",
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T09:00:00+00:00",
    ]);
    assert.equal(new Set(s.map((x) => Date.parse(x))).size, 1);
  });
});

describe("pickFreeSlot", () => {
  const slots = ["2026-11-03T10:00:00Z", "2026-11-03T09:00:00.000Z", "2026-11-03T08:00:00Z"];

  it("sorts, normalises, skips used and too-early slots", () => {
    const used = new Set(["2026-11-03T09:00:00.000Z"]);
    const notBefore = Date.parse("2026-11-03T08:30:00Z");
    assert.equal(pickFreeSlot(slots, used, notBefore), "2026-11-03T10:00:00.000Z");
  });

  it("returns the earliest when nothing is excluded", () => {
    assert.equal(pickFreeSlot(slots, new Set(), 0), "2026-11-03T08:00:00.000Z");
  });

  it("throws TEST BUG when empty", () => {
    assert.throws(() => pickFreeSlot([], new Set(), 0), /TEST BUG/);
    assert.throws(
      () => pickFreeSlot(slots, new Set(), Date.parse("2027-01-01T00:00:00Z")),
      /TEST BUG/,
    );
  });
});

describe("parseBookingResponse", () => {
  it("reads uid and status from a 2xx body", () => {
    const r = parseBookingResponse(200, '{"uid":"u1","status":"ACCEPTED"}');
    assert.equal(r.status, 200);
    assert.equal(r.uid, "u1");
    assert.equal(r.bodyStatus, "ACCEPTED");
  });

  it("reads the message of a redacted 400", () => {
    const r = parseBookingResponse(
      400,
      JSON.stringify({ message: LOSER_DB_REDACTED, data: { traceId: "trace_x" } }),
    );
    assert.equal(r.message, LOSER_DB_REDACTED);
    assert.equal(r.uid, null);
  });

  it("gives nulls for a network error", () => {
    const r = parseBookingResponse(null, "fetch failed");
    assert.equal(r.status, null);
    assert.equal(r.uid, null);
    assert.equal(r.message, null);
    assert.ok(r.summary.startsWith("error:"));
  });

  it("gives nulls for a non-JSON body", () => {
    const r = parseBookingResponse(502, "<html>bad gateway</html>");
    assert.deepEqual([r.uid, r.bodyStatus, r.message], [null, null, null]);
  });
});
