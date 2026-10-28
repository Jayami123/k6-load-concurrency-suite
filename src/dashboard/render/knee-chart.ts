import { escapeLabel } from "../site-model.ts";
import type { KneeCurve, KneeStep } from "../knee/read-curves.ts";
import {
  VIEW,
  axis,
  bandRect,
  dashFor,
  mark,
  polylinePath,
  scaleLinear,
  svgDoc,
} from "./charts.ts";

const PRODUCT_ORDER = ["cal", "medusa", "documenso"] as const;

function isKnee(row: KneeCurve): boolean {
  return row.verdict === "KNEE";
}

function finiteP95(step: KneeStep): number | undefined {
  return typeof step.p95Ms === "number" && Number.isFinite(step.p95Ms) ? step.p95Ms : undefined;
}

function tickLabel(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fiveTicks(min: number, max: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => min + ((max - min) * i) / 4);
}

function renderSvg(product: string, rows: KneeCurve[]): string {
  const rates: number[] = [];
  const p95s: number[] = [];
  for (const row of rows) {
    for (const step of row.steps) {
      rates.push(step.rate);
      const p95 = finiteP95(step);
      if (p95 !== undefined) p95s.push(p95);
    }
  }
  if (rates.length === 0 || p95s.length === 0) return "";
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const maxP95 = Math.max(...p95s);
  if (minRate === maxRate || maxP95 === 0) return "";
  const x0 = VIEW.left;
  const x1 = VIEW.width - VIEW.right;
  const y0 = VIEW.top;
  const y1 = VIEW.height - VIEW.bottom;
  const xScale = scaleLinear([minRate, maxRate], [x0, x1]);
  const yScale = scaleLinear([0, maxP95], [y1, y0]);
  const ticks = [
    ...fiveTicks(minRate, maxRate).map((v) => ({
      v,
      x: xScale(v),
      y: y1,
      label: tickLabel(v),
      axis: "x" as const,
    })),
    ...fiveTicks(0, maxP95).map((v) => ({
      v,
      x: x0,
      y: yScale(v),
      label: tickLabel(v),
      axis: "y" as const,
    })),
  ];
  let body = axis({ x0, x1, y0, y1, ticks });
  rows.forEach((row, runIndex) => {
    body += bandRect(xScale(row.range.lowerRate), xScale(row.range.upperRate), y0, y1);
    const points = row.steps.flatMap((step) => {
      const p95 = finiteP95(step);
      return p95 === undefined ? [] : [{ x: xScale(step.rate), y: yScale(p95) }];
    });
    const d = polylinePath(points);
    if (d !== "") {
      const dash = dashFor(runIndex);
      const dashAttr = dash === "none" ? "" : ` stroke-dasharray="${dash}"`;
      body += `<path d="${d}" fill="none" stroke="currentColor"${dashAttr}/>`;
    }
    const sat = row.firstSaturated;
    if (sat) {
      const step = row.steps.find((s) => s.index === sat.step);
      const p95 = step === undefined ? undefined : finiteP95(step);
      if (step !== undefined && p95 !== undefined) {
        body += mark(
          "triangle",
          xScale(step.rate),
          yScale(p95),
          `${sat.resource} at step ${sat.step}`,
        );
      }
    }
    const stopStep = row.steps.find((s) => s.index === row.stop.step);
    const stopP95 = stopStep === undefined ? undefined : finiteP95(stopStep);
    if (stopStep !== undefined && stopP95 !== undefined) {
      body += mark("square", xScale(stopStep.rate), yScale(stopP95));
    }
  });
  return svgDoc({
    id: `knee-${product}`,
    title: `Knee curves (${product})`,
    desc: `throughput vs p95 for ${product}`,
    width: VIEW.width,
    height: VIEW.height,
    body,
  });
}

function stepTable(rows: KneeCurve[]): string {
  const body = rows
    .flatMap((row) =>
      row.steps.map((step) => {
        const p95 = finiteP95(step);
        const saturated = row.firstSaturated?.step === step.index ? "yes" : "";
        return `<tr><td>${escapeLabel(row.githubRunId)}</td><td>${escapeLabel(row.runId)}</td><td>${escapeLabel(String(step.index))}</td><td>${escapeLabel(String(step.rate))}</td><td>${p95 === undefined ? "" : escapeLabel(String(p95))}</td><td>${escapeLabel(saturated)}</td></tr>`;
      }),
    )
    .join("");
  return `<table><caption>Knee steps</caption><thead><tr><th scope="col">github run id</th><th scope="col">run id</th><th scope="col">step</th><th scope="col">rate</th><th scope="col">p95Ms</th><th scope="col">saturated?</th></tr></thead><tbody>${body}</tbody></table>`;
}

function invalidTable(rows: KneeCurve[]): string {
  const body = rows
    .flatMap((row) => {
      const reasons = row.invalid.length > 0 ? row.invalid : [{ code: "", detail: "" }];
      return reasons.map(
        (inv) =>
          `<tr><td>${escapeLabel(row.githubRunId)}</td><td>${escapeLabel(row.runId)}</td><td>${escapeLabel(inv.code)}</td><td>${escapeLabel(inv.detail)}</td></tr>`,
      );
    })
    .join("");
  return `<table><caption>INVALID knee runs</caption><thead><tr><th scope="col">github run id</th><th scope="col">run id</th><th scope="col">code</th><th scope="col">detail</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderProduct(product: string, rows: KneeCurve[]): string {
  const valid = rows.filter(isKnee);
  const invalid = rows.filter((row) => row.verdict === "INVALID");
  const svg = renderSvg(product, valid);
  const steps = valid.length > 0 ? `<div class="table-wrap">${stepTable(valid)}</div>` : "";
  const listed = invalid.length > 0 ? `<div class="table-wrap">${invalidTable(invalid)}</div>` : "";
  if (svg === "" && steps === "" && listed === "") return "";
  return `<figure>${svg}${steps}${listed}</figure>`;
}

/** One figure per product. VALID runs only. INVALID listed in a <table> under the SVG. */
export function renderKneeCurves(rows: KneeCurve[]): string {
  if (rows.length === 0) return "";
  const groups = new Map<string, KneeCurve[]>();
  for (const row of rows) {
    const list = groups.get(row.product);
    if (list === undefined) groups.set(row.product, [row]);
    else list.push(row);
  }
  const rest = [...groups.keys()].filter((p) => !(PRODUCT_ORDER as readonly string[]).includes(p));
  const products = [...PRODUCT_ORDER.filter((p) => groups.has(p)), ...rest];
  return products
    .map((product) => {
      const group = groups.get(product);
      return group === undefined ? "" : renderProduct(product, group);
    })
    .join("");
}
