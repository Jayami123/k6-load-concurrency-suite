// P6-TW-LOAD-006 (rate-limit contract) and P6-TW-LOAD-009 (limiter fairness) verdicts (Twenty plan §6.9, §7). Pure except the
// stage at the end, which only reads the k6 log. Names and counts only: no key, token or response body is ever kept.

export type Phase = "below" | "at" | "above" | "recovery";

/** One request of the -006 or -009 run. `status` is the HTTP status; the body is read for its fields only. */
export interface Sample {
  phase: Phase;
  tMs: number;
  status: number;
  retryAfter: string | null; // Retry-After header value (seconds)
  hasRateHeaders: boolean; // X-RateLimit-Limit, -Remaining and -Reset all present
  errorCode: string | null; // body error, e.g. "RATE_LIMITED"; null for non-JSON
  periodCount: number | null; // body periodCount: 1 = short window, 60 = long window (periodUnit is always "second" in this build)
  scopeKeys: string[]; // presence only: the names of the body's scope keys (values are never read)
}

/** The planned requests of each phase (Twenty plan, phase schedule). The 90% floor is applied per phase. */
export type PlannedPerPhase = Record<Phase, number>;

/** The four limiter variables and the Node option the production-like profile must not set (names only, exact match). */
export const LIMITER_ENV_NAMES = [
  "API_RATE_LIMITING_SHORT_TTL_IN_MS",
  "API_RATE_LIMITING_SHORT_LIMIT",
  "API_RATE_LIMITING_LONG_TTL_IN_MS",
  "API_RATE_LIMITING_LONG_LIMIT",
  "APPLICATION_API_RATE_LIMITING_TTL_IN_MS",
  "APPLICATION_API_RATE_LIMITING_LIMIT",
] as const;

/** A 429 satisfies the contract when it has Retry-After, the three rate headers and the error RATE_LIMITED. Any other status passes. */
export function contractOk(s: Sample): boolean {
  if (s.status !== 429) return true;
  return s.retryAfter !== null && s.hasRateHeaders && s.errorCode === "RATE_LIMITED";
}

/** Counts of one phase: requests, 200s, 429s, 5xx and the rest. */
export function phaseCounts(
  samples: Sample[],
  phase: Phase,
): { n: number; s200: number; s429: number; s5xx: number; other: number } {
  const rows = samples.filter((s) => s.phase === phase);
  let s200 = 0;
  let s429 = 0;
  let s5xx = 0;
  let other = 0;
  for (const r of rows) {
    if (r.status === 200) s200 += 1;
    else if (r.status === 429) s429 += 1;
    else if (r.status >= 500 && r.status < 600) s5xx += 1;
    else other += 1;
  }
  return { n: rows.length, s200, s429, s5xx, other };
}

/**
 * The -006 verdict (Twenty plan, "What it proves"). Pure.
 * PRODUCT_BUG_SUSPECTED: a 429 under the limit, no 429 above it, a 429 without the contract (any phase), any 5xx, or no 200
 * within 60 s of the stop (recoveryMs null). INCONCLUSIVE: a phase under 90% of its planned requests. Otherwise PASS.
 * The `at` phase's 429 count is reported and never decides. Throws a TEST BUG when there are no samples.
 */
export function verdictForRateLimit(
  samples: Sample[],
  recoveryMs: number | null,
  plannedPerPhase: PlannedPerPhase,
): { verdict: "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE"; reasons: string[] } {
  if (samples.length === 0) throw new Error("TEST BUG: no rate-limit samples to judge");
  const bugs: string[] = [];
  const short: string[] = [];
  for (const phase of ["below", "at", "above"] as const) {
    const c = phaseCounts(samples, phase);
    const planned = plannedPerPhase[phase];
    if (c.n < 0.9 * planned) short.push(`${phase}: ${c.n} of ${planned} planned requests`);
    if (phase === "below" && c.s429 > 0) bugs.push(`below: ${c.s429} 429 under the limit`);
    if (phase === "above" && c.s429 < 1) bugs.push("above: no 429 above the limit");
  }
  const s5xx = samples.filter((s) => s.status >= 500 && s.status < 600).length;
  if (s5xx > 0) bugs.push(`${s5xx} 5xx response(s) (the limiter must answer 429, never 500)`);
  const badContract = samples.filter((s) => !contractOk(s)).length;
  if (badContract > 0) bugs.push(`${badContract} 429 response(s) without the contract`);
  if (recoveryMs === null) bugs.push("recovery: no 200 within 60 s of the stop");
  if (bugs.length > 0) return { verdict: "PRODUCT_BUG_SUSPECTED", reasons: [...bugs, ...short] };
  if (short.length > 0) return { verdict: "INCONCLUSIVE", reasons: short };
  return { verdict: "PASS", reasons: [] };
}

/**
 * The -009 verdict (Twenty plan, P6-TW-LOAD-009). Pure. The flood F and the low-rate key L are judged on one clock (tMs).
 * FINDING: L is refused while F is refused (cross-key starvation; the expected result at image defaults).
 * PASS: L is not refused while F is refused (per-key buckets). INCONCLUSIVE: F is never refused, or no L request falls
 * inside F's refusal span.
 */
export function fairnessVerdict(
  flood: Sample[],
  low: Sample[],
): { verdict: "PASS" | "FINDING" | "INCONCLUSIVE"; reason: string } {
  const refused = flood.filter((s) => s.status === 429).map((s) => s.tMs);
  if (refused.length === 0) {
    return { verdict: "INCONCLUSIVE", reason: "F was never refused: no contention" };
  }
  const from = Math.min(...refused);
  const to = Math.max(...refused);
  const during = low.filter((s) => s.tMs >= from && s.tMs <= to);
  if (during.length === 0) {
    return { verdict: "INCONCLUSIVE", reason: "no L request fell inside F's refusal span" };
  }
  const lowRefused = during.filter((s) => s.status === 429).length;
  if (lowRefused > 0) {
    return {
      verdict: "FINDING",
      reason: `L was refused ${lowRefused} of ${during.length} time(s) while F was refused (cross-key starvation)`,
    };
  }
  return {
    verdict: "PASS",
    reason: `L was not refused in ${during.length} request(s) while F was refused`,
  };
}

/** Throws a TEST BUG when a limiter variable or NODE_OPTIONS is set. Names only: the message never carries a value. */
export function assertNoLimiterEnv(envNames: string[]): void {
  const set = new Set(envNames);
  for (const name of [...LIMITER_ENV_NAMES, "NODE_OPTIONS"]) {
    if (set.has(name)) {
      throw new Error(`TEST BUG: ${name} is set; the production-like profile needs image defaults`);
    }
  }
}
