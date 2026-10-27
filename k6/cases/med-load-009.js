// P6-MED-LOAD-009: double cancel and cancel-vs-fulfil inside steady load (plan Phase 4b task 10 §6.4). Every 10th order gets a second
// cancel and every 20th a cancel and a fulfilment at the same moment, both sent with http.batch (Q-RACEPATH, decided). The admin token
// arrives in the environment only (MEDUSA_ADMIN_TOKEN), never in the config file. Standalone (D6):
//   MEDUSA_ADMIN_TOKEN=... P6_LOAD_CONFIG=k6/cases/med-load-009.example.json k6 run k6/cases/med-load-009.js
import http from "k6/http";
import exec from "k6/execution";
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { raceFor } from "../lib/pure/race.js";
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
  locationId: "sloc_placeholder",
  prefix: "p6-qa-00000000t000000z-00000000-p6-med-load-009",
  ...loadLoadConfig([]),
};

const tags = { case: "P6-MED-LOAD-009", journey: "med-checkout" };
const ADMIN_TOKEN = __ENV.MEDUSA_ADMIN_TOKEN || "";

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
  if (ADMIN_TOKEN === "")
    throw new Error("TEST BUG: MEDUSA_ADMIN_TOKEN is not set in the environment");
  const i = exec.scenario.iterationInTest;
  // a holder, so the type of the order is not narrowed to null by the callback that sets it
  /** @type {{ order: { orderId: string, lineItemId: string } | null }} */
  const seen = { order: null };
  runMedCheckout(cfg, {
    classify: true,
    onOrder: (orderId, lineItemId) => {
      seen.order = { orderId, lineItemId };
    },
  });
  const order = seen.order;
  const race = raceFor(i);
  if (order === null || race === null) return;
  const H = { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" };
  const cancel = {
    method: "POST",
    url: `${cfg.baseUrl}/admin/orders/${order.orderId}/cancel`,
    body: "{}",
    params: { headers: H, tags: { name: "POST /admin/orders/:id/cancel", race } },
  };
  // the second request of a double cancel is the same cancel; the fulfilment is the other half of cancel-vs-fulfil
  const second =
    race === "cancel-fulfil"
      ? {
          method: "POST",
          url: `${cfg.baseUrl}/admin/orders/${order.orderId}/fulfillments`,
          body: JSON.stringify({
            items: [{ id: order.lineItemId, quantity: 1 }],
            location_id: cfg.locationId,
          }),
          params: { headers: H, tags: { name: "POST /admin/orders/:id/fulfillments", race } },
        }
      : cancel;
  http.batch([cancel, second]);
}
