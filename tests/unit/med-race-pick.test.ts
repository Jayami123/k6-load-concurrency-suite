import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { raceFor } from "../../k6/lib/pure/race.js";

describe("medusa cancel race pick", () => {
  it("injects a double cancel on every 10th iteration and a cancel-vs-fulfil on every 20th, and nothing else", () => {
    assert.equal(raceFor(9), "double-cancel");
    assert.equal(raceFor(19), "cancel-fulfil");
    assert.equal(raceFor(29), "double-cancel");
    assert.equal(raceFor(0), null);
    assert.equal(raceFor(18), null);
  });

  it("rejects an index that is not a whole number >= 0", () => {
    assert.throws(() => raceFor(-1), /iteration index/);
    assert.throws(() => raceFor(1.5), /iteration index/);
  });
});
