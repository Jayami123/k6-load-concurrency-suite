import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changedRefs, touchesLoadCode } from "../../src/load/gate/triggers.ts";

describe("a/b trigger detection", () => {
  it("finds a bumped ref in perf.yml (CAL_REF) or bootstrap.sh (MEDUSA_REF), and ignores the +++ and --- file headers", () => {
    const perf = [
      "--- a/.github/workflows/perf.yml",
      "+++ b/.github/workflows/perf.yml",
      "@@ -33,7 +33,7 @@",
      "-  CAL_REF: c2b7ac44c66f24ffef1662b276f0653988a609a3",
      "+  CAL_REF: d111111111111111111111111111111111111111",
    ].join("\n");
    assert.deepEqual(changedRefs(perf), ["CAL_REF"]);
    const bootstrap = [
      "--- a/scripts/bootstrap.sh",
      "+++ b/scripts/bootstrap.sh",
      '-MEDUSA_REF="f677db438f27294fc50e4c7c6612e71ff38eeff5"',
      '+MEDUSA_REF="e222222222222222222222222222222222222222"',
    ].join("\n");
    assert.deepEqual(changedRefs(bootstrap), ["MEDUSA_REF"]);
  });

  it("ignores edits that move other lines and do not change a ref value", () => {
    const diff = [
      "+# a new comment that mentions CAL_REF in prose",
      "-  timeout-minutes: 6",
      "+  timeout-minutes: 7",
    ].join("\n");
    assert.deepEqual(changedRefs(diff), []);
  });

  it("is true for a change under k6/, scripts/load/ or src/load/, and false for workflow-only paths", () => {
    assert.equal(touchesLoadCode(["src/load/gate/ab-gate.ts"]), true);
    assert.equal(touchesLoadCode(["k6/lib/knee.js", "README.md"]), true);
    assert.equal(touchesLoadCode(["scripts/load/run-load.ts"]), true);
    assert.equal(touchesLoadCode([".github/workflows/perf.yml", "scripts/bootstrap.sh"]), false);
  });
});
