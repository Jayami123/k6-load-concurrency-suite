// P6-CAL-LOAD-007 retry storm (plan task 10 §6.2, §6.6). The runner passes the run through P6_LOAD_CONFIG (k6-config.json).
// Standalone (D6), against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-007.example.json k6 run k6/cases/cal-load-007.js
import { loadLoadConfig } from "../lib/config.js";
import { buildPlan } from "../lib/retry.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runCalBook } from "../journeys/cal-book.js";

// Defaults equal k6/cases/cal-load-007.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const cfg = {
  rate: 1,
  durationSec: 10,
  maxLatencyMs: 2000,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-007",
  windowDays: 28,
  ...loadLoadConfig([]),
};

// Three short storm attempts (35 ms), then one attempt that waits for the server (30 s) so every intent ends with an answer.
const RETRY = buildPlan({
  stormTimeoutMs: 35,
  stormAttempts: 3,
  finalTimeoutMs: 30000,
  delayMs: 0,
});

const tags = { case: "P6-CAL-LOAD-007", journey: "cal-book" };

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

export function journey() {
  runCalBook(cfg, { retryPlan: RETRY });
}
