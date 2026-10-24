export type LoadProduct = "stub" | "medusa" | "cal" | "documenso";
export type LoadProfileName = "pr" | "full";

/** One workload size. `rate` is iterations per second (timeUnit 1s). Sizes come from the case's probe (D1). */
export interface LoadProfile {
  rate: number;
  durationSec: number;
  /** Slowest single iteration expected, in ms: input of the Little's-law sizing (k6/lib/pure/sizing.js). */
  maxLatencyMs: number;
}

/** One k6 process of a case. Most cases have exactly one; the self-test has three. */
export interface K6RunSpec {
  label: string; // "main", "open", "closed", "undersized"
  script: string; // repo-relative, e.g. "k6/selftest/coordinated-omission.js"
  env: Record<string, string>; // non-secret inputs; also written to k6-config.json
  secretEnv?: string[]; // NAMES of env vars to forward from the runner's environment; values never logged or written
  expectExit?: number; // default 0 (99 = thresholds crossed)
}

export interface LoadCase {
  id: string; // "P6-X-LOAD-001"
  title: string;
  product: LoadProduct;
  label: "functional load, not capacity"; // D1, P6-RULE-003: printed in verdict.json and the job summary
  profiles: Record<LoadProfileName, LoadProfile>;
  runs: (ctx: LoadContext) => K6RunSpec[]; // evaluated after setup, so ids made in setup can go into env
  /** Per-case overrides of the default stages (setup, reconcile, ...). Tasks 7 to 10 use this. */
  stages?: Partial<StageSet>;
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
  k6: K6RunResult[]; // filled by the "k6" stage
  invalid: string[]; // INVALID reasons added by Task 4 and Task 5 stages
  results: Partial<Record<StageName, StageResult>>;
}

export type Stage = (ctx: LoadContext) => Promise<StageResult>;
export type StageSet = Record<StageName, Stage>;

export type Outcome = "PASS" | "FAIL" | "INVALID" | "ENV";
