import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASES, DOC_LOAD_005 } from "../../src/load/cases.ts";
import type { LoadContext } from "../../src/load/types.ts";

describe("documenso knee case", () => {
  it("the case, its run (allowExits 0 and 99, the token in secretEnv only, knee maxVUs 200) and its telemetry product", () => {
    const ctx = {
      profileName: "full",
      env: {},
      config: { smokeP95Ms: 233.13 },
    } as unknown as LoadContext;
    assert.equal(CASES["P6-DOC-LOAD-005"], DOC_LOAD_005);
    assert.equal(DOC_LOAD_005.product, "documenso");
    assert.equal(DOC_LOAD_005.label, "knee range, environment-bound");
    assert.deepEqual(DOC_LOAD_005.telemetry, { product: "documenso" });
    const runs = DOC_LOAD_005.runs(ctx);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0]?.allowExits, [0, 99]);
    assert.deepEqual(runs[0]?.secretEnv, ["DOCUMENSO_API_TOKEN"]);
    assert.equal(runs[0]?.knee?.maxVUs, 200);
    assert.equal(runs[0]?.knee?.smokeP95Ms, 233.13);
  });

  it("the pr profile's duration is its schedule: 3 steps of 12 s holds and 2 s ramps", () => {
    assert.equal(DOC_LOAD_005.profiles.pr.durationSec, 3 * (12 + 2));
  });

  it("package.json has the script and the example config holds the keys the script reads and no token", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    assert.equal(
      pkg.scripts["load:documenso-knee"],
      "node scripts/load/run-load.ts --case P6-DOC-LOAD-005",
    );
    const example = JSON.parse(readFileSync("k6/cases/doc-load-005.example.json", "utf8"));
    for (const key of [
      "startRate",
      "stepRate",
      "holdSec",
      "rampSec",
      "maxSteps",
      "smokeP95Ms",
      "pre",
      "max",
      "delayAbortEvalSec",
      "baseUrl",
      "prefix",
      "pdfPath",
    ]) {
      assert.ok(key in example, `example config has no ${key}`);
    }
    assert.doesNotMatch(JSON.stringify(example), /token|secret|password/i);
  });
});
