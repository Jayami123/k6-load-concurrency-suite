import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CAL_LOAD_008 } from "../../src/load/cases.ts";
import { parseKneeBounds } from "../../src/load/knee/bounds.ts";
import { soakDurationSec, withSoakProfile } from "../../src/load/soak/profile.ts";
import type { PlateauResult } from "../../src/load/soak/plateau.ts";
import type { SlopeResult } from "../../src/load/soak/slope.ts";
import { soakVerdict } from "../../src/load/soak/verdict.ts";

const flatSlope: SlopeResult = {
  n: 12,
  slopePerMin: 0,
  theilSenPerMin: 0,
  stepsOver: 0,
  reason: "ok",
};
const flatPlateau: PlateauResult = {
  n: 12,
  middleMedian: 100,
  lastMedian: 100,
  ratio: 1,
  reason: "ok",
};

describe("soak profile", () => {
  it("accepts SOAK_DURATION_MIN of 30 or 120 and rejects anything else before setup", () => {
    assert.equal(soakDurationSec("30"), 1800);
    assert.equal(soakDurationSec("120"), 7200);
    for (const bad of [undefined, "", "45", "abc"]) {
      assert.throws(() => soakDurationSec(bad), /^Error: ENV: SOAK_DURATION_MIN must be 30 or 120/);
    }
  });

  it("sets the soak rate to the steady rate of the knee bound, over 10 s units", () => {
    const bounds = parseKneeBounds(
      JSON.parse(readFileSync("k6/thresholds/knee-bounds.json", "utf8")),
    );
    const c = withSoakProfile(CAL_LOAD_008, bounds, 1800);
    assert.equal(c.label, "soak, environment-bound");
    assert.deepEqual(c.profiles.soak, {
      rate: 4,
      durationSec: 1800,
      maxLatencyMs: 8000,
      timeUnitSec: 10,
    });
  });
});

describe("soak verdict", () => {
  it("gives TEST BUG before INVALID, and INVALID before FAIL", () => {
    const base = { auditOk: false, slopeRpm: flatSlope, plateau: flatPlateau, thresholds: null };
    assert.equal(
      soakVerdict({ ...base, invalidReasons: ["gap"], testBugReasons: ["slots ran out"] }).verdict,
      "TEST BUG",
    );
    assert.equal(
      soakVerdict({ ...base, invalidReasons: ["gap"], testBugReasons: [] }).verdict,
      "INVALID",
    );
    assert.equal(
      soakVerdict({ ...base, invalidReasons: [], testBugReasons: [] }).verdict,
      "FAIL (PRODUCT BUG)",
    );
  });

  it("gives NO THRESHOLD YET without a threshold entry, PASS with one and no growth", () => {
    const input = {
      auditOk: true,
      invalidReasons: [],
      testBugReasons: [],
      slopeRpm: flatSlope,
      plateau: flatPlateau,
    };
    assert.equal(soakVerdict({ ...input, thresholds: null }).verdict, "NO THRESHOLD YET");
    const pass = soakVerdict({ ...input, thresholds: { slopePerMin: 0.5, plateauRatio: 1.2 } });
    assert.equal(pass.verdict, "PASS");
    assert.deepEqual(pass.reasons, []);
  });
});
