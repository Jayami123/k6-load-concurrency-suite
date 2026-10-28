// Builds site/index.html from the evidence artefacts (plan Phase 4b task 13 §6.3). Self-contained: no script, stylesheet or CDN.
// Each run's chart is copied as a separate file and linked; its markup is never inlined. Only derived values reach the page.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildSiteModel,
  SOAK_CASE_IDS,
  type VerdictInput,
} from "../../src/dashboard/site-model.ts";
import {
  parsePendingFile,
  type PendingFile,
  type ReleasePlan,
} from "../../src/dashboard/release-plan.ts";
import { collectFromArtefactDir, type CollectedEvidence } from "../../src/dashboard/collect.ts";
import { walkVerdicts } from "../../src/dashboard/verdicts.ts";
import {
  DEFAULT_CONTEXT,
  renderSite,
  runUrl,
  type KneeProduct,
  type PageContext,
} from "../../src/dashboard/render/page.ts";

export { renderSite, runUrl };

/** The knee bounds of each product (k6/thresholds/knee-bounds.json), or undefined when the file is absent. */
export function readKnee(file: string): PageContext["knee"] {
  if (!existsSync(file)) return undefined;
  const j = JSON.parse(readFileSync(file, "utf8"));
  const products: KneeProduct[] = Object.entries(j.products ?? {}).map(([product, p]) => {
    const e = p as Record<string, unknown>;
    return {
      product,
      lower: Number(e.lowerBoundRate),
      upper: Number(e.upperBoundRate),
      unit: String(j.unit ?? "iterations per second"),
      runIds: ((e.runIds as unknown[]) ?? []).map(String),
    };
  });
  return { release: String(j.release ?? "unknown"), products };
}

/** The soak thresholds calibrated so far, against the soak cases the site expects (SOAK_CASE_IDS). */
export function readSoak(file: string): PageContext["soak"] {
  if (!existsSync(file)) return undefined;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return {
    release: String(j.release ?? "unknown"),
    calibrated: Object.keys(j.products ?? {}).length,
    products: SOAK_CASE_IDS.length,
  };
}

/** The product observations: the first heading of each docs/observations/*.md, read at build time. */
export function readObservations(dir: string): PageContext["observations"] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .flatMap((file) => {
      const m = /^# (P6-OBS-[A-Z0-9-]+): (.*)$/m.exec(readFileSync(path.join(dir, file), "utf8"));
      return m ? [{ id: m[1] ?? "", title: (m[2] ?? "").trim(), file }] : [];
    });
}

/** The build time as "YYYY-MM-DD HH:MM UTC". The clock is read here, never inside the renderer. */
function utcStamp(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** The pages job writes this file. The soak tile uses it and does not guess a tag. */
function readReleasePlan(file: string): ReleasePlan {
  const plan = JSON.parse(readFileSync(file, "utf8")) as ReleasePlan;
  if (!plan || !Array.isArray(plan.fetch))
    throw new Error(`TEST BUG: release plan ${file} has no fetch list`);
  return plan;
}

/** Usage: build-site.ts <outDir> [--plan <plan.json>] <artefactDir>=<githubRunId> ... */
function main(argv: string[]): void {
  const args = [...argv];
  let planPath: string | undefined;
  const flag = args.indexOf("--plan");
  if (flag !== -1) {
    planPath = args[flag + 1];
    if (planPath === undefined || planPath.startsWith("--"))
      throw new Error("usage: build-site.ts <outDir> [--plan <plan.json>] <dir>=<runId>...");
    args.splice(flag, 2);
  }
  const [outDir, ...sources] = args;
  if (!outDir || sources.length === 0)
    throw new Error("usage: build-site.ts <outDir> [--plan <plan.json>] <dir>=<runId>...");
  const releasePlan = planPath === undefined ? undefined : readReleasePlan(planPath);
  const runs = new Map<string, string>();
  const verdicts: VerdictInput[] = [];
  const kneeCurves: CollectedEvidence["kneeCurves"] = [];
  const soakTrends: CollectedEvidence["soakTrends"] = [];
  const aa: CollectedEvidence["aa"] = [];
  const ab: CollectedEvidence["ab"] = [];
  const races: CollectedEvidence["races"] = [];
  const chartCopies: Array<{ from: string; to: string }> = [];
  const charts = new Map<string, string>();
  for (const source of sources) {
    const [dir = "", githubRunId = ""] = source.split("=");
    if (!existsSync(dir)) throw new Error(`TEST BUG: artefact folder ${dir} missing`);
    const collected = collectFromArtefactDir(dir, githubRunId);
    verdicts.push(...collected.verdicts);
    kneeCurves.push(...collected.kneeCurves);
    soakTrends.push(...collected.soakTrends);
    aa.push(...collected.aa);
    ab.push(...collected.ab);
    races.push(...collected.races);
    for (const { dir: runDir, verdict } of walkVerdicts(dir, githubRunId)) {
      runs.set(verdict.runId, githubRunId);
      const chart = path.join(runDir, "chart-main.html");
      if (existsSync(chart)) {
        const href = path.posix.join("runs", verdict.caseId, verdict.runId, "chart-main.html");
        chartCopies.push({ from: chart, to: href });
        charts.set(verdict.runId, href);
      }
    }
  }
  const model = buildSiteModel({ verdicts });
  mkdirSync(outDir, { recursive: true });
  const pendingFile = path.join("docs", "evidence", "pending-release.json");
  const pending: PendingFile | undefined = existsSync(pendingFile)
    ? parsePendingFile(JSON.parse(readFileSync(pendingFile, "utf8")))
    : undefined;
  const context: PageContext = {
    ...DEFAULT_CONTEXT,
    sha: process.env.GITHUB_SHA ?? "unknown",
    builtAt: utcStamp(new Date()),
    knee: readKnee(path.join("k6", "thresholds", "knee-bounds.json")),
    soak: readSoak(path.join("k6", "thresholds", "soak-bounds.json")),
    observations: readObservations(path.join("docs", "observations")),
    kneeCurves,
    soakTrends,
    releasePlan,
    aa,
    ab,
    races,
  };
  writeFileSync(path.join(outDir, "index.html"), renderSite(model, runs, charts, pending, context));
  for (const c of chartCopies) {
    const to = path.join(outDir, c.to);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(c.from, to);
  }
  console.log(
    `dashboard: site/index.html 1 page, runs ${verdicts.length}, invalid listed ${model.invalidRuns.length}, observations ${context.observations.length}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
