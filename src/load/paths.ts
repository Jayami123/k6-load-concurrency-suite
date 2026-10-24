import { randomBytes } from "node:crypto";

export const LOAD_ROOT = "results/load";

export function runDir(caseId: string, runId: string): string {
  return `${LOAD_ROOT}/${caseId}/${runId}`;
}

/** "20261024T010203Z-" plus 8 hex characters. */
export function newRunId(now = new Date()): string {
  const iso = now.toISOString(); // 2026-10-24T01:02:03.456Z
  const compact =
    iso.slice(0, 4) +
    iso.slice(5, 7) +
    iso.slice(8, 10) +
    "T" +
    iso.slice(11, 13) +
    iso.slice(14, 16) +
    iso.slice(17, 19) +
    "Z";
  return `${compact}-${randomBytes(4).toString("hex")}`;
}
