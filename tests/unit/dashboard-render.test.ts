import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSiteModel, type VerdictInput } from "../../src/dashboard/site-model.ts";
import { kneeRangeSvg } from "../../src/dashboard/render/svg.ts";
import { renderSite } from "../../src/dashboard/render/page.ts";
import { readKnee, readObservations } from "../../scripts/dashboard/build-site.ts";

const verdicts: VerdictInput[] = [
  {
    runId: "20261026T175734Z-aa",
    caseId: "P6-CAL-LOAD-005",
    outcome: "PASS",
    validity: "VALID",
    reasons: [],
  },
  {
    runId: "20261026T180000Z-bb",
    caseId: "P6-MED-RACE-009",
    outcome: "FAIL",
    validity: "VALID",
    reasons: [],
  },
  {
    runId: "20261027T000001Z-cc",
    caseId: "P6-MED-LOAD-009",
    outcome: "FAIL",
    validity: "INVALID",
    reasons: ["dropped iterations"],
  },
];
const runs = new Map([
  ["20261026T175734Z-aa", "40473743598"],
  ["20261026T180000Z-bb", "40473743599"],
  ["20261027T000001Z-cc", "40487849160"],
]);
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
  ],
};
const ctx = {
  sha: "0123456789abcdef",
  builtAt: "2026-10-27 12:00 UTC",
  knee,
  observations: [
    {
      id: "P6-OBS-MED-002",
      title: "cancel-order race leaves reservations on canceled orders",
      file: "2026-10-27-med-cancel-race-reservations.md",
    },
  ],
};
const model = buildSiteModel({ verdicts });
const html = renderSite(model, runs, new Map(), undefined, ctx);

describe("kneeRangeSvg", () => {
  it("draws one bar per product, with the bounds as text", () => {
    const svg = kneeRangeSvg([{ label: "cal", lower: 8, upper: 14 }], "iterations per second");
    assert.match(svg, /^<svg /);
    assert.match(svg, />cal</);
    assert.match(svg, />8 to 14</);
  });

  it("is empty when there are no bars, so the caller shows the pending state", () => {
    assert.equal(kneeRangeSvg([], "iterations per second"), "");
  });

  it("drops a bar whose lower bound is above its upper bound, and a non-finite one", () => {
    assert.equal(kneeRangeSvg([{ label: "x", lower: 5, upper: 1 }], "u"), "");
    assert.equal(kneeRangeSvg([{ label: "x", lower: Number.NaN, upper: 1 }], "u"), "");
  });

  it("escapes a label so no markup from the data reaches the page", () => {
    const svg = kneeRangeSvg([{ label: "<img src=x onerror=1>", lower: 1, upper: 2 }], "u");
    assert.doesNotMatch(svg, /<img/);
    assert.match(svg, /&lt;img/);
  });
});

