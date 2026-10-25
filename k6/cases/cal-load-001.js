// P6-CAL-LOAD-001 journey smoke (plan §6.3, §6.5). The runner passes the run through P6_LOAD_CONFIG (k6-config.json).
// Standalone (D6), against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-001.example.json k6 run k6/cases/cal-load-001.js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runCalBook } from "../journeys/cal-book.js";
import { clockHooks } from "../lib/markers.js";

// Defaults equal k6/cases/cal-load-001.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const cfg = {
  rate: 2,
  durationSec: 10,
  maxLatencyMs: 1000,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-001",
  windowDays: 4,
  ...loadLoadConfig([]),
};

const tags = { case: "P6-CAL-LOAD-001", journey: "cal-book" };

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
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  runCalBook(cfg);
}
