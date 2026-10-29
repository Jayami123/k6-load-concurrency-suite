// P6-TW-LOAD-006 (rate-limit contract) and P6-TW-LOAD-009 (limiter fairness) verdicts (Twenty plan §6.9, §7). Pure except the
// stages at the end, which only read the k6 log. Names and counts only: no key, token or response body is ever kept.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { reconcileStage } from "../load/reconcile/index.ts";
import { firstOkAfter } from "../load/recovery.ts";
import { seqStages } from "../load/stages.ts";
import type { LoadContext, Stage, StageResult } from "../load/types.ts";

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

/** What the limiter's API-key bucket is keyed on. Only per token or per workspace lets -009 measure its fairness claim. */
export type LimiterKeying = "token" | "workspace" | "ip" | "global";

/**
 * The keying recorded by the Task 3 probe (3b row 6): at image defaults every key of a workspace shares one bucket, whose key is
 * `{<workspaceId>}:speed:...:apiKey:-:60`. That is per workspace. The pre-run gate of P6-TW-LOAD-009 reads this value.
 */
export const RECORDED_LIMITER_KEYING: LimiterKeying = "workspace";

/** The -009 gate (Twenty plan §6.9): the limiter keys per token or per workspace. Per IP or global closes it (NOT RUN). */
export function keyingGateOpen(keying: LimiterKeying): boolean {
  return keying === "token" || keying === "workspace";
}

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
  flood: Array<Pick<Sample, "tMs" | "status">>,
  low: Array<Pick<Sample, "tMs" | "status">>,
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

/** The -006 planned requests per phase (tw-load-006.js: 1 per s for 120 s, 100 per 60 s for 120 s, 200 per 60 s for 120 s). */
export const PLANNED_006: PlannedPerPhase = { below: 120, at: 200, above: 400, recovery: 60 };

/** The lines a k6 case prints with one tag (`TW006 {json}`), parsed. A line whose JSON does not parse throws (a TEST BUG). */
export function parseTaggedLines<T>(text: string, tag: string): T[] {
  const re = new RegExp(`${tag} (\\{.*\\})`);
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const m = re.exec(line);
    // k6's log quotes the message (msg="TW006 {\"phase\":...}"), so the JSON's quotes and backslashes are unescaped first.
    if (m?.[1]) out.push(JSON.parse(m[1].replace(/\\(["\\])/g, "$1")) as T);
  }
  return out;
}

/** The k6 log of one run (its stdout, where the console lines are). A missing run is a TEST BUG. */
function k6Log(ctx: LoadContext, label: string): string {
  const run = ctx.k6.find((k) => k.label === label);
  if (!run) throw new Error(`TEST BUG: no k6 run ${label}`);
  return readFileSync(run.stdoutPath, "utf8");
}

/** Preflight of both cases: no limiter variable and NODE_OPTIONS in this process (names only), and the productionLike profile. */
export const limiterPreflight: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  try {
    assertNoLimiterEnv(Object.keys(ctx.env));
  } catch (err) {
    return { ok: false, kind: "TEST BUG", reasons: [(err as Error).message] };
  }
  if (ctx.env.P6_TWENTY_LIMITER_PROFILE !== "productionLike") {
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: [
        "TEST BUG: P6-TW-LOAD-006 and -009 run on the productionLike profile (image defaults)",
      ],
    };
  }
  return { ok: true, reasons: [] };
};

/**
 * The -006 judge, in the reconcile slot after the case's own reconcile. Writes phases.json and recovery.json to the run
 * directory and puts the verdict under stages.reconcile.data.rateLimit. PRODUCT_BUG_SUSPECTED is a PRODUCT BUG (the job
 * fails until the repeat runs confirm it, rule C13); INCONCLUSIVE is INVALID.
 */
export const rateLimitStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const samples = parseTaggedLines<Sample>(k6Log(ctx, "main"), "TW006");
  const above = samples.filter((s) => s.phase === "above");
  const recovery = samples.filter((s) => s.phase === "recovery");
  if (samples.length === 0 || above.length === 0 || recovery.length === 0) {
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["TEST BUG: the -006 run printed no above or recovery requests"],
    };
  }
  const stopMs = Math.max(...above.map((s) => s.tMs));
  const recoveryMs = firstOkAfter(recovery, stopMs);
  const verdict = verdictForRateLimit(samples, recoveryMs, PLANNED_006);
  const phases = (["below", "at", "above", "recovery"] as const).map((phase) => ({
    ...phaseCounts(samples, phase),
    phase,
    contractOk: samples.filter((s) => s.phase === phase).every(contractOk),
  }));
  writeFileSync(path.join(ctx.outDir, "phases.json"), `${JSON.stringify(phases, null, 2)}\n`);
  writeFileSync(
    path.join(ctx.outDir, "recovery.json"),
    `${JSON.stringify({ recoveryMs, probes: recovery.length }, null, 2)}\n`,
  );
  const limited = samples.filter((s) => s.status === 429);
  const data = {
    rateLimit: {
      verdict: verdict.verdict,
      reasons: verdict.reasons,
      recoveryMs,
      planned: PLANNED_006,
      observed429: {
        periodCounts: [...new Set(limited.map((s) => s.periodCount))]
          .filter((n) => n !== null)
          .sort(),
        scopeKeysPresent: limited.length > 0 && limited.every((s) => s.scopeKeys.length > 0),
      },
    },
  };
  if (verdict.verdict === "PRODUCT_BUG_SUSPECTED") {
    return {
      ok: false,
      kind: "PRODUCT BUG",
      reasons: verdict.reasons.map((r) => `SUSPECTED: ${r}`),
      data,
    };
  }
  if (verdict.verdict === "INCONCLUSIVE") {
    ctx.invalid.push(...verdict.reasons.map((r) => `P6-TW-LOAD-006 INCONCLUSIVE: ${r}`));
  }
  return { ok: true, reasons: [], data };
};

