import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  graphqlData,
  originFor,
  pickWorkspace,
  signInWorkspace,
  type TwentyWorkspace,
} from "../../src/twenty/auth.ts";

const ws = (over: Partial<TwentyWorkspace> = {}): TwentyWorkspace => ({
  displayName: "Apple",
  loginToken: "LOGIN-TOKEN-FIXTURE",
  workspaceUrls: { subdomainUrl: "http://127.0.0.1:3002/", customUrl: null },
  ...over,
});

/** A fake fetch that answers from a queue of JSON bodies and records each URL. */
function fakeFetch(bodies: unknown[], calls: string[]): typeof fetch {
  return (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(bodies.shift()), { status: 200 });
  }) as typeof fetch;
}

describe("twenty auth", () => {
  it("picks the origin: subdomain URL, then custom URL, then the base URL", () => {
    assert.equal(originFor(ws(), "http://x"), "http://127.0.0.1:3002");
    assert.equal(
      originFor(
        ws({ workspaceUrls: { subdomainUrl: null, customUrl: "https://c.test/" } }),
        "http://x",
      ),
      "https://c.test",
    );
    assert.equal(originFor(ws({ workspaceUrls: null }), "http://x/"), "http://x");
  });

  it("names the missing workspace in a TEST BUG", () => {
    assert.equal(pickWorkspace([ws()], "Apple").displayName, "Apple");
    assert.throws(() => pickWorkspace([ws()], "Missing"), /TEST BUG: no workspace named Missing/);
  });

  it("throws the GraphQL messages and never the response body", async () => {
    const f = fakeFetch([{ errors: [{ message: "Wrong password" }], data: null }], []);
    await assert.rejects(graphqlData(f, "http://x/metadata", "query Q { a }", {}), (err: Error) => {
      assert.match(err.message, /Wrong password/);
      assert.doesNotMatch(err.message, /LOGIN-TOKEN-FIXTURE/);
      return true;
    });
  });

  it("signs in, then exchanges the login token at the workspace origin", async () => {
    const calls: string[] = [];
    const f = fakeFetch(
      [
        { data: { signIn: { availableWorkspaces: { availableWorkspacesForSignIn: [ws()] } } } },
        {
          data: {
            getAuthTokensFromLoginToken: {
              tokens: { accessOrWorkspaceAgnosticToken: { token: "WS-TOKEN" } },
            },
          },
        },
      ],
      calls,
    );
    const out = await signInWorkspace({
      baseUrl: "http://127.0.0.1:3002",
      email: "e",
      password: "p",
      workspaceName: "Apple",
      fetchImpl: f,
    });
    assert.equal(out.authorizationHeader, "Bearer WS-TOKEN");
    assert.equal(out.origin, "http://127.0.0.1:3002");
    assert.deepEqual(calls, ["http://127.0.0.1:3002/metadata", "http://127.0.0.1:3002/metadata"]);
  });
});
