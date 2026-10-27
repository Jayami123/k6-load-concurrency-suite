import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MED_LOAD_007, MED_LOAD_008, MED_LOAD_009 } from "../../src/load/cases.ts";
import { openModelScenario } from "../../k6/lib/pure/options.js";

// rate is starts per second (openModelScenario multiplies it by timeUnitSec). The plan's 0.7 per second is written as 7 per 10 s.
describe("medusa invariant arrival rate", () => {
  for (const c of [MED_LOAD_007, MED_LOAD_008, MED_LOAD_009]) {
    it(`${c.id} offers 0.7 starts per second and plans 84 full iterations`, () => {
      const p = c.profiles.full!;
      assert.equal(p.rate, 0.7);
      const s = openModelScenario({
        rate: p.rate,
        timeUnitSec: p.timeUnitSec,
        durationSec: p.durationSec,
        maxLatencyMs: p.maxLatencyMs,
      });
      assert.equal(s.timeUnit, "10s");
      assert.equal(s.rate, 7);
      assert.equal(Math.round(p.rate * p.durationSec), 84);
    });
  }
});
