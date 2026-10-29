// What run-load does with a case before any setup: run it, report NOT RUN (exit 0), or refuse it (ENV). Pure: the CLI prints.
import type { LoadCase, LoadProfileName } from "./types.ts";

export type GateDecision =
  { kind: "run" } | { kind: "not-run"; reason: string } | { kind: "refuse" };

/** A gated case runs only when its gate check is open. A gated case with no gate check is refused, never run. */
export function gateDecision(caseDef: LoadCase): GateDecision {
  if (!caseDef.gated) return { kind: "run" };
  if (!caseDef.gate) return { kind: "refuse" };
  const state = caseDef.gate();
  return state.open ? { kind: "run" } : { kind: "not-run", reason: state.reason };
}

/** The NOT RUN report: the console line and the job summary (the summary ends with a blank line, as the runner's does). It never says PASS. */
export function notRunReport(
  caseDef: LoadCase,
  reason: string,
  profile: LoadProfileName,
): { console: string; summary: string } {
  const summary = [
    `### ${caseDef.id}: NOT RUN (${profile} profile, ${caseDef.label})`,
    `- gate closed: ${reason}`,
    "",
  ];
  return {
    console: `${caseDef.id} NOT RUN (gate closed: ${reason})`,
    summary: `${summary.join("\n")}\n`,
  };
}
