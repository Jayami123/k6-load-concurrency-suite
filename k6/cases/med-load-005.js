// P6-MED-LOAD-005: the Medusa checkout soak (plan Phase 4b task 7 §6.3). The runner passes the run through P6_LOAD_CONFIG.
// Standalone (D6), with a stocked variant from the harness:
//   P6_LOAD_CONFIG=k6/cases/med-load-005.example.json k6 run k6/cases/med-load-005.js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runMedCheckout } from "../journeys/med-checkout.js";
import { clockHooks } from "../lib/markers.js";

// Defaults let `k6 inspect` run the init context without a config file; a real run passes every value through P6_LOAD_CONFIG.
const cfg = {
  rate: 0.7,
  timeUnitSec: 10,
  durationSec: 30,
  maxLatencyMs: 5000,
  baseUrl: "http://127.0.0.1:9000",
  publishableKey: "pk_placeholder",
  regionId: "reg_placeholder",
  salesChannelId: "sc_placeholder",
  variantId: "variant_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-005",
  stock: 5,
  ...loadLoadConfig([]),
};

const tags = { case: "P6-MED-LOAD-005", journey: "med-checkout" };

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
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // 400 is expected, declared through expectStatuses(400)
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  runMedCheckout(cfg, { classify: true });
}
