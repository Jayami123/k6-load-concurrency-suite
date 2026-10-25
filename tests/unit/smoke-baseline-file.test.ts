import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseSmokeBaseline, SMOKE_CASES } from "../../src/load/smoke-baseline.ts";

const RUN_IDS = ["40177412186", "40178773022", "40180625279"];

describe("committed smoke baseline", () => {
  const file = parseSmokeBaseline(JSON.parse(readFileSync("k6/thresholds/smoke-p95.json", "utf8")));

  it("parses and covers the three journey cases with n of at least three", () => {
    for (const caseId of Object.keys(SMOKE_CASES)) {
      const c = file.cases[caseId as keyof typeof SMOKE_CASES];
      assert.ok(c.n >= 3, `${caseId} n ${c.n}`);
      assert.equal(c.n, c.runIds.length);
    }
  });

  it("names exactly the three runs of the phase 3 evidence, for every case", () => {
    for (const caseId of Object.keys(SMOKE_CASES)) {
      assert.deepEqual(file.cases[caseId as keyof typeof SMOKE_CASES].runIds, RUN_IDS);
    }
  });
});
