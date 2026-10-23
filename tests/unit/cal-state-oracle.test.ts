import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOKING_BY_EMAIL_SQL,
  BOOKING_STATUS_SQL,
  CASE_ACCEPTED_SQL,
  LINK_STATE_SQL,
} from "../../src/cal/state-oracle.ts";

describe("state oracle SQL", () => {
  it("state-oracle SQL is read-only", () => {
    for (const sql of [
      LINK_STATE_SQL,
      CASE_ACCEPTED_SQL,
      BOOKING_STATUS_SQL,
      BOOKING_BY_EMAIL_SQL,
    ]) {
      assert.match(sql, /^\s*SELECT\b/i);
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
    }
  });
});
