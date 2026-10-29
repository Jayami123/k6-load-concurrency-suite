import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRunApiKey, revokeRunApiKey } from "../../src/twenty/api-key.ts";

/** A fake fetch that answers each call from `replies` in order and records the GraphQL body it was sent. */
function fakeFetch(replies: unknown[]) {
  const calls: Array<{ url: string; body: { query: string; variables: Record<string, unknown> } }> =
    [];
  const fetchImpl = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(replies.shift() ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const opts = { baseUrl: "http://127.0.0.1:3002", authorizationHeader: "Bearer user", roleId: "r1" };

describe("twenty run API keys", () => {
  it("returns the id and token of a created key, and a refused token step holds no key value", async () => {
    const ok = fakeFetch([
      { data: { createApiKey: { id: "k1" } } },
      { data: { generateApiKeyToken: { token: "SECRETKEY123" } } },
    ]);
    const key = await createRunApiKey({
      ...opts,
      name: "p6-run-key-0",
      expiresAt: "2026-10-29T12:00:00.000Z",
      fetchImpl: ok.fetchImpl,
    });
    assert.deepEqual(key, { id: "k1", token: "SECRETKEY123" });
    assert.match(ok.calls[0]?.body.query ?? "", /createApiKey/);

    const refused = fakeFetch([
      { data: { createApiKey: { id: "k2" } } },
      { errors: [{ message: "token refused" }] },
      { data: { revokeApiKey: { id: "k2" } } },
    ]);
    await assert.rejects(
      createRunApiKey({
        ...opts,
        name: "p6-run-key-1",
        expiresAt: "2026-10-29T12:00:00.000Z",
        fetchImpl: refused.fetchImpl,
      }),
      (err: Error) => {
        assert.equal(err.message, "TEST BUG: token refused");
        assert.equal(err.message.includes("SECRET"), false);
        return true;
      },
    );
    assert.match(refused.calls[2]?.body.query ?? "", /revokeApiKey/);
  });

  it("revokes the given id with the revoke mutation", async () => {
    const fake = fakeFetch([{ data: { revokeApiKey: { id: "k1" } } }]);
    await revokeRunApiKey({
      baseUrl: opts.baseUrl,
      authorizationHeader: opts.authorizationHeader,
      id: "k1",
      fetchImpl: fake.fetchImpl,
    });
    assert.equal(fake.calls.length, 1);
    assert.match(fake.calls[0]?.body.query ?? "", /revokeApiKey/);
    assert.deepEqual(fake.calls[0]?.body.variables, { input: { id: "k1" } });
  });
});
