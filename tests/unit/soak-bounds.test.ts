import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseSoakBounds, thresholdsFor } from "../../src/load/soak/bounds.ts";

const empty = { schema: 1, metric: "m", unit: "u", release: "r", products: {}, notes: [] };

describe("soak bounds", () => {
  it("the committed file parses and has no entry for any product (NO THRESHOLD YET)", () => {
    const file = parseSoakBounds(
      JSON.parse(readFileSync("k6/thresholds/soak-bounds.json", "utf8")),
    );
    for (const product of ["cal", "medusa", "documenso"])
      assert.equal(thresholdsFor(file, product), null);
  });

  it("an entry for one product is its threshold, and the others stay null", () => {
    const file = parseSoakBounds({
      ...empty,
      products: { medusa: { slopePerMin: 0.5, plateauRatio: 1.2 } },
    });
    assert.deepEqual(thresholdsFor(file, "medusa"), { slopePerMin: 0.5, plateauRatio: 1.2 });
    assert.equal(thresholdsFor(file, "cal"), null);
  });

  it("an unknown product, a slope of 0 or a plateau ratio of 1 is refused", () => {
    assert.throws(
      () =>
        parseSoakBounds({ ...empty, products: { kafka: { slopePerMin: 1, plateauRatio: 1.2 } } }),
      /unknown product/,
    );
    assert.throws(
      () => parseSoakBounds({ ...empty, products: { cal: { slopePerMin: 0, plateauRatio: 1.2 } } }),
      /slopePerMin/,
    );
    assert.throws(
      () => parseSoakBounds({ ...empty, products: { cal: { slopePerMin: 1, plateauRatio: 1 } } }),
      /plateauRatio/,
    );
  });

  it("a wrong schema is refused", () => {
    assert.throws(() => parseSoakBounds({ ...empty, schema: 2 }), /schema must be 1/);
  });
});
