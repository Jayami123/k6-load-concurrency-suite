import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASES } from "../../src/load/cases.ts";

const LOAD_IDS: Record<string, string> = {
  "P6-CAL-LOAD-001": "k6/cases/cal-load-001.js",
  "P6-CAL-LOAD-007": "k6/cases/cal-load-007.js",
  "P6-CAL-LOAD-009": "k6/cases/cal-load-009.js",
  "P6-MED-LOAD-001": "k6/cases/med-load-001.js",
  "P6-MED-LOAD-002": "k6/cases/med-load-002.js",
  "P6-MED-LOAD-006": "k6/cases/med-load-006.js",
  "P6-DOC-LOAD-001": "k6/cases/doc-load-001.js",
  "P6-DOC-LOAD-002": "k6/cases/doc-load-002.js",
  "P6-DOC-LOAD-007": "k6/cases/doc-load-007.js",
  "P6-DOC-LOAD-008": "k6/cases/doc-load-008.js",
};

describe("product LOAD cases ship telemetry", () => {
  it("every case with a real product has a telemetry product that matches it", () => {
    for (const c of Object.values(CASES)) {
      if (c.product === "stub") continue;
      assert.equal(c.telemetry?.product, c.product, `${c.id} telemetry product`);
    }
  });

  it("every product LOAD case script installs the clock hooks", () => {
    for (const [id, file] of Object.entries(LOAD_IDS)) {
      const text = readFileSync(file, "utf8");
      assert.ok(text.includes("clockHooks("), `${id} (${file}) has no clockHooks(`);
      assert.ok(
        text.includes("export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);"),
        id,
      );
    }
  });
});
