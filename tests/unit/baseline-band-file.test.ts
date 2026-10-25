import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseBaselineBand } from "../../src/load/baseline-band.ts";

describe("committed baseline band", () => {
  it("parses, and holds Cal and Medusa with at least three runs each and unique run ids", () => {
    const b = parseBaselineBand(
      JSON.parse(readFileSync("k6/thresholds/baseline-band.json", "utf8")),
    );
    for (const caseId of ["P6-CAL-LOAD-003", "P6-MED-LOAD-002"]) {
      const product = Object.values(b.products).find((p) => p.caseId === caseId);
      assert.ok(product, `${caseId} is in the band`);
      assert.ok(product.n >= 3);
      assert.equal(new Set(product.runIds).size, product.runIds.length);
    }
  });
});
