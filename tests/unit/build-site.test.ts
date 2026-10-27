import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSiteModel } from "../../src/dashboard/site-model.ts";
import { renderSite } from "../../scripts/dashboard/build-site.ts";
import { parsePendingFile } from "../../src/dashboard/release-plan.ts";

const verdicts = [
  {
    runId: "20261026T175734Z-aa",
    caseId: "P6-CAL-LOAD-005",
    outcome: "PASS",
    validity: "VALID",
    reasons: [],
  },
  {
    runId: "20261027T000001Z-bb",
    caseId: "P6-MED-LOAD-009",
    outcome: "FAIL",
    validity: "INVALID",
    reasons: ["dropped iterations"],
  },
];
const model = buildSiteModel({ verdicts });
const runs = new Map([
  ["20261026T175734Z-aa", "40473743598"],
  ["20261027T000001Z-bb", "40487849160"],
]);
const html = renderSite(model, runs);

describe("dashboard site build", () => {
  it("the INVALID run is listed and never plotted into a showcase", () => {
    const knee = html.slice(html.indexOf('id="knee"'), html.indexOf('id="soak"'));
    assert.doesNotMatch(knee, /20261027T000001Z-bb/);
    assert.match(html, /INVALID runs \(listed, not plotted\)/);
    assert.match(html, /20261027T000001Z-bb/);
  });

  it("every run id links to its GitHub run", () => {
    assert.match(
      html,
      /href="https:\/\/github\.com\/Jayami123\/k6-load-concurrency-suite\/actions\/runs\/40473743598"/,
    );
    assert.match(
      html,
      /href="https:\/\/github\.com\/Jayami123\/k6-load-concurrency-suite\/actions\/runs\/40487849160"/,
    );
  });

  it("has no script, stylesheet, image or font, and every external link is a link to the repository", () => {
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<link[^>]+href=/i);
    assert.doesNotMatch(html, /\ssrc=/i);
    assert.doesNotMatch(html, /@import|url\(/i);
    const external = html.match(/https?:\/\/[^\s"<]+/g) ?? [];
    for (const url of external)
      assert.match(url, /^https:\/\/github\.com\/Jayami123\/k6-load-concurrency-suite(\/|$)/, url);
  });

  it("the bare word capacity is absent from the page", () => {
    assert.doesNotMatch(html, /capacity/i);
  });

  it("a pending card shows PENDING with its reason and no number", () => {
    const soak = html.slice(html.indexOf('id="soak"'), html.indexOf('id="two-instance"'));
    assert.match(soak, /PENDING/);
    assert.match(soak, /no VALID 30-minute soak run in a release yet/);
    assert.doesNotMatch(soak, /\d{3,}/);
  });

  it("each ready run links its chart next to its GitHub run", () => {
    const charts = new Map([
      ["20261026T175734Z-aa", "runs/P6-CAL-LOAD-005/20261026T175734Z-aa/chart-main.html"],
    ]);
    const page = renderSite(model, runs, charts);
    assert.match(
      page,
      /<a href="runs\/P6-CAL-LOAD-005\/20261026T175734Z-aa\/chart-main\.html">chart<\/a>/,
    );
  });
});

describe("pending runs on the site", () => {
  it("a pending run is listed under its release with its reason, and no run is plotted for it", () => {
    const model = buildSiteModel({ verdicts: [] });
    const pending = parsePendingFile({
      schema: 1,
      release: "p6-phase4",
      pending: [{ runId: "40242002499", reason: "baseline run waiting for its zip" }],
    });
    const html = renderSite(model, new Map(), new Map(), pending);
    assert.match(html, /<caption>Pending release p6-phase4<\/caption>/);
    assert.match(html, /<code>40242002499<\/code><\/td><td>baseline run waiting for its zip<\/td>/);
  });

  it("without pending runs the provenance table says none", () => {
    const html = renderSite(buildSiteModel({ verdicts: [] }), new Map());
    assert.doesNotMatch(html, /p6-phase4/);
    assert.match(html, /<caption>Pending release<\/caption>/);
    assert.match(html, /colspan="2" class="muted">none</);
  });
});
