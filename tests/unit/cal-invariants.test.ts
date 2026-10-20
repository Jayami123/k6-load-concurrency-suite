import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOSER_BOOKING_CONFLICT,
  LOSER_DB_REDACTED,
  LOSER_SLOT_TAKEN,
  checkIdenticalSlotInvariants,
  classifyLoser,
  nonConflictLosers,
  type AcceptedRow,
  type ParsedResponse,
} from "../../src/cal/invariants.ts";

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
