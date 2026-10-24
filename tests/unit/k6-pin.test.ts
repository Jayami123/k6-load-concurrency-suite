import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error -- plain .mjs module without types
import { compareK6Version } from "../../scripts/lib/k6-pin.mjs";

describe("k6 pin", () => {
  it("accepts the pinned version", () => {
    const out = "k6 v2.3.0 (commit/e088784614, go1.26.8, linux/amd64)";
    assert.deepEqual(compareK6Version(out, "2.3.0"), { ok: true, installed: "2.3.0" });
  });

  it("rejects another installed version and names it", () => {
    const out = "k6 v1.3.0 (commit/5870e99ae8, go1.25.1, linux/amd64)";
    assert.deepEqual(compareK6Version(out, "2.3.0"), { ok: false, installed: "1.3.0" });
  });

  it("rejects output it cannot parse", () => {
    assert.deepEqual(compareK6Version("command not found", "2.3.0"), {
      ok: false,
      installed: undefined,
    });
  });
});
