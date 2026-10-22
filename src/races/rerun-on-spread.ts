import {
  raceMaxInvalidSharePctFromEnv,
  raceMaxSpreadMsFromEnv,
  raceMaxSpreadRerunsFromEnv,
  raceMinInvalidBudgetFromEnv,
  raceWarmupBurstsFromEnv,
} from "./env.ts";
import { aggregateDispatchSpread, mergeStatusCounts } from "./histogram.ts";
import type {
  RaceAttemptResult,
  RaceHistogram,
  RaceTrialSummary,
  SpreadPolicy,
  WarmupRecord,
} from "./types.ts";

export function spreadPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): SpreadPolicy {
  return {
    limitMs: raceMaxSpreadMsFromEnv(env),
    maxReruns: raceMaxSpreadRerunsFromEnv(env),
    maxInvalidSharePct: raceMaxInvalidSharePctFromEnv(env),
    minInvalidBudget: raceMinInvalidBudgetFromEnv(env),
    warmupBursts: raceWarmupBurstsFromEnv(env),
  };
}

/** The one spread decision (D2): a burst at the limit is valid, above it is invalid. */
export function isSpreadValid(dispatchSpreadMs: number, limitMs: number): boolean {
  return dispatchSpreadMs <= limitMs;
}

/**
 * Invalid attempts a case may spend before it fails as "runner too noisy":
 * max(RACE_MIN_INVALID_BUDGET, ceil(trials * RACE_MAX_INVALID_SHARE_PCT / 100)).
 */
export function invalidBudget(trials: number, sharePct: number, minBudget: number): number {
  return Math.max(minBudget, Math.ceil((trials * sharePct) / 100));
}

/** Name part for the data of one attempt: attempt 1 keeps today's "t3"; a rerun is "t3a2", "t3a3", ... */
export function attemptTag(trial: number, attempt: number): string {
  return attempt === 1 ? `t${trial}` : `t${trial}a${attempt}`;
}

export function validAttempts(records: readonly RaceAttemptResult[]): RaceAttemptResult[] {
  return records.filter((r) => r.valid);
}

/** Sum of one numeric oracle key over the given attempts. A missing key counts as 0. */
export function sumOracle(records: readonly RaceAttemptResult[], key: string): number {
  return records.reduce((n, r) => n + Number(r.oracle[key] ?? 0), 0);
}

/**
 * One attempt = fresh setup, one fireTogether burst, the product oracle, cleanup. It returns the record
 * built by recordTrial and does not throw for product violations (they are in record.invariantViolations).
 * It throws only when setup or cleanup is broken (a TEST BUG), which is never rerun.
 */
export type AttemptFn = (attempt: number) => Promise<RaceAttemptResult>;

export interface RerunRunner {
  /** Plug into runTrials(trials, (trial) => runner.runTrial(trial, attemptFn)). Resolves with the valid record. */
  runTrial(trial: number, attemptFn: AttemptFn): Promise<RaceAttemptResult>;
  /**
   * Fires the untimed warm-up burst(s) before trial 1. Call it before runTrials, with an attempt function that
   * uses trial index 0. Never throws, never reruns, never counts as a trial: the record goes to histogram.warmup.
   */
  warmup(attemptFn: AttemptFn): Promise<void>;
  /** Every burst that was fired for a trial (valid and invalid), in firing order. Warm-ups are not in it. */
  readonly attempts: readonly RaceAttemptResult[];
  /** Attempts that threw before a burst record existed. Never counted as invalid trials. */
  readonly stubs: readonly RaceAttemptResult[];
  /** "TEST BUG: runner too noisy ..." lines. Product violations stay in the attempt records. */
  readonly violations: readonly string[];
  /** Writes trials, attempts, statusCounts, spread aggregates, invalidTrials, reruns, spreadPolicy and violations. */
  applyTo(histogram: RaceHistogram): void;
}

function stubRecord(trial: number, attempt: number, message: string): RaceAttemptResult {
  return {
    trial,
    attempt,
    valid: false,
    ok: false,
    statuses: [],
    statusCounts: {},
    dispatchSpreadMs: 0,
    oracle: {},
    invariantViolations: [message],
    error: message,
  };
}

