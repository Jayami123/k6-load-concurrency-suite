import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { readKneeCurves } from "../../src/dashboard/knee/read-curves.ts";
import { renderKneeCurves } from "../../src/dashboard/render/knee-chart.ts";

const GITHUB_RUN_ID = "40234172872";
const CAL_RUN_ID = "20261025T211249Z-930402a3";
const DOC_RUN_ID = "20261025T211144Z-2d4c30cb";
const CAL_LIMITATION =
  "the first saturated resource is taken from step 5, before the stop at step 6";

function stageReports(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "knee-curves-"));
  const copies: Array<[string, string]> = [
    [
      "tests/fixtures/dashboard/knee/cal-40234172872.json",
      "knee-cal/P6-CAL-LOAD-005/20261025T211249Z-930402a3/knee-report-main.json",
    ],
    [
      "tests/fixtures/dashboard/knee/doc-invalid-40234172872.json",
      "knee-documenso/P6-DOC-LOAD-005/20261025T211144Z-2d4c30cb/knee-report-main.json",
    ],
  ];
  for (const [src, dest] of copies) {
    const abs = path.join(dir, dest);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, readFileSync(src));
  }
  return dir;
}

describe("dashboard knee curves", () => {
  let dir = "";

  before(() => {
    dir = stageReports();
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("Cal run 40234172872 has 9 steps, range 12 to 14, firstSaturated app_cpu at step 5", () => {
    const rows = readKneeCurves(dir, GITHUB_RUN_ID);
    const cal = rows.find((r) => r.runId === CAL_RUN_ID);
    assert.ok(cal, "cal knee curve is present");
    assert.equal(cal.githubRunId, GITHUB_RUN_ID);
    assert.equal(cal.caseId, "P6-CAL-LOAD-005");
    assert.equal(cal.product, "cal");
    assert.equal(cal.verdict, "KNEE");
    assert.equal(cal.steps.length, 9);
    assert.equal(cal.range.lowerRate, 12);
    assert.equal(cal.range.upperRate, 14);
    assert.equal(cal.firstSaturated?.resource, "app_cpu");
    assert.equal(cal.firstSaturated?.step, 5);
  });

  it("the limitation text is the file's limitation, not invented", () => {
    const fixture = JSON.parse(
      readFileSync("tests/fixtures/dashboard/knee/cal-40234172872.json", "utf8"),
    ) as { limitation: string };
    const cal = readKneeCurves(dir, GITHUB_RUN_ID).find((r) => r.runId === CAL_RUN_ID);
    assert.ok(cal, "cal knee curve is present");
    assert.equal(cal.limitation, fixture.limitation);
    assert.equal(cal.limitation, CAL_LIMITATION);
  });

  it("the INVALID Documenso report 20261025T211144Z-2d4c30cb is listed and not in the polyline", () => {
    const rows = readKneeCurves(dir, GITHUB_RUN_ID);
    const doc = rows.find((r) => r.runId === DOC_RUN_ID);
    assert.ok(doc, "documenso invalid report is present");
    assert.equal(doc.verdict, "INVALID");
    assert.equal(doc.invalid[0]?.code, "dropped_iterations");
    const html = renderKneeCurves(rows);
    assert.match(html, /20261025T211144Z-2d4c30cb/);
    const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
    for (const svg of svgs) {
      assert.doesNotMatch(svg, /20261025T211144Z-2d4c30cb/);
    }
    assert.equal((html.match(/<path d="/g) ?? []).length, 1);
  });

  it("the SVG contains the text app_cpu at step 5", () => {
    const html = renderKneeCurves(readKneeCurves(dir, GITHUB_RUN_ID));
    assert.match(html, /<svg /);
    assert.match(html, /app_cpu at step 5/);
  });

  it("the stop step is marked", () => {
    const html = renderKneeCurves(readKneeCurves(dir, GITHUB_RUN_ID));
    assert.match(html, /<rect x="[^"]+" y="[^"]+" width="8" height="8" fill="currentColor"\/>/);
  });

  it("every number names its github run id in the table", () => {
    const html = renderKneeCurves(readKneeCurves(dir, GITHUB_RUN_ID));
    const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
    const stepTable = tables.find((t) => /saturated\?/.test(t));
    assert.ok(stepTable, "step table is present");
    const tbody = stepTable.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const trs = tbody.match(/<tr>/g) ?? [];
    assert.equal(trs.length, 9);
    assert.equal((tbody.match(/40234172872/g) ?? []).length, 9);
  });
});
