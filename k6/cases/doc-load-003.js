// P6-DOC-LOAD-003: exactly-once under load (plan Phase 4b task 9 §6). Two scenarios on one Documenso stack: the sequential stream
// at `rate`, and the concurrent pair stream at rate × pairShare, in addition (§6.3). The runner passes the run through P6_LOAD_CONFIG
// (k6-config.json); the API token arrives in the environment only (DOCUMENSO_API_TOKEN), never in the config file.
// Standalone (D6), against a Documenso stack started by the harness:
//   DOCUMENSO_API_TOKEN=... P6_LOAD_CONFIG=k6/cases/doc-load-003.example.json k6 run k6/cases/doc-load-003.js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { pairRateFor } from "../lib/pure/pair.js";
import { runDocSign } from "../journeys/doc-sign.js";
import { clockHooks } from "../lib/markers.js";

// Defaults let `k6 inspect` run the init context without a config file; a real run passes every value through P6_LOAD_CONFIG.
const cfg = {
  rate: 2,
  pairShare: 0.1,
  durationSec: 30,
  maxLatencyMs: 12000,
  baseUrl: "http://127.0.0.1:3001",
  prefix: "p6-qa-00000000t000000z-00000000-p6-doc-load-003",
  pdfPath: "",
  ...loadLoadConfig([]),
};

// The fixture is opened once, in the init context (k6 open() runs only there).
const PDF = cfg.pdfPath ? open(cfg.pdfPath, "b") : null;

// the pair stream is written over 10 s: 0.2 per second is 2 starts per 10 s
const PAIR_UNIT_SEC = 10;
const pairRate = pairRateFor(cfg.rate, cfg.pairShare, PAIR_UNIT_SEC);

export const options = standardOptions({
  scenarios: {
    sequential: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      exec: "sequential",
      tags: { case: "P6-DOC-LOAD-003", journey: "doc-sign", intent: "sequential" },
    }),
    pairs: openModelScenario({
      rate: pairRate,
      timeUnitSec: PAIR_UNIT_SEC,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      exec: "pair",
      tags: { case: "P6-DOC-LOAD-003", journey: "doc-pair", intent: "pair" },
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
  tags: { case: "P6-DOC-LOAD-003" },
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function sequential() {
  if (PDF === null) throw new Error("TEST BUG: pdfPath is not set in the config");
  runDocSign(cfg, PDF, { intent: "sequential" });
}

export function pair() {
  if (PDF === null) throw new Error("TEST BUG: pdfPath is not set in the config");
  runDocSign(cfg, PDF, { intent: "pair", pairLast: true });
}
