import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOSER_BOOKING_CONFLICT,
  LOSER_DB_REDACTED,
  LOSER_SLOT_TAKEN,
  checkIdenticalSlotInvariants,
  checkOverlapPairGuards,
  checkSequentialRefusal,
  classifyLoser,
  classifyOverlapLoser,
  doubleBookSummary,
  nonConflictLosers,
  overlapViolations,
  refusedLegs,
  type AcceptedRow,
  type ParsedResponse,
} from "../../src/cal/invariants.ts";
import type { SlotRow } from "../../src/cal/oracle.ts";

const win = (uid = "u1"): ParsedResponse => ({
  status: 200,
  uid,
  bodyStatus: "ACCEPTED",
  message: null,
  summary: `200: ${uid}`,
});
const lose = (status: number, message: string): ParsedResponse => ({
  status,
  uid: null,
  bodyStatus: null,
  message,
  summary: `${status}: ${message}`,
});
const redacted = () => lose(400, LOSER_DB_REDACTED);
const taken = () => lose(409, LOSER_SLOT_TAKEN);
const row = (uid: string, hasKey = true): AcceptedRow => ({
  id: 1,
  uid,
  status: "accepted",
  start: "2026-11-03T09:00:00.000Z",
  end: "2026-11-03T09:30:00.000Z",
  hasKey,
});

function check(
  responses: ParsedResponse[],
  accepted: AcceptedRow[],
  extra: { n?: number; spread?: number; limit?: number } = {},
): string[] {
  return checkIdenticalSlotInvariants({
    n: extra.n ?? responses.length,
    responses,
    accepted,
    dispatchSpreadMs: extra.spread ?? 1,
    spreadLimit: extra.limit ?? 20,
  });
}

const many = (f: () => ParsedResponse, k: number) => Array.from({ length: k }, f);

describe("classifyLoser", () => {
  it("knows the three allowed losers", () => {
    assert.equal(classifyLoser(409, LOSER_SLOT_TAKEN), "slot-taken");
    assert.equal(classifyLoser(409, LOSER_BOOKING_CONFLICT), "booking-conflict");
    assert.equal(classifyLoser(400, LOSER_DB_REDACTED), "db-unique-redacted");
  });

  it("everything else is unexpected", () => {
    assert.equal(classifyLoser(400, "other"), "unexpected");
    assert.equal(classifyLoser(409, "other"), "unexpected");
    assert.equal(classifyLoser(422, LOSER_SLOT_TAKEN), "unexpected");
    assert.equal(classifyLoser(null, null), "unexpected");
  });
});

