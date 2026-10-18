import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTrials } from "../../src/races/run-trials.ts";

describe("runTrials", () => {
  it("continues after a throw in trial 2", async () => {
    const results = await runTrials(3, async (trial) => {
      if (trial === 2) {
        throw new Error("boom");
      }
      return trial;
    });
    assert.equal(results.length, 3);
    assert.equal(results[0]?.ok, true);
    assert.equal(results[1]?.ok, false);
    assert.match(results[1]?.error ?? "", /boom/);
    assert.equal(results[2]?.ok, true);
  });
});
