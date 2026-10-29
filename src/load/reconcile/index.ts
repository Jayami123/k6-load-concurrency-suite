import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findHits } from "../../../scripts/evidence-token-scan.mjs";
import { calDatabaseUrlFromEnv, medusaDatabaseUrlFromEnv } from "../../races/env.ts";
import { documensoDatabaseUrlFromEnv } from "../../documenso/env.ts";
import { closePool, createReadOnlyPool } from "../../oracles/pg.ts";
import { twentyDatabaseUrlFromEnv } from "../../twenty/env.ts";
import { reconcileCal } from "./cal.ts";
import { reconcileDocumenso } from "./documenso.ts";
import { reconcileMedusa } from "./medusa.ts";
import { type BackgroundCounts, reconcileTwenty } from "./twenty.ts";
import type { AuditResult, AuditStageConfig, IntentCounters } from "./types.ts";
import { parseIntentLog } from "../knee/intents.ts";
import type { LoadContext, Stage, StageResult } from "../types.ts";

/** Runs stages in order and merges their data. A not-ok stage does not stop the next one; the first failing kind is reported. */
export function composeStages(stages: Stage[]): Stage {
  return async (ctx) => {
    let ok = true;
    let kind: StageResult["kind"];
    const reasons: string[] = [];
    const data: Record<string, unknown> = {};
    const findings: string[] = [];
    for (const stage of stages) {
      const r = await stage(ctx);
      if (!r.ok && ok) kind = r.kind;
      ok = ok && r.ok;
      reasons.push(...r.reasons);
      Object.assign(data, r.data);
      if (r.finding !== undefined) findings.push(r.finding);
    }
    return {
      ok,
      kind: ok ? undefined : kind,
      reasons,
      data,
      ...(findings.length > 0 ? { finding: findings.join("; ") } : {}),
    };
  };
}

/** Maps an audit to a stage result. Violations fail; a known bug is counted in the reasons and does not fail; an unexpected known bug fails (owner Q1). */
export function auditToStageResult(result: AuditResult): StageResult {
  const reasons: string[] = [];
  for (const v of result.violations) reasons.push(`${v.kind}: ${v.text}`);
  for (const [id, count] of Object.entries(result.knownBugs))
    reasons.push(`known bug ${id}: ${count} (counted, not a failure)`);
  for (const line of result.unexpected) reasons.push(`PRODUCT BUG: unexpected ${line}`);
  const productBug =
    result.violations.some((v) => v.kind === "PRODUCT BUG") || result.unexpected.length > 0;
  const testBug = result.violations.some((v) => v.kind === "TEST BUG");
  const ok = result.violations.length === 0 && result.unexpected.length === 0;
  return {
    ok,
    kind: ok ? undefined : productBug ? "PRODUCT BUG" : testBug ? "TEST BUG" : undefined,
    reasons,
    data: {
      audit: { product: result.product, rowsSeen: result.rowsSeen, checks: result.checks.length },
    },
  };
}

/** The client-visible counter of each product's journey (plan task 6 §6.2). */
export const CLIENT_COUNTER = {
  cal: "p6_bookings_accepted",
  medusa: "p6_orders",
  documenso: "p6_docs_completed",
  twenty: "p6_tw_created",
} as const;

/** A custom counter's total from a k6 summary export (metrics.<name>.count); undefined when the run did not define it. */
export function summaryCounter(summary: unknown, name: string): number | undefined {
  const metrics =
    (summary as { metrics?: Record<string, { count?: number; values?: { count?: number } }> })
      .metrics ?? {};
  const value = metrics[name]?.count ?? metrics[name]?.values?.count;
  return typeof value === "number" ? value : undefined;
}

/** The product switch: reads the database and evaluates the audit for the case's product. */
export async function reconcile(
  cfg: AuditStageConfig,
  pool: import("pg").Pool,
  counters: {
    clientCount?: number;
    intents?: IntentCounters;
    cancelsOk?: number;
    counts?: BackgroundCounts;
  },
): Promise<AuditResult> {
  switch (cfg.product) {
    case "cal":
      return reconcileCal(pool, cfg, counters.clientCount, counters.intents, counters.cancelsOk);
    case "medusa":
      return reconcileMedusa(pool, cfg, counters.clientCount, counters.intents);
    case "documenso":
      return reconcileDocumenso(pool, cfg, counters.clientCount, counters.intents?.interrupted);
    case "twenty":
      return reconcileTwenty(pool, cfg, counters.clientCount, counters.counts);
  }
}

