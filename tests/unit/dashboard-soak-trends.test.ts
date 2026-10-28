import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { renderSoakTrends } from "../../src/dashboard/render/soak-chart.ts";
import { downsampleTelemetry } from "../../src/dashboard/soak/downsample.ts";
import { readSoakTrends } from "../../src/dashboard/soak/read-trends.ts";

const SOAK_FIXTURE = "tests/fixtures/dashboard/soak/med-120-40455577906-soak.json";
const TELEMETRY_FIXTURE = "tests/fixtures/dashboard/soak/med-120-40455577906-telemetry-head.json";
const GITHUB_RUN_ID = "40455577906";
const CASE_ID = "P6-MED-LOAD-005";
const RUN_ID = "20261027T053030Z-ba00cb53";

const soakFixture = JSON.parse(readFileSync(SOAK_FIXTURE, "utf8")) as {
  verdict: string;
  statistics: {
    rssMb: { slope: { theilSenPerMin: number }; plateau: { ratio: number } };
  };
};
const telemetryFixture = JSON.parse(readFileSync(TELEMETRY_FIXTURE, "utf8")) as {
  intervalMs: number;
  startedAtMs: number;
  samples: Array<{ t: number; proc?: { rssMb?: number; fds?: number }; db?: { total?: number } }>;
};

function withArtefact(files: { soak?: unknown; telemetry?: unknown }): string {
  const root = mkdtempSync(path.join(tmpdir(), "dashboard-soak-"));
  const runDir = path.join(root, "soak-medusa-120", CASE_ID, RUN_ID);
  mkdirSync(runDir, { recursive: true });
  if (files.soak !== undefined) {
    writeFileSync(path.join(runDir, "soak.json"), `${JSON.stringify(files.soak)}\n`);
  }
  if (files.telemetry !== undefined) {
    writeFileSync(path.join(runDir, "telemetry-main.json"), `${JSON.stringify(files.telemetry)}\n`);
  }
  return root;
}

describe("dashboard soak trends", () => {
  it("med-120 rss theilSenPerMin is 0.1478 from soak.json, not from the buckets", () => {
    const dir = withArtefact({ soak: soakFixture, telemetry: telemetryFixture });
    try {
      const rows = readSoakTrends(dir, GITHUB_RUN_ID);
      assert.equal(rows.length, 1);
      const row = rows[0]!;
      assert.equal(row.rssTheilSenPerMin, soakFixture.statistics.rssMb.slope.theilSenPerMin);
      assert.equal(row.rssTheilSenPerMin, 0.1478153090900617);
      assert.equal(Number(row.rssTheilSenPerMin.toFixed(4)), 0.1478);
      assert.equal(row.buckets.length, 3);
      const chart = renderSoakTrends(rows);
      assert.match(chart, /theilSen 0\.1478 MB\/min/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("plateau ratio is 1.0107 from soak.json", () => {
    const dir = withArtefact({ soak: soakFixture, telemetry: telemetryFixture });
    try {
      const rows = readSoakTrends(dir, GITHUB_RUN_ID);
      const row = rows[0]!;
      assert.equal(row.plateauRatio, soakFixture.statistics.rssMb.plateau.ratio);
      assert.equal(row.plateauRatio, 1.010694309908446);
      assert.equal(Number(row.plateauRatio.toFixed(4)), 1.0107);
      assert.match(renderSoakTrends(rows), /plateau ratio 1\.0107/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("verdict text is NO THRESHOLD YET while soak-bounds products is empty", () => {
    const bounds = JSON.parse(readFileSync("k6/thresholds/soak-bounds.json", "utf8")) as {
      products: Record<string, unknown>;
    };
    assert.deepEqual(bounds.products, {});
    const dir = withArtefact({ soak: soakFixture, telemetry: telemetryFixture });
    try {
      const rows = readSoakTrends(dir, GITHUB_RUN_ID);
      assert.equal(rows[0]?.verdict, "NO THRESHOLD YET");
      assert.match(renderSoakTrends(rows), /NO THRESHOLD YET/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("downsample of 180 samples at 1000 ms yields 3 buckets", () => {
    assert.equal(telemetryFixture.samples.length, 180);
    assert.equal(telemetryFixture.intervalMs, 1000);
    const buckets = downsampleTelemetry(
      telemetryFixture.samples,
      telemetryFixture.startedAtMs,
      telemetryFixture.intervalMs,
    );
    assert.equal(buckets.length, 3);
    assert.deepEqual(
      buckets.map((b) => b.minute),
      [0, 1, 2],
    );
    assert.deepEqual(
      buckets.map((b) => b.n),
      [60, 60, 60],
    );
  });

  it("a missing soak.json yields pending: no soak.json in this artefact", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dashboard-soak-missing-"));
    try {
      const rows = readSoakTrends(dir, GITHUB_RUN_ID);
      assert.deepEqual(rows, []);
      assert.match(renderSoakTrends(rows), /pending: no soak.json in this artefact/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the chart does not contain a numeric RSS bound", () => {
    const bounds = JSON.parse(readFileSync("k6/thresholds/soak-bounds.json", "utf8")) as {
      products: Record<string, unknown>;
    };
    assert.deepEqual(bounds.products, {});
    const dir = withArtefact({ soak: soakFixture, telemetry: telemetryFixture });
    try {
      const chart = renderSoakTrends(readSoakTrends(dir, GITHUB_RUN_ID));
      const withoutVerdict = chart.replaceAll("NO THRESHOLD YET", "");
      assert.doesNotMatch(withoutVerdict, /THRESHOLD|bound/i);
      assert.doesNotMatch(chart, /RSS bound/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
