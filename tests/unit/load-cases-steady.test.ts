import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASES } from "../../src/load/cases.ts";
import type { KneeBounds } from "../../src/load/knee/bounds.ts";
import { withSteadyProfile } from "../../src/load/steady.ts";

const bounds: KneeBounds = {
  schema: 1,
  metric: "knee range lower bound",
  unit: "iterations per second",
  release: "p6-phase4a",
  products: {
    cal: {
      caseId: "P6-CAL-LOAD-005",
      profile: "full",
      lowerBoundRate: 6,
      medianLowerRate: 6,
      upperBoundRate: 8,
      n: 3,
      runIds: ["1001", "1002", "1003"],
      environment: "ubuntu24 20261023.334.3, 4 vCPU",
      environments: {},
      notes: [],
    },
    medusa: {
      caseId: "P6-MED-LOAD-004",
      profile: "full",
      lowerBoundRate: 1,
      medianLowerRate: 1,
      upperBoundRate: 2,
      n: 3,
      runIds: ["2001", "2002", "2003"],
      environment: "ubuntu24 20261023.334.3, 4 vCPU",
      environments: {},
      notes: [],
    },
  },
};

describe("steady cases", () => {
  it("registers CAL_LOAD_003 with telemetry and a steady profile derived from the bounds", () => {
    const c = CASES["P6-CAL-LOAD-003"]!;
    assert.equal(c.product, "cal");
    assert.deepEqual(c.telemetry, { product: "cal" });
    assert.equal(withSteadyProfile(c, bounds).profiles.steady!.rate, 3);
  });

  it("gives MED_LOAD_002 a steady profile and keeps its stages", () => {
    const base = CASES["P6-MED-LOAD-002"]!;
    const derived = withSteadyProfile(base, bounds);
    assert.equal(derived.profiles.steady!.rate, 0.5);
    assert.equal(derived.stages, base.stages);
  });

  it("has both steady npm scripts", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    assert.equal(
      scripts["load:cal-steady"],
      "node scripts/load/run-load.ts --case P6-CAL-LOAD-003 --profile steady",
    );
    assert.equal(
      scripts["load:medusa-steady"],
      "node scripts/load/run-load.ts --case P6-MED-LOAD-002 --profile steady",
    );
  });
});
