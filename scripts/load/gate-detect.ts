// The A/B trigger outputs of gate.yml (plan Phase 4b task 12 §6.4): which files changed between the base and HEAD, which product ref was
// bumped, and whether the PR carries the perf-gate label. Writes the step outputs to $GITHUB_OUTPUT (prints them when unset). Usage (CI):
//   EVENT_NAME, BASE_SHA, HEAD_SHA, LABELS_JSON are set by the workflow; node scripts/load/gate-detect.ts
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { changedRefs, touchesLoadCode } from "../../src/load/gate/triggers.ts";

const base = process.env.BASE_SHA ?? "";
const head = process.env.HEAD_SHA ?? "HEAD";
const git = (args: string[]): string => execFileSync("git", args, { encoding: "utf8" });
if (!base) throw new Error("gate-detect: BASE_SHA is not set");

const files = git(["diff", "--name-only", `${base}...${head}`])
  .split("\n")
  .filter(Boolean);
const refs = changedRefs(
  git(["diff", `${base}...${head}`, "--", ".github/workflows/perf.yml", "scripts/bootstrap.sh"]),
);
const labels = JSON.parse(process.env.LABELS_JSON || "[]") as Array<{ name: string }>;

const outputs = {
  load_code: String(touchesLoadCode(files)),
  cal_bump: String(refs.includes("CAL_REF")),
  medusa_bump: String(refs.includes("MEDUSA_REF")),
  perf_gate_label: String(labels.some((l) => l.name === "perf-gate")),
};
const text = `${Object.entries(outputs)
  .map(([k, v]) => `${k}=${v}`)
  .join("\n")}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
else console.log(text);