/**
 * The -009 judge, in the reconcile slot after the case's own reconcile. The F and L lines are judged on one clock. Any 5xx is
 * a PRODUCT BUG suspicion (never 500). FINDING is an expected result and stays ok (it is recorded, not a failure).
 */
export const fairnessStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const lines = parseTaggedLines<{ key: "F" | "L"; tMs: number; status: number }>(
    k6Log(ctx, "main"),
    "TW009",
  );
  const flood = lines.filter((l) => l.key === "F");
  const low = lines.filter((l) => l.key === "L");
  if (flood.length === 0 || low.length === 0) {
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["TEST BUG: the -009 run printed no F or no L requests"],
    };
  }
  const fairness = fairnessVerdict(flood, low);
  const data = {
    fairness: {
      verdict: fairness.verdict,
      reason: fairness.reason,
      floodRequests: flood.length,
      floodRefused: flood.filter((l) => l.status === 429).length,
      lowRequests: low.length,
      lowRefused: low.filter((l) => l.status === 429).length,
    },
  };
  const s5xx = lines.filter((l) => l.status >= 500 && l.status < 600).length;
  if (s5xx > 0) {
    return {
      ok: false,
      kind: "PRODUCT BUG",
      reasons: [`SUSPECTED: ${s5xx} 5xx response(s) (the limiter must answer 429, never 500)`],
      data,
    };
  }
  if (fairness.verdict === "INCONCLUSIVE") {
    ctx.invalid.push(`P6-TW-LOAD-009 INCONCLUSIVE: ${fairness.reason}`);
  }
  return { ok: true, reasons: [], data };
};

/** The reconcile slot of each case: the Twenty reconcile (relations, audits), then the judge. */
export const rateLimit006Reconcile: Stage = seqStages(reconcileStage, rateLimitStage);
export const fairness009Reconcile: Stage = seqStages(reconcileStage, fairnessStage);
