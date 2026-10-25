// Pure helpers of the breakpoint method (plan task 1 §6.3). No k6 import: the k6-facing module (k6/lib/knee.js) wires them in.
import { classifyRefusal } from "./refusal.js";
import { CAL_REDACTED } from "../retry.js";

/** @typedef {{ startRate: number, stepRate: number, holdSec: number, rampSec: number, maxSteps: number }} KneePlan */

/**
 * Held steps: for step i the rate is startRate + i*stepRate; the stages are [ramp to rate_i over rampSec, hold rate_i for holdSec].
 * The scenario uses timeUnit "10s" (plan R1), so each stage target is the rate per 10 s, which must be a whole number.
 * @param {KneePlan} p
 */
export function buildKneePlan(p) {
  if (!(p.startRate > 0) || !(p.stepRate > 0) || !(p.holdSec > 0)) {
    throw new Error("TEST BUG: knee plan needs startRate, stepRate and holdSec above 0");
  }
  if (!(p.rampSec >= 0) || !(p.maxSteps >= 1)) {
    throw new Error("TEST BUG: knee plan needs rampSec >= 0 and maxSteps >= 1");
  }
  /** @param {number} x */
  const tenths = (x) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-9;
  if (!tenths(p.startRate) || !tenths(p.stepRate))
    throw new Error("TEST BUG: knee rates need one decimal");
  const start = Math.round(p.startRate * 10);
  const step = Math.round(p.stepRate * 10);
  const steps = [];
  const stages = [];
  for (let i = 0; i < p.maxSteps; i++) {
    const target = start + i * step;
    const holdFromSec = i * (p.rampSec + p.holdSec) + p.rampSec;
    steps.push({ index: i, rate: target / 10, holdFromSec, holdToSec: holdFromSec + p.holdSec });
    if (p.rampSec > 0) stages.push({ target, duration: `${p.rampSec}s` });
    stages.push({ target, duration: `${p.holdSec}s` });
  }
  const totalSec = p.maxSteps * (p.rampSec + p.holdSec);
  return { steps, stages, totalSec };
}

/**
 * @param {ReturnType<typeof buildKneePlan>} plan
 * @param {number} elapsedMs since the scenario start
 * @returns {number | null} the step index while inside a hold window, null during a ramp or after the plan
 */
export function stepAt(plan, elapsedMs) {
  const sec = elapsedMs / 1000;
  if (!(sec >= 0)) return null;
  for (const step of plan.steps) {
    if (sec >= step.holdFromSec && sec < step.holdToSec) return step.index;
  }
  return null;
}

/**
 * VUs to pre-allocate: ceil(peakRate x iterationMs/1000 x factor), at least min, at most maxCap.
 * @param {{ peakRate: number, iterationMs: number, factor: number, min: number, maxCap: number }} o
 */
export function kneeVus({ peakRate, iterationMs, factor, min, maxCap }) {
  const need = Math.ceil((peakRate * iterationMs * factor) / 1000);
  return Math.min(maxCap, Math.max(min, need));
}

/**
 * The only builder of latency thresholds (plan §3.7). For each step i: the p95 stop rule and the error-rate stop rule abort the run;
 * the other step submetrics are listed with empty threshold lists, so the summary export keeps them.
 * @param {ReturnType<typeof buildKneePlan>} plan
 * @param {{ stopP95Ms: number, errorRate: number, delayAbortEvalSec: number }} o
 */
export function stopRuleThresholds(plan, { stopP95Ms, errorRate, delayAbortEvalSec }) {
  /** @type {Record<string, unknown[]>} */
  const out = {};
  const delay = `${delayAbortEvalSec}s`;
  for (const step of plan.steps) {
    const i = step.index;
    out[`http_req_duration{step:${i}}`] = [
      { threshold: `p(95)<${stopP95Ms}`, abortOnFail: true, delayAbortEval: delay },
    ];
    out[`p6_nonconflict_error{step:${i}}`] = [
      { threshold: `rate<=${errorRate}`, abortOnFail: true, delayAbortEval: delay },
    ];
    out[`p6_step_started{step:${i}}`] = [];
    out[`http_reqs{step:${i}}`] = [];
    out[`checks{step:${i}}`] = [];
  }
  return out;
}

/**
 * Conflict (counted apart, never an error), error (counts toward the 1 % rule) or ok, per product (plan §3.5).
 * `type` is the reply's `type` field when the body is JSON; the Medusa conflict is a 400 `not_allowed` with an inventory message.
 * @param {"cal" | "medusa" | "documenso"} product
 * @param {number} status
 * @param {unknown} message the reply's `message` field, when the body is JSON
 * @param {unknown} [type]
 * @returns {"ok" | "conflict" | "error"}
 */
export function classifyResponse(product, status, message, type) {
  if (status === 0) return "error";
  if (status >= 200 && status <= 299) return "ok";
  if (product === "cal") {
    if (status === 409) return "conflict";
    if (status === 400 && String(message || "").includes(CAL_REDACTED)) return "conflict";
  }
  if (
    product === "medusa" &&
    status === 400 &&
    classifyRefusal(status, type, message) === "clean"
  ) {
    return "conflict";
  }
  return "error";
}

/**
 * The outcome line of plan §6.8: `{"intent":n,"outcome":"ok"|"fail"}`, plus `"net":true` on a fail whose iteration saw a response with
 * status 0, plus `"ghost":true` on a fail whose iteration saw a response that classifyRefusal classifies as ghost.
 * @param {number} intent exec.scenario.iterationInTest
 * @param {boolean} committed the journey's commit counter was added to (opts.onCommit ran)
 * @param {boolean} sawNetworkError
 * @param {boolean} sawGhost
 * @returns {string}
 */
export function intentLine(intent, committed, sawNetworkError, sawGhost) {
  /** @type {{ intent: number, outcome: string, net?: boolean, ghost?: boolean }} */
  const line = { intent, outcome: committed ? "ok" : "fail" };
  if (!committed && sawNetworkError) line.net = true;
  if (!committed && sawGhost) line.ghost = true;
  return JSON.stringify(line);
}
