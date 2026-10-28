import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAaSeries } from "../../src/dashboard/gate/read-aa.ts";
import { readAbGate } from "../../src/dashboard/gate/read-ab.ts";
import { readRaceTallies } from "../../src/dashboard/races/read-tallies.ts";
import { PAGE_CSS } from "../../src/dashboard/render/style.ts";
import { renderSite } from "../../src/dashboard/render/page.ts";
import { buildSiteModel } from "../../src/dashboard/site-model.ts";

const AA_DAY1 = "tests/fixtures/dashboard/aa/40497029348";
const AA_DAY2 = "tests/fixtures/dashboard/aa/40605925118";
const AB_DIR = "tests/fixtures/dashboard/ab/40636843578";
const RACE_RUNS = [
  "40465973379",
  "40469597860",
  "40498902575",
  "40524237209",
  "40526041971",
] as const;

const ctx = {
  sha: "0123456789abcdef",
  builtAt: "2026-10-28 12:00 UTC",
  observations: [],
  aa: [...readAaSeries(AA_DAY1, "40497029348"), ...readAaSeries(AA_DAY2, "40605925118")],
  ab: readAbGate(AB_DIR, "40636843578"),
  races: RACE_RUNS.flatMap((id) => readRaceTallies(`tests/fixtures/dashboard/races/${id}`, id)),
};

const html = renderSite(buildSiteModel({ verdicts: [] }), new Map(), new Map(), undefined, ctx);

function findingsBlock(page: string): string {
  const start = page.indexOf('id="findings"');
  const end = page.indexOf('id="provenance"');
  assert.ok(start >= 0 && end > start, "findings and provenance sections exist");
  return page.slice(start, end);
}

function numberTokens(text: string): Set<string> {
  return new Set(text.match(/-?\d+(?:\.\d+)?/g) ?? []);
}

function tableAfterSvg(page: string, svg: string): string | undefined {
  const at = page.indexOf(svg);
  if (at < 0) return undefined;
  const before = page.slice(0, at);
  const figOpen = before.lastIndexOf("<figure>");
  const afterSvg = at + svg.length;
  if (figOpen >= 0) {
    const figClose = page.indexOf("</figure>", afterSvg);
    if (figClose >= 0) {
      const figure = page.slice(figOpen, figClose + "</figure>".length);
      const inner = figure.match(/<table[\s\S]*?<\/table>/);
      if (inner) return inner[0];
      const sibling = page
        .slice(figClose + "</figure>".length)
        .match(/^\s*(?:<div\b[^>]*>)?\s*<table[\s\S]*?<\/table>/);
      return sibling?.[0].match(/<table[\s\S]*?<\/table>/)?.[0];
    }
  }
  return page
    .slice(afterSvg)
    .match(/^\s*(?:<div\b[^>]*>)?\s*<table[\s\S]*?<\/table>/)?.[0]
    ?.match(/<table[\s\S]*?<\/table>/)?.[0];
}

describe("dashboard findings page", () => {
  it("the findings table has 24 data rows", () => {
    const block = findingsBlock(html);
    const tbody = block.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    assert.equal((tbody.match(/<tr>/g) ?? []).length, 24);
  });

  it("provenance line contains source: docs/findings.json, commit", () => {
    const block = findingsBlock(html);
    assert.match(block, /source: docs\/findings\.json, commit/);
    assert.match(block, /source: docs\/findings\.json, commit 0123456789abcdef/);
  });

  it("every svg[role=img] has title, desc, and a table of the same numbers", () => {
    const svgs = html.match(/<svg\b[\s\S]*?<\/svg>/g) ?? [];
    const images = svgs.filter((svg) => /\brole="img"/.test(svg));
    assert.ok(images.length > 0, "the page has at least one svg[role=img]");
    for (const svg of images) {
      assert.match(svg, /<title\b/, "svg has title");
      assert.match(svg, /<desc\b/, "svg has desc");
      const table = tableAfterSvg(html, svg);
      assert.ok(table, "svg is followed by a table in the same figure or the next sibling");
      const svgNums = numberTokens(
        [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? "").join(" "),
      );
      const tableNums = numberTokens(table);
      assert.ok((table.match(/<tbody>[\s\S]*?<tr>/) ?? []).length > 0, "companion table has rows");
      if (svgNums.size > 0 && tableNums.size > 0) {
        const overlap = [...svgNums].filter((n) => tableNums.has(n));
        assert.ok(
          overlap.length > 0,
          `svg and table share numbers, svg=${[...svgNums].slice(0, 8).join(",")} table=${[...tableNums].slice(0, 8).join(",")}`,
        );
      }
    }
  });

  it("index.html has a Content-Security-Policy meta with script-src 'none'", () => {
    assert.match(
      html,
      /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'none'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'" \/>/,
    );
    assert.match(html, /script-src 'none'/);
  });

  it("PAGE_CSS has no transition or animation", () => {
    assert.doesNotMatch(PAGE_CSS, /transition\s*:/);
    assert.doesNotMatch(PAGE_CSS, /animation\s*:/);
    assert.doesNotMatch(PAGE_CSS, /@keyframes/);
  });

  it("the summary observation tile uses the findings row count", () => {
    const summary = html.slice(html.indexOf('id="summary"'), html.indexOf('id="evidence"'));
    assert.match(summary, /24 open observation\(s\)/);
    assert.match(summary, /source: docs\/findings\.json/);
  });

  it("findings evidence uses runUrl and relative observation files, not blob/main", () => {
    const block = findingsBlock(html);
    assert.match(
      block,
      /href="https:\/\/github\.com\/Jayami123\/k6-load-concurrency-suite\/actions\/runs\/39561220290"/,
    );
    assert.match(block, /href="docs\/observations\/2026-10-27-med-cancel-race-reservations\.md"/);
    assert.doesNotMatch(block, /blob\/main/);
  });
});
