// The knee chart, drawn at build time as an inline SVG: one bar per product from its knee range's lower bound to its upper bound.
// Pure: the same bars always give the same markup. Labels are escaped here, so no artefact text reaches the page unescaped.
import { escapeLabel } from "../site-model.ts";

export interface KneeBar {
  label: string;
  lower: number;
  upper: number;
}

const WIDTH = 640;
const LEFT = 120;
const RIGHT = 80;
const ROW = 40;
const TOP = 12;
const AXIS = 28;

/** The axis top: the largest upper bound, rounded up to a whole number so the ticks are readable. */
function axisMax(bars: readonly KneeBar[]): number {
  return Math.max(1, Math.ceil(Math.max(...bars.map((b) => b.upper))));
}

/** The SVG of the knee ranges, or "" when there are no bars (the caller then shows the pending state). */
export function kneeRangeSvg(bars: readonly KneeBar[], unit: string): string {
  const valid = bars.filter(
    (b) => Number.isFinite(b.lower) && Number.isFinite(b.upper) && b.lower <= b.upper,
  );
  if (valid.length === 0) return "";
  const max = axisMax(valid);
  const plot = WIDTH - LEFT - RIGHT;
  const x = (v: number) => LEFT + (v / max) * plot;
  const height = TOP + valid.length * ROW + AXIS;
  const rows = valid
    .map((b, i) => {
      const y = TOP + i * ROW;
      const x1 = x(b.lower);
      const x2 = x(b.upper);
      return [
        `<text x="0" y="${y + 20}" font-size="13" fill="currentColor">${escapeLabel(b.label)}</text>`,
        `<rect x="${x1.toFixed(1)}" y="${y + 10}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="14" rx="2" fill="var(--bar-fill)" stroke="var(--bar)"/>`,
        `<text x="${(x2 + 8).toFixed(1)}" y="${y + 21}" font-size="12" font-family="monospace" fill="currentColor">${b.lower} to ${b.upper}</text>`,
      ].join("");
    })
    .join("");
  const ticks = [0, 1, 2, 3, 4].map((step) => {
    const v = (max * step) / 4;
    return `<text x="${x(v).toFixed(1)}" y="${height - 8}" font-size="11" text-anchor="middle" fill="currentColor">${v}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeLabel(`Knee ranges in ${unit}`)}"><title>${escapeLabel(`Knee ranges in ${unit}`)}</title>${rows}<line x1="${LEFT}" y1="${TOP + valid.length * ROW}" x2="${WIDTH - RIGHT}" y2="${TOP + valid.length * ROW}" stroke="currentColor" stroke-opacity="0.4"/>${ticks.join("")}</svg>`;
}
