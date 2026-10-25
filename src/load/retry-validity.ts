/** The share of first attempts that must time out for a run to prove anything (plan §6.3; probe: Medusa 21 of 21). */
export const STORM_SHARE = 0.5;

export interface StormCounters {
  intents: number;
  firstTimeouts: number;
  retries: number;
}

/** The journey counters of a retry case (plan §6.2), read from the k6 summary export. */
export interface RetryCounters {
  intents: number; // p6_intents
  attempts: number; // p6_attempts: every request sent, first and retries
  firstTimeouts: number; // p6_first_timeouts: the first attempt of an intent timed out
  intentsOk: number; // intents whose answer set contained a 2xx
  retryOk: number; // p6_retry_ok
  retryConflict: number; // p6_retry_conflict (409): counted, not a violation
  retryRedacted400: number; // p6_retry_redacted400 (P6-OBS-CAL-001): counted, not a violation
  retryRefused: number; // p6_retry_refused
  retry5xx: number; // p6_retry_5xx
  orderMismatch: number; // p6_retry_order_mismatch
}

export interface RetryFinding {
  check: string;
  ok: boolean;
  kind?: "PRODUCT BUG" | "TEST BUG";
  detail: string;
}

/** A judge's findings and the known bugs it counted (never failures). */
export interface RetryJudgement {
  findings: RetryFinding[];
  knownBugs: Record<string, number>;
}

export interface StormJudgement {
  ok: boolean;
  kind?: "TEST BUG";
  detail: string;
}

/**
 * Judges that the storm happened: at least half of the first attempts timed out, and every timed-out intent was retried.
 * A run without a storm has proven nothing, so it cannot PASS (plan §6.3). Pure; the detail is built from counts only.
 */
export function judgeStorm(c: StormCounters): StormJudgement {
  const share = c.intents > 0 ? c.firstTimeouts / c.intents : 0;
  if (c.intents > 0 && share >= STORM_SHARE && c.retries >= c.firstTimeouts) {
    return {
      ok: true,
      detail: `${c.firstTimeouts} of ${c.intents} first attempts timed out, ${c.retries} retries sent`,
    };
  }
  return {
    ok: false,
    kind: "TEST BUG",
    detail: `no storm (${c.firstTimeouts} of ${c.intents} first attempts timed out, ${c.retries} retries)`,
  };
}
