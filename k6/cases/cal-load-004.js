// P6-CAL-LOAD-004: Cal booking spike at 150 % of the knee, characterisation (plan Phase 4 task 6). The runner passes the run through
// P6_LOAD_CONFIG (k6-config.json). Standalone (D6), against a Cal stack started by the harness:
//   P6_LOAD_CONFIG=k6/cases/cal-load-004.example.json k6 run k6/cases/cal-load-004.js
import { loadLoadConfig } from "../lib/config.js";
import {
  beginSpikeIteration,
  endSpikeIteration,
  observeSpikeResponses,
  spikeHooks,
  spikeOptions,
} from "../lib/spike.js";
import { buildSpikePlan } from "../lib/pure/spike.js";
import { runCalBook } from "../journeys/cal-book.js";

// Defaults equal k6/cases/cal-load-004.example.json, so `k6 inspect` runs the init context without a config file.
const cfg = /** @type {any} */ ({
  steadyRate: 3,
  spikeRate: 9,
  steadySec: 60,
  spikeSec: 30,
  rampSec: 2,
  watchSec: 120,
  timeUnitSec: 1,
  baseUrl: "http://127.0.0.1:3000",
  eventTypeId: 1,
  eventTypeSlug: "30min",
  host: "pro",
  prefix: "p6-qa-00000000t000000z-00000000-p6-cal-load-004",
  windowDays: 28,
  ...loadLoadConfig([]),
});

// The run's own spike (k6-config.json `spike`, written from the case) wins over the defaults above.
const sp = { ...cfg, ...(cfg.spike ?? {}) };
const plan = buildSpikePlan(sp);
export const options = spikeOptions({
  ...sp,
  plan,
  exec: "journey",
  tags: { case: "P6-CAL-LOAD-004", journey: "cal-book" },
});
export const { setup, teardown } = spikeHooks(__ENV.MARKER_URL);
observeSpikeResponses();

export function journey() {
  const intent = beginSpikeIteration(plan);
  let committed = false;
  runCalBook(cfg, { onCommit: () => (committed = true) });
  endSpikeIteration(intent, committed);
}
