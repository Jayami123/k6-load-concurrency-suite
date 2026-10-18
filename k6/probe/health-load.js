// Probe-only: small GET /health load against harness Medusa on this Cursor cloud VM.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.MEDUSA_BASE_URL || "http://127.0.0.1:9000").replace(/\/$/, "");

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "2m", target: 10 },
    { duration: "1m", target: 20 },
  ],
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
  thresholds: {
    http_req_failed: ["rate<1"],
  },
};

export function setup() {
  return { startedAtMs: Date.now() };
}

/**
 * @param {{ startedAtMs: number }} data
 */
export default function (data) {
  const elapsedS = (Date.now() - data.startedAtMs) / 1000;
  const stage = elapsedS < 30 ? "ramp_to_10" : elapsedS < 150 ? "hold_10" : "ramp_to_20";
  const res = http.get(`${BASE_URL}/health`, { tags: { name: "GET /health", stage } });
  check(res, { "GET /health is 200": (r) => r.status === 200 });
}
