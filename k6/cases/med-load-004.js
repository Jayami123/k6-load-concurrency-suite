// P6-MED-LOAD-004: Medusa checkout knee (plan Phase 4 task 3). The runner passes the run through P6_LOAD_CONFIG (k6-config.json).
// Standalone (D6), with a stocked variant from the harness:
//   P6_LOAD_CONFIG=k6/cases/med-load-004.example.json k6 run k6/cases/med-load-004.js
import { loadLoadConfig } from "../lib/config.js";
import {
  beginKneeIteration,
  endKneeIteration,
  kneeHooks,
  kneeOptions,
  observeKneeResponses,
} from "../lib/knee.js";
import { buildKneePlan } from "../lib/pure/knee.js";
import { runMedCheckout } from "../journeys/med-checkout.js";

// Defaults equal k6/cases/med-load-004.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const flat = /** @type {any} */ ({
  startRate: 0.5,
  stepRate: 0.5,
  holdSec: 30,
  rampSec: 2,
  maxSteps: 8,
  smokeP95Ms: 171.6001092, // the median of k6/thresholds/smoke-p95.json, P6-MED-LOAD-001 (a real run reads it at setup)
  pre: 40,
  max: 120,
  delayAbortEvalSec: 10,
  baseUrl: "http://127.0.0.1:9000",
  publishableKey: "pk_placeholder",
  regionId: "reg_placeholder",
  salesChannelId: "sc_placeholder",
  variantId: "variant_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-004",
  ...loadLoadConfig([]),
});

// The run's plan comes in the `knee` block of its config (cases.ts); the flat keys above are the standalone defaults.
const knee = flat.knee ?? {
  startRate: flat.startRate,
  stepRate: flat.stepRate,
  holdSec: flat.holdSec,
  rampSec: flat.rampSec,
  maxSteps: flat.maxSteps,
  smokeP95Ms: flat.smokeP95Ms,
  maxVUs: flat.max,
};
const plan = buildKneePlan(knee);
export const options = kneeOptions({
  knee,
  smokeP95Ms: knee.smokeP95Ms,
  maxVUs: knee.maxVUs,
  delayAbortEvalSec: flat.delayAbortEvalSec,
  tags: { case: "P6-MED-LOAD-004", journey: "med-checkout" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("medusa");

export default function () {
  const intent = beginKneeIteration(plan);
  let committed = false;
  runMedCheckout(flat, { onCommit: () => (committed = true) }); // called where the journey adds to p6_orders
  endKneeIteration(intent, committed); // one outcome line per finished iteration (Task 1 §6.8)
}
