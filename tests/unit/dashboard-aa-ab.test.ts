import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAaSeries, type AaSeries } from "../../src/dashboard/gate/read-aa.ts";
import { readAbGate } from "../../src/dashboard/gate/read-ab.ts";
import { renderAaChart } from "../../src/dashboard/render/aa-chart.ts";
import { renderAbChart } from "../../src/dashboard/render/ab-chart.ts";
import { spreadOf } from "../../src/load/gate/aa-noise.ts";
import { FLOOR } from "../../src/load/gate/tolerance.ts";

const AA_DAY1 = "tests/fixtures/dashboard/aa/40497029348";
const AA_DAY2 = "tests/fixtures/dashboard/aa/40605925118";
const AB_DIR = "tests/fixtures/dashboard/ab/40636843578";
const AB_NEW_DIR = "tests/fixtures/dashboard/ab/40900000000";

function allAa(): AaSeries[] {
  return [...readAaSeries(AA_DAY1, "40497029348"), ...readAaSeries(AA_DAY2, "40605925118")];
}

function seriesOf(product: "cal" | "medusa"): AaSeries {
  const rows = allAa().filter((s) => s.product === product);
  assert.ok(rows.length > 0, `${product} A/A series`);
  const points = rows
    .flatMap((s) => s.points)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { ...rows[0]!, points };
}

function toleranceFile(): {
  products: Record<string, { p95Ms: { spread: number; tolerance: number } }>;
} {
  return JSON.parse(readFileSync("k6/thresholds/tolerance.json", "utf8"));
}

