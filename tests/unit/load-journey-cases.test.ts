import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import { bookingBody } from "../../src/cal/payloads.ts";

// The journeys import k6 modules. Node cannot run them, so a loader hook maps every "k6" specifier to a stub that
// records the HTTP calls. The stubs are inlined here (no k6 package in Node). Journey requests are then compared with
// the TypeScript payload builders, so the two cannot drift apart.
const STUBS: Record<string, string> = {
  k6: `export const check = () => true; export const sleep = () => {};`,
  "k6/http": `
    const SLOTS = { "2026-12-01": [{ time: "2026-12-01T10:00:00.000Z" }] };
    const respond = (url, body) => ({
      status: 200,
      json: (path) => (path === "result.data.json.slots" ? SLOTS : path === "status" ? "ACCEPTED" : undefined),
    });
    const record = (method, url, body, params) => {
      globalThis.__k6Calls.push({ method, url, body, params });
      return respond(url, body);
    };
    export default {
      get: (url, params) => record("GET", url, null, params),
      post: (url, body, params) => record("POST", url, body, params),
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

describe("load journeys against the payload builders", () => {
  it("the cal booking body equals bookingBody() of src/cal/payloads.ts", async () => {
    (globalThis as unknown as { __k6Calls?: unknown[] }).__k6Calls = [];
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
    const calls = (
      globalThis as unknown as { __k6Calls: Array<{ method: string; url: string; body: string }> }
    ).__k6Calls;
    const post = calls.find((c) => c.method === "POST");
    assert.ok(post, "the journey posted a booking");
    const sent = JSON.parse(post.body) as {
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
});
