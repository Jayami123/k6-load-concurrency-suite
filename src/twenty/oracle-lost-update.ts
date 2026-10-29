// Read-only oracle of P6-TW-LOAD-004 (lost update). Reads the final values of the case's records, joins them with the k6
// intents (src/load/lost-update.ts), judges the case's own VALID rules and writes the case extras. Never writes to the product.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { loadRepoEnv } from "../load/env.ts";
import {
  dedupeIntents,
  joinVariantA,
  joinVariantB,
  type FinalRow,
  type JoinResult,
  type LostUpdateVerdict,
  type WriteIntent,
} from "../load/lost-update.ts";
import { makeReconcileStage, reconcile, type ReconcileDeps } from "../load/reconcile/index.ts";
import type { LoadContext, Stage, StageResult } from "../load/types.ts";
import { closePool, createReadOnlyPool, selectRows } from "../oracles/pg.ts";
import { twentyDatabaseUrlFromEnv } from "./env.ts";

/** The records setup creates for this case: 5 for variant A, 6 for variant B (two per stage). Each gets one setup write. */
export const T4_SETUP_RECORDS = 11;
/** The value setup writes to employees on every record (not an intent). */
export const T4_INITIAL_EMPLOYEES = "0";
/** The writers' tolerance on the achieved attempt count per writer per stage (plan, VALID rule). */
export const T4_RATE_TOLERANCE = 0.1;

/** What setup stores in ctx.config.t4 for the k6 case and the oracle. Ids and numbers only, never a secret. */
export interface T4Config {
  records: { a: string[]; b: string[] };
  stageRates: number[]; // attempts per second per writer, one entry per stage
  stageSec: number;
  initialEmployees: string;
}

const SCHEMA_RE = /^workspace_[a-z0-9]+$/;
const MSG = /msg="((?:[^"\\]|\\.)*)"/;
const TAG = "TW004 ";

/** The schema name is interpolated into SQL, so it is checked first (a TEST BUG otherwise). */
export function assertSchemaName(schema: string): string {
  if (!SCHEMA_RE.test(schema)) throw new Error("TEST BUG: schema name not valid");
  return schema;
}

/** The read-only final values of the case's records. The schema is checked before it is interpolated. */
export function finalsSql(schema: string): string {
  return `SELECT id AS "recordId", employees::text AS employees, name FROM ${assertSchemaName(schema)}.company WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL`;
}

/** Final values of the given records. A record that is gone is absent from the result (the join reports it). */
export async function readFinals(
  pool: pg.Pool,
  schema: string,
  recordIds: string[],
): Promise<FinalRow[]> {
  const rows = await selectRows<{
    recordId: string;
    employees: string | null;
    name: string | null;
  }>(pool, finalsSql(schema), [recordIds]);
  return rows.map((r) => ({
    recordId: r.recordId,
    employees: r.employees,
    name: r.name,
    initialEmployees: T4_INITIAL_EMPLOYEES,
  }));
}

/**
 * The TW004 lines of the k6 log (k6 console output, logfmt: msg="TW004 {...}" with escaped quotes). A line that carries the tag but
 * not valid JSON is a TEST BUG: the intent cannot be judged.
 */
