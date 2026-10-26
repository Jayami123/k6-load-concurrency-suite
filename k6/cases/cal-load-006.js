// P6-CAL-LOAD-006: the stale read after commit (plan Phase 4b task 8 §6.3). A steady stream runs on the same stack; one attempt books the
// target slot S, then getSchedule is polled every 2 s for 60 s and each poll is logged (P6_POLL). Standalone (D6):
//   P6_LOAD_CONFIG=k6/cases/cal-load-006.example.json k6 run k6/cases/cal-load-006.js
import exec from "k6/execution";
import { sleep } from "k6";
import { loadLoadConfig } from "../lib/config.js";
import { expectStatuses } from "../lib/http.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runCalBook } from "../journeys/cal-book.js";
import { bookTarget, offeredNow } from "../journeys/cal-burst.js";
import { clockHooks } from "../lib/markers.js";

const cfg = {
  rate: 4,
  timeUnitSec: 10,
  durationSec: 120,
  maxLatencyMs: 2000,
  pollEverySec: 2,
  polls: 30,
  commitAtSec: 20,
  burstSlot: "",
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-006",
  windowDays: 28,
  ...loadLoadConfig([]),
};

const tags = { case: "P6-CAL-LOAD-006", journey: "cal-book" };

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
    stale: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      startTime: `${cfg.commitAtSec}s`,
      exec: "stale",
      maxDuration: "3m",
    },
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function steady() {
  runCalBook(cfg);
}

export function stale() {
  // The commit: one attempt on S. Its P6_BURST line carries the commit time (requestStartMs).
  bookTarget(cfg, `stale${exec.scenario.iterationInTest}`);
  for (let i = 0; i < cfg.polls; i++) {
    sleep(cfg.pollEverySec);
    const offered = offeredNow(cfg, cfg.burstSlot);
    console.log(`P6_POLL ${JSON.stringify({ tMs: Date.now(), offered })}`);
  }
}
