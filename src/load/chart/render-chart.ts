import type { SecondBin } from "./k6-points.ts";

export interface ChartSample {
  t: number;
  cpuCores?: number;
  rssMb?: number;
  fds?: number;
  members?: number;
  sampleCostMs?: number;
  /** The health probe's latency in ms (sampler `probe.ms`); drawn as the event-loop proxy when present. */
  probeMs?: number;
}

export interface ChartInput {
  title: string;
  bins: SecondBin[];
  samples: ChartSample[];
  gaps: Array<{ fromMs: number; toMs: number }>;
  /** Knee runs (plan task 1 §6.6): one labelled band per held step, drawn behind every chart. */
  steps?: Array<{ index: number; rate: number; fromMs: number; toMs: number }>;
  /** Per-second maximum of p99 across the in-window server pids (the preload); drawn only when present. */
  eventLoop?: Array<{ t: number; v: number }>;
}

const W = 720;
const H = 120;

function polyline(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/** One panel: a title, an inline SVG line for the series, or the text "no data" when the series is empty. */
function panel(
  title: string,
  series: Array<{ t: number; v?: number }>,
  t0: number,
  t1: number,
  note = "",
): string {
  const pts = series.filter((s) => s.v !== undefined && Number.isFinite(s.v)) as Array<{
    t: number;
    v: number;
  }>;
  if (pts.length === 0)
    return `<section><h3>${title}</h3><p class="absent">no data for this panel</p></section>`;
  const vmax = Math.max(...pts.map((p) => p.v), 1e-9);
  const span = Math.max(t1 - t0, 1);
  const line = polyline(
    pts.map((p) => ({ x: ((p.t - t0) / span) * W, y: H - (p.v / vmax) * (H - 8) - 4 })),
  );
  return `<section><h3>${title} <small>max ${vmax.toFixed(2)}</small></h3><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${title}"><polyline fill="none" stroke="#2b6cb0" stroke-width="1.5" points="${line}"/></svg>${note ? `<p class="note">${note}</p>` : ""}</section>`;
}

/**
 * One self-contained HTML file with eight panels (plan §6.5): requests per second, p95 (info, not a result), generator CPU, the app
 * group CPU and RSS, fds, the sampler's own cost, and the gap markers. No external reference: no script, no font, no image URL.
 */
export function renderChartHtml(input: ChartInput): string {
  const bins = input.bins;
  const t0 = Math.min(
    ...[...bins.map((b) => b.t), ...input.samples.map((s) => s.t)],
    Number.POSITIVE_INFINITY,
  );
  const t1 = Math.max(
    ...[...bins.map((b) => b.t), ...input.samples.map((s) => s.t)],
    Number.NEGATIVE_INFINITY,
  );
  const base = Number.isFinite(t0) ? t0 : 0;
  const end = Number.isFinite(t1) ? t1 : 1;
  const samples = input.samples;
  const panels = [
    panel(
      "Requests per second",
      bins.map((b) => ({ t: b.t, v: b.requests })),
      base,
      end,
    ),
    panel(
      "p95 latency (ms) — info, not a result",
      bins.map((b) => ({ t: b.t, v: b.p95Ms })),
      base,
      end,
      "Shown for context only; no latency gate in Phase 3 (D9).",
    ),
    panel("Generator (k6) CPU, cores", [], base, end, "No k6 CPU series is sampled yet."),
    panel(
      "App process group CPU, cores",
      samples.map((s) => ({ t: s.t, v: s.cpuCores })),
      base,
      end,
    ),
    panel(
      "App process group RSS, MB",
      samples.map((s) => ({ t: s.t, v: s.rssMb })),
      base,
      end,
    ),
    panel(
      "App process group fds",
      samples.map((s) => ({ t: s.t, v: s.fds })),
      base,
      end,
    ),
    panel(
      "Sampler cost, ms",
      samples.map((s) => ({ t: s.t, v: s.sampleCostMs })),
      base,
      end,
    ),
    panel(
      "Gaps (sampler stalls)",
      samples.map((s) => ({
        t: s.t,
        v: input.gaps.some((g) => s.t >= g.fromMs && s.t <= g.toMs) ? 1 : 0,
      })),
      base,
      end,
      `${input.gaps.length} gap(s) longer than 2 intervals.`,
    ),
    ...(samples.some((s) => s.probeMs !== undefined)
      ? [
          panel(
            "event-loop proxy (health probe)",
            samples.map((s) => ({ t: s.t, v: s.probeMs })),
            base,
            end,
            "Health-probe latency in ms: a proxy for the event loop, not the loop's own delay.",
          ),
        ]
      : []),
    ...(input.eventLoop && input.eventLoop.length > 0
      ? [
          panel(
            "eventLoop p99 (preload)",
            input.eventLoop,
            base,
            end,
            "Per-second maximum of p99 across the server processes in the run window.",
          ),
        ]
      : []),
  ].join("\n");
  const span = Math.max(end - base, 1);
  const bandMarkup = (input.steps ?? [])
    .map((st) => {
      const x = Math.max(0, ((st.fromMs - base) / span) * W);
      const w = Math.max(0, Math.min(W, ((st.toMs - base) / span) * W) - x);
      return `<rect class="band" x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" fill="#718096" fill-opacity="0.12"/><text class="band-label" x="${(x + 3).toFixed(1)}" y="12" font-size="10" fill="#4a5568">step ${st.index} · ${st.rate}/s</text>`;
    })
    .join("");
  const banded = bandMarkup
    ? panels.replace(/<svg viewBox="0 0 720 120"[^>]*>/g, (m) => m + bandMarkup)
    : panels;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${input.title}</title>
<style>
:root { --fg: #1a202c; --bg: #ffffff; --muted: #4a5568; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #e2e8f0; --bg: #1a202c; --muted: #a0aec0; } }
:root[data-theme="dark"] { --fg: #e2e8f0; --bg: #1a202c; --muted: #a0aec0; }
body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; margin: 16px; max-width: 900px; }
section { margin-bottom: 14px; } h3 { font-size: 15px; margin: 6px 0; } small { color: var(--muted); font-weight: normal; }
svg { background: transparent; border-bottom: 1px solid var(--muted); } .absent, .note { color: var(--muted); font-size: 13px; margin: 4px 0; }
</style></head>
<body>
<h1 style="font-size:18px">${input.title}</h1>
<p class="note">functional load, not capacity. Samples are outside the generator; times are epoch ms of k6's own clock.</p>
${banded}
</body></html>
`;
}
