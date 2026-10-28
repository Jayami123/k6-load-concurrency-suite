import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toleranceCheckoutOf } from "../../src/load/gate/triggers.ts";

const WORKFLOW = readFileSync(".github/workflows/gate.yml", "utf8");

describe("a/b verdict tolerance source", () => {
  it("reads the tolerance from the base on a pull request", () => {
    assert.equal(toleranceCheckoutOf("pull_request"), "p6-base");
  });

  it("reads the tolerance from the head on a push to main", () => {
    assert.equal(toleranceCheckoutOf("push"), "p6");
  });

  it("reads the tolerance from the head on a workflow_dispatch", () => {
    assert.equal(toleranceCheckoutOf("workflow_dispatch"), "p6");
  });

  it("wires the detect output into both verdict steps, and gate-detect writes it", () => {
    const verdicts =
      WORKFLOW.match(
        /gate-ab\.ts --product (cal|medusa) --tolerance "[^"]*needs\.detect\.outputs\.tolerance_checkout[^"]*"/g,
      ) ?? [];
    assert.equal(verdicts.length, 2);
    assert.match(
      WORKFLOW,
      /tolerance_checkout: \$\{\{ steps\.detect\.outputs\.tolerance_checkout \}\}/,
    );
    assert.match(
      readFileSync("scripts/load/gate-detect.ts", "utf8"),
      /tolerance_checkout: toleranceCheckoutOf/,
    );
  });
});
