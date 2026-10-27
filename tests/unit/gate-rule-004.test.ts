// P6-RULE-004 (plan Phase 4b task 11 §6.5): no A/B configuration without a cited A/A set. Tier 1 runs always; tier 2 binds once the
// tolerance file exists (the tolerance-file PR adds it, Q-TOLFILE).
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { AA_CASES } from "../../src/load/gate/aa-noise.ts";
import { parseTolerance } from "../../src/load/gate/tolerance.ts";

const TOLERANCE_URL = new URL("../../k6/thresholds/tolerance.json", import.meta.url);
const WORKFLOWS_URL = new URL("../../.github/workflows/", import.meta.url);

/** The workflows that read a tolerance (by file name or by the flag of a gate run). */
function gateWorkflowsNamingTolerance(): Array<{ name: string; text: string }> {
  return readdirSync(WORKFLOWS_URL)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(new URL(name, WORKFLOWS_URL), "utf8") }))
    .filter((w) => /tolerance\.json|--tolerance\b/.test(w.text));
}

describe("P6-RULE-004 tier 1: no A/B configuration without a cited A/A set", () => {
  it("names no tolerance file in a workflow while k6/thresholds/tolerance.json is absent", () => {
    if (existsSync(TOLERANCE_URL)) return; // tier 2 covers the file once it exists
    const named = gateWorkflowsNamingTolerance().map((w) => w.name);
    assert.deepEqual(named, [], `${named.join(", ")} name a tolerance but the file is absent`);
  });
});

describe("P6-RULE-004 tier 2: the tolerance file cites its A/A runs", () => {
  it(
    "parses, has at least three A/A arms per product and metric, and each gate names a steady A/A case",
    { skip: existsSync(TOLERANCE_URL) ? false : "no A/A set yet: the tolerance file is absent" },
    () => {
      const file = parseTolerance(JSON.parse(readFileSync(TOLERANCE_URL, "utf8")));
      for (const [product, metrics] of Object.entries(file.products)) {
        for (const [metric, t] of Object.entries(metrics)) {
          assert.ok(t!.arms >= 3, `${product} ${metric} has fewer than three A/A arms`);
        }
      }
      for (const gate of gateWorkflowsNamingTolerance()) {
        assert.ok(
          AA_CASES.some((caseId) => gate.text.includes(caseId)),
          `${gate.name} names a tolerance but no steady A/A case`,
        );
      }
    },
  );
});
