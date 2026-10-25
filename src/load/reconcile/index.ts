import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findHits } from "../../../scripts/evidence-token-scan.mjs";
import { calDatabaseUrlFromEnv, medusaDatabaseUrlFromEnv } from "../../races/env.ts";
import { documensoDatabaseUrlFromEnv } from "../../documenso/env.ts";
import { closePool, createReadOnlyPool } from "../../oracles/pg.ts";
import { reconcileCal } from "./cal.ts";
import { reconcileDocumenso } from "./documenso.ts";
import { reconcileMedusa } from "./medusa.ts";
import type { AuditResult, AuditStageConfig } from "./types.ts";
import type { LoadContext, Stage, StageResult } from "../types.ts";

/** Runs stages in order and merges their data. A not-ok stage does not stop the next one; the first failing kind is reported. */
export function composeStages(stages: Stage[]): Stage {
  return async (ctx) => {
    let ok = true;
    let kind: StageResult["kind"];
    const reasons: string[] = [];
    const data: Record<string, unknown> = {};
    for (const stage of stages) {
      const r = await stage(ctx);
      if (!r.ok && ok) kind = r.kind;
      ok = ok && r.ok;
      reasons.push(...r.reasons);
      Object.assign(data, r.data);
    }
    return { ok, kind: ok ? undefined : kind, reasons, data };
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
  counters: { clientCount?: number },
): Promise<AuditResult> {
  switch (cfg.product) {
    case "cal":
      return reconcileCal(pool, cfg, counters.clientCount);
    case "medusa":
      return reconcileMedusa(pool, cfg, counters.clientCount);
    case "documenso":
      return reconcileDocumenso(pool, cfg, counters.clientCount);
  }
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
          : medusaDatabaseUrlFromEnv(),
    ),
  reconcile,
};

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
      result = await deps.reconcile(audited, pool, { clientCount });
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
