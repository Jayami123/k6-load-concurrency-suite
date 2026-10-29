// The "Weekly soak trend" section (plan section 6.8). Pure: the trend comes in, one <section> of HTML goes out. Below
// REQUIRED_VALID_WEEKS points a product shows its status and table only; at or above it, one inline SVG per metric. No
// script, no image and no colour rule: a point's soak verdict is printed as text beside it.
import {
  isoWeekIndex,
  buildWeeklyTrend,
  REQUIRED_VALID_WEEKS,
  type ProductTrend,
  type TrendPoint,
} from "../soak/weekly-trend.ts";
import { escapeLabel } from "../site-model.ts";
import { axis, scaleLinear, svgDoc, VIEW } from "./charts.ts";

interface Metric {
  key: string;
  label: string;
  pick: (p: TrendPoint) => number | null;
}

const METRICS: Metric[] = [
  { key: "rss-slope", label: "RSS slope (MB per minute)", pick: (p) => p.rssSlope },
  { key: "rss-plateau", label: "RSS plateau ratio", pick: (p) => p.rssPlateau },
  { key: "fds-slope", label: "open fds slope (per minute)", pick: (p) => p.fdsSlope },
  { key: "db-slope", label: "DB connections slope (per minute)", pick: (p) => p.connSlope },
  {
    key: "probe-p95",
    label: "health-probe latency (proxy, 1 Hz), p95 in ms",
    pick: (p) => p.probeP95,
  },
];

const DASH = "&mdash;";

function fmt(value: number | null, digits: number): string {
  return value === null ? DASH : value.toFixed(digits);
}

function runLink(url: string | null): string {
  if (url === null) return DASH;
  const id = url.split("/").pop() ?? "";
  return `<a href="${escapeLabel(url)}">run ${escapeLabel(id)}</a>`;
}

