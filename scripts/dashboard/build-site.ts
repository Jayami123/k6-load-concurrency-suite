// Builds site/index.html from the evidence artefacts (plan Phase 4b task 13 §6.3). Self-contained: no script, stylesheet or CDN.
// Each run's chart is copied as a separate file and linked; its markup is never inlined. Only derived values reach the page.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildSiteModel,
  escapeLabel,
  type SiteModel,
  type VerdictInput,
} from "../../src/dashboard/site-model.ts";
import { SHOWCASE_TITLES, showcaseNotes } from "./showcases.ts";

const REPO = "https://github.com/Jayami123/k6-load-concurrency-suite";

/** The GitHub Actions run page of an evidence run (the workflow run the artefact came from). */
export function runUrl(githubRunId: string): string {
  return `${REPO}/actions/runs/${githubRunId}`;
}

/** Renders the one page. `runs` maps each P6 run id to the GitHub run it came from. */
export function renderSite(model: SiteModel, runs: Map<string, string>): string {
  const link = (runId: string) => {
    const gh = runs.get(runId);
    return gh === undefined
      ? `<code>${escapeLabel(runId)}</code>`
      : `<a href="${runUrl(gh)}">${escapeLabel(runId)}</a>`;
  };
  const notes = new Map(showcaseNotes().map((n) => [n.id, n.note]));
  const showcases = model.showcases
    .map((s) => {
      const body =
        s.status === "ready"
          ? `<p>Runs: ${s.runLinks.map(link).join(", ") || "none"}</p>`
          : `<p class="pending">Pending: ${escapeLabel(s.pending ?? "no data")}</p>`;
      return `<section id="${s.id}"><h2>${escapeLabel(SHOWCASE_TITLES[s.id])}</h2><p>${escapeLabel(notes.get(s.id) ?? s.note)}</p>${body}</section>`;
    })
    .join("\n");
  const invalid = model.invalidRuns
    .map(
      (r) =>
        `<li>${escapeLabel(r.caseId)} ${link(r.runId)}: ${r.reasons.map(escapeLabel).join("; ") || "INVALID"}</li>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>P6 load evidence</title></head>
<body>
<h1>P6 load evidence</h1>
${showcases}
<section id="invalid"><h2>INVALID runs (listed, not plotted)</h2><ul>${invalid}</ul><p>${model.invalidRuns.length} run(s) not used.</p></section>
<section id="sources"><h2>Runs the site is built from</h2><p>${model.generatedFrom.map(link).join(", ") || "none"}</p></section>
</body></html>
`;
}

function walkVerdicts(root: string): Array<{ dir: string; verdict: VerdictInput }> {
  const out: Array<{ dir: string; verdict: VerdictInput }> = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name === "verdict.json") {
        const v = JSON.parse(readFileSync(p, "utf8"));
        const caseId = path.basename(path.dirname(path.dirname(p)));
        out.push({
          dir: path.dirname(p),
          verdict: {
            runId: path.basename(path.dirname(p)),
            caseId,
            outcome: String(v.outcome ?? ""),
            validity: String(v.validity?.verdict ?? "INVALID"),
            reasons: (v.reasons ?? []).map(String),
          },
        });
      }
    }
  };
  visit(root);
  return out;
}

/** Usage: build-site.ts <outDir> <artefactDir>=<githubRunId> ... (each artefact folder with its GitHub run) */
function main(argv: string[]): void {
  const [outDir, ...sources] = argv;
  if (!outDir || sources.length === 0)
    throw new Error("usage: build-site.ts <outDir> <dir>=<runId>...");
  const runs = new Map<string, string>();
  const verdicts: VerdictInput[] = [];
  const chartCopies: Array<{ from: string; to: string }> = [];
  for (const source of sources) {
    const [dir = "", githubRunId = ""] = source.split("=");
    if (!existsSync(dir)) throw new Error(`TEST BUG: artefact folder ${dir} missing`);
    for (const { dir: runDir, verdict } of walkVerdicts(dir)) {
      verdicts.push(verdict);
      runs.set(verdict.runId, githubRunId);
      const chart = path.join(runDir, "chart-main.html");
      if (existsSync(chart)) {
        chartCopies.push({
          from: chart,
          to: path.join("runs", verdict.caseId, verdict.runId, "chart-main.html"),
        });
      }
    }
  }
  const model = buildSiteModel({
    verdicts,
    hasSoakData: verdicts.some((v) => /SOAK/.test(v.caseId) && v.validity === "VALID"),
    hasInvariantData: verdicts.some(
      (v) => /MED-LOAD-00[789]/.test(v.caseId) && v.validity === "VALID",
    ),
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), renderSite(model, runs));
  for (const c of chartCopies) {
    const to = path.join(outDir, c.to);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(c.from, to);
  }
  console.log(
    `dashboard: site/index.html 1 page, runs ${verdicts.length}, invalid listed ${model.invalidRuns.length}, showcases ready ${model.showcases.filter((s) => s.status === "ready").length}, pending ${model.showcases.filter((s) => s.status === "pending").length}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
