import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { planRelease, type ReleaseAsset } from "../../src/dashboard/release-plan.ts";
import {
  buildWeeklyTrend,
  GAP_NO_RELEASE,
  statusFor,
  type ProductTrend,
  type ReleaseEntry,
} from "../../src/dashboard/soak/weekly-trend.ts";
import { weeklySoakSection } from "../../src/dashboard/render/weekly-soak.ts";
import { latestWeeklyWeek } from "../../src/load/soak/weekly-summary.ts";

const FIXTURES = "tests/fixtures/soak-trend";

/** The release entries of one fixture case: one folder per release, read the way build-site.ts reads them. */
function entriesOf(caseName: string): ReleaseEntry[] {
  const dir = path.join(FIXTURES, caseName);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .map((tag) => {
      const rel = path.join(dir, tag);
      const assets = readdirSync(rel)
        .filter((name) => name !== "release.json")
        .sort();
      const sumsPath = path.join(rel, "SHA256SUMS.txt");
      const sums = existsSync(sumsPath)
        ? readFileSync(sumsPath, "utf8")
            .trim()
            .split("\n")
            .map((line) => line.split("  ")[1] ?? "")
        : null;
      const releasePath = path.join(rel, "release.json");
      const draft = existsSync(releasePath)
        ? (JSON.parse(readFileSync(releasePath, "utf8")) as { draft?: boolean }).draft === true
        : false;
      const files = assets
        .filter((name) => /^soak-summary-.+\.json$/.test(name))
        .map((name) => ({ name, text: readFileSync(path.join(rel, name), "utf8") }));
      return { tag, draft, assets, sums, files };
    });
}

function trendOf(trends: ProductTrend[], product: string): ProductTrend {
  const t = trends.find((x) => x.product === product);
  assert.ok(t, `a trend for ${product}`);
  return t;
}

