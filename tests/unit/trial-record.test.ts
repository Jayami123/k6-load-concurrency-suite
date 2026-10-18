import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordTrial } from "../../src/races/trial-record.ts";
import type { RaceRequestResult } from "../../src/races/types.ts";

function req(index: number, status: number | null): RaceRequestResult {
  return { index, status, bodySummary: `${status}: x`, startedAtMs: 0, endedAtMs: 1 };
}

describe("recordTrial", () => {
  it("returns ok record with statuses when validation passes", () => {
    const record = recordTrial(
      1,
      { requests: [req(0, 200), req(1, 200)], dispatchSpreadMs: 1 },
      () => {},
    );
    assert.equal(record.ok, true);
    assert.deepEqual(record.statuses, [200, 200]);
    assert.deepEqual(record.statusCounts, { "200": 2 });
    assert.equal(record.dispatchSpreadMs, 1);
    assert.deepEqual(record.invariantViolations, []);
    assert.equal(record.error, undefined);
  });

  it("keeps statuses and statusCounts when validation fails", () => {
    const requests = [req(0, 200), req(1, 503), req(2, null)];
    const record = recordTrial(2, { requests, dispatchSpreadMs: 2.5 }, (r) => {
      if (r.statuses.some((s) => s !== 200)) throw new Error("PRODUCT BUG: non-200");
    });
    assert.equal(record.ok, false);
    assert.equal(record.trial, 2);
    assert.equal(record.error, "PRODUCT BUG: non-200");
    assert.deepEqual(record.invariantViolations, ["PRODUCT BUG: non-200"]);
    assert.deepEqual(record.statuses, [200, 503, null]);
    assert.deepEqual(record.statusCounts, { "200": 1, "503": 1, error: 1 });
    assert.equal(record.dispatchSpreadMs, 2.5);
    assert.equal(record.requests, requests);
  });
});