describe("the page", () => {
  it("is one document with a language, a viewport, one inline style and no script", () => {
    assert.match(html, /^<!doctype html>\n<html lang="en">/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.equal((html.match(/<style>/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<script/i);
  });

  it("has no inline event handler, so it runs under a strict content security policy", () => {
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(html, /javascript:/i);
  });

  it("has the landmarks and table headers an accessibility check needs", () => {
    for (const tag of ["<header>", "<nav", "<main>", "<footer>", "<section"])
      assert.match(html, new RegExp(tag));
    const tables = html.match(/<table>/g) ?? [];
    assert.equal(
      tables.length,
      (html.match(/<caption>/g) ?? []).length,
      "every table has a caption",
    );
    assert.equal((html.match(/<th scope="col">/g) ?? []).length > 0, true, "headers have a scope");
    assert.doesNotMatch(html, /<img(?![^>]*alt=)/i);
  });

  it("keeps section and details tags balanced", () => {
    for (const tag of ["section", "details", "table", "ul", "main", "header", "footer"]) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
      const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      assert.equal(open, close, tag);
    }
  });

  it("shows the build SHA and build date from its inputs", () => {
    assert.match(html, /Built from <code>0123456<\/code> on 2026-10-27 12:00 UTC/);
  });

  it("states each card's status with its text, not colour alone", () => {
    assert.match(html, /<span class="pill pill-pass">PASS<\/span>/);
    assert.match(html, /<span class="pill pill-known-fail">KNOWN FAIL \(P6-OBS-MED-002\)<\/span>/);
    assert.match(html, /<span class="pill pill-pending">PENDING<\/span>/);
  });

  it("draws the knee chart inline, not behind a link", () => {
    const knee = html.slice(html.indexOf('id="knee"'), html.indexOf('id="soak"'));
    assert.match(knee, /<svg /);
    assert.match(knee, />cal</);
    assert.match(knee, /release p6-phase4a/);
  });

  it("a knee card with no bounds shows the pending state and no chart", () => {
    const page = renderSite(model, runs, new Map(), undefined, { ...ctx, knee: undefined });
    const knee = page.slice(page.indexOf('id="knee"'), page.indexOf('id="soak"'));
    assert.doesNotMatch(knee, /<svg /);
  });

  it("changing the knee bounds file changes the summary and the chart", () => {
    const other = renderSite(model, runs, new Map(), undefined, {
      ...ctx,
      knee: { ...knee, products: [{ ...knee.products[0]!, lower: 3, upper: 5 }] },
    });
    assert.notEqual(other, html);
    assert.match(other, /cal 3 to 5/);
    assert.doesNotMatch(other, /cal 8 to 14/);
  });

  it("every number in the summary comes from the inputs (none typed in)", () => {
    const summary = html.slice(html.indexOf('id="summary"'), html.indexOf('id="evidence"'));
    assert.match(summary, /cal 8 to 14; medusa 1.5 to 2.5/);
    assert.match(summary, /1 open observation\(s\)/);
    assert.match(summary, /A\/A tolerance committed; runs pending release/);
  });

  it("a KNOWN FAIL card links the observation document", () => {
    assert.match(html, /docs\/observations\/2026-10-27-med-cancel-race-reservations\.md/);
  });

  it("the INVALID run is listed in provenance and never shown as a pass", () => {
    const provenance = html.slice(html.indexOf('id="provenance"'));
    assert.match(provenance, /20261027T000001Z-cc/);
    assert.match(provenance, /dropped iterations/);
  });

  it("every card has its evidence runs in a collapsible table with headers", () => {
    assert.match(html, /<details><summary>Evidence runs \(1\)<\/summary>/);
    assert.match(html, /<th scope="col">UTC time<\/th>/);
  });
});

describe("the build reads its inputs from files", () => {
  it("readKnee reads products and release, and is undefined without the file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "knee-"));
    try {
      const file = path.join(dir, "knee-bounds.json");
      writeFileSync(
        file,
        JSON.stringify({
          release: "p6-phase4a",
          unit: "iterations per second",
          products: { cal: { lowerBoundRate: 8, upperBoundRate: 14, runIds: ["1"] } },
        }),
      );
      const read = readKnee(file);
      assert.equal(read?.release, "p6-phase4a");
      assert.deepEqual(read?.products, [
        { product: "cal", lower: 8, upper: 14, unit: "iterations per second", runIds: ["1"] },
      ]);
      assert.equal(readKnee(path.join(dir, "missing.json")), undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("readObservations takes each P6-OBS heading and skips files without one", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "obs-"));
    try {
      writeFileSync(
        path.join(dir, "a.md"),
        "# P6-OBS-MED-001: canceled orders keep reservations (PRODUCT BUG)\n",
      );
      writeFileSync(path.join(dir, "b.md"), "# no id here\n");
      assert.deepEqual(readObservations(dir), [
        {
          id: "P6-OBS-MED-001",
          title: "canceled orders keep reservations (PRODUCT BUG)",
          file: "a.md",
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
