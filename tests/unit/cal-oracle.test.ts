import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSelectOnly } from "../../src/oracles/pg.ts";
import {
  CASE_LIVE_BOOKINGS_SQL,
  HOST_SETUP_SQL,
  SLOT_ACCEPTED_SQL,
  rowEvidence,
  toDbTimestamp,
} from "../../src/cal/oracle.ts";

describe("cal oracle SQL", () => {
  it("every query is SELECT-only", () => {
    for (const sql of [HOST_SETUP_SQL, SLOT_ACCEPTED_SQL, CASE_LIVE_BOOKINGS_SQL]) {
      assertSelectOnly(sql);
    }
  });

  it("slot query reads the Booking table with a lowercase accepted status", () => {
    assert.match(SLOT_ACCEPTED_SQL, /"Booking"/);
    assert.match(SLOT_ACCEPTED_SQL, /status = 'accepted'/);
    assert.doesNotMatch(SLOT_ACCEPTED_SQL, /ACCEPTED/);
  });
});

describe("toDbTimestamp", () => {
  it("maps the three spellings of one instant to one value", () => {
    for (const s of [
      "2026-11-03T09:00:00Z",
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T09:00:00+00:00",
    ]) {
      assert.equal(toDbTimestamp(s), "2026-11-03 09:00:00.000");
    }
  });

  it("rejects a non-UTC offset and garbage", () => {
    assert.throws(() => toDbTimestamp("2026-11-03T09:00:00+05:30"), /TEST BUG/);
    assert.throws(() => toDbTimestamp("nope"), /TEST BUG/);
  });
});

describe("rowEvidence", () => {
  it("shows id, uid and status only", () => {
    const text = rowEvidence([
      {
        id: 7,
        uid: "abc",
        status: "accepted",
        start: "2026-11-03T09:00:00.000Z",
        end: "2026-11-03T09:30:00.000Z",
      },
    ]);
    assert.match(text, /id=7 uid=abc status=accepted/);
    assert.doesNotMatch(text, /email|idempotencyKey|hasKey/);
  });
});
