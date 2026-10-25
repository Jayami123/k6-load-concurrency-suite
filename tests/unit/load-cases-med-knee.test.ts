import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASES, MED_LOAD_004 } from "../../src/load/cases.ts";
import { medKneeDefaultsFor } from "../../src/load/knee/plan-input.ts";
import { stockForKnee } from "../../src/load/knee/med-stock.ts";
import type { LoadContext } from "../../src/load/types.ts";

describe("medusa knee case", () => {
  it("the case, its run (allowExits 0 and 99, knee maxVUs 120) and its telemetry product", () => {
    const ctx = {
      profileName: "pr",
      env: {},
      config: { smokeP95Ms: 171.6 },
    } as unknown as LoadContext;
    assert.equal(CASES["P6-MED-LOAD-004"], MED_LOAD_004);
    assert.equal(MED_LOAD_004.product, "medusa");
    assert.equal(MED_LOAD_004.label, "knee range, environment-bound");
    assert.deepEqual(MED_LOAD_004.telemetry, { product: "medusa" });
    const runs = MED_LOAD_004.runs(ctx);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0]?.allowExits, [0, 99]);
    assert.equal(runs[0]?.knee?.maxVUs, 120);
    assert.equal(runs[0]?.knee?.smokeP95Ms, 171.6);
  });

  it("the stock of the default full plan covers every planned order", () => {
    const plan = medKneeDefaultsFor("full");
    // 30 x (0.5 + 1.0 + ... + 4.0) = 540 orders
    assert.ok(stockForKnee(plan) >= 540);
  });

  it("package.json has the script and the example config holds the keys the script reads", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    assert.equal(
      pkg.scripts["load:medusa-knee"],
      "node scripts/load/run-load.ts --case P6-MED-LOAD-004",
    );
    const example = JSON.parse(readFileSync("k6/cases/med-load-004.example.json", "utf8"));
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
      "publishableKey",
      "regionId",
      "salesChannelId",
      "variantId",
      "prefix",
    ]) {
      assert.ok(key in example, `example config has no ${key}`);
    }
  });
});
