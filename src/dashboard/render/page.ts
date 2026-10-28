// Renders the evidence site as one report page (plan Phase 4b task 13). Pure: every value comes from the inputs, no script and no
// remote asset. Order: header, summary strip, evidence cards, findings, provenance (collapsed). Empty data reads as PENDING.
import { escapeLabel, type SiteModel } from "../site-model.ts";
import type { PendingFile } from "../release-plan.ts";
import { CARD_SPECS, computeCard, utcOf, type CardState, type CardStatus } from "../cards.ts";
import type { KneeCurve } from "../knee/read-curves.ts";
import type { SoakTrend } from "../soak/read-trends.ts";
import type { AaSeries } from "../gate/read-aa.ts";
import type { AbGate } from "../gate/read-ab.ts";
import type { RaceTally } from "../races/read-tallies.ts";
import { kneeRangeSvg } from "./svg.ts";
import { PAGE_CSS } from "./style.ts";
import { renderKneeCurves } from "./knee-chart.ts";
import { renderSoakTrends } from "./soak-chart.ts";
import { renderAaChart } from "./aa-chart.ts";
import { renderAbChart } from "./ab-chart.ts";
import { renderRaceChart } from "./race-chart.ts";

export const REPO = "https://github.com/Jayami123/k6-load-concurrency-suite";

/** The GitHub Actions run page of an evidence run (the workflow run the artefact came from). */
export function runUrl(githubRunId: string): string {
  return `${REPO}/actions/runs/${githubRunId}`;
}

export interface KneeProduct {
  product: string;
  lower: number;
  upper: number;
  unit: string;
  runIds: string[]; // GitHub run ids of the knee bound runs
}

export interface PageContext {
  sha: string; // the commit the site was built from
  builtAt: string; // ISO time of the build (UTC)
  knee?: { release: string; products: KneeProduct[] };
  soak?: { release: string; calibrated: number; products: number };
  observations: Array<{ id: string; title: string; file: string }>; // docs/observations/*.md, read at build time
  kneeCurves?: KneeCurve[];
  soakTrends?: SoakTrend[];
  aa?: AaSeries[];
  ab?: AbGate[];
  races?: RaceTally[];
}

export const DEFAULT_CONTEXT: PageContext = {
  sha: "unknown",
  builtAt: "unknown",
  observations: [],
};

const STATUS_ORDER: CardStatus[] = ["PASS", "FAIL", "KNOWN FAIL", "PENDING", "INVALID"];

const slug = (status: string) => status.toLowerCase().replace(/ /g, "-");

const pill = (state: CardState) =>
  `<span class="pill pill-${slug(state.status)}">${escapeLabel(state.status)}${state.obs ? ` (${escapeLabel(state.obs)})` : ""}</span>`;

/** A run id as a link to its GitHub run (and its chart, when it has one), or as plain code when its GitHub run is not known. */
function runLink(runs: Map<string, string>, charts: Map<string, string>, runId: string): string {
  const gh = runs.get(runId);
  const id =
    gh === undefined
      ? `<code>${escapeLabel(runId)}</code>`
      : `<a href="${runUrl(gh)}"><code>${escapeLabel(runId)}</code></a>`;
  const chart = charts.get(runId);
  return chart === undefined ? id : `${id} (<a href="${escapeLabel(chart)}">chart</a>)`;
}

