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
import {
  completeBody,
  recipientBodies,
  signatureFieldBodies,
  signFieldBody,
  signValue,
} from "../../src/documenso/payloads.ts";

// Replies the journeys read. The URL is matched without its query string, by suffix. A test can replace one reply
// through globalThis.__k6Override (keyed "METHOD path"), for the malformed-reply cases.
type Reply = [method: string, path: string, body: Record<string, unknown>];
const REPLIES: Reply[] = [
  [
    "GET",
    "/api/trpc/slots/getSchedule",
    {
      result: {
        data: { json: { slots: { "2026-12-01": [{ time: "2026-12-01T10:00:00.000Z" }] } } },
      },
    },
  ],
  ["POST", "/api/book/event", { status: "ACCEPTED" }],
  ["POST", "/store/carts", { cart: { id: "cart_1" } }],
  [
    "GET",
    "/store/shipping-options",
    { shipping_options: [{ id: "so_1", name: "Standard Shipping" }] },
  ],
  ["POST", "/store/payment-collections", { payment_collection: { id: "pc_1" } }],
  ["POST", "/store/carts/cart_1/complete", { type: "order" }],
  ["POST", "/api/v2/envelope/create", { id: "env_1" }],
  ["POST", "/api/v2/envelope/recipient/create-many", { data: [{ id: 11 }, { id: 12 }] }],
  ["GET", "/api/v2/envelope/env_1", { secondaryId: "document_1018", envelopeItems: [{ id: 77 }] }],
  [
    "POST",
    "/api/v2/envelope/field/create-many",
    {
      data: [
        { id: 21, recipientId: 11 },
        { id: 22, recipientId: 12 },
      ],
    },
  ],
  [
    "POST",
    "/api/v2/envelope/distribute",
    {
      recipients: [
        { id: 11, signingUrl: "https://sign.test/sign/tokA" },
        { id: 12, signingUrl: "https://sign.test/sign/tokB" },
      ],
    },
  ],
];

