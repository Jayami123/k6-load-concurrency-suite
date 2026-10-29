import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { armRunFolder } from "../../src/load/tier-aa/arm-folder.ts";

/** An arm folder in the layout the load runner writes: <arm>/P6-MED-LOAD-002/<runId>/ with the three files the verdict reads. */
function arm(runIds: string[]): string {
  const armDir = path.join(mkdtempSync(path.join(tmpdir(), "aa-arm-")), "off-1");
  for (const runId of runIds) {
    const runDir = path.join(armDir, "P6-MED-LOAD-002", runId);
    mkdirSync(runDir, { recursive: true });
    for (const file of ["verdict.json", "run-meta.json", "k6-main-summary.json"]) {
      writeFileSync(path.join(runDir, file), "{}\n");
    }
  }
  return armDir;
}

describe("a/a arm run folder", () => {
  it("reads the one run folder of an arm in the nested layout", () => {
    const armDir = arm(["20261029T085206Z-9f67bfa7"]);
    assert.equal(
      armRunFolder(armDir),
      path.join(armDir, "P6-MED-LOAD-002", "20261029T085206Z-9f67bfa7"),
    );
  });

  it("throws when an arm has no run folder, and names the arm", () => {
    const armDir = arm([]);
    assert.throws(() => armRunFolder(armDir), /arm off-1 has no run folder/);
  });

  it("throws when an arm has two run folders, and names the arm", () => {
    const armDir = arm(["20261029T085206Z-9f67bfa7", "20261029T090130Z-643f0fb0"]);
    assert.throws(() => armRunFolder(armDir), /arm off-1 has 2 run folders/);
  });
});
