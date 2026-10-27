// The gate self-test load (P6-X-LOAD-008, plan Phase 4b task 12 §6.5): a fixed-rate open model against one stub port. The driver
// (scripts/load/gate-selftest.ts) starts the three stubs and classifies the summaries with abGate. Standalone:
//   PORT=18080 RATE=40 DURATION_SEC=30 k6 run k6/selftest/gate-slowdown.js
import http from "k6/http";
import { check } from "k6";

const port = __ENV.PORT;
const rate = Number(__ENV.RATE || 40);
const duration = Number(__ENV.DURATION_SEC || 30);

export const options = {
  scenarios: {
    open: {
      executor: "constant-arrival-rate",
      rate: rate,
      timeUnit: "1s",
      duration: `${duration}s`,
      preAllocatedVUs: 20,
      maxVUs: 60,
    },
  },
};

export default function () {
  // k6 has no URL global: the URL is a plain string.
  const res = http.get("http://127.0.0.1:" + port + "/work");
  check(res, { "status is 200": (r) => r.status === 200 });
}
