import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { TWENTY_DEFAULT_ADMIN_EMAIL, TWENTY_DEV_SEED_PASSWORD } from "qa-portfolio-harness";
import {
  twentyBaseUrlFromEnv,
  twentyDatabaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyMailpitUrlFromEnv,
  twentyPasswordFromEnv,
  twentySubdomainFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../src/twenty/env.ts";

describe("twenty env", () => {
  afterEach(() => mock.restoreAll());

  it("defaults to the harness address and the seed workspace", () => {
    assert.equal(twentyBaseUrlFromEnv({}), "http://127.0.0.1:3002");
    assert.equal(twentySubdomainFromEnv({}), "apple");
    assert.equal(twentyWorkspaceNameFromEnv({}), "Apple");
  });

  it("strips one trailing slash from the base URL", () => {
    assert.equal(
      twentyBaseUrlFromEnv({ TWENTY_BASE_URL: "http://127.0.0.1:4000/" }),
      "http://127.0.0.1:4000",
    );
  });

  it("refuses cleartext http to a non-loopback host, and allows loopback and https", () => {
    assert.equal(
      twentyBaseUrlFromEnv({ TWENTY_BASE_URL: "http://localhost:3002" }),
      "http://localhost:3002",
    );
    assert.equal(
      twentyBaseUrlFromEnv({ TWENTY_BASE_URL: "https://twenty.example.test" }),
      "https://twenty.example.test",
    );
    assert.throws(
      () => twentyBaseUrlFromEnv({ TWENTY_BASE_URL: "http://twenty.example.test" }),
      /https:\/\//,
    );
  });

  it("prefers the P6 override, then TWENTY_DB_URL, then the harness default", () => {
    assert.equal(
      twentyDatabaseUrlFromEnv({}),
      "postgres://postgres:postgres@127.0.0.1:5434/default",
    );
    assert.equal(
      twentyDatabaseUrlFromEnv({ TWENTY_DB_URL: "postgres://a@h/x" }),
      "postgres://a@h/x",
    );
    assert.equal(
      twentyDatabaseUrlFromEnv({
        TWENTY_DB_URL: "postgres://a@h/x",
        P6_TWENTY_DATABASE_URL: "postgres://b@h/y",
      }),
      "postgres://b@h/y",
    );
  });

  it("uses TWENTY_EMAIL and TWENTY_PASSWORD when they are set", () => {
    assert.equal(twentyEmailFromEnv({ TWENTY_EMAIL: "login@example.test" }), "login@example.test");
    assert.equal(twentyPasswordFromEnv({ TWENTY_PASSWORD: "value-from-env" }), "value-from-env");
  });

  it("falls back to the harness exports when they are unset or blank", () => {
    assert.equal(twentyEmailFromEnv({}), TWENTY_DEFAULT_ADMIN_EMAIL);
    assert.equal(twentyEmailFromEnv({ TWENTY_EMAIL: "   " }), TWENTY_DEFAULT_ADMIN_EMAIL);
    assert.equal(twentyPasswordFromEnv({}), TWENTY_DEV_SEED_PASSWORD);
    assert.equal(twentyPasswordFromEnv({ TWENTY_PASSWORD: "  " }), TWENTY_DEV_SEED_PASSWORD);
  });

  it("defaults the Mailpit address to loopback 8025 and refuses a remote cleartext host", () => {
    assert.equal(twentyMailpitUrlFromEnv({}), "http://127.0.0.1:8025");
    assert.throws(
      () => twentyMailpitUrlFromEnv({ P6_TWENTY_MAILPIT_URL: "http://mail.example.test" }),
      /ENV:/,
    );
  });

  it("never prints the password", () => {
    const log = mock.method(console, "log", () => {});
    const error = mock.method(console, "error", () => {});
    twentyPasswordFromEnv({});
    twentyPasswordFromEnv({ TWENTY_PASSWORD: "value-from-env" });
    assert.equal(log.mock.callCount() + error.mock.callCount(), 0);
  });
});
