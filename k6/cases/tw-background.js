// TW-BG-FOUNDATION (Twenty plan §2.3): the background journey under the LOAD runner. The runner passes the run through
// P6_LOAD_CONFIG; the workspace token arrives in TWENTY_TOKEN only, never in the config file.
// Standalone (against a Twenty stack started by the harness):
//   TWENTY_TOKEN=... P6_LOAD_CONFIG=k6/cases/tw-background.example.json k6 run k6/cases/tw-background.js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runTwBackground } from "../journeys/tw-background.js";
import { clockHooks } from "../lib/markers.js";

// Defaults equal k6/cases/tw-background.example.json, so `k6 inspect` runs the init context without a config file.
// A real run passes every value through P6_LOAD_CONFIG, which wins over these.
const cfg = {
  rate: 1,
  durationSec: 30,
  maxLatencyMs: 4000,
  baseUrl: "http://127.0.0.1:3002",
  prefix: "p6-qa-00000000t000000z-00000000-tw-bg-foundation",
  ...loadLoadConfig([]),
};

const tags = { case: "TW-BG-FOUNDATION", journey: "tw-background" };

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