function evidenceTable(
  state: CardState,
  runs: Map<string, string>,
  charts: Map<string, string>,
): string {
  if (state.runs.length === 0)
    return `<p class="muted">No run of this card's cases is in a release yet.</p>`;
  const rows = state.runs
    .map(
      (r) =>
        `<tr><td>${runLink(runs, charts, r.runId)}</td><td><code>${escapeLabel(r.caseId)}</code></td><td>${utcOf(r.runId)}</td><td>${escapeLabel(`${r.outcome} / ${r.validity}`)}</td></tr>`,
    )
    .join("");
  return `<details><summary>Evidence runs (${state.runs.length})</summary><div class="table-wrap"><table><caption>Evidence runs: ${escapeLabel(state.spec.title)}</caption><thead><tr><th scope="col">Run</th><th scope="col">Case</th><th scope="col">UTC time</th><th scope="col">Verdict</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function cardHtml(
  state: CardState,
  runs: Map<string, string>,
  charts: Map<string, string>,
  body: string,
): string {
  const valid = state.runs.filter((r) => r.validity === "VALID").length;
  const invalid = state.runs.length - valid;
  const reason = state.reason ? `<p class="reason">${escapeLabel(state.reason)}</p>` : "";
  return `<section id="${state.spec.id}" class="card"><header class="card-head"><h2>${escapeLabel(state.spec.title)}</h2>${pill(state)}</header><p>${escapeLabel(state.spec.proves)}</p>${reason}${body}<p class="muted">${valid} VALID and ${invalid} INVALID run(s).</p>${evidenceTable(state, runs, charts)}</section>`;
}

function kneeBody(ctx: PageContext): string {
  const knee = ctx.knee;
  if (!knee || knee.products.length === 0) return "";
  const bars = knee.products.map((p) => ({ label: p.product, lower: p.lower, upper: p.upper }));
  const unit = knee.products[0]?.unit ?? "iterations per second";
  const svg = kneeRangeSvg(bars, unit);
  if (svg === "") return "";
  const sources = knee.products.flatMap((p) =>
    p.runIds.map((id) => `<a href="${runUrl(id)}">${escapeLabel(id)}</a>`),
  );
  return `<figure>${svg}<figcaption>Knee range per product from <code>k6/thresholds/knee-bounds.json</code>, release ${escapeLabel(knee.release)}. Bars run from the lower to the upper bound. Runs: ${[...new Set(sources)].join(", ")}. The first saturated resource is not in the committed bounds yet.</figcaption></figure>`;
}

function raceCaseId(row: RaceTally): string | undefined {
  const rec = row as Record<string, unknown>;
  return typeof rec.caseId === "string" ? rec.caseId : undefined;
}

function chartBody(id: string, ctx: PageContext): string {
  if (id === "knee") return kneeBody(ctx) + renderKneeCurves(ctx.kneeCurves ?? []);
  if (id === "soak") return renderSoakTrends(ctx.soakTrends ?? []);
  if (id === "aa-noise") return renderAaChart(ctx.aa ?? []);
  if (id === "ab-gate") return renderAbChart(ctx.ab ?? []);
  if (
    id === "promo" ||
    id === "cancel" ||
    id === "invariants" ||
    id === "two-instance" ||
    id === "twenty"
  ) {
    const spec = CARD_SPECS.find((s) => s.id === id);
    const caseIds = spec?.caseIds ?? [];
    return renderRaceChart((ctx.races ?? []).filter((r) => caseIds.includes(raceCaseId(r) ?? "")));
  }
  return "";
}

/** The summary strip: each fact is read from a file or a card at build time; an unread source reads "pending". */
function summaryStrip(
  cards: CardState[],
  ctx: PageContext,
  pending: PendingFile | undefined,
): string {
  const count = (s: CardStatus) => cards.filter((c) => c.status === s).length;
  const statusLine = STATUS_ORDER.map((s) => `${s} ${count(s)}`).join(", ");
  const aa = cards.find((c) => c.spec.id === "aa-noise");
  const knee = ctx.knee;
  const kneeValue =
    knee && knee.products.length > 0
      ? knee.products.map((p) => `${p.product} ${p.lower} to ${p.upper}`).join("; ")
      : "pending";
  const kneeSrc =
    knee && knee.products.length > 0
      ? `k6/thresholds/knee-bounds.json, release ${escapeLabel(knee.release)}, runs ${[...new Set(knee.products.flatMap((p) => p.runIds))].map((id) => `<a href="${runUrl(id)}">${escapeLabel(id)}</a>`).join(", ")}`
      : "k6/thresholds/knee-bounds.json has no product";
  const soakValue = ctx.soak
    ? `${ctx.soak.calibrated} of ${ctx.soak.products} products calibrated`
    : "pending";
  const soakSrc = ctx.soak
    ? `k6/thresholds/soak-bounds.json, release ${escapeLabel(ctx.soak.release)}`
    : "k6/thresholds/soak-bounds.json not read";
  const obsIds = ctx.observations.map((o) => o.id).join(", ");
  const facts = [
    {
      value: escapeLabel(kneeValue),
      label: "knee range per product (iterations per second)",
      src: kneeSrc,
    },
    {
      value: escapeLabel(statusLine),
      label: "evidence cards by state",
      src: "computed from the verdicts of each card",
    },
    { value: escapeLabel(soakValue), label: "soak thresholds", src: soakSrc },
    {
      value: escapeLabel(
        aa?.status === "PENDING"
          ? "A/A tolerance committed; runs pending release"
          : `A/A ${aa?.status ?? "pending"}`,
      ),
      label: "A/A noise and tolerance",
      src: escapeLabel(aa?.reason || "k6/thresholds/tolerance.json"),
    },
    {
      value: escapeLabel(`${ctx.observations.length} open observation(s)`),
      label: "product observations",
      src: escapeLabel(obsIds || "no docs/observations/*.md found"),
    },
    {
      value: escapeLabel(pending ? `${pending.pending.length} run(s) waiting` : "none waiting"),
      label: pending ? `in release ${pending.release}` : "pending release",
      src: "docs/evidence/pending-release.json",
    },
  ];
  const items = facts
    .map(
      (f) =>
        `<li class="fact"><span class="fact-value">${f.value}</span><span class="fact-label">${f.label}</span><span class="fact-src">source: ${f.src}</span></li>`,
    )
    .join("");
  return `<section id="summary" class="block" aria-labelledby="summary-title"><h2 id="summary-title">Summary</h2><ul class="strip">${items}</ul></section>`;
}

function findingsSection(ctx: PageContext): string {
  const rows = ctx.observations
    .map(
      (o) =>
        `<tr><td><code>${escapeLabel(o.id)}</code></td><td>${escapeLabel(o.title)}</td><td><a href="${REPO}/blob/main/docs/observations/${escapeLabel(o.file)}">docs/observations/${escapeLabel(o.file)}</a></td></tr>`,
    )
    .join("");
  const body =
    ctx.observations.length === 0
      ? `<p class="muted">No observation documents found.</p>`
      : `<div class="table-wrap"><table><caption>Product observations (P6-OBS-*)</caption><thead><tr><th scope="col">Label</th><th scope="col">Finding</th><th scope="col">Document</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return `<section id="findings" class="block" aria-labelledby="findings-title"><h2 id="findings-title">Findings</h2>${body}</section>`;
}

