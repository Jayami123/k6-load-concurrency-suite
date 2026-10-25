// P6-MED-LOAD-006 retry storm on the complete step (plan task 10 §6.2, §6.6). The runner passes the run through P6_LOAD_CONFIG.
// Standalone (D6), with a stocked variant from the harness:
//   P6_LOAD_CONFIG=k6/cases/med-load-006.example.json k6 run k6/cases/med-load-006.js
import { loadLoadConfig } from "../lib/config.js";
import { buildPlan } from "../lib/retry.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { runMedCheckout } from "../journeys/med-checkout.js";
import { clockHooks } from "../lib/markers.js";

// Defaults equal k6/cases/med-load-006.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const cfg = {
  rate: 1,
  durationSec: 10,
  maxLatencyMs: 6000,
  baseUrl: "http://127.0.0.1:9000",
  publishableKey: "pk_placeholder",
  regionId: "reg_placeholder",
  salesChannelId: "sc_placeholder",
  variantId: "variant_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-006",
  ...loadLoadConfig([]),
};

// Two short storm attempts (100 ms: the complete finishes after the client gave up), then one that waits for the server.
const RETRY = buildPlan({
  stormTimeoutMs: 100,
  stormAttempts: 2,
  finalTimeoutMs: 30000,
  delayMs: 0,
});

const tags = { case: "P6-MED-LOAD-006", journey: "med-checkout" };

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
  thresholds: {
    checks: ["rate==1"],
    p6_retry_5xx: ["count==0"],
    p6_retry_order_mismatch: ["count==0"],
  },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function journey() {
  runMedCheckout(cfg, { retryPlan: RETRY });
}
