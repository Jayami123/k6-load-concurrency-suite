// Phase 1 Task 3 smoke: proves k6 can reach a harness-started Cal booker. Not a performance number.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.CAL_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/pro/30min`, { tags: { name: "GET /pro/30min" } });
  check(res, { "GET /pro/30min is 200": (r) => r.status === 200 });
}
