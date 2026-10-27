import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactForArtifact } from "../../src/load/k6-process.ts";

describe("k6 config before an artifact upload", () => {
  it("replaces the publishable key, tokens, passwords and database urls, and keeps the rest", () => {
    const out = redactForArtifact({
      publishableKey: "pk_live_abc",
      baseUrl: "http://127.0.0.1:9000",
      rate: 7,
      label: "main",
      env: { MEDUSA_ADMIN_PASSWORD: "hunter2", PORT: "9000" },
      audit: { dbUrl: "postgres://u:p@127.0.0.1:5433/medusa", prefix: "p6-qa" },
      slotStarts: ["2026-11-03T09:00:00.000Z"],
    });
    assert.deepEqual(out, {
      publishableKey: "<redacted>",
      baseUrl: "http://127.0.0.1:9000",
      rate: 7,
      label: "main",
      env: { MEDUSA_ADMIN_PASSWORD: "<redacted>", PORT: "9000" },
      audit: { dbUrl: "<redacted>", prefix: "p6-qa" },
      slotStarts: ["2026-11-03T09:00:00.000Z"],
    });
  });

  it("does not change the object it is given", () => {
    const input = { publishableKey: "pk_live_abc" };
    redactForArtifact(input);
    assert.equal(input.publishableKey, "pk_live_abc");
  });
});
