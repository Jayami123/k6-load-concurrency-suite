import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { p6RunPrefix } from "../races/prefix.ts";
import { LOAD_ROOT, newRunId } from "./paths.ts";
import { execFileSync } from "node:child_process";
import { buildRunMeta } from "./run-meta.ts";
import { defaultStages, seqStages, validityStage } from "./stages.ts";
import { parseK6Summary } from "./summary.ts";
import type {
  K6RunResult,
  LoadCase,
  LoadContext,
  LoadProfileName,
  Outcome,
  Stage,
  StageName,
  StageResult,
  StageSet,
} from "./types.ts";

export const EXIT_CODES = { PASS: 0, FAIL: 1, ENV: 2, INVALID: 3 } as const;

export interface RunOptions {
  profile: LoadProfileName;
  outRoot?: string;
  runId?: string;
  stages?: Partial<StageSet>;
  env?: NodeJS.ProcessEnv;
}

export interface LoadResult {
  outcome: Outcome;
  ctx: LoadContext;
  verdictPath: string;
  exitCode: 0 | 1 | 2 | 3;
}

/** Order fixed by plan §6.2. Stages after a failed setup or preflight are skipped, except the three that always run. */
const ORDER: StageName[] = [
  "setup",
  "preflight",
  "samplerStart",
  "k6",
  "samplerStop",
  "drain",
  "reconcile",
  "cleanup",
  "tokenScan",
  "verdict",
];
const ALWAYS: StageName[] = ["cleanup", "tokenScan", "verdict"];

/** Pure. ENV if setup or preflight failed; else FAIL on a PRODUCT BUG or TEST BUG, or a k6 exit code other than expected; else INVALID; else PASS. */
export function evaluateVerdict(ctx: LoadContext): { outcome: Outcome; reasons: string[] } {
  const setupFailed = (["setup", "preflight"] as const).filter((n) => ctx.results[n]?.ok === false);
  if (setupFailed.length > 0) {
    return {
      outcome: "ENV",
      reasons: setupFailed.map(
        (n) => `${n} failed: ${(ctx.results[n]?.reasons ?? []).join("; ") || "no reason"}`,
      ),
    };
  }
  const reasons: string[] = [];
  for (const [name, r] of Object.entries(ctx.results)) {
    if (r && (r.kind === "PRODUCT BUG" || r.kind === "TEST BUG")) {
      reasons.push(`${name}: ${r.kind}${r.reasons.length > 0 ? ` - ${r.reasons.join("; ")}` : ""}`);
    }
  }
  const expected = new Map(ctx.caseDef.runs(ctx).map((s) => [s.label, s.expectExit ?? 0]));
  for (const k of ctx.k6) {
    const want = expected.get(k.label) ?? 0;
    if (k.exitCode !== want) reasons.push(`k6 ${k.label} exited ${k.exitCode}, expected ${want}`);
  }
  if (reasons.length > 0) return { outcome: "FAIL", reasons };
  if (ctx.invalid.length > 0) return { outcome: "INVALID", reasons: [...ctx.invalid] };
  return { outcome: "PASS", reasons: [] };
}

export function summaryFor(k: K6RunResult): Record<string, unknown> {
  if (!existsSync(k.summaryPath))
    return { label: k.label, exitCode: k.exitCode, summary: "missing" };
  let s: ReturnType<typeof parseK6Summary>;
  try {
    s = parseK6Summary(JSON.parse(readFileSync(k.summaryPath, "utf8")));
  } catch {
    // A k6 crash can leave a truncated file. Keep verdict.json writable and say why the summary is empty.
    return { label: k.label, exitCode: k.exitCode, summary: "unreadable" };
  }
  return {
    label: k.label,
    exitCode: k.exitCode,
    requests: s.requests,
    iterations: s.iterations,
    dropped: s.dropped,
    vusMax: s.vusMax,
    p95Ms: s.p95Ms,
  };
}

/** Splits "<label>: <code>: <detail>" (validityStage) into the { code, detail } objects the verdict readers expect. */
export function invalidReasons(
  invalid: string[],
): Array<{ label?: string; code: string; detail: string }> {
  return invalid.map((s) => {
    const m = /^([^:]+): ([^:]+): ([\s\S]*)$/.exec(s);
    return m ? { label: m[1], code: m[2]!, detail: m[3]! } : { code: "UNPARSED", detail: s };
  });
}

