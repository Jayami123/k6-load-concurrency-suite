export type LoadProduct = "stub" | "medusa" | "cal" | "documenso";
export type LoadProfileName = "pr" | "full";

/** One workload size. `rate` is iterations per second (timeUnit 1s). Sizes come from the case's probe (D1). */
export interface LoadProfile {
  rate: number;
  durationSec: number;
  /** Slowest single iteration expected, in ms: input of the Little's-law sizing (k6/lib/pure/sizing.js). */
  maxLatencyMs: number;
}

/** Labels a case or run can carry (plan task 1 §6.2). The knee label is set only by the knee cases. */
export type LoadLabel = "functional load, not capacity" | "knee range, environment-bound";

/**
 * The held-step plan of a knee run (plan task 1 §6.2). Rates are iterations per second with a resolution of 0.1 (plan §3.9 R1).
 * Planned iterations per step are rate x holdSec.
 */
export interface KneePlanSpec {
  startRate: number;
  stepRate: number;
  holdSec: number;
  rampSec: number;
  maxSteps: number;
}

/** One k6 process of a case. Most cases have exactly one; the self-test has three. */
export interface K6RunSpec {
  label: string; // "main", "open", "closed", "undersized"
  script: string; // repo-relative, e.g. "k6/selftest/coordinated-omission.js"
  env: Record<string, string>; // non-secret inputs; also written to k6-config.json
  secretEnv?: string[]; // NAMES of env vars to forward from the runner's environment; values never logged or written
  expectExit?: number; // default 0 (99 = thresholds crossed)
  /** The maxVUs the scenario was built with, read by the validity judge (Task 4). */
  maxVUs?: number;
  /** Self-test only (Task 5): run with the sampler (true) or without it (false). Default: the case's telemetry setting. */
  telemetry?: boolean;
  /** Self-test only (Task 5): the sampler stalls once for this long after three samples. */
  injectGapMs?: number;
  /** Self-test only (Task 5): the marker server reports a clock this far ahead of the runner. */
  markerSkewMs?: number;
  /** Expected validity of this run (Task 4): a run that is meant to be saturated expects INVALID. */
  expectValidity?: "VALID" | "INVALID";
  /** Invalid codes the expected INVALID run must show (Task 4). */
  expectCodes?: InvalidCode[];
  /** Exit codes the run may end with (plan task 1 §6.2). A knee run allows 0 and 99 (a stop is a result, not a failure). Default [expectExit ?? 0]. */
  allowExits?: number[];
  /** The knee plan of this run (plan task 1): steps, stop rule and the sizing the scenario was built with. */
  knee?: KneePlanSpec & {
    smokeP95Ms: number;
    maxVUs: number;
    expect?: { lowerRate: number; upperRate: number; firstSaturated?: string };
  };
}

export interface LoadCase {
  id: string; // "P6-X-LOAD-001"
  title: string;
  product: LoadProduct;
  label: LoadLabel; // D1, P6-RULE-003: printed in verdict.json and the job summary
  profiles: Record<LoadProfileName, LoadProfile>;
  runs: (ctx: LoadContext) => K6RunSpec[]; // evaluated after setup, so ids made in setup can go into env
  /** Telemetry for this case (Task 5): one sampler and one marker per k6 run, one chart per run. */
  telemetry?: { product: LoadProduct };
  /** Per-case overrides of the default stages (setup, reconcile, ...). Tasks 7 to 10 use this. */
  stages?: Partial<StageSet>;
  /**
   * Known product bugs this case declares (IDs from README "Known product bugs"). A violation of a declared bug is
   * KNOWN BUG in the verdict and does not fail the run. The gate is strict: a declared bug that is not observed fails.
   */
  knownBugs?: string[];
}

export type StageName =
  | "setup"
  | "preflight"
  | "samplerStart"
  | "k6"
  | "samplerStop"
  | "drain"
  | "reconcile"
  | "cleanup"
  | "tokenScan"
  | "verdict";

/** Failure kinds, in the vocabulary of docs/agent-rules.md. INVALID is not a failure (Task 4). */
export type FindingKind = "ENV" | "TEST BUG" | "PRODUCT BUG" | "INVALID";