describe("checkIdenticalSlotInvariants", () => {
  it("passes one winner, 19 redacted losers, one keyed row", () => {
    assert.deepEqual(check([win(), ...many(redacted, 19)], [row("u1")]), []);
  });

  it("passes mixed allowed losers", () => {
    assert.deepEqual(check([win(), ...many(taken, 10), ...many(redacted, 9)], [row("u1")]), []);
  });

  it("flags two accepted rows with both uids", () => {
    const v = check([win(), ...many(redacted, 19)], [row("u1"), { ...row("u2"), id: 2 }]);
    assert.equal(v.length, 1);
    assert.match(v[0]!, /PRODUCT BUG.*2 ACCEPTED/);
    assert.match(v[0]!, /u1/);
    assert.match(v[0]!, /u2/);
  });

  it("flags zero accepted rows", () => {
    const v = check([win(), ...many(redacted, 19)], []);
    assert.ok(v.some((x) => /PRODUCT BUG.*no ACCEPTED/.test(x)));
  });

  it("flags a 500 and a network error", () => {
    const five = { ...lose(500, "boom"), summary: "500: boom" };
    const v500 = check([win(), five, ...many(redacted, 18)], [row("u1")]);
    assert.ok(v500.some((x) => /PRODUCT BUG.*500/.test(x)));
    const net: ParsedResponse = {
      status: null,
      uid: null,
      bodyStatus: null,
      message: null,
      summary: "error: x",
    };
    const vNet = check([win(), net, ...many(redacted, 18)], [row("u1")]);
    assert.ok(vNet.some((x) => /PRODUCT BUG.*error/.test(x)));
  });

  it("flags two 2xx for one row", () => {
    const v = check([win(), win(), ...many(redacted, 18)], [row("u1")]);
    assert.ok(v.some((x) => /PRODUCT BUG.*2 HTTP 2xx/.test(x)));
  });

  it("flags a winner uid that is not the DB row", () => {
    const v = check([win("u9"), ...many(redacted, 19)], [row("u1")]);
    assert.ok(v.some((x) => /PRODUCT BUG.*winner uid/.test(x)));
  });

  it("flags a missing idempotencyKey", () => {
    const v = check([win(), ...many(redacted, 19)], [row("u1", false)]);
    assert.ok(v.some((x) => /PRODUCT BUG.*idempotencyKey/.test(x)));
  });

  it("calls a 422 a TEST BUG and a 429 ENV", () => {
    const v422 = check([win(), lose(422, "bad"), ...many(redacted, 18)], [row("u1")]);
    assert.ok(v422.some((x) => /TEST BUG.*unexpected loser/.test(x)));
    const v429 = check([win(), lose(429, "slow down"), ...many(redacted, 18)], [row("u1")]);
    assert.ok(v429.some((x) => x.startsWith("ENV")));
  });

  it("flags spread at or above the limit", () => {
    const v = check([win(), ...many(redacted, 19)], [row("u1")], { spread: 21, limit: 20 });
    assert.ok(v.some((x) => /TEST BUG.*dispatchSpreadMs/.test(x)));
  });

  it("flags a wrong response count", () => {
    const v = check([win(), ...many(redacted, 18)], [row("u1")], { n: 20 });
    assert.ok(v.some((x) => /TEST BUG.*expected 20 responses/.test(x)));
  });
});

describe("nonConflictLosers", () => {
  it("counts redacted losers, not 409s and not the winner", () => {
    const all = [win(), taken(), lose(409, LOSER_BOOKING_CONFLICT), redacted(), redacted()];
    assert.equal(nonConflictLosers(all).length, 2);
  });
});

const slotRow = (uid: string): SlotRow => ({
  id: 1,
  uid,
  status: "accepted",
  start: "2026-11-30T09:00:00.000Z",
  end: "2026-11-30T10:00:00.000Z",
});

function guards(
  responses: ParsedResponse[],
  rows: SlotRow[],
  extra: { spread?: number; limit?: number } = {},
): string[] {
  return checkOverlapPairGuards({
    responses,
    windowAccepted: rows,
    dispatchSpreadMs: extra.spread ?? 1,
    spreadLimit: extra.limit ?? 20,
  });
}

