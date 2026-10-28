import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSite } from "../../src/dashboard/render/page.ts";
import { buildSiteModel } from "../../src/dashboard/site-model.ts";
import type { KneeCurve } from "../../src/dashboard/knee/read-curves.ts";
import type { PageContext } from "../../src/dashboard/render/page.ts";

const CAL_RUN = "20261025T211249Z-930402a3";
const MEDUSA_RUN = "20261025T211300Z-medusa";

function curve(over: Partial<KneeCurve> & Pick<KneeCurve, "product" | "runId">): KneeCurve {
  return {
    githubRunId: "40234172872",
    caseId: "P6-CAL-LOAD-005",
    verdict: "KNEE",
    range: { lowerStep: 5, upperStep: 6, lowerRate: 12, upperRate: 14 },
    stop: { step: 6, rate: 14, reasons: ["p95"] },
    firstSaturated: { resource: "app_cpu", step: 5 },
    limitation: null,
    steps: [],
    invalid: [],
    ...over,
  };
}

function caption(ctx: PageContext): string {
  const html = renderSite(buildSiteModel({ verdicts: [] }), new Map(), new Map(), undefined, ctx);
  const knee = html.slice(html.indexOf('id="knee"'), html.indexOf('id="soak"'));
  const match = knee.match(/<figcaption>([\s\S]*?)<\/figcaption>/);
  assert.ok(match, "knee bounds figure has a caption");
  return match[1] ?? "";
}

const knee = {
  release: "p6-phase4a",
  products: [
    { product: "cal", lower: 8, upper: 14, unit: "iterations per second", runIds: ["40234172872"] },
    {
      product: "medusa",
      lower: 1.5,
      upper: 2.5,
      unit: "iterations per second",
      runIds: ["40234172872"],
    },
    {
      product: "documenso",
      lower: 4,
      upper: 5,
      unit: "iterations per second",
      runIds: ["40290101719"],
    },
  ],
};

const base: PageContext = {
  sha: "0123456789abcdef",
  builtAt: "2026-10-28 12:00 UTC",
  knee,
  observations: [],
};

describe("knee bounds caption", () => {
  it("lists firstSaturated resource, step and run id for each product that has one", () => {
    const text = caption({
      ...base,
      kneeCurves: [curve({ product: "cal", runId: CAL_RUN, caseId: "P6-CAL-LOAD-005" })],
    });
    assert.match(text, new RegExp(`cal: app_cpu at step 5, run ${CAL_RUN}`));
    assert.doesNotMatch(text, /not in the committed bounds/);
  });

  it("says no saturated resource when firstSaturated is null or the product has no knee curve", () => {
    const text = caption({
      ...base,
      kneeCurves: [
        curve({
          product: "medusa",
          runId: MEDUSA_RUN,
          caseId: "P6-MED-LOAD-004",
          firstSaturated: null,
        }),
      ],
    });
    assert.match(
      text,
      new RegExp(`medusa run ${MEDUSA_RUN}: no saturated resource reported by the knee run`),
    );
    assert.match(text, /documenso: no saturated resource reported by the knee run/);
    assert.doesNotMatch(text, /not in the committed bounds/);
  });
});
