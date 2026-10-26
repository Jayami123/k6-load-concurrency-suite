// Which Documenso cases run with the rate limiter ON. The harness defaults DANGEROUS_BYPASS_RATE_LIMITS to "true" (its
// scripts/harness.mjs), so a stack started by hand has the limiter off: a spike or limiter case then measures nothing. The
// launcher (scripts/load/documenso-up.ts) starts the stack with the value this module gives the case.

/** The spike and limiter cases: their 429s are the measurement, so the limiter must be on. */
export const LIMITER_ON_CASES: readonly string[] = ["P6-DOC-LOAD-004", "P6-DOC-LOAD-009"];

/** "false" (limiter on) for the spike and limiter cases, "true" (bypass) for every other case. */
export function documensoBypassFor(caseId: string): "true" | "false" {
  return LIMITER_ON_CASES.includes(caseId) ? "false" : "true";
}
