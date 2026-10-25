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

// The run's plan comes in the `knee` block of its config (cases.ts); the flat keys below are the standalone defaults.
const flat = /** @type {any} */ ({
  port: 18080,
  startRate: 60,
  stepRate: 80,
  holdSec: 10,
  rampSec: 2,
  maxSteps: 5,
  smokeP95Ms: 6,
  pre: 40,
  max: 80,
  delayAbortEvalSec: 12,
  ...loadLoadConfig([]),
});
const knee = flat.knee ?? {
  startRate: flat.startRate,
  stepRate: flat.stepRate,
  holdSec: flat.holdSec,
  rampSec: flat.rampSec,
  maxSteps: flat.maxSteps,
  smokeP95Ms: flat.smokeP95Ms,
  maxVUs: flat.max,
  port: flat.port,
};
const port = knee.port ?? flat.port;
const plan = buildKneePlan(knee);
export const options = kneeOptions({
  knee,
  smokeP95Ms: knee.smokeP95Ms,
  maxVUs: knee.maxVUs,
  iterationMs: 5,
  delayAbortEvalSec: flat.delayAbortEvalSec,
  tags: { case: "P6-X-LOAD-021" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("stub");

export default function () {
  const intent = beginKneeIteration(plan);
  const res = request("GET", `http://127.0.0.1:${port}/work`, "GET /work");
  check(res, { "status 200": (r) => r.status === 200 });
  endKneeIteration(intent, res.status === 200); // the stub has no database: "committed" = the answer was 200
}
