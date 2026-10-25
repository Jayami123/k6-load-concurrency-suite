import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseKneeBounds, steadyRateFor } from "../../src/load/knee/bounds.ts";

describe("committed knee bounds", () => {
  it("parses and gives the steady rates for cal and medusa", () => {
    const b = parseKneeBounds(JSON.parse(readFileSync("k6/thresholds/knee-bounds.json", "utf8")));
    assert.equal(steadyRateFor(b, "cal"), 4);
    assert.equal(steadyRateFor(b, "medusa"), 0.7);
  });
});
