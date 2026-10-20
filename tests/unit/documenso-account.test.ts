import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumensoSession } from "../../src/documenso/account.ts";
import {
  checkVerifyEmail,
  signUpVerifiedUser,
  CookieJar,
  generatePassword,
  parseTrpc,
  trpcUrl,
} from "../../src/documenso/account.ts";

describe("generatePassword", () => {
  it("is long and has every character class", () => {
    const pw = generatePassword();
    assert.ok(pw.length >= 24);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /\d/);
    assert.match(pw, /[^A-Za-z0-9]/);
  });

  it("differs on every call", () => {
    assert.notEqual(generatePassword(), generatePassword());
  });
});

describe("trpcUrl", () => {
  it("wraps the input as superjson json and percent-encodes it", () => {
    assert.equal(
      trpcUrl("http://127.0.0.1:3001", "team.find", { a: 1 }),
      "http://127.0.0.1:3001/api/trpc/team.find?input=%7B%22json%22%3A%7B%22a%22%3A1%7D%7D",
    );
  });

  it("omits the query string when there is no input", () => {
    assert.equal(
      trpcUrl("http://127.0.0.1:3001", "organisation.getMany"),
      "http://127.0.0.1:3001/api/trpc/organisation.getMany",
    );
  });
});

describe("parseTrpc", () => {
  it("returns the json payload on success", () => {
    const out = parseTrpc<{ id: number }>(
      "apiToken.create",
      200,
      '{"result":{"data":{"json":{"id":7,"token":"api_x"}}}}',
    );
    assert.deepEqual(out, { id: 7, token: "api_x" });
  });

  it("throws the code and message, not the raw body, on an error", () => {
    const body =
      '{"error":{"json":{"message":"Team not found","code":-32600,"data":{"code":"NOT_FOUND","httpStatus":404}}}}';
    assert.throws(
      () => parseTrpc("team.find", 404, body),
      (err: Error) => {
        assert.equal(err.message, "team.find HTTP 404 NOT_FOUND: Team not found");
        assert.equal(err.message.includes("httpStatus"), false);
        return true;
      },
    );
  });

  it("throws on a non-JSON error page without echoing it", () => {
    assert.throws(
      () => parseTrpc("team.find", 500, "<html>secret-page</html>"),
      (err: Error) => err.message === "team.find HTTP 500: ",
    );
  });
});

describe("CookieJar", () => {
  it("keeps the last value per name across responses", () => {
    const jar = new CookieJar();
    jar.absorb(
      new Response(null, {
        headers: [
          ["set-cookie", "csrfToken=first; Path=/"],
          ["set-cookie", "sessionId=s1; Path=/; HttpOnly"],
        ],
      }),
    );
    jar.absorb(new Response(null, { headers: [["set-cookie", "csrfToken=second; Path=/"]] }));
    assert.equal(jar.header(), "csrfToken=second; sessionId=s1");
    assert.equal(jar.has("sessionId"), true);
    assert.equal(jar.has("missing"), false);
  });
});

describe("checkVerifyEmail", () => {
  it("accepts 200 with state VERIFIED", () => {
    assert.doesNotThrow(() => checkVerifyEmail(200, '{"state":"VERIFIED"}'));
  });

  it("labels an HTML error page with its status and never echoes the body", () => {
    assert.throws(
      () => checkVerifyEmail(502, "<html><body>secret-page-bytes</body></html>"),
      (err: Error) => {
        assert.equal(err.message, "PRODUCT BUG: verify-email HTTP 502 state none");
        return true;
      },
    );
  });

  it("labels an HTML body with 200 as state none", () => {
    assert.throws(
      () => checkVerifyEmail(200, "<html>not json</html>"),
      (err: Error) => err.message === "PRODUCT BUG: verify-email HTTP 200 state none",
    );
  });

  it("labels a JSON null body as state none instead of throwing a TypeError", () => {
    assert.throws(
      () => checkVerifyEmail(200, "null"),
      (err: Error) => err.message === "PRODUCT BUG: verify-email HTTP 200 state none",
    );
  });

  it("reports a non-VERIFIED state from valid JSON", () => {
    assert.throws(
      () => checkVerifyEmail(200, '{"state":"EXPIRED"}'),
      (err: Error) => err.message === "PRODUCT BUG: verify-email HTTP 200 state EXPIRED",
    );
  });
});

