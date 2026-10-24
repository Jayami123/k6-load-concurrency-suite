import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newRunId, runDir } from "../../src/load/paths.ts";

describe("load paths", () => {
  it("run id has the UTC compact stamp and 8 hex characters", () => {
    const id = newRunId(new Date("2026-10-24T01:02:03.456Z"));
    assert.match(id, /^20261024T010203Z-[0-9a-f]{8}$/);
  });

  it("runDir is results/load/<case>/<run>", () => {
    assert.equal(runDir("P6-X-LOAD-001", "r1"), "results/load/P6-X-LOAD-001/r1");
  });
});
