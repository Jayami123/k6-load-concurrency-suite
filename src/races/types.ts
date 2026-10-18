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

export interface RaceTrialResult {
  trial: number;
  ok: boolean;
  statuses: Array<number | null>;
  statusCounts: Record<string, number>;
  dispatchSpreadMs: number;
  oracle: Record<string, RaceOracleValue>;
  invariantViolations: string[];
  error?: string;
  requests?: RaceRequestResult[];
}

export interface RaceHistogram {
  caseId: string;
  title: string;
  product: RaceProduct;
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  trials: number;
  concurrency: number;
  statusCounts: Record<string, number>;
  perTrial: RaceTrialResult[];
  oracle: Record<string, RaceOracleValue>;
  dispatchSpreadMs: { min: number; max: number; mean: number };
  invariantViolations: string[];
  verdict: RaceVerdict;
}
