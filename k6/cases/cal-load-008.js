// P6-CAL-LOAD-008: the Cal booking soak with slot recycling (plan Phase 4b task 7 §6.3). The runner passes the run through
// P6_LOAD_CONFIG (k6-config.json). Standalone (D6), against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-008.example.json k6 run k6/cases/cal-load-008.js
// Each iteration books pool[i mod P] and then cancels that booking (recycle: true, the journey's option).
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runCalBook } from "../journeys/cal-book.js";
import { clockHooks } from "../lib/markers.js";

// Defaults let `k6 inspect` run the init context without a config file; a real run passes every value through P6_LOAD_CONFIG.
const cfg = {
  rate: 4,
  timeUnitSec: 10,
  durationSec: 30,
  maxLatencyMs: 4000,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-008",
  windowDays: 28,
  recycle: true,
  ...loadLoadConfig([]),
};

const tags = { case: "P6-CAL-LOAD-008", journey: "cal-book" };

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
  // Correctness only: the soak verdict is in src/load/soak/verdict.ts, not a latency threshold here.
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  runCalBook(cfg);
}
