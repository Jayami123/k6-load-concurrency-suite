import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASES } from "../../src/load/cases.ts";

describe("knee self-test case", () => {
  it("the case has three runs: the knee, the under-sized generator and the plan without a knee", () => {
    const kase = CASES["P6-X-LOAD-021"]!;
    assert.equal(kase.label, "knee range, environment-bound");
    const runs = kase.runs({ profileName: "pr", config: { ports: { knee: 1, slow: 2 } } } as never);
    assert.deepEqual(
      runs.map((r) => [r.label, r.allowExits, r.expectValidity, r.expectCodes]),
      [
        ["knee", [99], "VALID", undefined],
        ["undersized", [0, 99], "INVALID", ["dropped_iterations"]],
        ["norule", [0], "INVALID", ["no_knee"]],
      ],
    );
    assert.equal(runs[0]!.knee!.holdSec, 10, "the pr profile holds 10 s");
    assert.equal(kase.runs({ profileName: "full", config: {} } as never)[0]!.knee!.holdSec, 20);
  });

  it("package.json has the knee self-test script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.equal(
      pkg.scripts["load:knee-selftest"],
      "node scripts/load/run-load.ts --case P6-X-LOAD-021",
    );
  });
});
