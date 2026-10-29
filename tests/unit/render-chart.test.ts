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

  it("knee runs draw one labelled band per step behind every chart", () => {
    const f = fixture(10);
    const steps = [0, 1, 2].map((index) => ({
      index,
      rate: 1 + index,
      fromMs: f.bins[index * 3]!.t,
      toMs: f.bins[index * 3 + 2]!.t,
    }));
    const html = renderChartHtml({ ...f, steps });
    assert.equal((html.match(/class="band"/g) ?? []).length, 3 * 7, "seven charts have data");
    assert.match(html, /step 1 · 2\/s/);
  });

  it("a panel without data says so", () => {
    const html = renderChartHtml({ ...fixture(5), samples: [] });
    assert.match(html, /no data for this panel/);
  });

  it("adds the event-loop series and the proxy label", () => {
    const f = fixture(10);
    const html = renderChartHtml({
      ...f,
      samples: f.samples.map((s) => ({ ...s, probeMs: 4 })),
      eventLoop: [0, 1, 2].map((i) => ({ t: 1_792_801_000_000 + i * 1000, v: 2.5 })),
    });
    assert.match(html, /event-loop proxy \(health probe\)/);
    assert.match(html, /eventLoop p99 \(preload\)/);
    assert.equal((html.match(/<section>/g) ?? []).length, 10);
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