/** The Twenty background counters of a k6 summary (Twenty plan §6.7). Absent counters are 0; created is the client count. */
function twentyCounts(summary: unknown, created: number | undefined): BackgroundCounts | undefined {
  if (summary === undefined) return undefined;
  return {
    created: created ?? 0,
    patched: summaryCounter(summary, "p6_tw_updated") ?? 0,
    serverErrors: summaryCounter(summary, "p6_tw_5xx") ?? 0,
    limited429: summaryCounter(summary, "p6_tw_429") ?? 0,
  };
}

export interface ReconcileDeps {
  openPool: (product: AuditStageConfig["product"]) => import("pg").Pool;
  reconcile: typeof reconcile;
}

const defaultDeps: ReconcileDeps = {
  openPool: (product) =>
    createReadOnlyPool(
      product === "cal"
        ? calDatabaseUrlFromEnv()
        : product === "documenso"
          ? documensoDatabaseUrlFromEnv()
          : product === "twenty"
            ? twentyDatabaseUrlFromEnv()
            : medusaDatabaseUrlFromEnv(),
    ),
  reconcile,
};

/**
 * The intent counters of a knee run (plan task 1 §6.8): the log of the main run, `started` from p6_step_started and
 * `interrupted` = started - iterations. undefined for every run without a knee plan.
 */
export async function intentCountersFor(
  ctx: LoadContext,
  summary: unknown,
): Promise<IntentCounters | undefined> {
  const main = ctx.k6.find((k) => k.label === "main") ?? ctx.k6[0];
  if (!main || !ctx.caseDef.runs(ctx).some((r) => r.label === "main" && (r.knee || r.spike)))
    return undefined;
  const started = summaryCounter(summary, "p6_step_started") ?? 0;
  const iterations = summaryCounter(summary, "iterations") ?? 0;
  const log = parseIntentLog(readFileSync(main.stdoutPath, "utf8"), started);
  return { started, interrupted: Math.max(0, started - iterations), log };
}

/** Builds the audit stage. Writes audit.json (numbers, ids and check names only) after a token scan. */
export function makeReconcileStage(deps: ReconcileDeps = defaultDeps): Stage {
  return async (ctx: LoadContext): Promise<StageResult> => {
    const cfg = ctx.config.audit as AuditStageConfig | undefined;
    if (cfg === undefined)
      return { ok: true, reasons: [], data: { skipped: "case has no product audit (stub)" } };
    const main = ctx.k6.find((k) => k.label === "main") ?? ctx.k6[0];
    const summary = main ? JSON.parse(readFileSync(main.summaryPath, "utf8")) : undefined;
    const clientCount = summary ? summaryCounter(summary, CLIENT_COUNTER[cfg.product]) : undefined;
    const pool = deps.openPool(cfg.product);
    let result: AuditResult;
    try {
      // The case's declared known bugs travel with the Documenso audit config (LoadCase.knownBugs).
      const audited =
        cfg.product === "documenso" ? { ...cfg, knownBugs: ctx.caseDef.knownBugs } : cfg;
      const intents = await intentCountersFor(ctx, summary);
      const cancelsOk = summary ? summaryCounter(summary, "p6_cancels_ok") : undefined;
      const counts = cfg.product === "twenty" ? twentyCounts(summary, clientCount) : undefined;
      result = await deps.reconcile(audited, pool, { clientCount, intents, cancelsOk, counts });
    } finally {
      await closePool(pool);
    }
    const file = path.join(ctx.outDir, "audit.json");
    const text = JSON.stringify(result, null, 2);
    if (findHits(text).length > 0) {
      rmSync(file, { force: true });
      return {
        ok: false,
        kind: "TEST BUG",
        reasons: ["audit.json matched a token pattern; not kept"],
      };
    }
    writeFileSync(file, `${text}\n`);
    const mapped = auditToStageResult(result);
    return {
      ...mapped,
      data: {
        ...mapped.data,
        audit: "audit.json",
        rowsSeen: result.rowsSeen,
        knownBugs: result.knownBugs,
        unexpected: result.unexpected,
        pending: result.pending,
      },
    };
  };
}

/** The case's reconcile stage (plan task 6 §6.6). */
export const reconcileStage: Stage = makeReconcileStage();
