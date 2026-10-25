// Breakpoint self-test (P6-X-LOAD-021, proves P6-RULE-006). Standalone, against a stub started by hand:
//   node src/load/stub-server.ts 18080 0 0 1 5          (a 5 ms CPU-burn stub, about 200 requests/s)
//   P6_LOAD_CONFIG=k6/selftest/breakpoint-stub.example.json k6 run k6/selftest/breakpoint-stub.js
import { check } from "k6";
import { loadLoadConfig } from "../lib/config.js";
import {
  beginKneeIteration,
  endKneeIteration,
  kneeHooks,
  kneeOptions,
  observeKneeResponses,
} from "../lib/knee.js";
import { request } from "../lib/http.js";
import { buildKneePlan } from "../lib/pure/knee.js";

const cfg = {
  port: 18080,
  startRate: 60,
  stepRate: 80,
  holdSec: 10,
  rampSec: 2,
  maxSteps: 5,
  smokeP95Ms: 6,
  pre: 40,
  max: 80,
  delayAbortEvalSec: 4,
  ...loadLoadConfig([]),
};
const knee = {
  startRate: cfg.startRate,
  stepRate: cfg.stepRate,
  holdSec: cfg.holdSec,
  rampSec: cfg.rampSec,
  maxSteps: cfg.maxSteps,
};
const plan = buildKneePlan(knee);
export const options = kneeOptions({
  knee,
  smokeP95Ms: cfg.smokeP95Ms,
  maxVUs: cfg.max,
  iterationMs: 5,
  delayAbortEvalSec: cfg.delayAbortEvalSec,
  tags: { case: "P6-X-LOAD-021" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("stub");

export default function () {
  const intent = beginKneeIteration(plan);
  const res = request("GET", `http://127.0.0.1:${cfg.port}/work`, "GET /work");
  check(res, { "status 200": (r) => r.status === 200 });
  endKneeIteration(intent, res.status === 200); // the stub has no database: "committed" = the answer was 200
}
