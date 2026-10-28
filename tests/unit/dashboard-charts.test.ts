import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  axis,
  bandRect,
  dashFor,
  mark,
  polylinePath,
  svgDoc,
} from "../../src/dashboard/render/charts.ts";

describe("svg chart primitives", () => {
  it("svgDoc wraps title, desc, role=img and aria-labelledby", () => {
    const svg = svgDoc({ id: "knee-cal", title: "Knee", desc: "rate vs p95", body: "<g/>" });
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-labelledby="knee-cal-title knee-cal-desc"/);
    assert.match(svg, /<title id="knee-cal-title">Knee<\/title>/);
    assert.match(svg, /<desc id="knee-cal-desc">rate vs p95<\/desc>/);
  });

  it("polylinePath joins scaled points in order", () => {
    assert.equal(
      polylinePath([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 10 },
      ]),
      "M10.0,20.0L30.0,40.0L50.0,10.0",
    );
  });

  it("bandRect shades x0 to x1", () => {
    const rect = bandRect(12, 40, 8, 88);
    assert.match(rect, /^<rect /);
    assert.match(rect, /x="12.0"/);
    assert.match(rect, /y="8.0"/);
    assert.match(rect, /width="28.0"/);
    assert.match(rect, /height="80.0"/);
    assert.match(rect, /fill="var\(--bar-fill\)"/);
  });

  it("mark hollow-circle is distinct from circle (warm-up vs counted)", () => {
    const counted = mark("circle", 16, 24);
    const warmup = mark("hollow-circle", 16, 24);
    assert.match(counted, /<circle cx="16.0" cy="24.0" r="4" fill="currentColor"\/>/);
    assert.match(warmup, /<circle cx="16.0" cy="24.0" r="4" fill="none" stroke="currentColor"\/>/);
    assert.notEqual(counted, warmup);
  });

  it("dashFor(0) is solid and dashFor(1) contains a dash array", () => {
    assert.equal(dashFor(0), "none");
    assert.equal(dashFor(1), "6 4");
    assert.match(dashFor(1), /\d+\s+\d+/);
  });

  it("axis tick labels are escaped", () => {
    const markup = axis({
      x0: 0,
      x1: 100,
      y0: 0,
      y1: 50,
      ticks: [{ v: 1, x: 10, y: 50, label: `<script>alert("x")</script>`, axis: "x" }],
    });
    assert.doesNotMatch(markup, /<script/);
    assert.match(markup, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  });

  it("svgDoc escapes title and desc so markup cannot break out", () => {
    const svg = svgDoc({
      id: "aa",
      title: `</title><script>alert("t")</script>`,
      desc: `</desc><img src=x onerror=1>`,
      body: "",
    });
    assert.doesNotMatch(svg, /<script/);
    assert.doesNotMatch(svg, /<img/);
    assert.match(svg, /&lt;\/title&gt;/);
    assert.match(svg, /&lt;\/desc&gt;/);
  });

  it("an empty polylinePath is an empty string, not a plot", () => {
    assert.equal(polylinePath([]), "");
    assert.doesNotMatch(polylinePath([]), /M|L/);
  });
});
