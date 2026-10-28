import { escapeLabel } from "../site-model.ts";
import type { AaArmPoint, AaSeries } from "../gate/read-aa.ts";
import { FLOOR } from "../../load/gate/tolerance.ts";
import { medianOf } from "../../load/medians.ts";
import { VIEW, axis, dashFor, mark, scaleLinear, svgDoc, svgText } from "./charts.ts";

function groupByProduct(rows: AaSeries[]): Map<string, AaSeries> {
  const map = new Map<string, AaSeries>();
  for (const row of rows) {
    const prev = map.get(row.product);
    if (!prev) {
      map.set(row.product, { ...row, points: [...row.points] });
      continue;
    }
    prev.points.push(...row.points);
  }
  for (const series of map.values())
    series.points.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return map;
}

function renderTable(product: string, points: AaArmPoint[]): string {
  const rows = points
    .map(
      (p) =>
        `<tr><td>${escapeLabel(p.utcDay)}</td><td><code>${escapeLabel(p.runId)}</code></td><td>${escapeLabel(p.p95Ms.toFixed(3))}</td><td>${p.warmup ? "warm-up, not counted" : "counted"}</td></tr>`,
    )
    .join("");
  return `<table><caption>${escapeLabel(product)} A/A p95 (ms)</caption><thead><tr><th scope="col">UTC day</th><th scope="col">Run</th><th scope="col">p95Ms</th><th scope="col">Arm</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderProduct(series: AaSeries): string {
  const points = series.points;
  if (points.length === 0) return "";
  const days = [...new Set(points.map((p) => p.utcDay))].sort();
  const maxP95 = Math.max(...points.map((p) => p.p95Ms));
  const yMax = maxP95 > 0 ? maxP95 * 1.1 : 1;
  const xScale = scaleLinear([0, Math.max(1, days.length)], [VIEW.left, VIEW.width - VIEW.right]);
  const yScale = scaleLinear([0, yMax], [VIEW.height - VIEW.bottom, VIEW.top]);
  const counted = points.filter((p) => !p.warmup).map((p) => p.p95Ms);
  let body = "";
  if (counted.length > 0) {
    const midY = yScale(medianOf(counted));
    body += `<line x1="${VIEW.left}" y1="${midY.toFixed(1)}" x2="${VIEW.width - VIEW.right}" y2="${midY.toFixed(1)}" stroke="currentColor" stroke-dasharray="${dashFor(1)}" fill="none"/>`;
  }
  const byDay = new Map<string, AaArmPoint[]>();
  for (const p of points) {
    const list = byDay.get(p.utcDay) ?? [];
    list.push(p);
    byDay.set(p.utcDay, list);
  }
  for (let di = 0; di < days.length; di++) {
    const day = days[di]!;
    const group = byDay.get(day) ?? [];
    const cx = xScale(di + 0.5);
    group.forEach((p, i) => {
      const x = cx + (i - (group.length - 1) / 2) * 18;
      const y = yScale(p.p95Ms);
      body += p.warmup ? mark("hollow-circle", x, y, "warm-up, not counted") : mark("circle", x, y);
    });
  }
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = t * yMax;
    return { v, x: VIEW.left, y: yScale(v), label: v.toFixed(0), axis: "y" as const };
  });
  const xTicks = days.map((day, i) => ({
    v: i,
    x: xScale(i + 0.5),
    y: VIEW.height - VIEW.bottom,
    label: day,
    axis: "x" as const,
  }));
  body += axis({
    x0: VIEW.left,
    x1: VIEW.width - VIEW.right,
    y0: VIEW.top,
    y1: VIEW.height - VIEW.bottom,
    ticks: [...xTicks, ...yTicks],
  });
  const runIds = [...new Set(points.map((p) => p.githubRunId))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const floorNote = series.tolerance === FLOOR ? " (FLOOR)" : "";
  const caption = `spread ${series.spread}, tolerance ${series.tolerance}${floorNote} from k6/thresholds/tolerance.json, runs ${runIds.join(" ")}`;
  body += svgText(VIEW.left, VIEW.height - 8, caption);
  const svg = svgDoc({
    id: `aa-${series.product}`,
    title: `${series.product} A/A p95`,
    desc: caption,
    body,
  });
  return `<figure>${svg}<figcaption>${escapeLabel(caption)}</figcaption>${renderTable(series.product, points)}</figure>`;
}

export function renderAaChart(rows: AaSeries[]): string {
  if (rows.length === 0) return "";
  return [...groupByProduct(rows).values()].map(renderProduct).join("");
}
