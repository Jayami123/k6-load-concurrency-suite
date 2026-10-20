import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSelectOnly } from "../../src/oracles/pg.ts";
import {
  CASE_LIVE_BOOKINGS_SQL,
  HOST_SETUP_SQL,
  OVERLAP_PAIRS_SQL,
  SLOT_ACCEPTED_SQL,
  WINDOW_ACCEPTED_SQL,
  pairEvidence,
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

describe("overlap SQL", () => {
  it("is SELECT-only, has no CTE and uses the half-open predicate", () => {
    assertSelectOnly(OVERLAP_PAIRS_SQL);
    assertSelectOnly(WINDOW_ACCEPTED_SQL);
    assert.doesNotMatch(OVERLAP_PAIRS_SQL, /^\s*WITH/i);
    assert.match(OVERLAP_PAIRS_SQL, /a\.id < b\.id/);
    assert.match(
      OVERLAP_PAIRS_SQL,
      /a\."startTime" < b\."endTime" AND b\."startTime" < a\."endTime"/,
    );
    assert.match(OVERLAP_PAIRS_SQL, /a\.status = 'accepted' AND b\.status = 'accepted'/);
    assert.equal((OVERLAP_PAIRS_SQL.match(/email LIKE \$2/g) ?? []).length, 2);
  });

  it("pairEvidence shows ids, uids, event types and times only", () => {
    const text = pairEvidence([
      {
        aId: 1261,
        aUid: "u1",
        aEventTypeId: 3,
        aStart: "2026-11-30T09:00:00.000Z",
        aEnd: "2026-11-30T09:30:00.000Z",
        bId: 1262,
        bUid: "u2",
        bEventTypeId: 4,
        bStart: "2026-11-30T09:00:00.000Z",
        bEnd: "2026-11-30T10:00:00.000Z",
      },
    ]);
    assert.equal(
      text,
      "1261/u1(et3 2026-11-30T09:00:00.000Z..2026-11-30T09:30:00.000Z) x 1262/u2(et4 2026-11-30T09:00:00.000Z..2026-11-30T10:00:00.000Z)",
    );
    assert.doesNotMatch(text, /email|@/);
  });
});
