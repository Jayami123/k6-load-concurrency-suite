// P6-DOC-LOAD-007 retry storm on completeDocumentWithToken (plan task 10 §6.2, §6.6). The runner passes the run through
// P6_LOAD_CONFIG; the API token arrives in the environment only (DOCUMENSO_API_TOKEN), never in the config file.
// Standalone (D6), against a Documenso stack started by the harness:
//   DOCUMENSO_API_TOKEN=... P6_LOAD_CONFIG=k6/cases/doc-load-007.example.json k6 run k6/cases/doc-load-007.js
import { loadLoadConfig } from "../lib/config.js";
import { buildPlan } from "../lib/retry.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runDocSign } from "../journeys/doc-sign.js";
import { clockHooks } from "../lib/markers.js";

// Defaults equal k6/cases/doc-load-007.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const cfg = {
  rate: 1,
  durationSec: 10,
  maxLatencyMs: 3000,
  baseUrl: "http://127.0.0.1:3001",
  prefix: "p6-qa-00000000t000000z-00000000-p6-doc-load-007",
  pdfPath: "",
  ...loadLoadConfig([]),
};

// The fixture is opened once, in the init context (k6 open() runs only there).
const PDF = cfg.pdfPath ? open(cfg.pdfPath, "b") : null;

// One short first attempt (25 ms), then three identical completions together, the last of them waiting for the server.
const RETRY = buildPlan({
  stormTimeoutMs: 25,
  stormAttempts: 1,
  parallelRetries: 3,
  finalTimeoutMs: 30000,
  delayMs: 0,
});

const tags = { case: "P6-DOC-LOAD-007", journey: "doc-sign" };

export const options = standardOptions({
  scenarios: {
    journey: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      exec: "journey",
      tags,
    }),
  },
  thresholds: { checks: ["rate==1"], p6_retry_5xx: ["count==0"] },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  if (PDF === null) throw new Error("TEST BUG: pdfPath is not set in the config");
  runDocSign(cfg, PDF, { retryPlan: RETRY });
}
