import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ssrfBypassHostsDefault } from "../../scripts/lib/documenso-test-env.mjs";

describe("ssrfBypassHostsDefault", () => {
  it("defaults to p6-webhook.test when nothing is set", () => {
    assert.equal(ssrfBypassHostsDefault({}), "p6-webhook.test");
  });

  it("derives the allowlist from P6_WEBHOOK_HOST, trimmed and lowercased", () => {
    assert.equal(ssrfBypassHostsDefault({ P6_WEBHOOK_HOST: "p6-other.test" }), "p6-other.test");
    assert.equal(ssrfBypassHostsDefault({ P6_WEBHOOK_HOST: " P6-Other.TEST " }), "p6-other.test");
  });

  it("falls back to p6-webhook.test when P6_WEBHOOK_HOST is blank", () => {
    assert.equal(ssrfBypassHostsDefault({ P6_WEBHOOK_HOST: "   " }), "p6-webhook.test");
  });

  it("keeps an explicit bypass value unchanged", () => {
    assert.equal(
      ssrfBypassHostsDefault({
        NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS: "custom.test",
        P6_WEBHOOK_HOST: "p6-other.test",
      }),
      "custom.test",
    );
  });
});
