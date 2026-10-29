import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstOkAfter, type Sample } from "../../src/load/recovery.ts";

const STOP = 1_000_000;

describe("firstOkAfter", () => {
  it("returns the ms from the stop to the first 200 at or after the stop", () => {
    const samples: Sample[] = [
      { tMs: STOP + 0, status: 429 },
      { tMs: STOP + 1_000, status: 429 },
      { tMs: STOP + 2_017, status: 200 },
      { tMs: STOP + 3_000, status: 200 },
    ];
    assert.equal(firstOkAfter(samples, STOP), 2_017);
  });

  it("returns null when no 200 comes at or after the stop", () => {
    assert.equal(firstOkAfter([{ tMs: STOP, status: 429 }], STOP), null);
    assert.equal(firstOkAfter([], STOP), null);
  });

  it("ignores 200s before the stop", () => {
    const samples: Sample[] = [
      { tMs: STOP - 500, status: 200 },
      { tMs: STOP + 600, status: 429 },
      { tMs: STOP + 1_200, status: 200 },
    ];
    assert.equal(firstOkAfter(samples, STOP), 1_200);
  });
});
