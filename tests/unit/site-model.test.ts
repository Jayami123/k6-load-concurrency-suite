import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSiteModel, escapeLabel } from "../../src/dashboard/site-model.ts";

const verdict = (runId: string, caseId: string, validity = "VALID") => ({
  runId,
  caseId,
  outcome: "PASS",
  validity,
  reasons: [],
});

describe("dashboard site model", () => {
  it("a showcase without its data is pending with its reason, never a number", () => {
    const m = buildSiteModel({ verdicts: [], hasSoakData: false, hasInvariantData: false });
    const soak = m.showcases.find((s) => s.id === "soak");
    assert.equal(soak?.status, "pending");
    assert.equal(soak?.pending, "waiting for the soak data (Task 7)");
    assert.deepEqual(soak?.runLinks, []);
  });

  it("the showcases keep their order, and the INVALID runs are sorted by case then run", () => {
    const m = buildSiteModel({
      verdicts: [
        verdict("r9", "P6-CAL-LOAD-002", "INVALID"),
        verdict("r1", "P6-MED-LOAD-007", "INVALID"),
        verdict("r2", "P6-MED-LOAD-007", "INVALID"),
      ],
      hasSoakData: true,
      hasInvariantData: true,
    });
    assert.deepEqual(
      m.showcases.map((s) => s.id),
      ["knee", "soak", "two-instance"],
    );
    assert.deepEqual(
      m.invalidRuns.map((r) => `${r.caseId}/${r.runId}`),
      ["P6-CAL-LOAD-002/r9", "P6-MED-LOAD-007/r1", "P6-MED-LOAD-007/r2"],
    );
  });

  it("escapes run labels and reasons before they reach the page", () => {
    assert.equal(
      escapeLabel(`<script>alert("x") & 'y'</script>`),
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });
});
