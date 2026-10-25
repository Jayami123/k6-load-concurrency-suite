// P6-CAL-LOAD-003: the Cal steady baseline at half the knee (plan Phase 4 task 5). The runner passes the run through P6_LOAD_CONFIG
// (k6-config.json). Standalone (D6), against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-003.example.json k6 run k6/cases/cal-load-003.js
// The steady rate is written over timeUnitSec (10): 3 per second is 30 per 10 s.
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runCalBook } from "../journeys/cal-book.js";
import { clockHooks } from "../lib/markers.js";

// Defaults equal k6/cases/cal-load-003.example.json, so `k6 inspect` runs the init context without a config file. Standalone there
// is no slotStarts: the journey books by its own schedule, and the runner always passes the slots.
const cfg = {
  rate: 3,
  timeUnitSec: 1,
  durationSec: 30,
  maxLatencyMs: 2000,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-003",
  windowDays: 28,
  ...loadLoadConfig([]),
};

const tags = { case: "P6-CAL-LOAD-003", journey: "cal-book" };

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
  // Correctness only (P6-RULE-001, D9): the steady case measures and gates nothing on latency.
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  runCalBook(cfg);
}
