export type RaceProduct = "medusa" | "cal" | "documenso" | "twenty" | "framework";
export type RaceVerdict = "pass" | "fail";

export type RaceOracleValue = number | string | boolean | null;

export interface RaceRequestResult {
  index: number;
  status: number | null;
  bodySummary: string;
  startedAtMs: number;
  endedAtMs: number;
  error?: string;
}

export interface SpreadPolicy {
  /** Largest dispatch spread, in ms, that still counts as a valid burst (valid when spread <= limit). */
  limitMs: number;
  /** Reruns allowed per trial index. */
  maxReruns: number;
  /** Invalid attempts allowed per case, in whole percent of the trials asked for. */
  maxInvalidSharePct: number;
  /** Invalid attempts a case may always spend (the budget never falls below this). */
  minInvalidBudget: number;
  /** Warm-up bursts fired before trial 1 (0 disables). Not trials: no verdict, no counts. */
  warmupBursts: number;
}

/** What the evidence keeps of one warm-up burst. */
export interface WarmupRecord {
  attempt: number;
  dispatchSpreadMs: number;
  statusCounts: Record<string, number>;
  /** False when the warm-up burst broke an invariant or threw. Recorded, never part of the verdict. */
  ok: boolean;
  invariantViolations: string[];
  error?: string;
}

/** One burst: fresh setup, one fireTogether, the product oracle. A trial index may have several (reruns). */
export interface RaceAttemptResult {
  trial: number;
  /** 1 for the first burst of a trial index, 2 for the first rerun, and so on. */
  attempt: number;
  /** False when the burst spread was above the limit: the burst is kept but not counted as a trial. */
  valid: boolean;
  ok: boolean;
  statuses: Array<number | null>;
  statusCounts: Record<string, number>;
  dispatchSpreadMs: number;
  oracle: Record<string, RaceOracleValue>;
  invariantViolations: string[];
  error?: string;
  requests?: RaceRequestResult[];
}

export type RaceTrialOutcome =
  /** The last attempt had a valid spread. */
  | "valid"
  /** Every allowed attempt had a spread above the limit (per-trial cap or invalid-share budget). */
  | "invalid-after-cap"
  /** An attempt threw before it produced a burst record (setup or cleanup broken). */
  | "failed"
  /** The invalid-share budget was spent earlier, so this trial index never started. */
  | "not-run";

/** One entry per trial index. */
export interface RaceTrialSummary {
  trial: number;
  /** Attempts started for this index. */
  attempts: number;
  /** Attempt number of the final valid attempt, or null when there is none. */
  finalAttempt: number | null;
  outcome: RaceTrialOutcome;
  /** True when the outcome is "valid" and no attempt of this index, valid or invalid, has a violation. */
  ok: boolean;
}

export interface RaceHistogram {
  caseId: string;
  title: string;
  product: RaceProduct;
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  /** Valid trials asked for (RACE_TRIALS or the case's cap). Invalid attempts are not part of this number. */
  trialsRequested: number;
  concurrency: number;
  /** Valid attempts only. Invalid attempts keep their own counts in attempts[]. */
  statusCounts: Record<string, number>;
  /** One entry per trial index, ordered by trial. */
  trials: RaceTrialSummary[];
  /** Every attempt (valid, invalid, and attempts that threw), ordered by trial then attempt. */
  attempts: RaceAttemptResult[];
  /** Warm-up bursts fired before trial 1. Not trials: excluded from statusCounts, spread aggregates and the verdict. */
  warmup: WarmupRecord[];
  oracle: Record<string, RaceOracleValue>;
  /** Valid attempts only. */
  dispatchSpreadMs: { min: number; max: number; mean: number };
  /** Invalid attempts only (all zeros when there were none). */
  invalidDispatchSpreadMs: { min: number; max: number; mean: number };
  /** Attempts rejected because the spread was above the limit. */
  invalidTrials: number;
  /** Attempts that were reruns (attempt number above 1). */
  reruns: number;
  spreadPolicy: SpreadPolicy & { invalidBudget: number };
  invariantViolations: string[];
  /** SUSPECTED findings that never fail a case, e.g. orphan orders (F-M5). Absent when the case has none. */
  suspected?: string[];
  verdict: RaceVerdict;
}
