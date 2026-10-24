import { readFileSync } from "node:fs";
import { readOversellSnapshot, type OversellOracleSnapshot } from "../medusa/oracle.ts";
import { closePool, createReadOnlyPool } from "../oracles/pg.ts";
import { parseK6Summary } from "./summary.ts";
import type { LoadContext, StageResult } from "./types.ts";

export interface ConservationCounters {
  iterations: number;
  orders: number;
  refusedClean: number;
  refusedGhost: number;
  refusedOther: number;
  failedOther: number; // iterations that ended on a failed step that is not a refusal (p6_iter_failed)
  dropped: number;
  status5xx: number;
}

export interface ConservationInput {
  counters: ConservationCounters;
  snapshot: OversellOracleSnapshot;
  stock: number;
}

export interface ConservationFinding {
  check: string;
  ok: boolean;
  kind?: "PRODUCT BUG" | "TEST BUG";
  detail: string;
}

/**
 * Pure. Checks in order (plan task 8 §6.3). Every detail line is numbers only. A ghost order (F-M2) is counted under
 * knownBugs["F-M2"] and is not a violation of its own; a database order above S is still an oversell.
 */
export function judgeConservation(i: ConservationInput): {
  findings: ConservationFinding[];
  knownBugs: Record<string, number>;
} {
  const { counters: c, snapshot: s, stock } = i;
  const findings: ConservationFinding[] = [];
  const knownBugs: Record<string, number> = {};
  const add = (f: ConservationFinding) => findings.push(f);

  const accounted = c.orders + c.refusedClean + c.refusedGhost + c.refusedOther + c.failedOther;
  add({
    check: "iterations-accounted",
    ok: accounted === c.iterations,
    kind: accounted === c.iterations ? undefined : "TEST BUG",
    detail: `terminal outcomes ${accounted} of ${c.iterations} iterations`,
  });

  const exhausted = c.iterations > stock && s.orderCount >= stock;
  add({
    check: "stock-exhausted",
    ok: exhausted,
    kind: exhausted ? undefined : "TEST BUG",
    detail: `stock never ran out: orders ${s.orderCount} of S ${stock}, iterations ${c.iterations}`,
  });

  const oversold = s.orderCount > stock || s.orderQty > stock;
  add({
    check: "orders-le-stock",
    ok: !oversold,
    kind: oversold ? "PRODUCT BUG" : undefined,
    detail: `oversold: ${s.orderCount} orders and ${s.orderQty} units for stock S ${stock}`,
  });

  const reservationsMatch = s.reservationQty === s.orderQty && s.reserved === s.reservationQty;
  add({
    check: "reservations-match",
    ok: reservationsMatch,
    kind: reservationsMatch ? undefined : "PRODUCT BUG",
    detail: `units ${s.orderQty}, reservation rows ${s.reservationQty}, reserved ${s.reserved}`,
  });

  const delta = s.orderCount - c.orders;
  if (delta > 0) knownBugs["F-M2"] = (knownBugs["F-M2"] ?? 0) + delta;
  add({
    check: "client-matches-db",
    ok: delta >= 0,
    kind: delta >= 0 ? undefined : "PRODUCT BUG",
    detail: `client saw ${c.orders} orders, database has ${s.orderCount}`,
  });

  if (c.refusedGhost > 0) knownBugs["F-M2"] = (knownBugs["F-M2"] ?? 0) + c.refusedGhost;
  const clean = c.refusedOther === 0 && c.failedOther === 0 && c.status5xx === 0;
  add({
    check: "clean-refusals-only",
    ok: clean,
    kind: clean ? undefined : "PRODUCT BUG",
    detail: `unclassified refusals ${c.refusedOther}, failed iterations ${c.failedOther}, 5xx responses ${c.status5xx}`,
  });

  add({
    check: "no-drops",
    ok: c.dropped === 0,
    detail: `dropped iterations ${c.dropped} (a drop makes the run INVALID in Task 4, not a finding here)`,
  });

  return { findings, knownBugs };
}

/** Reads the custom counters of the main run from its k6 summary export. A missing counter is 0. */
export function conservationCounters(summary: unknown): ConservationCounters {
  const metrics =
    (summary as { metrics?: Record<string, { values?: { count?: number } }> }).metrics ?? {};
  const count = (name: string): number => {
    const value = metrics[name]?.values?.count;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const parsed = parseK6Summary(summary);
  return {
    iterations: parsed.iterations,
    orders: count("p6_orders"),
    refusedClean: count("p6_refused_clean"),
    refusedGhost: count("p6_refused_ghost"),
    refusedOther: count("p6_refused_other"),
    failedOther: count("p6_iter_failed"),
    dropped: parsed.dropped,
    status5xx: count("p6_status_5xx"),
  };
}

/** The case's conservation stage: reads the counters and the database, then judges. Findings are one line each. */
export const conservationStage = async (ctx: LoadContext): Promise<StageResult> => {
  const main = ctx.k6.find((k) => k.label === "main");
  const audit = ctx.config.audit as Record<string, unknown> | undefined;
  if (!main || !audit)
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["conservation: no main run or no audit config"],
    };
  const counters = conservationCounters(JSON.parse(readFileSync(main.summaryPath, "utf8")));
  const pool = createReadOnlyPool();
  try {
    const snapshot = await readOversellSnapshot(
      pool,
      String(audit.variantId),
      String(audit.inventoryItemId),
      String(audit.locationId),
    );
    const stock = Number(audit.stock);
    const { findings, knownBugs } = judgeConservation({ counters, snapshot, stock });
    const failed = findings.filter((f) => !f.ok);
    const kind = failed.some((f) => f.kind === "PRODUCT BUG")
      ? "PRODUCT BUG"
      : failed.length > 0
        ? "TEST BUG"
        : undefined;
    return {
      ok: failed.length === 0,
      kind: kind as StageResult["kind"],
      reasons: failed.map((f) => `${f.check}: ${f.detail}`),
      data: { findings: findings.map((f) => `${f.check}: ${f.ok ? "ok" : "fail"}`), knownBugs },
    };
  } finally {
    await closePool(pool);
  }
};
