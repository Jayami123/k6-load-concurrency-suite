import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { planRelease, type ReleasePlan } from "../../src/dashboard/release-plan.ts";
import { renderSite, type PageContext } from "../../src/dashboard/render/page.ts";
import { buildSiteModel } from "../../src/dashboard/site-model.ts";
import type { SoakTrend } from "../../src/dashboard/soak/read-trends.ts";

function trend(githubRunId: string, runId: string, product: string): SoakTrend {
  return {
    githubRunId,
    caseId: "P6-CAL-LOAD-008",
    runId,
    product,
    durationSec: 1800,
    verdict: "NO THRESHOLD YET",
    rssTheilSenPerMin: 0.1,
    plateauRatio: 1.01,
    buckets: [],
  };
}

function soakSource(ctx: PageContext): string {
  const html = renderSite(buildSiteModel({ verdicts: [] }), new Map(), new Map(), undefined, ctx);
  const summary = html.slice(html.indexOf('id="summary"'), html.indexOf('id="evidence"'));
  const match = summary.match(
    /soak thresholds<\/span><span class="fact-src">source: ([^<]*)<\/span>/,
  );
  assert.ok(match, "soak tile has a source line");
  return match[1] ?? "";
}

const emptySoak: PageContext = {
  sha: "0123456789abcdef",
  builtAt: "2026-10-28 12:00 UTC",
  observations: [],
  soak: { release: "p6-phase4b", calibrated: 0, products: 3 },
};

describe("soak and tolerance release labels", () => {
  it("the committed soak-bounds and tolerance release labels are p6-phase4", () => {
    const soak = JSON.parse(readFileSync("k6/thresholds/soak-bounds.json", "utf8")) as {
      release: string;
    };
    const tolerance = JSON.parse(readFileSync("k6/thresholds/tolerance.json", "utf8")) as {
      release: string;
    };
    assert.equal(soak.release, "p6-phase4");
    assert.equal(tolerance.release, "p6-phase4");
  });

  it("says soak-bounds has no calibrated product and lists each zip's release from the plan", () => {
    const plan: ReleasePlan = planRelease(
      ["111", "222"],
      [
        { tag: "p6-phase4", name: "p6-111-evidence.zip" },
        { tag: "p6-phase4a", name: "p6-222-evidence.zip" },
      ],
      [],
    );
    const src = soakSource({
      ...emptySoak,
      releasePlan: plan,
      soakTrends: [
        trend("111", "inner-a", "cal"),
        trend("111", "inner-b", "medusa"),
        trend("222", "inner-c", "documenso"),
        trend("333", "inner-d", "cal"),
      ],
    });
    assert.match(src, /k6\/thresholds\/soak-bounds\.json has no calibrated product/);
    assert.match(src, /111 \(inner-a, inner-b\) from p6-phase4/);
    assert.match(src, /222 \(inner-c\) from p6-phase4a/);
    assert.match(src, /333 \(inner-d\) from not in the release plan/);
    assert.doesNotMatch(src, /p6-phase4b/);
    const calibrated = soakSource({
      ...emptySoak,
      soak: { release: "p6-phase4", calibrated: 1, products: 3 },
      releasePlan: plan,
      soakTrends: [trend("111", "inner-a", "cal")],
    });
    assert.match(calibrated, /k6\/thresholds\/soak-bounds\.json, release p6-phase4/);
    assert.match(calibrated, /111 \(inner-a\) from p6-phase4/);
    assert.doesNotMatch(calibrated, /no calibrated product/);
  });
});
