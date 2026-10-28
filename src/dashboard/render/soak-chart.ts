import { escapeLabel } from "../site-model.ts";
import type { SoakTrend } from "../soak/read-trends.ts";
import { VIEW, axis, dashFor, polylinePath, scaleLinear, svgDoc, svgText } from "./charts.ts";

const WIDTH = 720;
const HEIGHT = 320;

function cornerText(row: SoakTrend): string {
  return `theilSen ${row.rssTheilSenPerMin.toFixed(4)} MB/min, plateau ratio ${row.plateauRatio.toFixed(4)}, ${row.verdict}`;
}

function plot(row: SoakTrend): string {
  const buckets = row.buckets;
  if (buckets.length === 0) return "";
  const minutes = buckets.map((b) => b.minute);
  const yValues = buckets.flatMap((b) => [b.rssMb.mean, b.fds.mean, b.dbTotal.mean]);
  const x0 = minutes[0]!;
  const x1 = minutes[minutes.length - 1]!;
  const xDomain: [number, number] = x0 === x1 ? [x0, x0 + 1] : [x0, x1];
  const yMax = Math.max(0, ...yValues);
  const yDomain: [number, number] = yMax === 0 ? [0, 1] : [0, yMax];
  const x = scaleLinear(xDomain, [VIEW.left, WIDTH - VIEW.right]);
  const y = scaleLinear(yDomain, [HEIGHT - VIEW.bottom, VIEW.top]);
  const series = [
    buckets.map((b) => b.rssMb.mean),
    buckets.map((b) => b.fds.mean),
    buckets.map((b) => b.dbTotal.mean),
  ];
  const lines = series
    .map((values, i) => {
      const d = polylinePath(buckets.map((b, j) => ({ x: x(b.minute), y: y(values[j]!) })));
      if (d === "") return "";
      return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="${dashFor(i)}"/>`;
    })
    .join("");
  const xTicks = minutes.map((m) => ({
    v: m,
    x: x(m),
    y: HEIGHT - VIEW.bottom,
    label: String(m),
    axis: "x" as const,
  }));
  const yTicks = [0, 1, 2, 3, 4].map((step) => {
    const v = (yDomain[1] * step) / 4;
    return {
      v,
      x: VIEW.left,
      y: y(v),
      label: String(Number(v.toFixed(1))),
      axis: "y" as const,
    };
  });
  const axes = axis({
    x0: VIEW.left,
    x1: WIDTH - VIEW.right,
    y0: VIEW.top,
    y1: HEIGHT - VIEW.bottom,
    ticks: [...xTicks, ...yTicks],
  });
  const label = svgText(
    VIEW.left + 8,
    VIEW.top + 4,
    cornerText(row),
    `font-family="var(--mono, monospace)"`,
  );
  return svgDoc({
    id: `soak-${row.githubRunId}-${row.runId}`,
    title: `Soak trend ${row.caseId} ${row.githubRunId}`,
    desc: cornerText(row),
    width: WIDTH,
    height: HEIGHT,
    body: axes + lines + label,
  });
}

function table(row: SoakTrend): string {
  const rows = row.buckets
    .map(
      (b) =>
        `<tr><td>${escapeLabel(String(b.minute))}</td><td>${escapeLabel(b.rssMb.mean.toFixed(2))}</td><td>${escapeLabel(b.fds.mean.toFixed(2))}</td><td>${escapeLabel(b.dbTotal.mean.toFixed(2))}</td></tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table><caption>Soak ${escapeLabel(row.caseId)} run ${escapeLabel(row.githubRunId)}</caption><thead><tr><th scope="col">minute</th><th scope="col">rss mean</th><th scope="col">fds mean</th><th scope="col">db.total mean</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function invalidTable(rows: SoakTrend[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td><code>${escapeLabel(r.runId)}</code></td><td><code>${escapeLabel(r.caseId)}</code></td><td>${escapeLabel(r.verdict)}</td><td><code>${escapeLabel(r.githubRunId)}</code></td></tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table><caption>INVALID soak runs (listed, not plotted)</caption><thead><tr><th scope="col">Run</th><th scope="col">Case</th><th scope="col">Verdict</th><th scope="col">GitHub run</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function figure(row: SoakTrend): string {
  const svg = plot(row);
  const caption = `<figcaption>${escapeLabel(cornerText(row))}</figcaption>`;
  return `<figure>${svg}${caption}${table(row)}</figure>`;
}

/** One figure per soak trend. INVALID listed, never plotted. No bound is drawn. */
export function renderSoakTrends(rows: SoakTrend[]): string {
  if (rows.length === 0) return `<p class="muted">pending: no soak.json in this artefact</p>`;
  const invalid = rows.filter((r) => r.verdict === "INVALID");
  const plotted = rows.filter((r) => r.verdict !== "INVALID");
  const figures = plotted.map(figure).join("");
  const listed = invalid.length > 0 ? invalidTable(invalid) : "";
  if (figures === "" && listed === "")
    return `<p class="muted">pending: no soak.json in this artefact</p>`;
  return figures + listed;
}