describe("weekly soak trend: status, gaps, markers and the section", () => {
  it("zero valid weeks: collecting (0/3 weeks) and no points", () => {
    const trends = buildWeeklyTrend([], null);
    assert.deepEqual(
      trends.map((t) => [t.product, t.status, t.points.length]),
      [
        ["cal", "collecting (0/3 weeks)", 0],
        ["medusa", "collecting (0/3 weeks)", 0],
        ["documenso", "collecting (0/3 weeks)", 0],
      ],
    );
  });

  it("one valid week: collecting (1/3 weeks)", () => {
    const trends = buildWeeklyTrend(entriesOf("one-valid"), null);
    assert.equal(trendOf(trends, "cal").status, "collecting (1/3 weeks)");
    assert.equal(trendOf(trends, "cal").validCount, 1);
  });

  it("two valid weeks: collecting (2/3 weeks)", () => {
    const trends = buildWeeklyTrend(entriesOf("two-valid"), null);
    assert.equal(trendOf(trends, "medusa").status, "collecting (2/3 weeks)");
    assert.equal(statusFor(2), "collecting (2/3 weeks)");
  });

  it("three valid weeks: status trend with three points", () => {
    const trends = buildWeeklyTrend(entriesOf("three-valid"), null);
    const cal = trendOf(trends, "cal");
    assert.equal(cal.validCount, 3);
    assert.equal(cal.status, "trend");
    assert.deepEqual(
      cal.points.map((p) => p.isoWeek),
      ["2026-w44", "2026-w45", "2026-w46"],
    );
  });

  it("an invalid week between two valid weeks is a gap, not a point", () => {
    const trends = buildWeeklyTrend(entriesOf("invalid-between"), null);
    const cal = trendOf(trends, "cal");
    assert.equal(cal.validCount, 2);
    assert.deepEqual(
      cal.gaps.map((g) => [g.isoWeek, g.reason]),
      [["2026-w45", "telemetry gaps over two intervals: 3"]],
    );
    assert.equal(
      cal.points.some((p) => p.isoWeek === "2026-w45"),
      false,
    );
  });

  it("a duplicate week makes both entries gaps", () => {
    const three = entriesOf("three-valid");
    const first = three[0];
    assert.ok(first, "the w44 release exists");
    // A second release that claims the same week (a hand-made release) carries a cal summary for w44 (plan 6.7 rule 5).
    const calOnly = first.files.filter((f) => f.name === "soak-summary-cal.json");
    const duplicated = [...three, { ...first, files: calOnly }];
    const trends = buildWeeklyTrend(duplicated, null);
    const cal = trendOf(trends, "cal");
    assert.equal(cal.validCount, 2);
    assert.equal(
      cal.gaps.filter((g) => g.isoWeek === "2026-w44" && g.reason === "duplicate week").length,
      2,
    );
    assert.equal(trendOf(trends, "medusa").validCount, 3);
  });

  it("a product SHA change is a marker on the later point", () => {
    const cal = trendOf(buildWeeklyTrend(entriesOf("sha-changed"), null), "cal");
    assert.deepEqual(
      cal.points.map((p) => p.marker),
      [null, null, "product SHA changed"],
    );
  });

  it("a harness tag change is a marker", () => {
    const medusa = trendOf(buildWeeklyTrend(entriesOf("harness-changed"), null), "medusa");
    assert.equal(medusa.points[2]?.marker, "harness tag changed");
    assert.equal(medusa.points[1]?.marker, null);
  });

  it("a k6 version change is a marker", () => {
    const cal = trendOf(buildWeeklyTrend(entriesOf("k6-changed"), null), "cal");
    assert.equal(cal.points[2]?.marker, "k6 version changed");
    assert.equal(cal.points[0]?.marker, null);
  });

  it("schema v2 is a gap, and a file whose tag differs from its release is a gap", () => {
    const schema = trendOf(buildWeeklyTrend(entriesOf("schema-v2"), null), "cal");
    assert.deepEqual(
      schema.gaps.map((g) => [g.isoWeek, g.reason]),
      [["2026-w44", "unknown schemaVersion 2"]],
    );

    // A medusa file for w45 placed inside the w44 release: its own tag and week are consistent, but not this release's.
    const entries = entriesOf("one-valid");
    const medusaW45 = JSON.parse(
      readFileSync(
        path.join(FIXTURES, "three-valid", "p6-soak-2026-w45", "soak-summary-medusa.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const release = entries[0];
    assert.ok(release, "the w44 release exists");
    const swapped = {
      ...release,
      files: release.files.map((f) =>
        f.name === "soak-summary-medusa.json"
          ? { name: f.name, text: JSON.stringify(medusaW45) }
          : f,
      ),
    };
    const medusa = trendOf(buildWeeklyTrend([swapped], null), "medusa");
    assert.deepEqual(
      medusa.gaps.map((g) => [g.isoWeek, g.reason]),
      [["2026-w44", "summary does not match its release tag"]],
    );
  });

  it("skipped and failed products get their reasons", () => {
    const trends = buildWeeklyTrend(entriesOf("upstream-failed"), null);
    const medusa = trendOf(trends, "medusa");
    const documenso = trendOf(trends, "documenso");
    const cal = trendOf(trends, "cal");
    assert.ok(
      medusa.gaps.some(
        (g) => g.isoWeek === "2026-w44" && g.reason === "not run: upstream job failed",
      ),
    );
    assert.ok(
      documenso.gaps.some(
        (g) => g.isoWeek === "2026-w44" && g.reason === "not run: upstream job failed",
      ),
    );
    assert.ok(
      cal.gaps.some(
        (g) => g.isoWeek === "2026-w45" && g.reason === "no artefact: job failed before upload",
      ),
    );
  });

  it("gap-fill: a week with no release is a gap for each product, up to expectedThrough", () => {
    const trends = buildWeeklyTrend(entriesOf("gap-fill"), "2026-w47");
    for (const t of trends) {
      const filled = t.gaps.filter((g) => g.reason === GAP_NO_RELEASE);
      assert.deepEqual(
        filled.map((g) => [g.isoWeek, g.tag]),
        [
          ["2026-w45", null],
          ["2026-w47", null],
        ],
      );
      assert.equal(
        t.gaps.some((g) => g.isoWeek === "2026-w48"),
        false,
      );
      assert.equal(
        t.gaps.some((g) => g.isoWeek < "2026-w44"),
        false,
      );
    }
    // The settle window (24 h after the slot) decides whether a week is due yet.
    assert.equal(latestWeeklyWeek(new Date("2026-11-03T20:00:00Z")), "2026-w44");
    assert.equal(latestWeeklyWeek(new Date("2026-11-09T20:00:00Z")), "2026-w45");
  });

  it("an incomplete or draft release is a gap, never a point", () => {
    const trends = buildWeeklyTrend(entriesOf("incomplete"), null);
    for (const t of trends) {
      assert.equal(t.validCount, 0);
      assert.ok(t.gaps.some((g) => g.isoWeek === "2026-w44" && g.reason === "incomplete release"));
      assert.ok(t.gaps.some((g) => g.isoWeek === "2026-w45" && g.reason === "incomplete release"));
    }
  });

  it("the section below three valid points shows collecting and no chart", () => {
    const html = weeklySoakSection(buildWeeklyTrend(entriesOf("two-valid"), null));
    assert.match(html, /collecting \(2\/3 weeks\)/);
    assert.doesNotMatch(html, /<polyline/);
    assert.match(html, /actions\/runs\//);
  });

  it("the section at three valid points draws one polyline per chart, the verdict beside each point, and no script", () => {
    const html = weeklySoakSection(buildWeeklyTrend(entriesOf("three-valid"), null));
    assert.match(html, /<polyline/);
    const rows = html
      .split("<tr>")
      .filter((r) => r.includes("<td>VALID</td>") && r.includes("<td>NO THRESHOLD YET</td>"));
    assert.equal(rows.length, 9, "three products, three weeks each");
    assert.doesNotMatch(html, /<script/i);
  });

  it("planRelease ignores a p6-soak release", () => {
    const soak = entriesOf("plan-release")[0];
    assert.ok(soak, "the w44 soak release exists");
    const assets: ReleaseAsset[] = soak.assets.map((name) => ({ tag: soak.tag, name }));
    const plan = planRelease(["40796699639"], assets, []);
    assert.deepEqual(plan.missing, ["40796699639"]);
    assert.deepEqual(plan.fetch, []);
  });
});
