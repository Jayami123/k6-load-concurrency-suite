// P6-MED-LOAD-002 inventory conservation (plan task 8 §6.2, §6.4). The runner passes the run through P6_LOAD_CONFIG.
// Standalone (D6), with a stocked variant from the harness:
//   P6_LOAD_CONFIG=k6/cases/med-load-002.example.json k6 run k6/cases/med-load-002.js
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runMedCheckout } from "../journeys/med-checkout.js";
import { clockHooks } from "../lib/markers.js";

// Defaults equal k6/cases/med-load-002.example.json (see k6/cases/med-load-001.js for why).
const cfg = {
  rate: 1,
  durationSec: 10,
  maxLatencyMs: 4000,
  baseUrl: "http://127.0.0.1:9000",
  publishableKey: "pk_placeholder",
  regionId: "reg_placeholder",
  salesChannelId: "sc_placeholder",
  variantId: "variant_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-002",
  stock: 5,
  ...loadLoadConfig([]),
};

const tags = { case: "P6-MED-LOAD-002", journey: "med-checkout" };

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
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // 400 is expected, declared through expectStatuses(400)
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  runMedCheckout(cfg, { classify: true });
}
