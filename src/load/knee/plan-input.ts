import type { KneePlanSpec } from "../types.ts";

/** Bounds of the knee plan inputs (plan task 1 R4). Rates are iterations per second with one decimal. */
export const KNEE_BOUNDS = {
  rate: { min: 0.1, max: 100 },
  holdSec: { min: 10, max: 120 },
  rampSec: { min: 0, max: 10 },
  maxSteps: { min: 1, max: 30 },
  plannedTotal: 5000,
} as const;

const FIELDS = {
  startRate: "KNEE_START_RATE",
  stepRate: "KNEE_STEP_RATE",
  holdSec: "KNEE_HOLD_SEC",
  rampSec: "KNEE_RAMP_SEC",
  maxSteps: "KNEE_MAX_STEPS",
} as const;

function numberOf(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`ENV: knee plan out of bounds: ${name} is not a number`);
  return value;
}

/**
 * The knee plan from the workflow inputs (plan task 1 R4). An empty string takes the default. Out of bounds names the field:
 * `ENV: knee plan out of bounds: <FIELD> ...`. The planned total (rate x hold summed over the steps) is capped at 5,000.
 */
export function kneePlanFromInputs(
  env: Record<string, string | undefined>,
  defaults: KneePlanSpec,
): KneePlanSpec {
  const plan: KneePlanSpec = {
    startRate: numberOf(FIELDS.startRate, env[FIELDS.startRate], defaults.startRate),
    stepRate: numberOf(FIELDS.stepRate, env[FIELDS.stepRate], defaults.stepRate),
    holdSec: numberOf(FIELDS.holdSec, env[FIELDS.holdSec], defaults.holdSec),
    rampSec: numberOf(FIELDS.rampSec, env[FIELDS.rampSec], defaults.rampSec),
    maxSteps: numberOf(FIELDS.maxSteps, env[FIELDS.maxSteps], defaults.maxSteps),
  };
  const fail = (field: string, why: string): never => {
    throw new Error(`ENV: knee plan out of bounds: ${field} ${why}`);
  };
  for (const key of ["startRate", "stepRate"] as const) {
    const v = plan[key];
    if (v < KNEE_BOUNDS.rate.min || v > KNEE_BOUNDS.rate.max) {
      fail(
        FIELDS[key],
        `must be between ${KNEE_BOUNDS.rate.min} and ${KNEE_BOUNDS.rate.max}, got ${v}`,
      );
    }
    if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9)
      fail(FIELDS[key], `must have one decimal, got ${v}`);
  }
  if (plan.holdSec < KNEE_BOUNDS.holdSec.min || plan.holdSec > KNEE_BOUNDS.holdSec.max) {
    fail(
      FIELDS.holdSec,
      `must be between ${KNEE_BOUNDS.holdSec.min} and ${KNEE_BOUNDS.holdSec.max} s, got ${plan.holdSec}`,
    );
  }
  if (plan.rampSec < KNEE_BOUNDS.rampSec.min || plan.rampSec > KNEE_BOUNDS.rampSec.max) {
    fail(
      FIELDS.rampSec,
      `must be between ${KNEE_BOUNDS.rampSec.min} and ${KNEE_BOUNDS.rampSec.max} s, got ${plan.rampSec}`,
    );
  }
  if (
    !Number.isInteger(plan.maxSteps) ||
    plan.maxSteps < KNEE_BOUNDS.maxSteps.min ||
    plan.maxSteps > KNEE_BOUNDS.maxSteps.max
  ) {
    fail(
      FIELDS.maxSteps,
      `must be a whole number between ${KNEE_BOUNDS.maxSteps.min} and ${KNEE_BOUNDS.maxSteps.max}, got ${plan.maxSteps}`,
    );
  }
  let planned = 0;
  for (let i = 0; i < plan.maxSteps; i++) {
    planned += (plan.startRate + i * plan.stepRate) * plan.holdSec;
  }
  if (planned > KNEE_BOUNDS.plannedTotal) {
    fail(
      "KNEE_MAX_STEPS",
      `plans ${Math.round(planned)} iterations; the cap is ${KNEE_BOUNDS.plannedTotal} (lower the rates, the hold or the steps)`,
    );
  }
  // Every planned step, not only the first, stays inside the rate bound.
  const lastRate = plan.startRate + (plan.maxSteps - 1) * plan.stepRate;
  if (lastRate > KNEE_BOUNDS.rate.max) {
    fail(
      "KNEE_MAX_STEPS",
      `the last step runs at ${Math.round(lastRate * 10) / 10}/s; the rate limit is ${KNEE_BOUNDS.rate.max}`,
    );
  }
  return plan;
}
