// The weekly soak capture (plan section 6.5 and 6.6). Three subcommands, run by .github/workflows/soak-release.yml and
// pages.yml:
//   decide    <run.json> <artifacts.json> <jobs.json> <trigger|dispatch>   writes the job outputs (GITHUB_OUTPUT)
//   summarize <soakDir> <outDir>                                           writes soak-summary-<product>.json and NOTES.md
//   releases  <outDir>                                                     downloads the p6-soak-* summaries, checks sums
// Environment for summarize: RUN_ID, TAG, HEAD_SHA, CREATED_AT, JOB_RESULTS (JSON), GITHUB_REPOSITORY. Nothing secret is
// read or printed. Every failure exits 1 with a ::error:: line.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  assertSummarySize,
  buildSummary,
  CASE_BY_PRODUCT,
  missingSummary,
  parseSummary,
  PRODUCTS,
  weeklyDecision,
  weeklyIsoWeek,
  type GapReason,
  type Product,
  type WeeklyRunFacts,
  type WeeklySummary,
} from "../../src/load/soak/weekly-summary.ts";

const SUMMARY_FILE = (product: Product) => `soak-summary-${product}.json`;

interface ArtefactList {
  artifacts: Array<{ name: string; expired?: boolean }>;
}
interface JobList {
  jobs: Array<{ name: string; conclusion: string | null }>;
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function writeOutputs(lines: Record<string, string>): void {
  const text = Object.entries(lines)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${text}\n`);
  else console.log(text);
}

function writeSummaryLines(text: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  else console.log(text);
}

/** Decide whether the soak run is a weekly point, and write the outputs the capture and publish jobs need. */
function decide(runPath: string, artefactsPath: string, jobsPath: string, mode: string): void {
  if (mode !== "trigger" && mode !== "dispatch") throw new Error(`decide: unknown mode ${mode}`);
  const run = readJson(runPath) as Record<string, unknown>;
  const artefacts = (readJson(artefactsPath) as ArtefactList).artifacts ?? [];
  const jobs = (readJson(jobsPath) as JobList).jobs ?? [];
  const facts: WeeklyRunFacts = {
    workflowId: String(run.workflow_id),
    headBranch: String(run.head_branch),
    event: String(run.event),
    conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
    createdAt: String(run.created_at),
    headSha: String(run.head_sha),
    artefactNames: artefacts.filter((a) => a.expired !== true).map((a) => a.name),
  };
  const decision = weeklyDecision(facts, mode);
  const runId = String(run.id);
  if (!decision.weekly) {
    if (decision.refuse) throw new Error(`refused backfill of run ${runId}: ${decision.reason}`);
    writeOutputs({ weekly: "false", run_id: runId });
    writeSummaryLines(`NOT RUN: ${decision.reason} (run ${runId})`);
    return;
  }
  if (!/^[0-9a-f]{40}$/.test(facts.headSha))
    throw new Error("decide: head_sha is not a 40-character sha");
  const jobResults = Object.fromEntries(
    PRODUCTS.map((p) => [p, jobs.find((j) => j.name === `${p}-soak`)?.conclusion ?? "unknown"]),
  );
  writeOutputs({
    weekly: "true",
    run_id: runId,
    tag: decision.tag,
    iso_week: decision.isoWeek,
    head_sha: facts.headSha,
    created_at: facts.createdAt,
    products: JSON.stringify(decision.products),
    job_results: JSON.stringify(jobResults),
  });
  writeSummaryLines(`weekly point: run ${runId}, week ${decision.isoWeek}`);
}

/** Every run-meta.json under a folder, with its folder. Walks the tree: the Medusa layout is one level deeper (P-10). */
function runMetaFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name === "run-meta.json") out.push(p);
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}

function gapReasonFor(conclusion: string | undefined): GapReason {
  if (conclusion === "skipped") return "not run: upstream job failed";
  if (conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out")
    return "no artefact: job failed before upload";
  return "artefact missing";
}

/** The summary of one product from its artefact folder, or the gap summary with its reason. */
function summaryFor(
  product: Product,
  soakDir: string,
  identity: { githubRunId: string; runUrl: string; soakHeadSha: string; createdAt: string },
  jobResults: Record<string, string>,
): WeeklySummary {
  const folder = path.join(soakDir, `soak-${product}-120`);
  const gap = (reason: GapReason) => missingSummary({ product, ...identity, reason });
  if (!existsSync(folder)) return gap(gapReasonFor(jobResults[product]));
  const caseId = CASE_BY_PRODUCT[product];
  let metas: string[];
  try {
    metas = runMetaFiles(folder).filter(
      (f) => (readJson(f) as { caseId?: unknown }).caseId === caseId,
    );
  } catch {
    return gap("artefact unreadable");
  }
  if (metas.length === 0) return gap("artefact missing");
  if (metas.length > 1) return gap("artefact unreadable");
  const metaPath = metas[0] ?? "";
  const dir = path.dirname(metaPath);
  const soakPath = path.join(dir, "soak.json");
  if (!existsSync(soakPath)) return gap("artefact missing");
  const telemetryPath = path.join(dir, "telemetry-main.json");
  try {
    return buildSummary({
      product,
      ...identity,
      soakJson: readJson(soakPath),
      runMeta: readJson(metaPath),
      telemetry: existsSync(telemetryPath) ? readJson(telemetryPath) : null,
    });
  } catch {
    return gap("artefact unreadable");
  }
}

/** Writes one summary per product (a gap where an artefact is missing) and the notes. Refuses a week that does not match. */
function summarize(soakDir: string, outDir: string): void {
  const env = process.env;
  const githubRunId = env.RUN_ID ?? "";
  const tag = env.TAG ?? "";
  const repo = env.GITHUB_REPOSITORY ?? "";
  const soakHeadSha = env.HEAD_SHA ?? "";
  const createdAt = env.CREATED_AT ?? "";
  if (!/^\d+$/.test(githubRunId) || !/^[0-9a-f]{40}$/.test(soakHeadSha) || !repo.includes("/"))
    throw new Error("summarize: RUN_ID, HEAD_SHA or GITHUB_REPOSITORY is not set");
  const week = weeklyIsoWeek(createdAt);
  if (week.tag !== tag) throw new Error(`summarize: created_at is in ${week.tag}, not ${tag}`);
  const jobResults = JSON.parse(env.JOB_RESULTS ?? "{}") as Record<string, string>;
  const identity = {
    githubRunId,
    runUrl: `https://github.com/${repo}/actions/runs/${githubRunId}`,
    soakHeadSha,
    createdAt,
  };
  mkdirSync(outDir, { recursive: true });
  const summaries = PRODUCTS.map((product) => {
    const summary = summaryFor(product, soakDir, identity, jobResults);
    const text = `${JSON.stringify(summary, null, 2)}\n`;
    assertSummarySize(Buffer.byteLength(text, "utf8"));
    parseSummary(JSON.parse(text));
    writeFileSync(path.join(outDir, SUMMARY_FILE(product)), text);
    return summary;
  });
  const notes = [
    `# P6 weekly soak, ${week.isoWeek}`,
    "",
    `Soak run [${githubRunId}](https://github.com/${repo}/actions/runs/${githubRunId}), head \`${soakHeadSha.slice(0, 7)}\`.`,
    "",
    "Summaries only. The raw soak artefacts are not published. A product that is not VALID carries its reason.",
    "",
    ...summaries.map((s) =>
      s.valid
        ? `- ${s.product}: VALID (verdict ${s.verdict ?? ""})`
        : `- ${s.product}: gap (${s.invalidReason ?? ""})`,
    ),
    "",
  ].join("\n");
  writeFileSync(path.join(outDir, "NOTES.md"), notes);
  writeSummaryLines(
    [
      `weekly soak capture: run ${githubRunId}, week ${week.isoWeek}, tag ${tag}, head ${soakHeadSha.slice(0, 7)}`,
      ...summaries.map(
        (s) => `${s.product}: ${s.valid ? "valid" : `gap (${s.invalidReason ?? ""})`}`,
      ),
    ].join("\n"),
  );
}

