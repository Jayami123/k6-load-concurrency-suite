// P6-CAL-LOAD-005: Cal booking knee (plan Phase 4 task 2). The runner passes the run through P6_LOAD_CONFIG (k6-config.json).
// Standalone (D6), against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-005.example.json k6 run k6/cases/cal-load-005.js
import { loadLoadConfig } from "../lib/config.js";
import {
  beginKneeIteration,
  endKneeIteration,
  kneeHooks,
  kneeOptions,
  observeKneeResponses,
} from "../lib/knee.js";
import { buildKneePlan } from "../lib/pure/knee.js";
import { runCalBook } from "../journeys/cal-book.js";

// Defaults equal k6/cases/cal-load-005.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const flat = /** @type {any} */ ({
  startRate: 2,
  stepRate: 2,
  holdSec: 30,
  rampSec: 2,
  maxSteps: 9,
  smokeP95Ms: 77.12, // the median of k6/thresholds/smoke-p95.json, P6-CAL-LOAD-001 (a real run reads it at setup)
  pre: 80,
  max: 160,
  delayAbortEvalSec: 10,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-005",
  windowDays: 28,
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
  tags: { case: "P6-CAL-LOAD-005", journey: "cal-book" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("cal");

export default function () {
  const intent = beginKneeIteration(plan);
  let committed = false;
  runCalBook(flat, { onCommit: () => (committed = true) }); // called where the journey adds to p6_bookings_accepted
  endKneeIteration(intent, committed); // one outcome line per finished iteration (Task 1 §6.8)
}