// The k6 modules are not installed in Node. A loader hook maps every "k6" specifier to a stub that records each call.
// The payload builders of src/ are the reference, so a request body that drifts from them fails here.
const STUBS: Record<string, string> = {
  k6: `export const check = () => true; export const sleep = () => {};`,
  "k6/http": `
    const REPLIES = ${JSON.stringify(REPLIES)};
    const replyFor = (method, url) => {
      const path = url.split("?")[0];
      const override = globalThis.__k6Override ?? {};
      const hit = REPLIES.find(([m, p]) => m === method && path.endsWith(p));
      if (hit && override[method + " " + hit[1]] !== undefined) return override[method + " " + hit[1]];
      return hit ? hit[2] : {};
    };
    const record = (method, url, body, params) => {
      globalThis.__k6Calls.push({ method, url, body, params });
      const payload = replyFor(method, url);
      return {
        status: 200,
        json: (p) => (p === undefined ? payload : p.split(".").reduce((o, k) => o?.[k], payload)),
      };
    };
    export default {
      get: (url, params) => record("GET", url, null, params),
      post: (url, body, params) => record("POST", url, body, params),
      file: (data, name, type) => ({ data, name, type }),
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

type Call = { method: string; url: string; body: unknown };
type K6Globals = {
  __k6Calls: Call[];
  __k6Override?: Record<string, unknown>;
  __ENV?: Record<string, string>;
};

function k6Globals(): K6Globals {
  return globalThis as unknown as K6Globals;
}

function recordedCalls(): Call[] {
  k6Globals().__k6Calls = [];
  k6Globals().__k6Override = {};
  return k6Globals().__k6Calls;
}

/** A journey posts JSON as a string (request()) or an object (multipart). Both read as an object here. */
function sentBody(call: Call): Record<string, unknown> {
  return (typeof call.body === "string" ? JSON.parse(call.body) : call.body) as Record<
    string,
    unknown
  >;
}

function callTo(calls: Call[], method: string, suffix: string): Call {
  const call = calls.find(
    (c) => c.method === method && c.url.replace(/\?.*$/, "").endsWith(suffix),
  );
  if (!call) throw new Error(`the journey did not call ${method} ${suffix}`);
  return call;
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
    const sent = sentBody(callTo(calls, "POST", "/api/book/event")) as {
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
    const cart = sentBody(callTo(calls, "POST", "/store/carts"));
    assert.deepEqual(cart, cartCreateBody("reg_1", String(cart.email), "sc_1"));
    assert.deepEqual(
      sentBody(callTo(calls, "POST", "/store/carts/cart_1/line-items")),
      lineItemBody("variant_1", 1),
    );
    assert.deepEqual(
      sentBody(callTo(calls, "POST", "/store/carts/cart_1")).shipping_address,
      STORE_ADDRESS,
    );
    assert.deepEqual(sentBody(callTo(calls, "POST", "/payment-sessions")), paymentSessionBody());
  });

  it("the documenso bodies equal the payload builders of src/documenso/payloads.ts", async () => {
    const calls = recordedCalls();
    k6Globals().__ENV = { DOCUMENSO_API_TOKEN: "test-token" };
    const { runDocSign } = await import("../../k6/journeys/doc-sign.js");
    const out = runDocSign(
      { baseUrl: "http://doc.test", prefix: "p6-qa-20261024t010203z-3fa9c0d1-p6-doc-load-001" },
      "pdf",
    );
    assert.equal(out.completed, true);
    const recipients = sentBody(callTo(calls, "POST", "/recipient/create-many")).data as Array<{
      email: string;
    }>;
    const expected = recipientBodies("p6-doc", 0, 2);
    assert.deepEqual(
      recipients.map(({ email: _email, ...rest }) => rest),
      expected.map(({ email: _email, ...rest }) => rest),
    );
    assert.deepEqual(
      sentBody(callTo(calls, "POST", "/field/create-many")).data,
      signatureFieldBodies({ envelopeItemId: "77", recipientIds: [11, 12] }).map((f) => ({
        ...f,
        envelopeItemId: 77,
      })),
    );
    const sign = sentBody(callTo(calls, "POST", "signFieldWithToken"));
    assert.deepEqual(sign.json as Record<string, unknown>, signFieldBody("tokA", 21, signValue(0)));
    const done = sentBody(callTo(calls, "POST", "completeDocumentWithToken"));
    assert.deepEqual(done.json, completeBody("tokA", 1018));
  });

  it("a distribute reply that is malformed fails the distribute step and never throws", async () => {
    const malformed: Array<Record<string, unknown>> = [
      { recipients: undefined },
      { recipients: "tokA" },
      { recipients: [] },
      { recipients: [{ id: 11, signingUrl: "https://sign.test/sign/tokA" }] },
      {
        recipients: [
          { id: 99, signingUrl: "https://sign.test/sign/tokA" },
          { id: 12, signingUrl: "https://sign.test/sign/tokB" },
        ],
      },
      {
        recipients: [
          { id: 11, signingUrl: "https://sign.test/sign/same" },
          { id: 12, signingUrl: "https://sign.test/sign/same" },
        ],
      },
      {
        recipients: [
          { id: 11, signingUrl: "https://sign.test/sign/tokA" },
          { id: 11, signingUrl: "https://sign.test/sign/tokB" },
        ],
      },
    ];
    const { runDocSign } = await import("../../k6/journeys/doc-sign.js");
    for (const reply of malformed) {
      recordedCalls();
      k6Globals().__ENV = { DOCUMENSO_API_TOKEN: "test-token" };
      k6Globals().__k6Override = { "POST /api/v2/envelope/distribute": reply };
      const out = runDocSign({ baseUrl: "http://doc.test", prefix: "p6-qa-x" }, "pdf");
      assert.equal(out.completed, false, JSON.stringify(reply));
      assert.equal(out.failedStep, "distribute", JSON.stringify(reply));
    }
  });

  it("a distribute reply whose signingUrl does not end in /sign/<token> fails the distribute step", async () => {
    recordedCalls();
    k6Globals().__ENV = { DOCUMENSO_API_TOKEN: "test-token" };
    k6Globals().__k6Override = {
      "POST /api/v2/envelope/distribute": {
        recipients: [
          { id: 11, signingUrl: "https://sign.test/nope" },
          { id: 12, signingUrl: "https://sign.test/sign/tokB" },
        ],
      },
    };
    const { runDocSign } = await import("../../k6/journeys/doc-sign.js");
    const out = runDocSign({ baseUrl: "http://doc.test", prefix: "p6-qa-x" }, "pdf");
    assert.equal(out.completed, false);
    assert.equal(out.failedStep, "distribute");
  });
});
