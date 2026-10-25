import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kneePlanFromInputs } from "../../src/load/knee/plan-input.ts";
import type { KneePlanSpec } from "../../src/load/types.ts";

const DEFAULTS: KneePlanSpec = {
  startRate: 0.5,
  stepRate: 0.5,
  holdSec: 30,
  rampSec: 5,
  maxSteps: 8,
};

describe("knee plan inputs", () => {
  it("an empty string takes the default", () => {
    assert.deepEqual(
      kneePlanFromInputs({ KNEE_START_RATE: "", KNEE_HOLD_SEC: "  " }, DEFAULTS),
      DEFAULTS,
    );
    assert.deepEqual(kneePlanFromInputs({}, DEFAULTS), DEFAULTS);
  });

  it("rates have one decimal", () => {
    const plan = kneePlanFromInputs({ KNEE_START_RATE: "0.3", KNEE_STEP_RATE: "0.1" }, DEFAULTS);
    assert.equal(plan.startRate, 0.3);
    assert.equal(plan.stepRate, 0.1);
    assert.throws(
      () => kneePlanFromInputs({ KNEE_START_RATE: "0.35" }, DEFAULTS),
      /KNEE_START_RATE must have one decimal/,
    );
  });

  it("the bounds and the 5,000-iteration cap name the field", () => {
    assert.throws(() => kneePlanFromInputs({ KNEE_HOLD_SEC: "9" }, DEFAULTS), /KNEE_HOLD_SEC/);
    assert.throws(() => kneePlanFromInputs({ KNEE_RAMP_SEC: "11" }, DEFAULTS), /KNEE_RAMP_SEC/);
    assert.throws(() => kneePlanFromInputs({ KNEE_MAX_STEPS: "31" }, DEFAULTS), /KNEE_MAX_STEPS/);
    assert.throws(() => kneePlanFromInputs({ KNEE_START_RATE: "0" }, DEFAULTS), /KNEE_START_RATE/);
    assert.throws(
      () =>
        kneePlanFromInputs(
          {
            KNEE_START_RATE: "100",
            KNEE_STEP_RATE: "1",
            KNEE_HOLD_SEC: "120",
            KNEE_MAX_STEPS: "30",
          },
          DEFAULTS,
        ),
      /ENV: knee plan out of bounds: KNEE_MAX_STEPS plans .* the cap is 5000/,
    );
  });

  it("non-numeric input is rejected", () => {
    assert.throws(
      () => kneePlanFromInputs({ KNEE_HOLD_SEC: "thirty" }, DEFAULTS),
      /KNEE_HOLD_SEC is not a number/,
    );
  });
});
