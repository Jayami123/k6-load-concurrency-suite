// P6-MED-LOAD-003: Medusa checkout spike at 150 % of the knee, characterisation (plan Phase 4 task 6). The runner passes the run through
// P6_LOAD_CONFIG (k6-config.json). Standalone (D6), with a stocked variant from the harness:
//   P6_LOAD_CONFIG=k6/cases/med-load-003.example.json k6 run k6/cases/med-load-003.js
import { loadLoadConfig } from "../lib/config.js";
import {
  beginSpikeIteration,
  endSpikeIteration,
  observeSpikeResponses,
  spikeHooks,
  spikeOptions,
} from "../lib/spike.js";
import { buildSpikePlan } from "../lib/pure/spike.js";
import { runMedCheckout } from "../journeys/med-checkout.js";

// Defaults equal k6/cases/med-load-003.example.json, so `k6 inspect` runs the init context without a config file.
const cfg = /** @type {any} */ ({
  steadyRate: 0.5,
  spikeRate: 1.5,
  steadySec: 60,
  spikeSec: 30,
  rampSec: 2,
  watchSec: 120,
  timeUnitSec: 10,
  baseUrl: "http://127.0.0.1:9000",
  publishableKey: "pk_placeholder",
  regionId: "reg_placeholder",
  salesChannelId: "sc_placeholder",
  variantId: "variant_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-003",
  ...loadLoadConfig([]),
});

const plan = buildSpikePlan(cfg);
export const options = spikeOptions({
  ...cfg,
  plan,
  exec: "journey",
  tags: { case: "P6-MED-LOAD-003", journey: "med-checkout" },
});
export const { setup, teardown } = spikeHooks(__ENV.MARKER_URL);
observeSpikeResponses();

export function journey() {
  const intent = beginSpikeIteration(plan);
  let committed = false;
  // P6-MED-LOAD-010 in the same run: every fourth iteration abandons its cart (src/load/spike/med-abandon.ts, isAbandoned).
  runMedCheckout(cfg, { onCommit: () => (committed = true), abandon: (n) => n % 4 === 3 });
  endSpikeIteration(intent, committed);
}
