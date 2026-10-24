import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderChartHtml } from "../../src/load/chart/render-chart.ts";

const fixture = (seconds: number) => {
  const t0 = 1_792_801_000_000;
  const bins = Array.from({ length: seconds }, (_, i) => ({
    t: t0 + i * 1000,
    requests: 40,
    p95Ms: 25,
  }));
  const samples = Array.from({ length: seconds }, (_, i) => ({
    t: t0 + i * 1000,
    cpuCores: 0.5,
    rssMb: 120,
    fds: 20,
    sampleCostMs: 3,
  }));
  return { title: "P6-X-LOAD-002 normal", bins, samples, gaps: [] };
};

describe("render chart", () => {
  it("renders eight panels", () => {
    const html = renderChartHtml(fixture(10));
    assert.equal((html.match(/<section>/g) ?? []).length, 8);
  });

  it("a panel without data says so", () => {
    const html = renderChartHtml({ ...fixture(5), samples: [] });
    assert.match(html, /no data for this panel/);
  });

  it("makes no external reference", () => {
    const html = renderChartHtml(fixture(10));
    assert.doesNotMatch(html, /(src|href)=["']https?:/i);
    assert.doesNotMatch(html, /<script/i);
  });

  it("stays small for a 60 s run and a 30 min run", () => {
    assert.ok(renderChartHtml(fixture(60)).length < 200_000);
    assert.ok(renderChartHtml(fixture(1800)).length < 2_000_000);
  });
});