describe("checkOverlapPairGuards", () => {
  it("accepts two winners that are both in the window (the race bug is not a guard)", () => {
    assert.deepEqual(guards([win("u1"), win("u2")], [slotRow("u1"), slotRow("u2")]), []);
  });

  it("accepts one winner and an allowed 409 loser", () => {
    assert.deepEqual(guards([win("u1"), taken()], [slotRow("u1")]), []);
    assert.deepEqual(guards([win("u1"), lose(409, LOSER_BOOKING_CONFLICT)], [slotRow("u1")]), []);
  });

  it("a redacted db 400 on one leg is a refused leg, not a guard violation", () => {
    assert.deepEqual(guards([win("u1"), redacted()], [slotRow("u1")]), []);
    assert.deepEqual(guards([redacted(), win("u1")], [slotRow("u1")]), []);
  });

  it("two refused legs still mean no booking was accepted", () => {
    const v = guards([redacted(), redacted()], []);
    assert.ok(v.some((x) => /PRODUCT BUG.*no booking accepted/.test(x)));
  });

  it("a 400 with another message is still an unexpected loser", () => {
    const v = guards([win("u1"), lose(400, "Bad Request")], [slotRow("u1")]);
    assert.ok(v.some((x) => /TEST BUG.*unexpected loser/.test(x)));
  });

  it("flags a 422 as TEST BUG and a 429 as ENV", () => {
    assert.ok(
      guards([win("u1"), lose(422, "bad")], [slotRow("u1")]).some((x) =>
        /TEST BUG.*unexpected loser/.test(x),
      ),
    );
    assert.ok(
      guards([win("u1"), lose(429, "slow")], [slotRow("u1")]).some((x) => x.startsWith("ENV")),
    );
  });

  it("flags a 500 and a network error", () => {
    const five = { ...lose(500, "boom"), summary: "500: boom" };
    assert.ok(guards([five, win("u1")], [slotRow("u1")]).some((x) => /PRODUCT BUG.*500/.test(x)));
    const net: ParsedResponse = {
      status: null,
      uid: null,
      bodyStatus: null,
      message: null,
      summary: "error: x",
    };
    assert.ok(guards([net, win("u1")], [slotRow("u1")]).some((x) => /PRODUCT BUG.*error/.test(x)));
  });

  it("flags no winner", () => {
    const v = guards([taken(), taken()], []);
    assert.ok(v.some((x) => /PRODUCT BUG.*no booking accepted/.test(x)));
  });

  it("flags HTTP 2xx count != DB rows", () => {
    const v = guards([win("u1"), win("u2")], [slotRow("u1")]);
    assert.ok(v.some((x) => /PRODUCT BUG.*HTTP 2xx 2 != DB accepted 1/.test(x)));
  });

  it("flags a winner uid that is not in the rows", () => {
    const v = guards([win("u9"), taken()], [slotRow("u1")]);
    assert.ok(v.some((x) => /PRODUCT BUG.*not an ACCEPTED row/.test(x)));
  });

  it("flags spread at the limit", () => {
    const v = guards([win("u1"), taken()], [slotRow("u1")], { spread: 20, limit: 20 });
    assert.ok(v.some((x) => /TEST BUG.*dispatchSpreadMs/.test(x)));
  });

  it("flags a wrong response count", () => {
    const v = guards([win("u1")], [slotRow("u1")]);
    assert.ok(v.some((x) => /TEST BUG.*expected 2 responses/.test(x)));
  });
});

describe("doubleBookSummary", () => {
  it("counts double-booked and clean trials in trial order", () => {
    assert.deepEqual(doubleBookSummary([1, 1, 0, 1, 1]), {
      trialsDoubleBooked: 4,
      trialsClean: 1,
      overlapPairsTotal: 4,
      doubleBookedByTrial: "1,1,0,1,1",
    });
  });

  it("handles empty and multi-pair input", () => {
    assert.deepEqual(doubleBookSummary([]), {
      trialsDoubleBooked: 0,
      trialsClean: 0,
      overlapPairsTotal: 0,
      doubleBookedByTrial: "",
    });
    assert.deepEqual(doubleBookSummary([2, 0]), {
      trialsDoubleBooked: 1,
      trialsClean: 1,
      overlapPairsTotal: 2,
      doubleBookedByTrial: "2,0",
    });
  });
});

describe("overlapViolations", () => {
  it("is empty without pairs and one PRODUCT BUG line with both uids otherwise", () => {
    assert.deepEqual(overlapViolations([]), []);
    const v = overlapViolations([
      {
        aId: 1,
        aUid: "ua",
        aEventTypeId: 3,
        aStart: "2026-11-30T09:00:00.000Z",
        aEnd: "2026-11-30T09:30:00.000Z",
        bId: 2,
        bUid: "ub",
        bEventTypeId: 4,
        bStart: "2026-11-30T09:00:00.000Z",
        bEnd: "2026-11-30T10:00:00.000Z",
      },
    ]);
    assert.equal(v.length, 1);
    assert.match(v[0]!, /PRODUCT BUG.*1 overlapping/);
    assert.match(v[0]!, /ua/);
    assert.match(v[0]!, /ub/);
  });
});