function row(cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

/** One table row per week: a VALID point (verdict beside it) or a gap (reason). Sorted by week. */
function rowsOf(t: ProductTrend): string {
  const pointRows = t.points.map((p) => ({
    isoWeek: p.isoWeek,
    html: row([
      escapeLabel(p.isoWeek),
      "VALID",
      escapeLabel(p.verdict),
      fmt(p.rssSlope, 4),
      fmt(p.rssPlateau, 4),
      fmt(p.fdsSlope, 4),
      fmt(p.connSlope, 4),
      fmt(p.probeP95, 1),
      escapeLabel(p.marker ?? DASH),
      runLink(p.runUrl),
    ]),
  }));
  const gapRows = t.gaps.map((g) => ({
    isoWeek: g.isoWeek,
    html: row([
      escapeLabel(g.isoWeek),
      escapeLabel(g.reason),
      DASH,
      DASH,
      DASH,
      DASH,
      DASH,
      DASH,
      DASH,
      runLink(g.runUrl),
    ]),
  }));
  return [...pointRows, ...gapRows]
    .sort((a, b) => (a.isoWeek < b.isoWeek ? -1 : a.isoWeek > b.isoWeek ? 1 : 0))
    .map((r) => r.html)
    .join("");
}

/** One metric chart: the polyline through VALID points only, gaps as ticks, markers as dashed lines. */
function chartOf(t: ProductTrend, metric: Metric): string {
  const points = t.points.filter((p) => metric.pick(p) !== null);
  const weekIndexes = [
    ...t.points.map((p) => isoWeekIndex(p.isoWeek)),
    ...t.gaps.map((g) => isoWeekIndex(g.isoWeek)),
  ];
  const x0 = Math.min(...weekIndexes);
  const x1 = Math.max(x0 + 1, Math.max(...weekIndexes));
  const values = points.map((p) => metric.pick(p) ?? 0);
  const lo = Math.min(...values);
  const hi = Math.max(...values, lo + 1e-9);
  const pad = (hi - lo) * 0.1 || 1;
  const xs = scaleLinear([x0, x1], [VIEW.left, VIEW.width - VIEW.right]);
  const ys = scaleLinear([lo - pad, hi + pad], [VIEW.height - VIEW.bottom, VIEW.top]);
  const plotted = points.map((p) => ({
    x: xs(isoWeekIndex(p.isoWeek)),
    y: ys(metric.pick(p) ?? 0),
  }));
  const gapTicks = t.gaps
    .map(
      (g) =>
        `<line x1="${xs(isoWeekIndex(g.isoWeek)).toFixed(1)}" y1="${VIEW.height - VIEW.bottom}" x2="${xs(isoWeekIndex(g.isoWeek)).toFixed(1)}" y2="${VIEW.height - VIEW.bottom - 10}" stroke="currentColor"><title>${escapeLabel(`${g.isoWeek}: ${g.reason}`)}</title></line>`,
    )
    .join("");
  const markers = points
    .filter((p) => p.marker !== null)
    .map((p) => {
      const x = xs(isoWeekIndex(p.isoWeek)).toFixed(1);
      return `<line x1="${x}" y1="${VIEW.top}" x2="${x}" y2="${VIEW.height - VIEW.bottom}" stroke="currentColor" stroke-dasharray="6 4"><title>${escapeLabel(p.marker ?? "")}</title></line>`;
    })
    .join("");
  const dots = plotted
    .map(
      (pt, i) =>
        `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" fill="currentColor"><title>${escapeLabel(`${points[i]?.isoWeek ?? ""}: ${points[i]?.verdict ?? ""}`)}</title></circle>`,
    )
    .join("");
  const ticks = [
    ...points.map((p) => ({
      v: 0,
      x: xs(isoWeekIndex(p.isoWeek)),
      y: VIEW.height - VIEW.bottom + 14,
      label: p.isoWeek,
      axis: "x" as const,
    })),
    { v: hi, x: VIEW.left, y: ys(hi), label: hi.toFixed(4), axis: "y" as const },
    { v: lo, x: VIEW.left, y: ys(lo), label: lo.toFixed(4), axis: "y" as const },
  ];
  const line = plotted.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const body = `${axis({ x0: VIEW.left, x1: VIEW.width - VIEW.right, y0: VIEW.top, y1: VIEW.height - VIEW.bottom, ticks })}<polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2"/>${markers}${gapTicks}${dots}`;
  return svgDoc({
    id: `soak-weekly-${t.product}-${metric.key}`,
    title: `${t.product}: ${metric.label}`,
    desc: `${points.length} VALID weekly points; gaps are ticks on the axis with their reason.`,
    body,
  });
}

function productBlock(t: ProductTrend): string {
  const charts =
    t.validCount >= REQUIRED_VALID_WEEKS
      ? METRICS.map(
          (m) =>
            `<figure><figcaption>${escapeLabel(m.label)}</figcaption>${chartOf(t, m)}</figure>`,
        ).join("")
      : "";
  return `<div class="soak-weekly-product"><h3>${escapeLabel(t.product)}</h3><p class="status">${escapeLabel(t.status)}</p>${charts}<div class="table-wrap"><table><caption>${escapeLabel(t.product)} weekly soak, one row per week</caption><thead><tr><th scope="col">week</th><th scope="col">status</th><th scope="col">soak verdict</th><th scope="col">RSS slope (MB/min)</th><th scope="col">RSS plateau</th><th scope="col">fds slope</th><th scope="col">DB connections slope</th><th scope="col">health-probe p95 (ms, proxy)</th><th scope="col">marker</th><th scope="col">run</th></tr></thead><tbody>${rowsOf(t)}</tbody></table></div></div>`;
}

/** The section. With no trend given, each product reads "collecting (0/3 weeks)" with an empty table. */
export function weeklySoakSection(trends: ProductTrend[]): string {
  const list = trends.length > 0 ? trends : buildWeeklyTrend([], null);
  return `<section id="soak-weekly" class="block" aria-labelledby="soak-weekly-title"><h2 id="soak-weekly-title">Weekly soak trend</h2><p>Each point is one weekly 2 h soak with a VALID summary; its soak verdict is printed beside it. Gaps are listed with their reason and never plotted.</p>${list.map(productBlock).join("")}</section>`;
}
