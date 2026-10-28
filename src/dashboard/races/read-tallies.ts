import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { VerdictInput } from "../verdicts.ts";

const RACE_FILE = /^P6-[A-Z]+-RACE-\d+\.json$/;

export interface RaceTally {
  githubRunId: string;
  caseId: string;
  title: string;
  product: string;
  verdict: "pass" | "fail" | string;
  attempts: number;
  attemptsWithViolation: number;
  attemptsWithSuspectedBug: number;
  invalidAttempts: number;
  invariantViolationsTop: number;
  // Lets PR-D's page.ts raceCaseId cast stay valid without editing page.ts (D-WAVE2).
  [key: string]: string | number;
}

function visitRaceFiles(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) visitRaceFiles(p, acc);
    else if (RACE_FILE.test(name)) acc.push(p);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function tallyAttempts(attempts: unknown[]): {
  attemptsWithViolation: number;
  attemptsWithSuspectedBug: number;
  invalidAttempts: number;
} {
  let attemptsWithViolation = 0;
  let attemptsWithSuspectedBug = 0;
  let invalidAttempts = 0;
  for (const raw of attempts) {
    const attempt = asRecord(raw);
    if (!attempt) continue;
    const violations = attempt.invariantViolations;
    if (Array.isArray(violations) && violations.length > 0) attemptsWithViolation += 1;
    const oracle = asRecord(attempt.oracle);
    const suspected = oracle?.suspectedBug;
    if (typeof suspected === "string" && suspected.length > 0) attemptsWithSuspectedBug += 1;
    if (attempt.valid === false) invalidAttempts += 1;
  }
  return { attemptsWithViolation, attemptsWithSuspectedBug, invalidAttempts };
}

/** Walks histogram files matching P6-*-RACE-*.json. Does not map histogram.verdict. */
export function readRaceTallies(dir: string, githubRunId: string): RaceTally[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  visitRaceFiles(dir, files);
  files.sort();
  const out: RaceTally[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const h = asRecord(parsed);
    if (!h) continue;
    const caseId = typeof h.caseId === "string" ? h.caseId : "";
    if (!caseId) continue;
    const attempts = Array.isArray(h.attempts) ? h.attempts : [];
    const counts = tallyAttempts(attempts);
    const top = Array.isArray(h.invariantViolations) ? h.invariantViolations.length : 0;
    out.push({
      githubRunId,
      caseId,
      title: typeof h.title === "string" ? h.title : "",
      product: typeof h.product === "string" ? h.product : "",
      verdict: typeof h.verdict === "string" ? h.verdict : "",
      attempts: attempts.length,
      attemptsWithViolation: counts.attemptsWithViolation,
      attemptsWithSuspectedBug: counts.attemptsWithSuspectedBug,
      invalidAttempts: counts.invalidAttempts,
      invariantViolationsTop: top,
    });
  }
  return out;
}

/**
 * After PR-T, runTwentyTrials assigns verdict like Cal. p6-phase4 TW histograms still have
 * the default fail (0 violations). Do not map that pair to FAIL.
 */
export function raceVerdictInputs(tallies: RaceTally[]): VerdictInput[] {
  const out: VerdictInput[] = [];
  for (const tally of tallies) {
    if (
      tally.verdict === "fail" &&
      tally.attemptsWithViolation === 0 &&
      tally.product === "twenty"
    ) {
      continue;
    }
    const outcome = tally.verdict === "fail" && tally.attemptsWithViolation > 0 ? "FAIL" : "PASS";
    out.push({
      runId: tally.githubRunId,
      caseId: tally.caseId,
      outcome,
      validity: "VALID",
      reasons: [],
      suspectedBugCount: tally.attemptsWithSuspectedBug,
      githubRunId: tally.githubRunId,
    });
  }
  return out;
}
