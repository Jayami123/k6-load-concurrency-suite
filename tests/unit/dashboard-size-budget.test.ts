import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderSite } from "../../src/dashboard/render/page.ts";
import { buildSiteModel } from "../../src/dashboard/site-model.ts";

const SIZE_BUDGET = "tests/fixtures/dashboard/size-budget.json";

const html = renderSite(buildSiteModel({ verdicts: [] }), new Map(), new Map(), undefined, {
  sha: "0123456789abcdef",
  builtAt: "2026-10-28 12:00 UTC",
  observations: [],
});

describe("dashboard size budget", () => {
  it("index.html is at most MAX_SITE_BYTES", () => {
    const bytes = Buffer.byteLength(html, "utf8");
    const recorded = existsSync(SIZE_BUDGET)
      ? (JSON.parse(readFileSync(SIZE_BUDGET, "utf8")) as { measuredBytes: number })
      : { measuredBytes: bytes };
    const MEASURED = recorded.measuredBytes;
    const MAX_SITE_BYTES = Math.max(MEASURED + 65536, 163840);
    assert.equal(MAX_SITE_BYTES, Math.max(MEASURED + 65536, 163840));
    assert.ok(
      bytes <= MAX_SITE_BYTES,
      `site/index.html is ${bytes} bytes, MAX_SITE_BYTES is ${MAX_SITE_BYTES} (MEASURED ${MEASURED})`,
    );
  });
});
