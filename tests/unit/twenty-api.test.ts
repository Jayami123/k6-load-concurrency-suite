import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { graphqlCall, restCall } from "../../src/twenty/api.ts";

describe("twenty race calls", () => {
  it("restCall sends the method, the bearer header and the JSON body, and returns the parsed body", async () => {
    let seen: { method?: string; auth?: string; body?: string } = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      seen = {
        method: init.method,
        auth: (init.headers as Record<string, string>).Authorization,
        body: init.body as string,
      };
      return new Response(JSON.stringify({ data: { updateCompany: { name: "A" } } }), {
        status: 200,
      });
    }) as typeof fetch;
    const r = await restCall(
      "http://127.0.0.1:3002",
      "Bearer t",
      "PATCH",
      "/companies/1",
      { name: "A" },
      fakeFetch,
    );
    assert.equal(seen.method, "PATCH");
    assert.equal(seen.auth, "Bearer t");
    assert.equal(seen.body, JSON.stringify({ name: "A" }));
    assert.equal(r.status, 200);
  });

  it("restCall returns a 429 as a status and does not throw", async () => {
    const fakeFetch = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    const r = await restCall(
      "http://127.0.0.1:3002",
      "Bearer t",
      "GET",
      "/companies",
      undefined,
      fakeFetch,
    );
    assert.equal(r.status, 429);
  });

  it("graphqlCall returns the errors array for a refused replay and does not throw", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ data: null, errors: [{ message: "Token is invalid" }] }), {
        status: 200,
      })) as typeof fetch;
    const r = await graphqlCall(
      "http://127.0.0.1:3002",
      "/metadata",
      "mutation { x }",
      {},
      undefined,
      fakeFetch,
    );
    assert.equal(r.status, 200);
    assert.equal(r.json?.errors?.[0]?.message, "Token is invalid");
  });
});