type Route = (url: string, init?: RequestInit) => Response;

/** Replaces fetch for one test; every URL must match a route, otherwise the test fails loudly. */
async function withFetch(route: Route, fn: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
    route(String(input), init)) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const json = (body: unknown, status = 200, setCookie?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: setCookie ? [["set-cookie", setCookie]] : undefined,
  });

const inbucketBase = "http://inbucket.test";
const signupEmail = "p6-x-owner@example.com";

/** Happy path up to verify-email; `after` decides the organisation and team lookups. */
function signupRoute(verifyStatus: number, after: Route): Route {
  return (url, init) => {
    if (url.endsWith("/api/auth/csrf")) return json({ csrfToken: "t" }, 200, "csrfToken=t; Path=/");
    if (url.endsWith("/api/auth/email-password/signup")) return new Response("OK", { status: 201 });
    if (url.endsWith("/api/v1/mailbox/p6-x-owner")) {
      return json([
        {
          mailbox: "p6-x-owner",
          id: "m1",
          from: "",
          to: [],
          subject: "Please confirm",
          date: "",
          size: 1,
          seen: false,
        },
      ]);
    }
    if (url.endsWith("/api/v1/mailbox/p6-x-owner/m1")) {
      return json({
        mailbox: "p6-x-owner",
        id: "m1",
        from: "",
        to: [],
        subject: "Please confirm",
        date: "",
        size: 1,
        seen: false,
        header: {},
        body: { text: "/verify-email/tok_1", html: "" },
      });
    }
    if (url.endsWith("/api/auth/email-password/verify-email")) {
      return verifyStatus === 200
        ? json({ state: "VERIFIED" }, 200, "sessionId=s1; Path=/; HttpOnly")
        : new Response("<html>gateway</html>", { status: verifyStatus });
    }
    return after(url, init);
  };
}

const trpcError = (code: string, message: string) =>
  json({ error: { json: { message, data: { code } } } }, 500);

const signUp = (onVerified: (s: DocumensoSession) => void) =>
  signUpVerifiedUser({
    baseUrl: "http://127.0.0.1:3001",
    inbucketBaseUrl: inbucketBase,
    email: signupEmail,
    name: "P6 Owner",
    onVerified,
  });

describe("signUpVerifiedUser cleanup handle", () => {
  it("exposes the verified session when the organisation lookup fails", async () => {
    const seen: DocumensoSession[] = [];
    await withFetch(
      signupRoute(200, (url) =>
        url.includes("organisation.getMany")
          ? trpcError("INTERNAL_SERVER_ERROR", "boom")
          : new Response(null, { status: 404 }),
      ),
      async () => {
        await assert.rejects(
          signUp((s) => seen.push(s)),
          /organisation\.getMany HTTP 500/,
        );
      },
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.jar.has("sessionId"), true);
  });

  it("exposes the verified session when the team lookup fails", async () => {
    const seen: DocumensoSession[] = [];
    await withFetch(
      signupRoute(200, (url) => {
        if (url.includes("organisation.getMany"))
          return json({ result: { data: { json: [{ id: "org_1" }] } } });
        if (url.includes("team.find")) return trpcError("NOT_FOUND", "no team");
        return new Response(null, { status: 404 });
      }),
      async () => {
        await assert.rejects(
          signUp((s) => seen.push(s)),
          /team\.find HTTP 500 NOT_FOUND/,
        );
      },
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.jar.has("sessionId"), true);
  });

  it("does not expose a session when verify-email fails", async () => {
    const seen: DocumensoSession[] = [];
    await withFetch(
      signupRoute(500, () => new Response(null, { status: 404 })),
      async () => {
        await assert.rejects(
          signUp((s) => seen.push(s)),
          /PRODUCT BUG: verify-email HTTP 500 state none/,
        );
      },
    );
    assert.equal(seen.length, 0);
  });
});
