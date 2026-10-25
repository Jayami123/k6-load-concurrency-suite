import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CAL_LOAD_005, CASES } from "../../src/load/cases.ts";
import { kneeDefaultsFor } from "../../src/load/knee/plan-input.ts";
import { slotsNeeded } from "../../src/load/knee/cal-supply.ts";
import type { LoadContext } from "../../src/load/types.ts";

describe("cal knee case", () => {
  it("the case, its run (allowExits 0 and 99, knee maxVUs 160) and its telemetry product", () => {
    const ctx = {
      profileName: "pr",
      env: {},
      config: { smokeP95Ms: 77.12 },
    } as unknown as LoadContext;
    assert.equal(CASES["P6-CAL-LOAD-005"], CAL_LOAD_005);
    assert.equal(CAL_LOAD_005.product, "cal");
    assert.equal(CAL_LOAD_005.label, "knee range, environment-bound");
    assert.deepEqual(CAL_LOAD_005.telemetry, { product: "cal" });
    const runs = CAL_LOAD_005.runs(ctx);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0]?.allowExits, [0, 99]);
    assert.equal(runs[0]?.knee?.maxVUs, 160);
    assert.equal(runs[0]?.knee?.smokeP95Ms, 77.12);
  });

  it("the default full plan needs at most 3,000 slots", () => {
    assert.ok(slotsNeeded(kneeDefaultsFor("full")) <= 3000);
  });

  it("package.json has the script and the example config holds the keys the script reads", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    assert.equal(
      pkg.scripts["load:cal-knee"],
      "node scripts/load/run-load.ts --case P6-CAL-LOAD-005",
    );
    const example = JSON.parse(readFileSync("k6/cases/cal-load-005.example.json", "utf8"));
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
      "eventTypeId",
      "eventTypeSlug",
      "host",
      "prefix",
      "windowDays",
    ]) {
      assert.ok(key in example, `example config has no ${key}`);
    }
  });
});
