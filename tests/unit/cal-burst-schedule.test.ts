import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { burstOffsetsMs, burstPlan } from "../../k6/lib/pure/burst.js";

describe("cal burst schedule", () => {
  it("spreads N attempts evenly inside the 100 ms window", () => {
    const offsets = burstOffsetsMs(8);
    assert.equal(offsets.length, 8);
    assert.equal(offsets[0], 0);
    assert.equal(offsets[7], 100);
    assert.ok(offsets.every((o) => o >= 0 && o <= 100));
  });

  it("takes N and the start from the case config, with the plan's defaults when absent", () => {
    assert.deepEqual(burstPlan({}), { attempts: 8, startSec: 40, offsetsMs: burstOffsetsMs(8) });
    const p = burstPlan({ burstAttempts: 4, burstAtSec: 60 });
    assert.equal(p.attempts, 4);
    assert.equal(p.startSec, 60);
    assert.equal(p.offsetsMs.length, 4);
  });
});