function provenanceSection(
  model: SiteModel,
  runs: Map<string, string>,
  charts: Map<string, string>,
  pending: PendingFile | undefined,
): string {
  const sources = model.generatedFrom.length
    ? model.generatedFrom.map((id) => `<tr><td>${runLink(runs, charts, id)}</td></tr>`).join("")
    : `<tr><td class="muted">none</td></tr>`;
  const invalid = model.invalidRuns.length
    ? model.invalidRuns
        .map(
          (r) =>
            `<tr><td>${runLink(runs, charts, r.runId)}</td><td><code>${escapeLabel(r.caseId)}</code></td><td>${escapeLabel(r.reasons.join("; ") || "INVALID")}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">none</td></tr>`;
  const pendingRows = pending?.pending.length
    ? pending.pending
        .map(
          (p) =>
            `<tr><td><code>${escapeLabel(p.runId)}</code></td><td>${escapeLabel(p.reason)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="muted">none</td></tr>`;
  const pendingTitle = pending
    ? `Pending release ${escapeLabel(pending.release)}`
    : "Pending release";
  return `<section id="provenance" class="block" aria-labelledby="provenance-title"><details><summary id="provenance-title">Provenance</summary>
<div class="table-wrap"><table><caption>Runs the site is built from</caption><thead><tr><th scope="col">Run</th></tr></thead><tbody>${sources}</tbody></table></div>
<div class="table-wrap"><table><caption>INVALID runs (listed, not plotted)</caption><thead><tr><th scope="col">Run</th><th scope="col">Case</th><th scope="col">Reasons</th></tr></thead><tbody>${invalid}</tbody></table></div>
<div class="table-wrap"><table><caption>${pendingTitle}</caption><thead><tr><th scope="col">Run</th><th scope="col">Reason</th></tr></thead><tbody>${pendingRows}</tbody></table></div>
</details></section>`;
}

/** The whole page. `runs` maps each P6 run id to its GitHub run id; `charts` maps a run id to its copied chart (relative path). */
export function renderSite(
  model: SiteModel,
  runs: Map<string, string>,
  charts: Map<string, string> = new Map(),
  pending?: PendingFile,
  ctx: PageContext = DEFAULT_CONTEXT,
): string {
  const cards = CARD_SPECS.map((spec) => computeCard(spec, model.verdicts));
  const cardBlocks = cards
    .map((c) => cardHtml(c, runs, charts, chartBody(c.spec.id, ctx)))
    .join("\n");
  const nav = cards
    .map((c) => `<li><a href="#${c.spec.id}">${escapeLabel(c.spec.title)}</a></li>`)
    .join("");
  const sha = escapeLabel(ctx.sha.slice(0, 7));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>P6 load and concurrency evidence</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header>
<h1>P6 load and concurrency evidence</h1>
<p>Each number and status here is computed at build time from committed threshold files and evidence runs. A run that is not VALID is listed, never plotted.</p>
<p class="meta">Built from <code>${sha}</code> on ${escapeLabel(ctx.builtAt)} · <a href="${REPO}">repository</a></p>
<nav aria-label="Evidence areas"><ul>${nav}<li><a href="#findings">Findings</a></li><li><a href="#provenance">Provenance</a></li></ul></nav>
</header>
<main>
${summaryStrip(cards, ctx, pending)}
<section id="evidence" class="block" aria-labelledby="evidence-title"><h2 id="evidence-title">Evidence</h2><div class="cards">${cardBlocks}</div></section>
${findingsSection(ctx)}
${provenanceSection(model, runs, charts, pending)}
</main>
<footer>Source: <a href="${REPO}">${REPO.replace("https://", "")}</a>, built from main commit <code>${sha}</code>. Charts link their run's chart file.</footer>
</body>
</html>
`;
}
