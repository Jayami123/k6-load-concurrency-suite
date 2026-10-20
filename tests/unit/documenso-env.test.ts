import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../src/documenso/env.ts";

const PLACEHOLDER_DB = "postgres://documenso:password@127.0.0.1:5451/documenso";

describe("documenso env", () => {
  it("defaults to the harness addresses when unset", () => {
    assert.equal(documensoBaseUrlFromEnv({}), "http://127.0.0.1:3001");
    assert.equal(documensoDatabaseUrlFromEnv({}), PLACEHOLDER_DB);
    assert.equal(inbucketBaseUrlFromEnv({}), "http://127.0.0.1:9003");
    assert.equal(webhookHostFromEnv({}), "p6-webhook.test");
  });

  it("strips a trailing slash from URLs", () => {
    assert.equal(
      documensoBaseUrlFromEnv({ DOCUMENSO_BASE_URL: "http://127.0.0.1:4000/" }),
      "http://127.0.0.1:4000",
    );
    assert.equal(
      inbucketBaseUrlFromEnv({ INBUCKET_BASE_URL: "http://127.0.0.1:9100/" }),
      "http://127.0.0.1:9100",
    );
  });

  it("treats blank values as unset", () => {
    assert.equal(documensoBaseUrlFromEnv({ DOCUMENSO_BASE_URL: "   " }), "http://127.0.0.1:3001");
    assert.equal(documensoDatabaseUrlFromEnv({ DOCUMENSO_DB_URL: "" }), PLACEHOLDER_DB);
    assert.equal(webhookHostFromEnv({ P6_WEBHOOK_HOST: " " }), "p6-webhook.test");
  });

  it("prefers P6_DOCUMENSO_DATABASE_URL over DOCUMENSO_DB_URL", () => {
    assert.equal(
      documensoDatabaseUrlFromEnv({
        P6_DOCUMENSO_DATABASE_URL: "postgres://a/p6",
        DOCUMENSO_DB_URL: "postgres://a/shared",
      }),
      "postgres://a/p6",
    );
    assert.equal(
      documensoDatabaseUrlFromEnv({ DOCUMENSO_DB_URL: "postgres://a/shared" }),
      "postgres://a/shared",
    );
  });

  it("accepts a dotted webhook hostname and lowercases it", () => {
    assert.equal(webhookHostFromEnv({ P6_WEBHOOK_HOST: "P6-Webhook.TEST" }), "p6-webhook.test");
  });

  it("refuses an IP, localhost or a single-label webhook host as TEST BUG", () => {
    for (const host of ["127.0.0.1", "localhost", "nodots"]) {
      assert.throws(
        () => webhookHostFromEnv({ P6_WEBHOOK_HOST: host }),
        /TEST BUG: P6_WEBHOOK_HOST/,
      );
    }
  });
});
