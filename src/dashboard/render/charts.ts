import { escapeLabel } from "../site-model.ts";

export const VIEW = { width: 720, height: 280, left: 56, right: 16, top: 24, bottom: 40 } as const;

/** Purpose: one SVG document with title, desc, role="img", aria-labelledby. No external CSS. */
export function svgDoc(opts: {
  id: string;
  title: string;
  desc: string;
  width?: number;
  height?: number;
  body: string;
}): string {
  const w = opts.width ?? VIEW.width;
  const h = opts.height ?? VIEW.height;
  const titleId = `${opts.id}-title`;
  const descId = `${opts.id}-desc`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">${escapeLabel(opts.title)}</title><desc id="${descId}">${escapeLabel(opts.desc)}</desc>${opts.body}</svg>`;
}

/** Purpose: x/y linear scale. Domain must be finite. Throws TEST BUG on a zero-width domain. */
export function scaleLinear(
  domain: [number, number],
  range: [number, number],
): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1)
    throw new Error("TEST BUG: scale domain must be finite and non-zero");
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/** Purpose: polyline `d` attribute from already-scaled points. */
export function polylinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  const [h, ...t] = points;
  if (h === undefined) return "";
  return (
    `M${h.x.toFixed(1)},${h.y.toFixed(1)}` +
    t.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("")
  );
}

/** Purpose: vertical band (knee range, A/B tolerance). */
export function bandRect(x0: number, x1: number, y0: number, y1: number, extra = ""): string {
  const x = Math.min(x0, x1);
  const w = Math.max(1, Math.abs(x1 - x0));
  return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="var(--bar-fill)" fill-opacity="0.5" ${extra}/>`;
}

/** Purpose: x and y axis lines + tick labels. Ticks are numbers, formatted with the mono font. */
export function axis(opts: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  ticks: Array<{ v: number; x: number; y: number; label: string; axis: "x" | "y" }>;
}): string {
  const xLine = `<line x1="${opts.x0}" y1="${opts.y1}" x2="${opts.x1}" y2="${opts.y1}" stroke="currentColor" stroke-opacity="0.4"/>`;
  const yLine = `<line x1="${opts.x0}" y1="${opts.y0}" x2="${opts.x0}" y2="${opts.y1}" stroke="currentColor" stroke-opacity="0.4"/>`;
  const ticks = opts.ticks
    .map((t) => {
      const anchor = t.axis === "y" ? "end" : "middle";
      const dx = t.axis === "y" ? " dx='-4'" : "";
      const dy = t.axis === "x" ? " dy='12'" : " dy='4'";
      return `<text x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" font-size="11" font-family="var(--mono, monospace)" text-anchor="${anchor}" fill="currentColor"${dx}${dy}>${escapeLabel(t.label)}</text>`;
    })
    .join("");
  return xLine + yLine + ticks;
}

export type MarkShape = "circle" | "square" | "triangle" | "hollow-circle";

/** Purpose: one mark. Colour is never the only signal: shape + optional dash must differ. */
export function mark(shape: MarkShape, x: number, y: number, label?: string): string {
  const core =
    shape === "square"
      ? `<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" fill="currentColor"/>`
      : shape === "triangle"
        ? `<polygon points="${x.toFixed(1)},${(y - 5).toFixed(1)} ${(x + 5).toFixed(1)},${(y + 4).toFixed(1)} ${(x - 5).toFixed(1)},${(y + 4).toFixed(1)}" fill="currentColor"/>`
        : shape === "hollow-circle"
          ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="none" stroke="currentColor"/>`
          : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="currentColor"/>`;
  return label ? core + svgText(x + 8, y + 4, label) : core;
}

/** Purpose: dashed stroke for a series index (0 solid, 1 dash, 2 dash-dot, 3 long-dash). */
export function dashFor(index: number): string {
  return ["none", "6 4", "2 3 6 3", "12 4"][index % 4] ?? "none";
}

/** Purpose: a text label, escaped. */
export function svgText(x: number, y: number, text: string, extra = ""): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" fill="currentColor" ${extra}>${escapeLabel(text)}</text>`;
}
