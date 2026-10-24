import { check, sleep } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { runJourney } from "../lib/pure/journey.js";
import { iterationId } from "../lib/pure/prefix.js";
import { request, expectStatuses } from "../lib/http.js";

export const ordersCounter = new Counter("p6_orders"); // names fixed by the Task 6 plan
const refusedAtLineItem = new Counter("p6_refused_at_line_item");
const refusedAtComplete = new Counter("p6_refused_at_complete");
const otherStatus = new Counter("p6_other_status");

const ADDRESS = {
  first_name: "P6",
  last_name: "QA",
  address_1: "Teststr 1",
  city: "Berlin",
  country_code: "de",
  postal_code: "10115",
}; // = STORE_ADDRESS in src/medusa/payloads.ts

/** cfg: { baseUrl, publishableKey, regionId, salesChannelId, variantId, prefix } (written by the runner's setup, no secrets). */
/**
 * @param {{ baseUrl: string, publishableKey: string, regionId: string, salesChannelId: string, variantId: string, prefix: string }} cfg
 */
export function runMedCheckout(cfg) {
  expectStatuses(400); // a clean refusal is not a failed request (D9)
  const email = `${iterationId(cfg.prefix, exec.scenario.iterationInTest)}@qa.local`; // lower-case, [a-z0-9-] prefix, unique per iteration
  const H = { "Content-Type": "application/json", "x-publishable-api-key": cfg.publishableKey };
  /** @type {(method: string, path: string, body: unknown, name: string) => any} */
  const call = (method, path, body, name) =>
    request(method, `${cfg.baseUrl}/store${path}`, name, body, { headers: H, timeout: "30s" });
  const steps = [
    {
      name: "browse",
      run: () => ({
        ok: call("GET", "/products?limit=4", undefined, "GET /store/products").status === 200,
      }),
    },
    {
      name: "cart",
      run: () => {
        const r = call(
          "POST",
          "/carts",
          { region_id: cfg.regionId, email, sales_channel_id: cfg.salesChannelId },
          "POST /store/carts",
        );
        return { ok: r.status === 200, data: { cartId: r.json("cart.id") } };
      },
    },
    {
      name: "line item",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = call(
          "POST",
          `/carts/${s.cartId}/line-items`,
          { variant_id: cfg.variantId, quantity: 1 },
          "POST /store/carts/:id/line-items",
        );
        if (r.status === 400) {
          refusedAtLineItem.add(1);
          return { ok: true, stop: true };
        } // out of stock: a clean end of the journey, not a failure
        return { ok: r.status === 200 };
      },
    },
    {
      name: "address",
      run: (/** @type {Record<string, any>} */ s) => ({
        ok:
          call(
            "POST",
            `/carts/${s.cartId}`,
            { email, shipping_address: ADDRESS, billing_address: ADDRESS },
            "POST /store/carts/:id",
          ).status === 200,
      }),
    },
    {
      name: "shipping options",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = call(
          "GET",
          `/shipping-options?cart_id=${s.cartId}`,
          undefined,
          "GET /store/shipping-options",
        );
        const o =
          r.status === 200 &&
          /** @type {Array<{ id: string, name: string }>} */ (r.json("shipping_options")).find(
            (x) => x.name === "Standard Shipping",
          );
        return { ok: Boolean(o), data: { optionId: o && o.id } };
      },
    },
    {
      name: "shipping method",
      run: (/** @type {Record<string, any>} */ s) => ({
        ok:
          call(
            "POST",
            `/carts/${s.cartId}/shipping-methods`,
            { option_id: s.optionId },
            "POST /store/carts/:id/shipping-methods",
          ).status === 200,
      }),
    },
    {
      name: "payment collection",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = call(
          "POST",
          "/payment-collections",
          { cart_id: s.cartId },
          "POST /store/payment-collections",
        );
        return { ok: r.status === 200, data: { pcId: r.json("payment_collection.id") } };
      },
    },
    {
      name: "payment session",
      run: (/** @type {Record<string, any>} */ s) => ({
        ok:
          call(
            "POST",
            `/payment-collections/${s.pcId}/payment-sessions`,
            { provider_id: "pp_system_default" },
            "POST /store/payment-collections/:id/payment-sessions",
          ).status === 200,
      }),
    },
    {
      name: "complete",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = call(
          "POST",
          `/carts/${s.cartId}/complete`,
          undefined,
          "POST /store/carts/:id/complete",
        );
        if (r.status === 200 && r.json("type") === "order") {
          ordersCounter.add(1);
          return { ok: true };
        }
        if (r.status === 400) {
          refusedAtComplete.add(1);
          return { ok: true };
        } // the last unit was taken between add-to-cart and complete
        otherStatus.add(1);
        return { ok: false };
      },
    },
  ];
  return runJourney({
    steps,
    deps: { check: (n, ok) => check(null, { [n]: () => ok }), sleep, now: Date.now },
  });
}
