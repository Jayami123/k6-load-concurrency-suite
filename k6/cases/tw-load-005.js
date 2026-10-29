// P6-TW-LOAD-005 (Task 5): the background journey that runs while the one-time reset token loop redeems tokens
// (Twenty plan §2.3). The runner passes the run through P6_LOAD_CONFIG; the workspace token arrives in TWENTY_TOKEN only.
// The token logic lives in src/twenty/reset-token-load.ts, never here.
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runTwBackground } from "../journeys/tw-background.js";
import { clockHooks } from "../lib/markers.js";

// Defaults equal the pr profile of src/load/cases.ts, so `k6 inspect` runs the init context without a config file.
// A real run passes every value through P6_LOAD_CONFIG, which wins over these.
const cfg = {
  rate: 1,
  durationSec: 60,
  maxLatencyMs: 4000,
  baseUrl: "http://127.0.0.1:3002",
  prefix: "p6-qa-00000000t000000z-00000000-tw-load-005",
  ...loadLoadConfig([]),
};

const tags = { case: "P6-TW-LOAD-005", journey: "tw-background" };

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
  runTwBackground(cfg, {});
}