describe("dashboard a/a and a/b", () => {
  it("dropping the earliest startedAt per run per product reproduces Cal p95 77.362, 77.522, 76.212, 60.055, 59.506, 58.341", () => {
    const cal = seriesOf("cal");
    const counted = cal.points
      .filter((p) => !p.warmup)
      .sort(
        (a, b) =>
          a.githubRunId.localeCompare(b.githubRunId) || a.startedAt.localeCompare(b.startedAt),
      );
    assert.deepEqual(
      counted.map((p) => p.p95Ms.toFixed(3)),
      ["77.362", "77.522", "76.212", "60.055", "59.506", "58.341"],
    );
  });

  it("Cal spread 0.28151 and tolerance 0.56302 match tolerance.json", () => {
    const cal = seriesOf("cal");
    const file = toleranceFile().products.cal?.p95Ms;
    assert.ok(file);
    assert.equal(cal.spread, file.spread);
    assert.equal(cal.tolerance, file.tolerance);
    assert.equal(cal.spread.toFixed(5), "0.28151");
    assert.equal(cal.tolerance.toFixed(5), "0.56302");
    const counted = cal.points.filter((p) => !p.warmup).map((p) => p.p95Ms);
    assert.equal(spreadOf(counted), file.spread);
  });

  it("Medusa spread 0.039747 and tolerance 0.1 (FLOOR)", () => {
    const med = seriesOf("medusa");
    const file = toleranceFile().products.medusa?.p95Ms;
    assert.ok(file);
    assert.equal(med.spread, file.spread);
    assert.equal(med.tolerance, file.tolerance);
    assert.equal(med.spread.toFixed(6), "0.039747");
    assert.equal(med.tolerance, 0.1);
    assert.equal(med.tolerance, FLOOR);
  });

  it("warm-up arms are hollow and labelled warm-up, not counted", () => {
    const svg = renderAaChart(allAa());
    assert.match(svg, /<circle cx="[^"]+" cy="[^"]+" r="4" fill="none" stroke="currentColor"\/>/);
    assert.match(svg, /warm-up, not counted/);
    assert.match(svg, /<circle cx="[^"]+" cy="[^"]+" r="4" fill="currentColor"\/>/);
    const cal = seriesOf("cal");
    assert.equal(cal.points.filter((p) => p.warmup).length, 2);
    assert.equal(cal.points.filter((p) => !p.warmup).length, 6);
  });

  it("Cal A/B ratios 0.99807, 0.98549, 1.02465 and verdict PASS from gate-verdict-cal.json", () => {
    const cal = readAbGate(AB_DIR, "40636843578").find((g) => g.source === "gate-verdict-cal.json");
    assert.ok(cal);
    assert.equal(cal.product, "cal");
    assert.equal(cal.verdict, "PASS");
    assert.deepEqual(
      (cal.ratios ?? []).map((r) => r.toFixed(5)),
      ["0.99807", "0.98549", "1.02465"],
    );
  });

  it("the rule text says every B arm's ratio is above 1 + toleranceRel", () => {
    const cal = readAbGate(AB_DIR, "40636843578").find((g) => g.source === "gate-verdict-cal.json");
    assert.ok(cal);
    assert.equal(cal.rule, "repeated regression: every B arm's ratio is above 1 + toleranceRel");
    const html = renderAbChart(readAbGate(AB_DIR, "40636843578"));
    assert.match(html, /every B arm(&#39;|')s ratio is above 1 \+ toleranceRel/);
    assert.match(html, /only the upper limit 1 \+ T is the fail rule/);
  });

  it("Medusa A/B without a verdict file is pending: verdict file not in release", () => {
    const med = readAbGate(AB_DIR, "40636843578").find((g) => g.product === "medusa");
    assert.ok(med);
    assert.equal(med.source, "unlabelled-arms");
    assert.match(med.pendingReason ?? "", /verdict file not in release/);
    assert.equal(med.verdict, undefined);
    const html = renderAbChart(readAbGate(AB_DIR, "40636843578"));
    assert.match(html, /verdict file not in release/);
  });

  it("selftest slowed verdict is FAIL (REGRESSION)", () => {
    const st = readAbGate(AB_DIR, "40636843578").find((g) => g.product === "selftest");
    assert.ok(st);
    assert.equal(st.verdict, "FAIL (REGRESSION)");
    const html = renderAbChart(readAbGate(AB_DIR, "40636843578"));
    assert.match(html, /gate self-test \(slowed\): FAIL \(REGRESSION\)/);
  });

  it("an inferred start-order label never appears as a released a-1 / b-1 in the SVG", () => {
    const html = renderAbChart(readAbGate(AB_DIR, "40636843578"));
    const svgs = html.match(/<svg[\s\S]*?<\/svg>/g)?.join("") ?? "";
    assert.notEqual(svgs.length, 0);
    for (const label of ["a-1", "a-2", "a-3", "b-1", "b-2", "b-3"]) {
      assert.equal(svgs.includes(label), false, `SVG must not contain released label ${label}`);
      assert.equal(html.includes(label), false, `chart must not present ${label} as released`);
    }
  });

  it("old and new gate runs keep one labelled row per product and drop the pending medusa row", () => {
    const rows = [...readAbGate(AB_DIR, "40636843578"), ...readAbGate(AB_NEW_DIR, "40900000000")];
    const html = renderAbChart(rows);
    assert.equal((html.match(/<figure>/g) ?? []).length, 3);
    assert.doesNotMatch(html, /verdict file not in release/);
    assert.doesNotMatch(html, /0\.99807/);
    assert.match(html, /1\.10000/);
    assert.match(html, /1\.01000/);
    assert.match(html, />4\.00000</);
  });

  it("new-only labelled medusa has a verdict and ratios, not pending", () => {
    const rows = readAbGate(AB_NEW_DIR, "40900000000");
    const med = rows.find((g) => g.product === "medusa");
    assert.ok(med);
    assert.equal(med.source, "gate-verdict-medusa.json");
    assert.equal(med.verdict, "PASS");
    assert.deepEqual(
      (med.ratios ?? []).map((r) => r.toFixed(5)),
      ["1.01000", "1.02000", "1.03000"],
    );
    const html = renderAbChart(rows);
    assert.match(html, /medusa A\/B ratios \(verdict PASS\)/);
    assert.doesNotMatch(html, /verdict file not in release/);
  });
});