export function createRerunRunner(policy: SpreadPolicy, trials: number): RerunRunner {
  const budget = invalidBudget(trials, policy.maxInvalidSharePct, policy.minInvalidBudget);
  const attempts: RaceAttemptResult[] = [];
  const stubs: RaceAttemptResult[] = [];
  const summaries: RaceTrialSummary[] = [];
  const warmups: WarmupRecord[] = [];
  const violations: string[] = [];
  let invalidCount = 0;
  let abortMessage: string | null = null;

  async function runTrial(trial: number, attemptFn: AttemptFn): Promise<RaceAttemptResult> {
    const summary: RaceTrialSummary = {
      trial,
      attempts: 0,
      finalAttempt: null,
      outcome: "not-run",
      ok: false,
    };
    summaries.push(summary);
    if (abortMessage) throw new Error(abortMessage);

    summary.outcome = "failed";
    const mine: RaceAttemptResult[] = [];
    for (let attempt = 1; attempt <= policy.maxReruns + 1; attempt++) {
      summary.attempts = attempt;
      let record: RaceAttemptResult;
      try {
        record = await attemptFn(attempt);
      } catch (err) {
        stubs.push(stubRecord(trial, attempt, err instanceof Error ? err.message : String(err)));
        throw err;
      }
      record.attempt = attempt;
      record.valid = isSpreadValid(record.dispatchSpreadMs, policy.limitMs);
      attempts.push(record);
      mine.push(record);
      if (record.valid) break;

      invalidCount += 1;
      if (invalidCount > budget) {
        abortMessage =
          `TEST BUG: runner too noisy: ${invalidCount} invalid attempts exceed the budget of ${budget} ` +
          `(max(RACE_MIN_INVALID_BUDGET=${policy.minInvalidBudget}, ${policy.maxInvalidSharePct}% of ${trials} trials)); ` +
          `case stopped at trial ${trial}`;
        violations.push(abortMessage);
        break;
      }
    }

    const last = mine[mine.length - 1]!;
    if (!last.valid) {
      summary.outcome = "invalid-after-cap";
      if (abortMessage) throw new Error(abortMessage);
      const spreads = mine.map((r) => r.dispatchSpreadMs.toFixed(2)).join(", ");
      const message =
        `TEST BUG: runner too noisy: trial ${trial} still above RACE_MAX_SPREAD_MS=${policy.limitMs} ` +
        `after ${policy.maxReruns} reruns (spreads ${spreads} ms)`;
      violations.push(message);
      throw new Error(message);
    }
    summary.outcome = "valid";
    summary.finalAttempt = last.attempt;
    // D3: a violation in any attempt, valid or invalid, fails the trial index.
    const failed = mine.find((r) => !r.ok);
    summary.ok = failed === undefined;
    if (failed) {
      throw new Error(failed.error ?? failed.invariantViolations[0] ?? "TEST BUG: attempt failed");
    }
    return last;
  }

  async function warmup(attemptFn: AttemptFn): Promise<void> {
    for (let attempt = 1; attempt <= policy.warmupBursts; attempt++) {
      try {
        const r = await attemptFn(attempt);
        warmups.push({
          attempt,
          dispatchSpreadMs: r.dispatchSpreadMs,
          statusCounts: r.statusCounts,
          ok: r.ok,
          invariantViolations: r.invariantViolations,
          ...(r.error === undefined ? {} : { error: r.error }),
        });
      } catch (err) {
        // Setup or cleanup is broken: the same would break the trials, so say so (TEST BUG), do not hide it.
        const message = err instanceof Error ? err.message : String(err);
        warmups.push({
          attempt,
          dispatchSpreadMs: 0,
          statusCounts: {},
          ok: false,
          invariantViolations: [message],
          error: message,
        });
        violations.push(`TEST BUG: warm-up burst ${attempt} failed: ${message.slice(0, 200)}`);
      }
    }
  }

  function applyTo(histogram: RaceHistogram): void {
    const valid = attempts.filter((a) => a.valid);
    const invalid = attempts.filter((a) => !a.valid);
    histogram.warmup = [...warmups];
    histogram.trials = [...summaries].sort((a, b) => a.trial - b.trial);
    histogram.attempts = [...attempts, ...stubs].sort(
      (a, b) => a.trial - b.trial || a.attempt - b.attempt,
    );
    histogram.statusCounts = {};
    for (const a of valid) mergeStatusCounts(histogram.statusCounts, a.statusCounts);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(valid.map((a) => a.dispatchSpreadMs));
    histogram.invalidDispatchSpreadMs = aggregateDispatchSpread(
      invalid.map((a) => a.dispatchSpreadMs),
    );
    histogram.invalidTrials = invalid.length;
    histogram.reruns = attempts.filter((a) => a.attempt > 1).length;
    histogram.spreadPolicy = { ...policy, invalidBudget: budget };
    histogram.invariantViolations.push(...violations);
  }

  return { runTrial, warmup, attempts, stubs, violations, applyTo };
}
