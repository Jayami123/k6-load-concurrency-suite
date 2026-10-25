// k6-facing side of the breakpoint method (plan task 1 §6.3): the held-step scenario, the stop thresholds, the intent line and the
// response observer. The pure parts (plan, thresholds, classifier, intent line) live in k6/lib/pure/knee.js.
import exec from "k6/execution";
import { Counter, Gauge, Rate } from "k6/metrics";
import { observeResponses } from "./http.js";
import { clockHooks } from "./markers.js";
import {
  buildKneePlan,
  classifyResponse,
  intentLine,
  kneeVus,
  stepAt,
  stopRuleThresholds,
} from "./pure/knee.js";
import { classifyRefusal } from "./pure/refusal.js";
import { standardOptions } from "./pure/options.js";

const started = new Counter("p6_step_started");
const t0 = new Gauge("p6_knee_t0_ms");
const nonconflict = new Rate("p6_nonconflict_error");
const conflicts = new Counter("p6_conflict_responses");

/**
 * Options of a knee script. cfg.knee is the plan (KneePlanSpec), cfg.smokeP95Ms the journey smoke p95, cfg.maxVUs the cap.
 * The scenario uses timeUnit "10s" (plan R1); its stage targets are the rates per 10 s.
 * @param {any} cfg
 */
export function kneeOptions(cfg) {
  const plan = buildKneePlan(cfg.knee);
  const peak = Math.max(...plan.steps.map((s) => s.rate));
  const first = plan.steps[0];
  if (!first) throw new Error("TEST BUG: knee plan has no steps");
  const pre = kneeVus({
    peakRate: peak,
    iterationMs: cfg.iterationMs ?? 1000,
    factor: 2,
    min: 5,
    maxCap: cfg.maxVUs,
  });
  const base = standardOptions({ scenarios: {}, tags: cfg.tags ?? {} });
  return {
    ...base,
    scenarios: {
      knee: {
        executor: "ramping-arrival-rate",
        startRate: Math.round(first.rate * 10),
        timeUnit: "10s",
        preAllocatedVUs: pre,
        maxVUs: cfg.maxVUs,
        stages: plan.stages,
      },
    },
    thresholds: stopRuleThresholds(plan, {
      stopP95Ms: 10 * cfg.smokeP95Ms,
      errorRate: 0.01,
      delayAbortEvalSec: cfg.delayAbortEvalSec ?? 10,
    }),
  };
}

// Per VU, per iteration: a response with status 0, and one that classifies as the F-M2 ghost refusal.
let sawGhost = false;
let sawNetworkError = false;

/**
 * Call first in every iteration: tags the VU with the step ("ramp" outside a hold), counts the start, returns the intent number.
 * @param {ReturnType<typeof buildKneePlan>} plan
 */
export function beginKneeIteration(plan) {
  const idx = stepAt(plan, Date.now() - exec.scenario.startTime);
  const tag = idx === null ? "ramp" : String(idx);
  exec.vu.tags.step = tag;
  started.add(1, { step: tag });
  sawNetworkError = false;
  sawGhost = false;
  return exec.scenario.iterationInTest;
}

/**
 * Call last in every iteration (plan §6.8): one outcome line per finished iteration. `committed` = the journey's own commit
 * counter was added to (its onCommit hook ran).
 * @param {number} intent
 * @param {boolean} committed
 */
export function endKneeIteration(intent, committed) {
  console.log(intentLine(intent, committed, sawNetworkError, sawGhost));
}

/**
 * Once in the init context: every response made through request() or a retry attempt is classified for the product.
 * @param {"cal" | "medusa" | "documenso" | "stub"} product
 */
export function observeKneeResponses(product) {
  observeResponses((/** @type {any} */ res) => {
    if (res.status === 0) sawNetworkError = true;
    const type = jsonField(res, "type");
    const message = jsonField(res, "message");
    if (classifyRefusal(res.status, type, message) === "ghost") sawGhost = true;
    const cls = classifyResponse(/** @type {any} */ (product), res.status, message, type);
    nonconflict.add(cls === "error");
    if (cls === "conflict") conflicts.add(1);
  });
}

/** setup() and teardown(): the Phase 3 clock markers plus the knee origin (p6_knee_t0_ms). */
/** @param {string | undefined} markerUrl */
export function kneeHooks(markerUrl) {
  const clock = clockHooks(markerUrl);
  return {
    setup() {
      clock.setup();
      t0.add(Date.now());
    },
    teardown: clock.teardown,
  };
}

/** A top-level JSON field of a response, or undefined when the body is not JSON. */
/**
 * @param {any} res
 * @param {string} path
 */
function jsonField(res, path) {
  try {
    return res.json(path);
  } catch {
    return undefined;
  }
}
