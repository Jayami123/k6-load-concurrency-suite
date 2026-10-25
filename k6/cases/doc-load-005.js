// P6-DOC-LOAD-005: Documenso signing knee (plan Phase 4 task 4). The API token arrives in the environment only (DOCUMENSO_API_TOKEN).
// The runner passes the run through P6_LOAD_CONFIG (k6-config.json).
// Standalone (D6), against a Documenso stack started by the harness:
//   DOCUMENSO_API_TOKEN=... P6_LOAD_CONFIG=k6/cases/doc-load-005.example.json k6 run k6/cases/doc-load-005.js
import { loadLoadConfig } from "../lib/config.js";
import {
  beginKneeIteration,
  endKneeIteration,
  kneeHooks,
  kneeOptions,
  observeKneeResponses,
} from "../lib/knee.js";
import { buildKneePlan } from "../lib/pure/knee.js";
import { runDocSign } from "../journeys/doc-sign.js";

// Defaults equal k6/cases/doc-load-005.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const flat = /** @type {any} */ ({
  startRate: 1,
  stepRate: 1,
  holdSec: 30,
  rampSec: 2,
  maxSteps: 8,
  smokeP95Ms: 233.131137, // the median of k6/thresholds/smoke-p95.json, P6-DOC-LOAD-001 (a real run reads it at setup)
  pre: 80,
  max: 200,
  delayAbortEvalSec: 8,
  baseUrl: "http://127.0.0.1:3001",
  prefix: "p6-qa-00000000t000000z-00000000-p6-doc-load-005",
  pdfPath: "",
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
// The fixture is opened once, in the init context (k6 open() runs only there).
const PDF = flat.pdfPath ? open(flat.pdfPath, "b") : null;

export const options = kneeOptions({
  knee,
  smokeP95Ms: knee.smokeP95Ms,
  maxVUs: knee.maxVUs,
  // A signing journey runs 3.5 s on average and 12 s at most on the Documenso knee (p95 10.3 s); the pool is sized from this.
  iterationMs: 12000,
  delayAbortEvalSec: flat.delayAbortEvalSec,
  tags: { case: "P6-DOC-LOAD-005", journey: "doc-sign" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("documenso");

export default function () {
  if (PDF === null) throw new Error("TEST BUG: pdfPath is not set in the config");
  const intent = beginKneeIteration(plan);
  let committed = false;
  runDocSign(flat, PDF, { onCommit: () => (committed = true) }); // called beside completedCounter.add(1)
  endKneeIteration(intent, committed); // one outcome line per finished iteration (Task 1 §6.8)
}
