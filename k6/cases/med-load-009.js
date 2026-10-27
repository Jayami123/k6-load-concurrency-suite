// P6-MED-LOAD-009: double cancel and cancel-vs-fulfil inside steady load (plan Phase 4b task 10 §6.4). Every 10th order gets a second
// cancel and every 20th a cancel and a fulfilment at the same moment, both sent with http.batch (Q-RACEPATH, decided). The admin token
// arrives in the environment only (MEDUSA_ADMIN_TOKEN), never in the config file. Standalone (D6):
//   MEDUSA_ADMIN_TOKEN=... P6_LOAD_CONFIG=k6/cases/med-load-009.example.json k6 run k6/cases/med-load-009.js
import http from "k6/http";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
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
// the races actually sent: an order whose completion response was lost has no order id here, so it gets no race (decided by the stage)
const racesSent = new Counter("p6_races_sent");
// double cancels where both HTTP answers were 200 (P6-MED-RACE-008 X04 next to the stored count, D41)
const doubleCancelOk = new Counter("p6_double_cancel_http_200");

// a non-2xx answer: its status, and the server's error type and message with e-mail addresses removed (no tokens, no PII)
/** @param {any} r */
function refusal(r) {
  let type = "";
  let message = "";
  try {
    const body = r.json();
    type = String(body.type ?? "");
    message = String(body.message ?? "");
  } catch (_) {
    // not JSON: the status alone
  }
  return `HTTP ${r.status} type=${type} message=${message.replace(/\S+@\S+/g, "<email>").slice(0, 120)}`;
}
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
  const answers = http.batch([cancel, second]);
  racesSent.add(1);
  const statuses = answers.map((/** @type {any} */ r) => r.status);
  // one line per raced order: the race and the HTTP status of each race request (read back by the invariant stage)
  console.log(`P6-MED-LOAD-009 race ${race} order ${order.orderId} statuses ${statuses.join(",")}`);
  if (race === "double-cancel" && statuses.every((s) => s === 200)) doubleCancelOk.add(1);
  for (const r of answers) {
    if (r.status < 200 || r.status >= 300)
      console.warn(`P6-MED-LOAD-009 race ${race} order ${order.orderId} ${refusal(r)}`);
  }
}
