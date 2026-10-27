// The release plan of the pages workflow (plan Phase 4b task 13). Reads the cited run ids, the releases (gh api, all pages),
// and the pending file; writes the plan and a job summary; exits 1 when a cited run is missing and not pending.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import {
  parsePendingFile,
  planRelease,
  type ReleaseAsset,
  type ReleasePlan,
} from "../../src/dashboard/release-plan.ts";

interface GhRelease {
  tag_name: string;
  assets: Array<{ name: string }>;
}

function summary(plan: ReleasePlan, release: string): string {
  const lines = [
    "## Evidence runs for the site",
    "",
    `Fetched from a p6-* release: ${plan.fetch.length} (${plan.fetch.map((r) => `${r.runId} in ${r.tag}`).join(", ") || "none"})`,
    "",
    `Pending release ${release}: ${plan.pending.length}`,
  ];
  for (const p of plan.pending) lines.push(`- ${p.runId}: ${p.reason}`);
  lines.push("", `Missing (fails the check): ${plan.missing.join(", ") || "none"}`);
  return `${lines.join("\n")}\n`;
}

function main(argv: string[]): void {
  const [runIdsFile = "", releasesFile = "", pendingFile = "", planOut = ""] = argv;
  if (!runIdsFile || !releasesFile || !pendingFile || !planOut)
    throw new Error("usage: plan-release.ts <runIds> <releases.json> <pending.json> <plan.json>");
  const cited = readFileSync(runIdsFile, "utf8")
    .split("\n")
    .filter((id) => id !== "");
  const releases = JSON.parse(readFileSync(releasesFile, "utf8")) as GhRelease[];
  const assets: ReleaseAsset[] = releases.flatMap((r) =>
    r.assets.map((a) => ({ tag: r.tag_name, name: a.name })),
  );
  const pending = parsePendingFile(JSON.parse(readFileSync(pendingFile, "utf8")));
  const plan = planRelease(cited, assets, pending.pending);
  writeFileSync(planOut, `${JSON.stringify(plan, null, 2)}\n`);
  const text = summary(plan, pending.release);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  for (const id of plan.missing)
    console.error(
      `::error::run ${id} has no zip in any p6-* release and is not on the pending list`,
    );
  if (plan.missing.length > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
