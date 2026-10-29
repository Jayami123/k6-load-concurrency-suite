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
import { buildWeeklyTrend, type ReleaseEntry } from "../../src/dashboard/soak/weekly-trend.ts";
import { latestWeeklyWeek } from "../../src/load/soak/weekly-summary.ts";
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
import { preferReleasedAb } from "../../src/dashboard/gate/read-ab.ts";
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

const USAGE =
  "usage: build-site.ts <outDir> [--plan <plan.json>] [--weekly-soak <dir>] <dir>=<runId>...";

/** Removes "<name> <value>" from args and returns the value; undefined when the flag is absent. */
function takeFlag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(USAGE);
  args.splice(at, 2);
  return value;
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** release.json as the releases command wrote it. A missing or unreadable file reads as an incomplete release (sums null). */
function releaseMeta(file: string): {
  draft: boolean;
  assets: string[] | null;
  sums: string[] | null;
} {
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const names = (v: unknown) =>
      Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
    return { draft: j.draft === true, assets: names(j.assets), sums: names(j.sums) };
  } catch {
    return { draft: false, assets: null, sums: null };
  }
}

/**
 * The p6-soak-* releases the soak-summaries job wrote, one folder per tag (release.json and the summary files). A missing
 * directory is no releases (the first build before a week is captured). A bad release.json reads as an incomplete release.
 */
export function readWeeklySoak(dir: string): ReleaseEntry[] {
  if (!existsSync(dir)) {
    console.log(`weekly soak: no directory ${dir}; no weekly releases`);
    return [];
  }
  return readdirSync(dir)
    .filter((tag) => tag.startsWith("p6-soak-") && statSync(path.join(dir, tag)).isDirectory())
    .sort()
    .map((tag) => {
      const folder = path.join(dir, tag);
      const onDisk = readdirSync(folder).sort();
      const meta = releaseMeta(path.join(folder, "release.json"));
      return {
        tag,
        draft: meta.draft,
        assets: meta.assets ?? onDisk,
        sums: meta.sums,
        files: onDisk
          .filter((name) => /^soak-summary-.+\.json$/.test(name))
          .map((name) => ({ name, text: readText(path.join(folder, name)) })),
      };
    });
}

/** Usage: build-site.ts <outDir> [--plan <plan.json>] [--weekly-soak <dir>] <artefactDir>=<githubRunId> ... */
function main(argv: string[]): void {
  const args = [...argv];
  const planPath = takeFlag(args, "--plan");
  const weeklyDir = takeFlag(args, "--weekly-soak");
  const [outDir, ...sources] = args;
  if (!outDir || sources.length === 0) throw new Error(USAGE);
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
    ab: preferReleasedAb(ab),
    races,
    weeklySoak:
      weeklyDir === undefined
        ? undefined
        : buildWeeklyTrend(readWeeklySoak(weeklyDir), latestWeeklyWeek(new Date())),
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
