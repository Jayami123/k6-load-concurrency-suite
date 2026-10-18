// Phase 0 smoke: proves k6 can reach a harness-started Medusa. Not a performance number.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.MEDUSA_BASE_URL || "http://127.0.0.1:9000").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`, { tags: { name: "GET /health" } });
  check(res, { "GET /health is 200": (r) => r.status === 200 });
}