function writeVerdictFile(ctx: LoadContext, startedAt: string): void {
  const { outcome, reasons } = evaluateVerdict(ctx);
  const stages = Object.fromEntries(
    Object.entries(ctx.results).map(([name, r]) => [
      name,
      { ok: r?.ok, ms: r?.ms, kind: r?.kind, reasons: r?.reasons ?? [], data: r?.data },
    ]),
  );
  const doc = {
    schema: 1,
    caseId: ctx.caseDef.id,
    runId: ctx.runId,
    profile: ctx.profileName,
    label: ctx.caseDef.label,
    startedAt,
    finishedAt: new Date().toISOString(),
    outcome,
    reasons,
    invalid: ctx.invalid,
    validity: {
      verdict: ctx.invalid.length === 0 ? "VALID" : "INVALID",
      reasons: invalidReasons(ctx.invalid),
    },
    k6: ctx.k6.map((k) => ({
      ...summaryFor(k),
      validity: k.validity,
      resources: k.resources,
      telemetry: k.telemetry,
    })),
    runMeta: "run-meta.json",
    stages,
  };
  writeFileSync(path.join(ctx.outDir, "verdict.json"), `${JSON.stringify(doc, null, 2)}\n`);
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function k6VersionOf(): string {
  try {
    const out = execFileSync("k6", ["version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /^k6 v([\d.]+)/.exec(out.trim())?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** run-meta.json is written at the start and rewritten at the end with finishedAt. */
function writeRunMeta(outDir: string, ctx: LoadContext): void {
  if (!ctx.meta) return;
  const doc = { ...ctx.meta, finishedAt: new Date().toISOString() };
  writeFileSync(path.join(outDir, "run-meta.json"), `${JSON.stringify(doc, null, 2)}\n`);
}

export async function runLoad(caseDef: LoadCase, opts: RunOptions): Promise<LoadResult> {
  const env = opts.env ?? process.env;
  const runId = opts.runId ?? newRunId();
  const outDir = path.join(opts.outRoot ?? LOAD_ROOT, caseDef.id, runId);
  mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const profile = caseDef.profiles[opts.profile];
  const ctx: LoadContext = {
    caseDef,
    profileName: opts.profile,
    profile,
    runId,
    runPrefix: p6RunPrefix(),
    outDir,
    env,
    config: {},
    handles: {},
    k6: [],
    invalid: [],
    results: {},
  };
  const verdictStage: Stage = async (c) => {
    writeVerdictFile(c, startedAt);
    return { ok: true, reasons: [] };
  };
  const stages: StageSet = {
    ...defaultStages,
    verdict: verdictStage,
    ...caseDef.stages,
    ...opts.stages,
  };
  // The validity judge runs first in the reconcile slot; the case's own reconcile (relations, audits) runs after it.
  stages.reconcile = seqStages(validityStage, stages.reconcile);
  ctx.meta = buildRunMeta({
    caseDef,
    profileName: opts.profile,
    profile,
    runId,
    startedAt: new Date(startedAt),
    env,
    k6Version: k6VersionOf(),
  });
  writeRunMeta(outDir, ctx);

  let abort = false;
  for (const name of ORDER) {
    if (abort && !ALWAYS.includes(name)) continue;
    const t0 = Date.now();
    let result: StageResult;
    try {
      result = await stages[name](ctx);
    } catch (err) {
      result = { ok: false, kind: "TEST BUG", reasons: [`${name} threw: ${message(err)}`] };
    }
    result.ms = Date.now() - t0;
    ctx.results[name] = result;
    if (!result.ok && (name === "setup" || name === "preflight")) abort = true;
  }

  writeRunMeta(outDir, ctx);
  const { outcome } = evaluateVerdict(ctx);
  const exitCode = EXIT_CODES[outcome];
  if (env.GITHUB_STEP_SUMMARY) {
    const relations = ctx.results.reconcile?.data?.relations;
    const lines = [
      `### ${caseDef.id}: ${outcome} (${opts.profile} profile, ${caseDef.label})`,
      ...(relations ? [`- relations: ${String(relations)}`] : []),
      ...evaluateVerdict(ctx).reasons.map((r) => `- ${r}`),
      "",
    ];
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
  return { outcome, ctx, verdictPath: path.join(outDir, "verdict.json"), exitCode };
}

/** Exposed for the CLI's cleanup check: true when a process id is gone (Linux /proc). */
export function processGone(pid: number): boolean {
  return !existsSync(`/proc/${pid}`);
}