export function parseTw004(logText: string): WriteIntent[] {
  const intents: WriteIntent[] = [];
  for (const line of logText.split("\n")) {
    const match = MSG.exec(line);
    if (!match) continue;
    const msg = match[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (!msg.startsWith(TAG)) continue;
    try {
      intents.push(JSON.parse(msg.slice(TAG.length)) as WriteIntent);
    } catch {
      throw new Error("TEST BUG: malformed TW004 line");
    }
  }
  return intents;
}

/**
 * The stage result of the combined verdict. Pure. A variant A loss is a PRODUCT BUG suspicion (the run fails until repeated
 * runs confirm it). A variant B loss is a FINDING (owner decision C13: last-write-wins by design): recorded, exit 0.
 */
export function lostUpdateOutcome(
  verdict: LostUpdateVerdict,
  a: JoinResult,
  b: JoinResult,
): Pick<StageResult, "ok" | "kind" | "reasons" | "finding"> {
  if (verdict === "PRODUCT_BUG_SUSPECTED") {
    return {
      ok: false,
      kind: "PRODUCT BUG",
      reasons: [`SUSPECTED: P6-TW-LOAD-004 variant A: ${a.verdictReason}`],
    };
  }
  if (verdict === "FINDING") {
    return { ok: true, reasons: [], finding: `P6-TW-LOAD-004 variant B: ${b.verdictReason}` };
  }
  return { ok: true, reasons: [] };
}

/** The overall verdict: a variant A loss is PRODUCT_BUG_SUSPECTED, a variant B loss is a FINDING, else PASS or INCONCLUSIVE. */
export function combineVerdicts(a: JoinResult, b: JoinResult): LostUpdateVerdict {
  if (a.verdict === "PRODUCT_BUG_SUSPECTED") return "PRODUCT_BUG_SUSPECTED";
  if (b.verdict === "FINDING") return "FINDING";
  if (a.verdict === "INCONCLUSIVE" || b.verdict === "INCONCLUSIVE") return "INCONCLUSIVE";
  return "PASS";
}

/** A counter of the k6 summary (absent counters are 0). */
function counterOf(summary: unknown, name: string): number {
  const metrics = (summary as { metrics?: Record<string, { count?: number }> }).metrics ?? {};
  return metrics[name]?.count ?? 0;
}

/**
 * The case's own VALID rules, in addition to the runner's validity judge: no 429 and no 5xx on any API-key request, no rejected
 * write (a 4xx other than 429), and each writer's achieved attempts within the tolerance of its plan per stage.
 * Each breach is a reason of the main run (INVALID), named by code and count only.
 */
export function validityReasons(intents: WriteIntent[], summary: unknown, t4: T4Config): string[] {
  const reasons: string[] = [];
  const limited = counterOf(summary, "p6_t4_429") + counterOf(summary, "p6_tw_429");
  const serverErrors = counterOf(summary, "p6_t4_5xx") + counterOf(summary, "p6_tw_5xx");
  const rejected = intents.filter((i) => i.status >= 400 && i.status < 500 && i.status !== 429);
  if (limited > 0) reasons.push(`main: HTTP_429: ${limited} request(s) limited`);
  if (serverErrors > 0) reasons.push(`main: HTTP_5XX: ${serverErrors} server error(s)`);
  if (rejected.length > 0)
    reasons.push(`main: WRITE_REJECTED: ${rejected.length} write(s) answered 4xx`);
  t4.stageRates.forEach((rate, index) => {
    const stage = index + 1;
    const planned = rate * t4.stageSec;
    for (const writer of ["A1", "A2", "B1", "B2"]) {
      const achieved = intents.filter((i) => i.writer === writer && i.stage === stage).length;
      if (Math.abs(achieved - planned) > planned * T4_RATE_TOLERANCE) {
        reasons.push(
          `main: RATE_OUT_OF_BAND: writer ${writer} stage ${stage} planned ${planned} achieved ${achieved}`,
        );
      }
    }
  });
  return reasons;
}

/** Makes the stage reconcile with the case's 11 setup records and their 11 setup writes (the counts the foundation audit does not know). */
export const t4ReconcileDeps: ReconcileDeps = {
  openPool: () => {
    loadRepoEnv();
    return createReadOnlyPool(twentyDatabaseUrlFromEnv());
  },
  reconcile: (cfg, pool, counters) =>
    reconcile(cfg, pool, {
      ...counters,
      clientCount:
        counters.clientCount === undefined ? undefined : counters.clientCount + T4_SETUP_RECORDS,
      counts: counters.counts && {
        ...counters.counts,
        patched: counters.counts.patched + T4_SETUP_RECORDS,
      },
    }),
};

/** The audit of the case's rows, with the setup records counted in. */
export const t4ReconcileStage: Stage = makeReconcileStage(t4ReconcileDeps);

/** The lost-update stage: judges the case's rules, joins the intents with the finals and writes the case extras. */
export const lostUpdateStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const t4 = ctx.config.t4 as T4Config | undefined;
  const main = ctx.k6.find((k) => k.label === "main");
  if (!t4 || !main) return { ok: true, reasons: [], data: { skipped: "no k6 run" } };
  const schema = (ctx.config.audit as { schema?: string } | undefined)?.schema ?? "";
  const intents = parseTw004(readFileSync(main.stdoutPath, "utf8"));
  const summary = JSON.parse(readFileSync(main.summaryPath, "utf8"));
  for (const reason of validityReasons(intents, summary, t4)) ctx.invalid.push(reason);

  const recordIds = [...t4.records.a, ...t4.records.b];
  const pool = createReadOnlyPool(twentyDatabaseUrlFromEnv());
  let finals: FinalRow[];
  try {
    finals = await readFinals(pool, schema, recordIds);
  } finally {
    await closePool(pool);
  }
  let a: JoinResult;
  let b: JoinResult;
  try {
    a = joinVariantA(intents, finals);
    b = joinVariantB(intents, finals);
  } catch (err) {
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: [err instanceof Error ? err.message : String(err)],
    };
  }
  const verdict = combineVerdicts(a, b);
  writeFileSync(
    path.join(ctx.outDir, "intents.jsonl"),
    `${intents.map((i) => JSON.stringify(i)).join("\n")}\n`,
  );
  writeFileSync(path.join(ctx.outDir, "finals.json"), `${JSON.stringify(finals, null, 2)}\n`);
  const unique = dedupeIntents(intents).kept.length;
  return {
    ...lostUpdateOutcome(verdict, a, b),
    data: {
      lostUpdate: { variantA: a, variantB: b, verdict, intents: unique, finals: finals.length },
      intents: "intents.jsonl",
      finals: "finals.json",
    },
  };
};