describe("classifyOverlapLoser", () => {
  it("keeps the 409 kinds and calls a redacted db 400 a refused leg", () => {
    assert.equal(classifyOverlapLoser(409, LOSER_SLOT_TAKEN), "slot-taken");
    assert.equal(classifyOverlapLoser(409, LOSER_BOOKING_CONFLICT), "booking-conflict");
    assert.equal(classifyOverlapLoser(400, LOSER_DB_REDACTED), "refused-db-error");
  });

  it("everything else is unexpected", () => {
    assert.equal(classifyOverlapLoser(400, "other"), "unexpected");
    assert.equal(classifyOverlapLoser(409, "other"), "unexpected");
    assert.equal(classifyOverlapLoser(422, LOSER_DB_REDACTED), "unexpected");
    assert.equal(classifyOverlapLoser(null, null), "unexpected");
  });
});

describe("refusedLegs", () => {
  it("lists redacted db 400s with their traceId and skips winners and 409s", () => {
    const refused: ParsedResponse = {
      status: 400,
      uid: null,
      bodyStatus: null,
      message: LOSER_DB_REDACTED,
      summary: `400: {"message":"${LOSER_DB_REDACTED}","data":{"traceId":"trace_abc-1"}}`,
    };
    assert.deepEqual(refusedLegs([win("u1"), refused, taken()]), [{ traceId: "trace_abc-1" }]);
    assert.deepEqual(refusedLegs([win("u1"), taken()]), []);
  });

  it("falls back to unknown when the summary has no traceId", () => {
    assert.deepEqual(refusedLegs([redacted()]), [{ traceId: "unknown" }]);
  });
});

describe("checkSequentialRefusal", () => {
  it("passes a 2xx ACCEPTED first leg and a 409 slot-taken second leg", () => {
    assert.deepEqual(checkSequentialRefusal([win("u1"), taken()]), []);
  });

  it("fails a redacted db 400 on the second leg and keeps the summary", () => {
    const refused: ParsedResponse = {
      ...redacted(),
      summary: `400: {"message":"${LOSER_DB_REDACTED}","data":{"traceId":"trace_keep-1"}}`,
    };
    const v = checkSequentialRefusal([win("u1"), refused]);
    assert.equal(v.length, 1);
    assert.match(v[0]!, /^PRODUCT BUG: sequential overlap not refused with 409: 400:/);
    assert.match(v[0]!, /trace_keep-1/);
  });

  it("fails any other 400 on the second leg", () => {
    const v = checkSequentialRefusal([win("u1"), lose(400, "Bad Request")]);
    assert.equal(v.length, 1);
    assert.match(v[0]!, /sequential overlap not refused with 409/);
  });

  it("fails a 409 with another message and a second 2xx", () => {
    assert.equal(checkSequentialRefusal([win("u1"), lose(409, LOSER_BOOKING_CONFLICT)]).length, 1);
    const v = checkSequentialRefusal([win("u1"), win("u2")]);
    assert.ok(v.some((x) => /not refused with 409: 200:/.test(x)));
  });

  it("fails a 409 first and a 200 second", () => {
    const v = checkSequentialRefusal([taken(), win("u1")]);
    assert.ok(v.some((x) => /sequential overlap not refused with 409: 200:/.test(x)));
    assert.ok(v.some((x) => /sequential first booking not accepted: 409:/.test(x)));
  });

  it("fails a missing second leg", () => {
    assert.ok(checkSequentialRefusal([win("u1")]).length >= 1);
  });

  it("leaves race mode alone: 200 + redacted 400 is still a refused leg", () => {
    assert.deepEqual(guards([win("u1"), redacted()], [slotRow("u1")]), []);
  });
});
