// The expected-failure judgement of a case with a knownFailure: the load equivalent of Playwright's test.fail(). Pure.
import type { KnownFailure, Outcome } from "./types.ts";

/** The marker written beside the real outcome in verdict.json; nothing when the case has no known failure. */
export function verdictMarker(known: KnownFailure | undefined): {
  expectedFailure?: { findingId: string };
} {
  return known === undefined ? {} : { expectedFailure: { findingId: known.findingId } };
}

export interface KnownFailureJudgement {
  exitCode: number;
  /** The console line in place of "<case> <outcome>", when the marker decides the result. */
  line?: string;
  /** A job-summary line, when the marker decides the result. */
  summary?: string;
}

/**
 * Only a VALID run is judged: a FAIL is expected and exits 0, a PASS means the finding no longer reproduces and exits 1. An INVALID
 * run, an INCONCLUSIVE run and a case without the marker keep the runner's own exit code. The outcome itself is never changed.
 */
export function judgeKnownFailure(
  caseId: string,
  known: KnownFailure | undefined,
  outcome: Outcome,
  valid: boolean,
  exitCode: number,
): KnownFailureJudgement {
  if (known === undefined || !valid) return { exitCode };
  const { findingId } = known;
  if (outcome === "FAIL") {
    return {
      exitCode: 0,
      line: `${caseId} FAIL (expected, ${findingId})`,
      summary: `- known failure ${findingId}: reproduced (expected)`,
    };
  }
  if (outcome === "PASS") {
    return {
      exitCode: 1,
      line: `${caseId} PASS (unexpected: ${findingId} no longer reproduces, remove the knownFailure marker)`,
      summary: `- known failure ${findingId} no longer reproduces: remove the knownFailure marker`,
    };
  }
  return { exitCode };
}
