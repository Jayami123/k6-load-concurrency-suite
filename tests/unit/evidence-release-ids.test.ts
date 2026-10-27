import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const WORKFLOW = readFileSync(".github/workflows/evidence-release.yml", "utf8");

describe("evidence release accepts the runs of perf.yml, knee.yml, soak.yml and gate.yml", () => {
  it("declares EVIDENCE_WORKFLOW_IDS as the four workflow ids, perf.yml first, and no single PERF_WORKFLOW_ID", () => {
    const m = /EVIDENCE_WORKFLOW_IDS: "([^"]*)"/.exec(WORKFLOW);
    assert.ok(m, "EVIDENCE_WORKFLOW_IDS is declared");
    const ids = (m[1] ?? "").split(" ");
    assert.deepEqual(ids, ["376454455", "396253729", "397232763", "398161444"]);
    assert.ok(ids.every((id) => /^\d+$/.test(id)));
    assert.doesNotMatch(WORKFLOW, /PERF_WORKFLOW_ID/);
  });

  it("checks membership in the list; the single-id comparison is gone", () => {
    assert.doesNotMatch(WORKFLOW, /--argjson wf/);
    assert.doesNotMatch(WORKFLOW, /workflowDatabaseId == \$wf/);
    assert.match(WORKFLOW, /index\(\$w\)\) != null/);
  });
});
