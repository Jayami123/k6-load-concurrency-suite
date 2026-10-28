import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { collectFromArtefactDir } from "../../src/dashboard/collect.ts";

describe("dashboard collect", () => {
  it("collectFromArtefactDir on an empty dir returns empty arrays for every stub", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dashboard-collect-"));
    try {
      const collected = collectFromArtefactDir(dir, "40473743598");
      assert.deepEqual(collected, {
        verdicts: [],
        kneeCurves: [],
        soakTrends: [],
        aa: [],
        ab: [],
        races: [],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
