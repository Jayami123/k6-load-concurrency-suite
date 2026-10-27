// P6-MED-LOAD-008: the promo ledger under steady load (plan Phase 4b task 10 §6.3). A share of the carts (promoShare) applies the
// promotion created by the setup (src/medusa/run-promo-case.ts); the others check out without it. The runner passes the run through
// P6_LOAD_CONFIG (k6-config.json). Standalone (D6):
//   P6_LOAD_CONFIG=k6/cases/med-load-008.example.json k6 run k6/cases/med-load-008.js
import exec from "k6/execution";
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { shareHit } from "../lib/pure/share.js";
import { runMedCheckout } from "../journeys/med-checkout.js";
import { clockHooks } from "../lib/markers.js";

// Defaults let `k6 inspect` run the init context without a config file; a real run passes every value through P6_LOAD_CONFIG.
const cfg = {
  rate: 7,
  timeUnitSec: 10,
  durationSec: 120,
  maxLatencyMs: 5000,
  baseUrl: "http://127.0.0.1:9000",
  publishableKey: "pk_placeholder",
  regionId: "reg_placeholder",
  salesChannelId: "sc_placeholder",
  variantId: "variant_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-008",
  promoCode: "P6PROMO",
  promoShare: 0.5,
  ...loadLoadConfig([]),
};

const tags = { case: "P6-MED-LOAD-008", journey: "med-checkout" };

export const options = standardOptions({
  scenarios: {
    steady: openModelScenario({
      rate: cfg.rate,
      timeUnitSec: cfg.timeUnitSec,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      exec: "checkout",
      tags,
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] }, // 400 is expected, declared through expectStatuses(400)
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function checkout() {
  const i = exec.scenario.iterationInTest;
  const promoCode = shareHit(i, cfg.promoShare) ? cfg.promoCode : undefined;
  runMedCheckout(cfg, { classify: true, promoCode });
}
