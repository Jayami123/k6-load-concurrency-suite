// Pure scenario and option builders. No k6 import; the scenario objects are plain data k6 accepts as options.
import { maxVUs, preAllocatedVUs } from "./sizing.js";

export const SUMMARY_TREND_STATS = ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"];

/** k6 default system tags minus "url": a URL can carry a token or an id (plan §3.4). Every request is named with tags.name instead. */
export const SYSTEM_TAGS = [
  "status",
  "method",
  "name",
  "scenario",
  "error",
  "error_code",
  "check",
  "expected_response",
];

/**
 * @param {{ rate: number, durationSec: number, maxLatencyMs?: number, exec?: string, startTimeSec?: number, tags?: Record<string, string>, preAllocated?: number, maxVus?: number }} o
 * @returns {Record<string, unknown>}
 */
export function openModelScenario({
  rate,
  durationSec,
  maxLatencyMs,
  exec,
  startTimeSec,
  tags,
  preAllocated,
  maxVus,
}) {
  const pre = preAllocated ?? preAllocatedVUs({ rate, maxLatencyMs: maxLatencyMs ?? 1000 });
  return {
    executor: "constant-arrival-rate",
    rate,
    timeUnit: "1s",
    duration: `${durationSec}s`,
    preAllocatedVUs: pre,
    maxVUs: maxVus ?? maxVUs(pre),
    ...(exec ? { exec } : {}),
    ...(startTimeSec ? { startTime: `${startTimeSec}s` } : {}),
    ...(tags ? { tags } : {}),
  };
}

/**
 * Phase 4 uses it; unit-tested now.
 * @param {{ startRate: number, stages: Array<{ target: number, durationSec: number }>, maxLatencyMs: number, exec?: string, tags?: Record<string, string> }} o
 * @returns {Record<string, unknown>}
 */
export function rampingOpenScenario({ startRate, stages, maxLatencyMs, exec, tags }) {
  const peak = Math.max(startRate, ...stages.map((s) => s.target));
  const pre = preAllocatedVUs({ rate: peak, maxLatencyMs });
  return {
    executor: "ramping-arrival-rate",
    startRate,
    timeUnit: "1s",
    preAllocatedVUs: pre,
    maxVUs: maxVUs(pre),
    stages: stages.map((s) => ({ target: s.target, duration: `${s.durationSec}s` })),
    ...(exec ? { exec } : {}),
    ...(tags ? { tags } : {}),
  };
}

/**
 * Closed model. Only the coordinated-omission self-test uses it (the comparison needs a closed run).
 * @param {{ vus: number, durationSec: number, exec?: string, tags?: Record<string, string> }} o
 * @returns {Record<string, unknown>}
 */
export function closedModelScenario({ vus, durationSec, exec, tags }) {
  return {
    executor: "constant-vus",
    vus,
    duration: `${durationSec}s`,
    ...(exec ? { exec } : {}),
    ...(tags ? { tags } : {}),
  };
}

const LATENCY_THRESHOLD =
  /^(http_req_(duration|waiting|connecting|blocked|sending|receiving|tls_handshaking)|iteration_duration|http_reqs|data_(sent|received))(\{|$)/;

/**
 * D9: only correctness thresholds (checks, http_req_failed and custom counters). Throws on a latency or throughput threshold.
 * @param {Record<string, unknown>} thresholds
 * @returns {Record<string, unknown>}
 */
export function assertCorrectnessThresholds(thresholds) {
  for (const key of Object.keys(thresholds)) {
    if (LATENCY_THRESHOLD.test(key))
      throw new Error(
        `threshold on "${key}" is a latency/throughput gate; none are allowed in Phase 3 (D9, P6-RULE-001)`,
      );
  }
  return thresholds;
}

/**
 * @param {{ scenarios: Record<string, unknown>, thresholds?: Record<string, unknown>, tags?: Record<string, string> }} o
 * @returns {Record<string, unknown>}
 */
export function standardOptions({ scenarios, thresholds = {}, tags = {} }) {
  return {
    scenarios,
    thresholds: assertCorrectnessThresholds(thresholds),
    summaryTrendStats: SUMMARY_TREND_STATS,
    systemTags: SYSTEM_TAGS,
    tags,
    discardResponseBodies: false,
  };
}
