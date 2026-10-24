import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import { bookingBody } from "../../src/cal/payloads.ts";
import {
  cartCreateBody,
  lineItemBody,
  paymentSessionBody,
  STORE_ADDRESS,
} from "../../src/medusa/payloads.ts";

// The journeys import k6 modules. Node cannot run them, so a loader hook maps every "k6" specifier to a stub that
// records the HTTP calls. The stubs are inlined here (no k6 package in Node). Journey requests are then compared with
// the TypeScript payload builders, so the two cannot drift apart.
const STUBS: Record<string, string> = {
  k6: `export const check = () => true; export const sleep = () => {};`,
  "k6/http": `
    const FIELDS = {
      "result.data.json.slots": { "2026-12-01": [{ time: "2026-12-01T10:00:00.000Z" }] },
      status: "ACCEPTED",
      "cart.id": "cart_1",
      shipping_options: [{ id: "so_1", name: "Standard Shipping" }],
      "payment_collection.id": "pc_1",
      type: "order",
    };
    const record = (method, url, body, params) => {
      globalThis.__k6Calls.push({ method, url, body, params });
      return { status: 200, json: (path) => FIELDS[path] };
    };
    export default {
      get: (url, params) => record("GET", url, null, params),
      post: (url, body, params) => record("POST", url, body, params),
      setResponseCallback: () => {},
      expectedStatuses: () => null,
    };
  `,
  "k6/execution": `export default { scenario: { iterationInTest: 0 } };`,
  "k6/metrics": `export class Counter { constructor(name) { this.name = name; } add() {} }`,
};

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const STUBS = ${JSON.stringify(STUBS)};
      export async function resolve(specifier, context, next) {
        if (specifier === "k6" || specifier.startsWith("k6/")) {
          return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true, format: "module" };
        }
        return next(specifier, context);
      }
    `),
);

type Call = { method: string; url: string; body: string | null };

function recordedCalls(): Call[] {
  const g = globalThis as unknown as { __k6Calls: Call[] };
  g.__k6Calls = [];
  return g.__k6Calls;
}

describe("load journeys against the payload builders", () => {
  it("the cal booking body equals bookingBody() of src/cal/payloads.ts", async () => {
    const calls = recordedCalls();
    const { runCalBook } = await import("../../k6/journeys/cal-book.js");
    const out = runCalBook({
      baseUrl: "http://cal.test",
      eventTypeId: 7,
      eventTypeSlug: "30min",
      host: "pro",
      prefix: "p6-qa-20261024t010203z-3fa9c0d1-p6-cal-load-001",
      windowDays: 4,
    });
    assert.equal(out.completed, true);
    const post = calls.find((c) => c.method === "POST");
    assert.ok(post, "the journey posted a booking");
    const sent = JSON.parse(post.body ?? "{}") as {
      start: string;
      end: string;
      responses: { email: string; name: string };
    };
    assert.deepEqual(
      sent,
      bookingBody({
        start: sent.start,
        end: sent.end,
        email: sent.responses.email,
        name: sent.responses.name,
        eventTypeId: 7,
        eventTypeSlug: "30min",
      }),
    );
  });

  it("the medusa checkout bodies equal the payload builders of src/medusa/payloads.ts", async () => {
    const calls = recordedCalls();
    const { runMedCheckout } = await import("../../k6/journeys/med-checkout.js");
    const out = runMedCheckout({
      baseUrl: "http://medusa.test",
      publishableKey: "pk_test",
      regionId: "reg_1",
      salesChannelId: "sc_1",
      variantId: "variant_1",
      prefix: "p6-qa-20261024t010203z-3fa9c0d1-p6-med-load-001",
    });
    assert.equal(out.completed, true);
    const body = (suffix: string) => {
      const call = calls.find((c) => c.method === "POST" && c.url.endsWith(suffix));
      assert.ok(call, `the journey posted ${suffix}`);
      return JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    };
    const cart = body("/store/carts");
    assert.deepEqual(cart, cartCreateBody("reg_1", String(cart.email), "sc_1"));
    assert.deepEqual(body("/store/carts/cart_1/line-items"), lineItemBody("variant_1", 1));
    assert.deepEqual(body("/store/carts/cart_1").shipping_address, STORE_ADDRESS);
    assert.deepEqual(body("/payment-sessions"), paymentSessionBody());
  });
});
