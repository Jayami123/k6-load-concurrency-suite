import { escapeLabel } from "../site-model.ts";
import type { RaceTally } from "../races/read-tallies.ts";
import { scaleLinear, svgDoc, svgText } from "./charts.ts";

const WIDTH = 720;
const HEIGHT = 200;
const LEFT = 48;
const RIGHT = 16;
const TOP = 20;
const BOTTOM = 36;

function plotRows(rows: RaceTally[]): RaceTally[] {
  return [...rows].sort(
    (a, b) => a.githubRunId.localeCompare(b.githubRunId) || a.caseId.localeCompare(b.caseId),
  );
}

function barRect(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  hollow: boolean;
}): string {
  const h = Math.max(0, opts.height);
  if (h === 0) return "";
  if (opts.hollow) {
    return `<rect x="${opts.x.toFixed(1)}" y="${opts.y.toFixed(1)}" width="${opts.width.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="currentColor"/>`;
  }
  return `<rect x="${opts.x.toFixed(1)}" y="${opts.y.toFixed(1)}" width="${opts.width.toFixed(1)}" height="${h.toFixed(1)}" fill="currentColor"/>`;
}

/** Grouped bars per run: solid = attempts, hollow = attempts with violation or suspectedBug. */
export function renderRaceChart(rows: RaceTally[]): string {
  const data = plotRows(rows);
  if (data.length === 0) return "";
  const yMax = Math.max(1, ...data.map((r) => r.attempts));
  const yAt = scaleLinear([0, yMax], [HEIGHT - BOTTOM, TOP]);
  const inner = WIDTH - LEFT - RIGHT;
  const groupW = inner / data.length;
  const barW = Math.min(22, Math.max(6, groupW / 2 - 6));
  const parts: string[] = [];
  for (const [i, row] of data.entries()) {
    const gx = LEFT + i * groupW;
    const solidX = gx + groupW / 2 - barW - 2;
    const hollowX = gx + groupW / 2 + 2;
    const hollowCount = row.attemptsWithViolation + row.attemptsWithSuspectedBug;
    const solidY = yAt(row.attempts);
    const hollowY = yAt(hollowCount);
    parts.push(
      barRect({
        x: solidX,
        y: solidY,
        width: barW,
        height: HEIGHT - BOTTOM - solidY,
        hollow: false,
      }),
      barRect({
        x: hollowX,
        y: hollowY,
        width: barW,
        height: HEIGHT - BOTTOM - hollowY,
        hollow: true,
      }),
      svgText(solidX + barW / 2, solidY - 4, String(row.attempts), 'text-anchor="middle"'),
      svgText(hollowX + barW / 2, hollowY - 4, String(hollowCount), 'text-anchor="middle"'),
      svgText(
        gx + groupW / 2,
        HEIGHT - BOTTOM + 14,
        row.githubRunId,
        'text-anchor="middle" font-size="9" font-family="var(--mono, monospace)"',
      ),
    );
  }
  const svg = svgDoc({
    id: "race-tallies",
    title: "Race tallies",
    desc: "Solid bar: attempts. Hollow bar: attempts with a violation or suspected bug.",
    width: WIDTH,
    height: HEIGHT,
    body: parts.join(""),
  });
  const tableRows = data
    .map(
      (r) =>
        `<tr><td><code>${escapeLabel(r.githubRunId)}</code></td><td>${r.attempts}</td><td>${r.attemptsWithViolation}</td><td>${r.attemptsWithSuspectedBug}</td><td>${escapeLabel(r.verdict)}</td></tr>`,
    )
    .join("");
  return `<figure>${svg}<figcaption>Solid bar: attempts. Hollow bar: attempts with a violation or suspected bug.</figcaption></figure><div class="table-wrap"><table><caption>Race tallies</caption><thead><tr><th scope="col">Run</th><th scope="col">attempts</th><th scope="col">with violation</th><th scope="col">with suspectedBug</th><th scope="col">histogram verdict</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
}