export interface StageResult {
  ok: boolean;
  /** Present when ok is false, or for INVALID reasons that do not stop the pipeline. */
  kind?: FindingKind;
  reasons: string[]; // one line each; no secrets, ids and counts only
  data?: Record<string, unknown>; // stage output, merged into verdict.json under stages.<name>
  ms?: number;
}

export interface K6RunResult {
  label: string;
  exitCode: number;
  summaryPath: string; // <outDir>/k6-<label>-summary.json
  pointsPath: string; // <outDir>/k6-<label>.json.gz
  stdoutPath: string; // <outDir>/k6-<label>.log
  startedAtMs: number;
  endedAtMs: number;
  pid: number; // for the sampler (Task 5) and the CPU guard (Task 4)
  resources?: ResourceSummary;
  validity?: ValidityVerdict;
  telemetry?: TelemetrySummary;
}

export interface LoadContext {
  caseDef: LoadCase;
  profileName: LoadProfileName;
  profile: LoadProfile;
  runId: string; // "<UTC compact>-<8 hex>", e.g. "20261024T010203Z-3fa9c0d1"
  runPrefix: string; // p6RunPrefix(); isP6RunPrefix(runPrefix) is true
  outDir: string; // results/load/<caseId>/<runId>
  env: NodeJS.ProcessEnv; // the runner's environment (read-only)
  /** Free-form values set by setup and read by later stages (ids, base URLs). Never secrets. */
  config: Record<string, unknown>;
  /** Secrets set by setup (an admin token, an API token). Only the k6 process named in secretEnv receives them; never logged or written. */
  secrets: Record<string, string>;
  /** In-memory handles of a product's run (setup to cleanup). Never serialized: a handle can hold a secret. */
  handles: Record<string, unknown>;
  k6: K6RunResult[]; // filled by the "k6" stage
  invalid: string[]; // INVALID reasons added by Task 4 and Task 5 stages
  results: Partial<Record<StageName, StageResult>>;
  /** Run metadata (Task 4, P6-RULE-003); written to run-meta.json. */
  meta?: RunMeta;
}

export type Stage = (ctx: LoadContext) => Promise<StageResult>;
export type StageSet = Record<StageName, Stage>;

export type Outcome = "PASS" | "FAIL" | "INVALID" | "ENV";

export type InvalidCode =
  | "dropped_iterations"
  | "vu_exhausted"
  | "k6_cpu"
  | "runner_cpu"
  | "runner_memory"
  | "telemetry_gap"
  | "clock_skew"
  | "no_knee";

/** detail: counts only, no URL, token or id. */
export interface InvalidReason {
  code: InvalidCode;
  detail: string;
}

export interface ValidityVerdict {
  verdict: "VALID" | "INVALID";
  reasons: InvalidReason[];
}

/** Per-run resource summary written by the sampler of src/load/proc-stats.ts. Absent when /proc could not be read. */
export interface ResourceSummary {
  samples: number;
  intervalMs: number;
  k6CoresAvg: number;
  k6CoresMax: number;
  runnerBusyPctAvg: number;
  runnerBusyPctMax: number;
  memAvailablePctMin: number;
}

export interface RunMeta {
  schema: 1;
  caseId: string;
  runId: string;
  profile: LoadProfileName;
  label: LoadLabel;
  rate: number;
  durationSec: number;
  plannedIterations: number;
  /** The knee plan of a knee run (plan task 1 §6.2); absent on every other run. */
  knee?: KneePlanSpec;
  startedAt: string;
  finishedAt?: string;
  environment: {
    kind: "github-actions" | "local";
    event?: string;
    workflow?: string;
    ref?: string;
    sha?: string;
    runUrl?: string;
    attempt?: number;
    runnerImage: string;
    imageVersion: string;
    runnerOs: string;
    runnerArch: string;
    nproc: number;
    memTotalMb: number;
  };
  software: {
    k6: string;
    harness: string;
    node: string;
    products: Partial<Record<"medusa" | "cal" | "documenso" | "twenty", string>>;
  };
  limits: Record<string, number>;
}

/** Per-run telemetry summary (Task 5): what the validity judge reads, plus the files written. */
export interface TelemetrySummary {
  gaps: string[];
  skewMs?: number;
  skewLimitMs: number;
  files: string[];
  sources: Record<string, boolean>;
}
