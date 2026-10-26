// P6-DOC-LOAD-006: the Documenso signing soak (plan Phase 4b task 7 §6.3). The runner passes the run through P6_LOAD_CONFIG
// (k6-config.json); the API token arrives in the environment only (DOCUMENSO_API_TOKEN), never in the config file.
// Standalone (D6), against a Documenso stack started by the harness:
//   DOCUMENSO_API_TOKEN=... P6_LOAD_CONFIG=k6/cases/doc-load-006.example.json k6 run k6/cases/doc-load-006.js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runDocSign } from "../journeys/doc-sign.js";
import { clockHooks } from "../lib/markers.js";

// Defaults let `k6 inspect` run the init context without a config file; a real run passes every value through P6_LOAD_CONFIG.
const cfg = {
  rate: 2,
  timeUnitSec: 10,
  durationSec: 30,
  maxLatencyMs: 12000,
  baseUrl: "http://127.0.0.1:3001",
  prefix: "p6-qa-00000000t000000z-00000000-p6-doc-load-006",
  pdfPath: "",
  ...loadLoadConfig([]),
};

// The fixture is opened once, in the init context (k6 open() runs only there).
const PDF = cfg.pdfPath ? open(cfg.pdfPath, "b") : null;

const tags = { case: "P6-DOC-LOAD-006", journey: "doc-sign" };

export const options = standardOptions({
  scenarios: {
    journey: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      timeUnitSec: cfg.timeUnitSec,
      exec: "journey",
      tags,
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  if (PDF === null) throw new Error("TEST BUG: pdfPath is not set in the config");
  runDocSign(cfg, PDF);
}
