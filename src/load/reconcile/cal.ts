import type pg from "pg";
import { caseLiveBookings, readOverlapPairs } from "../../cal/oracle.ts";
import { selectRows } from "../../oracles/pg.ts";
import { auditByIntent } from "../knee/intents.ts";
import { CAL_INTENT_ROWS_SQL, calRowsByIntent } from "../knee/cal-intents.ts";
import type { AuditResult, AuditStageConfig, IntentCounters } from "./types.ts";
import { addFinding } from "./types.ts";

/** Counts from the database after the run, scoped to the run's prefix. Pure input; the reads are added with the Cal product case (Task 7). */
export interface CalSnapshot {
  liveBookings: number;
  nonAccepted: number;
  overlapPairs: number;
  clientAccepted?: number;
  /** Knee runs (plan task 2 §6.4b): the per-intent audit replaces the client count check when present. */
  intents?: { counters: IntentCounters; rowsByIntent: Map<number, number>; ghostRows: number };
}

/** Pure. Checks in order: rows, accepted-only, client-matches-db (or per-intent), no-overlap (a known bug, counted). */
export function evaluateCalAudit(s: CalSnapshot, prefixLike: string): AuditResult {
  const result: AuditResult = {
    schema: 1,
    product: "cal",
    prefixLike,
    rowsSeen: s.liveBookings,
    checks: [],
    violations: [],
    knownBugs: {},
    unexpected: [],
    pending: [],
    leak: [],
  };
  const check = (name: string, ok: boolean, detail: string) =>
    result.checks.push({ name, ok, detail });

  check("rows", s.liveBookings >= 1, `${s.liveBookings} live booking(s)`);
  if (s.liveBookings < 1) {
    addFinding(result, {
      kind: "TEST BUG",
      text: `audit saw no bookings (scope LIKE ${prefixLike})`,
    });
  }

  check("accepted-only", s.nonAccepted === 0, `${s.nonAccepted} not accepted`);
  if (s.nonAccepted > 0) {
    addFinding(result, {
      kind: "PRODUCT BUG",
      text: `${s.nonAccepted} bookings of the run are pending or in another live state`,
    });
  }

  if (s.intents) {
    const { counters, rowsByIntent, ghostRows } = s.intents;
    const audit = auditByIntent({
      started: counters.started,
      log: counters.log,
      rowsByIntent,
      ghostRows,
      interrupted: counters.interrupted,
    });
    check(
      "per-intent",
      audit.findings.length === 0,
      `${audit.counts.ok} ok, ${audit.counts.fail} fail, ${audit.counts.indeterminate} indeterminate, ${audit.counts.ghostRows} ghost row(s), ${audit.counts.duplicateRows} duplicate row(s)`,
    );
    for (const f of audit.findings) {
      addFinding(result, { kind: f.kind, text: f.text, knownBugId: f.knownBugId });
    }
  } else if (s.clientAccepted !== undefined) {
    check(
      "client-matches-db",
      s.liveBookings === s.clientAccepted,
      `client ${s.clientAccepted}, database ${s.liveBookings}`,
    );
    if (s.liveBookings !== s.clientAccepted) {
      addFinding(result, {
        kind: "PRODUCT BUG",
        text: `client was told ACCEPTED for ${s.clientAccepted} bookings, the database holds ${s.liveBookings}`,
      });
    }
  }

  check(
    "no-overlap",
    s.overlapPairs === 0,
    s.overlapPairs === 0
      ? "0 overlapping accepted pairs"
      : `${s.overlapPairs} overlapping accepted pairs (P6-OBS-CAL-002)`,
  );
  if (s.overlapPairs > 0) {
    addFinding(
      result,
      { kind: "PRODUCT BUG", text: "overlapping accepted pairs", knownBugId: "P6-OBS-CAL-002" },
      s.overlapPairs,
    );
  }
  return result;
}

/** Reads the run's bookings and overlap pairs from the database (scope: the case prefix; the user is the case host). */
export async function readCalSnapshot(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "cal" }>,
  clientAccepted?: number,
): Promise<CalSnapshot> {
  const live = await caseLiveBookings(pool, cfg.prefixLike);
  const pairs = await readOverlapPairs(pool, cfg.userId, cfg.prefixLike);
  return {
    liveBookings: live.length,
    nonAccepted: live.filter((r) => r.status !== "accepted").length,
    overlapPairs: pairs.length,
    clientAccepted,
  };
}

/** Reads, then evaluates. Knee runs pass the intent counters: the audit then reconciles per intent (plan task 2 §6.4b). */
export async function reconcileCal(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "cal" }>,
  clientAccepted?: number,
  intents?: IntentCounters,
): Promise<AuditResult> {
  const snapshot = await readCalSnapshot(pool, cfg, clientAccepted);
  if (intents) {
    if (cfg.prefix === undefined)
      throw new Error("TEST BUG: cal audit config has no prefix for the per-intent audit");
    const rows = await selectRows<{ id: number; email: string }>(pool, CAL_INTENT_ROWS_SQL, [
      cfg.prefixLike,
    ]);
    snapshot.intents = { counters: intents, ...calRowsByIntent(rows, cfg.prefix) };
  }
  return evaluateCalAudit(snapshot, cfg.prefixLike);
}
