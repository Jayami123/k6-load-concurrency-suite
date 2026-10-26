// P6-DOC-LOAD-004: Documenso signing spike at the limiter-bound rates, on the production-like limiter profile (plan Phase 4 task 6). The
// API token arrives in the environment only (DOCUMENSO_API_TOKEN). The runner passes the run through P6_LOAD_CONFIG (k6-config.json).
// Standalone (D6), against a Documenso stack started by the harness:
//   DOCUMENSO_API_TOKEN=... P6_LOAD_CONFIG=k6/cases/doc-load-004.example.json k6 run k6/cases/doc-load-004.js
// The rates are the limiter's (100 tRPC per minute over 4 requests per document: 0.42 documents per second); see the plan §3.4.
import { loadLoadConfig } from "../lib/config.js";
import {
  beginSpikeIteration,
  endSpikeIteration,
  observeSpikeResponses,
  spikeHooks,
  spikeOptions,
} from "../lib/spike.js";
import { buildSpikePlan } from "../lib/pure/spike.js";
import { runDocSign } from "../journeys/doc-sign.js";

// Defaults equal k6/cases/doc-load-004.example.json, so `k6 inspect` runs the init context without a config file.
const cfg = /** @type {any} */ ({
  steadyRate: 0.2,
  // 4 token-keyed tRPC calls per document (measured, run a7968c28): 1.0 x 30 s x 4 = 120 calls in the spike, at least the 100-per-minute limit
  spikeRate: 1.0,
  steadySec: 60,
  spikeSec: 30,
  rampSec: 2,
  watchSec: 120,
  timeUnitSec: 10,
  baseUrl: "http://127.0.0.1:3001",
  prefix: "p6-qa-00000000t000000z-00000000-p6-doc-load-004",
  pdfPath: "",
  ...loadLoadConfig([]),
});

// The run's own spike (k6-config.json `spike`, written from the case) wins over the defaults above.
const sp = { ...cfg, ...(cfg.spike ?? {}) };
const plan = buildSpikePlan(sp);
// The fixture is opened once, in the init context (k6 open() runs only there).
const PDF = cfg.pdfPath ? open(cfg.pdfPath, "b") : null;

export const options = spikeOptions({
  ...sp,
  plan,
  exec: "journey",
  tags: { case: "P6-DOC-LOAD-004", journey: "doc-sign" },
});
export const { setup, teardown } = spikeHooks(__ENV.MARKER_URL);
observeSpikeResponses();

export function journey() {
  if (PDF === null) throw new Error("TEST BUG: pdfPath is not set in the config");
  const intent = beginSpikeIteration(plan);
  let committed = false;
  runDocSign(cfg, PDF, { onCommit: () => (committed = true) });
  endSpikeIteration(intent, committed);
}