/** The release list of the repository as one array (paginated pages are merged). */
function listReleases(repo: string): Array<Record<string, unknown>> {
  const out = execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${repo}/releases`], {
    encoding: "utf8",
    env: process.env,
  });
  const pages = JSON.parse(out) as unknown[];
  return pages.flat() as Array<Record<string, unknown>>;
}

/** The SHA-256 sums of a SHA256SUMS.txt file as name → hex. */
function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.trim().split("\n")) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!m) throw new Error(`SHA256SUMS.txt line is not a sum: ${line.slice(0, 80)}`);
    sums.set(m[2] ?? "", m[1] ?? "");
  }
  return sums;
}

/**
 * Lists the p6-soak-* releases into outDir/<tag>/release.json, and downloads the summaries and sums of each complete
 * release. A checksum mismatch throws (fail closed). A draft is recorded and not downloaded (plan 6.13).
 */
function releases(outDir: string): void {
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  if (!repo.includes("/")) throw new Error("releases: GITHUB_REPOSITORY is not set");
  mkdirSync(outDir, { recursive: true });
  const soakReleases = listReleases(repo).filter((r) =>
    String(r.tag_name ?? "").startsWith("p6-soak-"),
  );
  for (const release of soakReleases) {
    const tag = String(release.tag_name);
    const dir = path.join(outDir, tag);
    mkdirSync(dir, { recursive: true });
    const assets = ((release.assets as Array<{ name: string }>) ?? []).map((a) => a.name).sort();
    const draft = release.draft === true;
    let sums: string[] | null = null;
    if (!draft && assets.includes("SHA256SUMS.txt")) {
      execFileSync(
        "gh",
        [
          "release",
          "download",
          tag,
          "--repo",
          repo,
          "--dir",
          dir,
          "--pattern",
          "soak-summary-*.json",
          "--pattern",
          "SHA256SUMS.txt",
          "--clobber",
        ],
        { stdio: "inherit", env: process.env },
      );
      const sumMap = parseSums(readFileSync(path.join(dir, "SHA256SUMS.txt"), "utf8"));
      for (const [name, expected] of sumMap) {
        const local = path.join(dir, name);
        if (!existsSync(local)) continue; // listed but not on the release: the reader marks the release incomplete
        const actual = createHash("sha256").update(readFileSync(local)).digest("hex");
        if (actual !== expected) throw new Error(`checksum mismatch for ${tag}/${name}`);
      }
      sums = [...sumMap.keys()];
    }
    writeFileSync(
      path.join(dir, "release.json"),
      `${JSON.stringify({ tag, draft, assets, sums }, null, 2)}\n`,
    );
  }
  writeFileSync(
    path.join(outDir, "listing.json"),
    `${JSON.stringify({ tags: soakReleases.map((r) => String(r.tag_name)) }, null, 2)}\n`,
  );
  writeSummaryLines(`p6-soak releases listed: ${soakReleases.length}`);
}

function main(argv: string[]): void {
  const [command, ...args] = argv;
  if (command === "decide" && args.length === 4)
    decide(args[0] ?? "", args[1] ?? "", args[2] ?? "", args[3] ?? "");
  else if (command === "summarize" && args.length === 2) summarize(args[0] ?? "", args[1] ?? "");
  else if (command === "releases" && args.length === 1) releases(args[0] ?? "");
  else
    throw new Error(
      "usage: weekly-capture.ts decide <run.json> <artifacts.json> <jobs.json> <trigger|dispatch> | summarize <soakDir> <outDir> | releases <outDir>",
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${(error as Error).message}`);
    process.exit(1);
  }
}
