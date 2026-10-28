import { escapeLabel } from "../site-model.ts";
import type { AbGate } from "../gate/read-ab.ts";
import { SELFTEST_TOLERANCE } from "../../load/gate/selftest.ts";
import { VIEW, axis, bandRect, mark, scaleLinear, svgDoc, svgText } from "./charts.ts";

function ratioFigure(opts: {
  id: string;
  title: string;
  desc: string;
  ratios: number[];
  toleranceRel: number | undefined;
  rule?: string;
  small?: boolean;
}): string {
  const height = opts.small ? 160 : VIEW.height;
  const top = opts.small ? 20 : VIEW.top;
  const bottom = opts.small ? 32 : VIEW.bottom;
  const t = opts.toleranceRel ?? 0;
  const lo = 1 - t;
  const hi = 1 + t;
  const ys = [...opts.ratios, lo, hi, 1];
  const yMin = Math.min(...ys, 0.5);
  const yMax = Math.max(...ys, 1.5);
  const xScale = scaleLinear([0.5, 3.5], [VIEW.left, VIEW.width - VIEW.right]);
  const yScale = scaleLinear([yMin, yMax], [height - bottom, top]);
  const yLo = yScale(lo);
  const yHi = yScale(hi);
  let body = bandRect(VIEW.left, VIEW.width - VIEW.right, Math.min(yLo, yHi), Math.max(yLo, yHi));
  opts.ratios.forEach((ratio, i) => {
    body += mark("circle", xScale(i + 1), yScale(ratio));
    body += svgText(xScale(i + 1), yScale(ratio) - 10, String(i + 1));
  });
  const yTicks = [lo, 1, hi].map((v) => ({
    v,
    x: VIEW.left,
    y: yScale(v),
    label: v.toFixed(2),
    axis: "y" as const,
  }));
  const xTicks = [1, 2, 3].map((v) => ({
    v,
    x: xScale(v),
    y: height - bottom,
    label: String(v),
    axis: "x" as const,
  }));
  body += axis({
    x0: VIEW.left,
    x1: VIEW.width - VIEW.right,
    y0: top,
    y1: height - bottom,
    ticks: [...xTicks, ...yTicks],
  });
  const failRule = "only the upper limit 1 + T is the fail rule";
  body += svgText(VIEW.left, height - 6, failRule);
  if (opts.rule) body += svgText(VIEW.left, top - 4, opts.rule);
  return svgDoc({
    id: opts.id,
    title: opts.title,
    desc: opts.desc,
    height,
    body,
  });
}

function calTable(row: AbGate): string {
  const ratios = row.ratios ?? [];
  const a = row.a ?? [];
  const b = row.b ?? [];
  const cells = ratios
    .map(
      (ratio, i) =>
        `<tr><td>${i + 1}</td><td>${escapeLabel(ratio.toFixed(5))}</td><td>${escapeLabel((a[i] ?? Number.NaN).toFixed(3))}</td><td>${escapeLabel((b[i] ?? Number.NaN).toFixed(3))}</td></tr>`,
    )
    .join("");
  return `<table><caption>${escapeLabel(row.product)} A/B ratios (verdict ${escapeLabel(row.verdict ?? "")})</caption><thead><tr><th scope="col">B index</th><th scope="col">ratio</th><th scope="col">A p95Ms</th><th scope="col">B p95Ms</th></tr></thead><tbody>${cells}</tbody></table>`;
}

function unlabelledTable(p95: number[]): string {
  const rows = p95
    .map((v, i) => `<tr><td>${i + 1}</td><td>${escapeLabel(v.toFixed(3))}</td></tr>`)
    .join("");
  return `<table><caption>Medusa p95 in startedAt order</caption><thead><tr><th scope="col">order</th><th scope="col">p95Ms</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderUnlabelled(row: AbGate): string {
  const values = row.p95 ?? [];
  const pending = row.pendingReason ?? "verdict file not in release";
  const height = 200;
  const top = 24;
  const bottom = 40;
  let body = "";
  if (values.length > 0) {
    const max = Math.max(...values);
    const yMax = max > 0 ? max * 1.1 : 1;
    const xScale = scaleLinear(
      [0.5, Math.max(1.5, values.length + 0.5)],
      [VIEW.left, VIEW.width - VIEW.right],
    );
    const yScale = scaleLinear([0, yMax], [height - bottom, top]);
    values.forEach((v, i) => {
      body += mark("circle", xScale(i + 1), yScale(v));
    });
    const xTicks = values.map((_, i) => ({
      v: i + 1,
      x: xScale(i + 1),
      y: height - bottom,
      label: String(i + 1),
      axis: "x" as const,
    }));
    const yTicks = [0, yMax].map((v) => ({
      v,
      x: VIEW.left,
      y: yScale(v),
      label: v.toFixed(0),
      axis: "y" as const,
    }));
    body += axis({
      x0: VIEW.left,
      x1: VIEW.width - VIEW.right,
      y0: top,
      y1: height - bottom,
      ticks: [...xTicks, ...yTicks],
    });
  }
  body += svgText(VIEW.left, height - 8, pending);
  const svg = svgDoc({
    id: "ab-medusa-unlabelled",
    title: "Medusa A/B pending",
    desc: pending,
    height,
    body,
  });
  return `<figure>${svg}<figcaption>pending: ${escapeLabel(pending)}</figcaption>${unlabelledTable(values)}</figure>`;
}

function renderLabelled(row: AbGate): string {
  const ratios = row.ratios ?? [];
  if (ratios.length === 0) return "";
  const caption = [
    "only the upper limit 1 + T is the fail rule",
    row.rule ?? "",
    `verdict ${row.verdict ?? ""}`,
  ]
    .filter(Boolean)
    .join(". ");
  const svg = ratioFigure({
    id: `ab-${row.product}`,
    title: `${row.product} A/B ratios`,
    desc: caption,
    ratios,
    toleranceRel: row.toleranceRel,
    rule: row.rule,
  });
  return `<figure>${svg}<figcaption>${escapeLabel(caption)}</figcaption>${calTable(row)}</figure>`;
}

function renderSelftest(row: AbGate): string {
  const verdict = row.verdict ?? "";
  const title = `gate self-test (slowed): ${verdict}`;
  const ratios = row.ratios ?? [];
  const svg = ratioFigure({
    id: "ab-selftest",
    title,
    desc: title,
    ratios,
    toleranceRel: SELFTEST_TOLERANCE,
    rule: row.rule,
    small: true,
  });
  const tableRows = ratios
    .map((r, i) => `<tr><td>${i + 1}</td><td>${escapeLabel(r.toFixed(5))}</td></tr>`)
    .join("");
  const table = `<table><caption>${escapeLabel(title)}</caption><thead><tr><th scope="col">index</th><th scope="col">ratio</th></tr></thead><tbody>${tableRows}</tbody></table>`;
  return `<figure>${svg}<figcaption>${escapeLabel(title)}</figcaption>${table}</figure>`;
}

export function renderAbChart(rows: AbGate[]): string {
  if (rows.length === 0) return "";
  return rows
    .map((row) => {
      if (row.source === "selftest.json" || row.product === "selftest") return renderSelftest(row);
      if (row.source === "unlabelled-arms") return renderUnlabelled(row);
      if (row.source === "gate-verdict-medusa.json" || row.source === "gate-verdict-cal.json")
        return renderLabelled(row);
      return "";
    })
    .join("");
}
