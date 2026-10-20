import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkVerifyEmail,
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
