import type pg from "pg";
import { createReadOnlyPool } from "../oracles/pg.ts";
import { dispatchSpreadMs, summariseBody } from "../races/fire-together.ts";
import { raceTrialsFromEnv } from "../races/env.ts";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import { createRerunRunner, spreadPolicyFromEnv } from "../races/rerun-on-spread.ts";
import { p6RunPrefix } from "../races/prefix.ts";
import { runTrials } from "../races/run-trials.ts";
import { recordTrial } from "../races/trial-record.ts";
import type {
  RaceAttemptResult,
  RaceHistogram,
  RaceOracleValue,
  RaceRequestResult,
} from "../races/types.ts";
import { signInWorkspace } from "./auth.ts";
import {
  twentyBaseUrlFromEnv,
  twentyDatabaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyMailpitUrlFromEnv,
  twentyPasswordFromEnv,
  twentySubdomainFromEnv,
  twentyWorkspaceNameFromEnv,
} from "./env.ts";
import { resolveWorkspaceSchema } from "./oracle.ts";

export interface CaseContext {
  base: string;
  mailpitUrl: string;
  /** Workspace bearer token (signInWorkspace). */
  auth: string;
  workspaceId: string;
  /** workspace_<base36>, resolved from core.workspace. */
  schema: string;
  /** Read-only oracle pool. */
  pool: pg.Pool;
  /** Run prefix (p6RunPrefix), in every name and address. */
  prefix: string;
}

export async function setupTwentyContext(): Promise<CaseContext> {
  const base = twentyBaseUrlFromEnv();
  const pool = createReadOnlyPool(twentyDatabaseUrlFromEnv());
  const session = await signInWorkspace({
    baseUrl: base,
    email: twentyEmailFromEnv(),
    password: twentyPasswordFromEnv(),
    workspaceName: twentyWorkspaceNameFromEnv(),
  });
  const ws = await resolveWorkspaceSchema(pool, twentySubdomainFromEnv());
  return {
    base,
    mailpitUrl: twentyMailpitUrlFromEnv(),
    auth: session.authorizationHeader,
    workspaceId: ws.workspaceId,
    schema: ws.schema,
    pool,
    prefix: p6RunPrefix(),
  };
}

/** One sequential request with its start and end time, in the same shape fireTogether records. */
export async function timed(
  index: number,
  fn: () => Promise<{ status: number; body: string }>,
): Promise<RaceRequestResult> {
  const startedAtMs = performance.now();
  try {
    const { status, body } = await fn();
    return {
      index,
      status,
      bodySummary: summariseBody(status, body),
      startedAtMs,
      endedAtMs: performance.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      index,
      status: null,
      bodySummary: summariseBody(null, message),
      startedAtMs,
      endedAtMs: performance.now(),
      error: message,
    };
  }
}

/**
 * Warm-up, then N trials through the rerun runner (the self-test shape). `attempt` may throw: that becomes a stub, and the
 * spec's first guard fails on it. `leakCheck` runs before the histogram is written and its values join the histogram oracle.
 */
export async function runTwentyTrials(opts: {
  caseId: string;
  title: string;
  concurrency: number;
  attempt: (
    trial: number,
  ) => Promise<{ requests: RaceRequestResult[]; oracle: Record<string, RaceOracleValue> }>;
  leakCheck?: () => Promise<Record<string, RaceOracleValue>>;
}): Promise<{
  histogram: RaceHistogram;
  trials: Array<{ trial: number; ok: boolean; value?: RaceAttemptResult; error?: string }>;
}> {
  const trials = raceTrialsFromEnv();
  const histogram = createHistogram({
    caseId: opts.caseId,
    title: opts.title,
    product: "twenty",
    concurrency: opts.concurrency,
    trials,
  });
  try {
    const burst = async (trial: number): Promise<RaceAttemptResult> => {
      const { requests, oracle } = await opts.attempt(trial);
      const record = recordTrial(
        trial,
        { requests, dispatchSpreadMs: dispatchSpreadMs(requests.map((r) => r.startedAtMs)) },
        () => {},
      );
      record.oracle = oracle;
      return record;
    };
    const runner = createRerunRunner(spreadPolicyFromEnv(), trials);
    await runner.warmup(() => burst(0));
    const results = await runTrials(trials, (trial) => runner.runTrial(trial, () => burst(trial)));
    runner.applyTo(histogram);
    if (opts.leakCheck) Object.assign(histogram.oracle, await opts.leakCheck());
    return { histogram, trials: results };
  } finally {
    await writeHistogram(histogram);
  }
}
