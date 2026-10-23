// Phase 2 Task 6 smoke: proves k6 can reach a harness-started Twenty. Not a performance number.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.TWENTY_BASE_URL || "http://127.0.0.1:3002").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/healthz`, { tags: { name: "GET /healthz" } });
  check(health, { "GET /healthz is 200": (r) => r.status === 200 });
}
