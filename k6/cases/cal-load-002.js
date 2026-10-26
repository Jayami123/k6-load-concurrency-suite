// P6-CAL-LOAD-002: one free slot, N simultaneous bookings, inside steady load (plan Phase 4b task 8 §6.2, §6.4). The runner passes the
// run through P6_LOAD_CONFIG (k6-config.json). Standalone (D6), against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-002.example.json k6 run k6/cases/cal-load-002.js
// A steady stream at the cal steady rate runs on the same stack; N attempts for one free slot start at burstAtSec inside the hold.
import exec from "k6/execution";
import { loadLoadConfig } from "../lib/config.js";
import { expectStatuses } from "../lib/http.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { burstPlan } from "../lib/pure/burst.js";
import { runCalBook } from "../journeys/cal-book.js";
import { bookTarget } from "../journeys/cal-burst.js";
import { clockHooks } from "../lib/markers.js";

// Defaults let `k6 inspect` run the init context without a config file; a real run passes every value through P6_LOAD_CONFIG.
const cfg = {
  rate: 4,
  timeUnitSec: 10,
  durationSec: 120,
  maxLatencyMs: 2000,
  burstAttempts: 8,
  burstAtSec: 40,
  burstSlot: "",
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-002",
  windowDays: 28,
  ...loadLoadConfig([]),
};

const plan = burstPlan(cfg);
const tags = { case: "P6-CAL-LOAD-002", journey: "cal-book" };

// 400 and 409 are the expected status of a losing booking (src/cal/payloads.ts parseBookingResponse): declared before the burst.
expectStatuses(400, 409);

export const options = standardOptions({
  scenarios: {
    steady: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      timeUnitSec: cfg.timeUnitSec,
      exec: "steady",
      tags,
    }),
    burst: {
      executor: "shared-iterations",
      vus: plan.attempts,
      iterations: plan.attempts,
      startTime: `${plan.startSec}s`,
      exec: "burst",
      maxDuration: "30s",
    },
  },
  // A 4xx is expected for the losers; the verdict is in the burst classifier, not in these thresholds.
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function steady() {
  runCalBook(cfg);
}

export function burst() {
  bookTarget(cfg, `b${exec.scenario.iterationInTest}`);
}
