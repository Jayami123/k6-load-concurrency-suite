// Phase 1 Task 6 smoke: proves k6 can reach a harness-started Documenso. Not a performance number.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.DOCUMENSO_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

export default function () {
  const signin = http.get(`${BASE_URL}/signin`, { tags: { name: "GET /signin" } });
  check(signin, { "GET /signin is 200": (r) => r.status === 200 });
  const csrf = http.get(`${BASE_URL}/api/auth/csrf`, { tags: { name: "GET /api/auth/csrf" } });
  check(csrf, { "GET /api/auth/csrf is 200": (r) => r.status === 200 });
}
