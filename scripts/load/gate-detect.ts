// The A/B trigger outputs of gate.yml (plan Phase 4b task 12 §6.4): the base commit of the diff, which files changed, which product ref was
// bumped, and whether the PR carries the perf-gate label. Writes the step outputs to $GITHUB_OUTPUT (prints them when unset). Usage (CI):
//   EVENT_NAME, PR_BASE_SHA, BEFORE_SHA, HEAD_SHA, LABELS_JSON are set by the workflow; node scripts/load/gate-detect.ts
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
  changedRefs,
  diffBaseOf,
  hasLabel,
  parseLabelNames,
  touchesLoadCode,
  toleranceCheckoutOf,
} from "../../src/load/gate/triggers.ts";

const git = (args: string[]): string => execFileSync("git", args, { encoding: "utf8" });
const head = process.env.HEAD_SHA ?? "HEAD";
const requested = diffBaseOf({
  eventName: process.env.EVENT_NAME ?? "",
  prBaseSha: process.env.PR_BASE_SHA,
  beforeSha: process.env.BEFORE_SHA,
});
// Resolved to a full sha: the A/B jobs check the base out by this value.
const base = git(["rev-parse", requested]).trim();

const files = git(["diff", "--name-only", `${base}...${head}`])
  .split("\n")
  .filter(Boolean);
const refs = changedRefs(
  git(["diff", `${base}...${head}`, "--", ".github/workflows/perf.yml", "scripts/bootstrap.sh"]),
);
const labels = parseLabelNames(process.env.LABELS_JSON);

const outputs = {
  base_sha: base,
  load_code: String(touchesLoadCode(files)),
  cal_bump: String(refs.includes("CAL_REF")),
  medusa_bump: String(refs.includes("MEDUSA_REF")),
  perf_gate_label: String(hasLabel(labels, "perf-gate")),
  tolerance_checkout: toleranceCheckoutOf(process.env.EVENT_NAME ?? ""),
};
const text = `${Object.entries(outputs)
  .map(([k, v]) => `${k}=${v}`)
  .join("\n")}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
else console.log(text);
