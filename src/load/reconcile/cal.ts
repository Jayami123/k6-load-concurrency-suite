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

/**
 * Recycle mode: two bookings of one user whose slots overlap and whose lifetimes overlap (created to cancelled, or to infinity while
 * live) are a double acceptance. A cancelled booking is no longer `accepted`, so OVERLAP_PAIRS_SQL cannot see it; the lifetime does.
 */
export const RECYCLE_OVERLAP_SQL = `
SELECT a.id AS "aId", b.id AS "bId"
FROM "Booking" a
JOIN "Booking" b ON b."userId" = a."userId" AND a.id < b.id
  AND a."startTime" < b."endTime" AND b."startTime" < a."endTime"
  AND a."createdAt" < CASE WHEN b.status = 'cancelled' THEN b."updatedAt" ELSE 'infinity'::timestamp END
  AND b."createdAt" < CASE WHEN a.status = 'cancelled' THEN a."updatedAt" ELSE 'infinity'::timestamp END
WHERE a."userId" = $1 AND a.status IN ('accepted', 'cancelled') AND b.status IN ('accepted', 'cancelled')
  AND EXISTS (SELECT 1 FROM "Attendee" x WHERE x."bookingId" = a.id AND x.email LIKE $2)
  AND EXISTS (SELECT 1 FROM "Attendee" y WHERE y."bookingId" = b.id AND y.email LIKE $2)
ORDER BY a.id, b.id
`;

/** Bookings of the run in status cancelled (recycle mode): each one is an iteration whose cancel the database kept. */
export const CAL_CANCELLED_BOOKINGS_SQL = `SELECT count(DISTINCT b.id)::int AS n FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id WHERE a.email LIKE $1 AND b.status = 'cancelled'`;

export interface CalRecycleSnapshot {
  cancelled: number; // bookings of the run in status cancelled
  live: number; // bookings of the run in status accepted or pending
  overlapPairs: number; // pairs by lifetime, from RECYCLE_OVERLAP_SQL
  clientAccepted?: number;
  cancelsOk?: number; // k6 p6_cancels_ok: cancels the client saw succeed
}

/**
 * Pure, recycle mode (plan Phase 4b task 7 §6.3). Each ACCEPTED booking the client saw is one cancelled row, every cancel the client
 * saw succeed is that booking's cancel, and no booking of the run stays live.
 */
export function evaluateCalRecycleAudit(s: CalRecycleSnapshot, prefixLike: string): AuditResult {
  const result: AuditResult = {
    schema: 1,
    product: "cal",
    prefixLike,
    rowsSeen: s.cancelled + s.live,
    checks: [],
    violations: [],
    knownBugs: {},
    unexpected: [],
    pending: [],
    leak: [],
  };
  const check = (name: string, ok: boolean, detail: string) =>
    result.checks.push({ name, ok, detail });

  check("rows", s.cancelled + s.live >= 1, `${s.cancelled} cancelled, ${s.live} live booking(s)`);
  if (s.cancelled + s.live < 1) {
    addFinding(result, {
      kind: "TEST BUG",
      text: `audit saw no bookings (scope LIKE ${prefixLike})`,
    });
  }

  check("no-live", s.live === 0, `${s.live} live booking(s) after the run`);
  if (s.live > 0) {
    addFinding(result, {
      kind: "PRODUCT BUG",
      text: `${s.live} booking(s) of the run are still live after their cancel`,
    });
  }

  if (s.clientAccepted !== undefined) {
    check(
      "cancelled-matches-client",
      s.cancelled === s.clientAccepted,
      `client ${s.clientAccepted} accepted, database ${s.cancelled} cancelled`,
    );
    if (s.cancelled !== s.clientAccepted) {
      addFinding(result, {
        kind: "PRODUCT BUG",
        text: `client was told ACCEPTED for ${s.clientAccepted} bookings, the database holds ${s.cancelled} cancelled`,
      });
    }
  }
  if (s.cancelsOk !== undefined && s.clientAccepted !== undefined) {
    check(
      "cancels-acked",
      s.cancelsOk === s.clientAccepted,
      `${s.cancelsOk} cancels acknowledged for ${s.clientAccepted} accepted bookings`,
    );
    if (s.cancelsOk !== s.clientAccepted) {
      addFinding(result, {
        kind: "PRODUCT BUG",
        text: `the client saw ${s.cancelsOk} cancels succeed for ${s.clientAccepted} accepted bookings`,
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

/** Reads the recycle counts of the run: cancelled and live bookings, and the overlap pairs (scope: the case prefix). */
export async function readCalRecycleSnapshot(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "cal" }>,
  clientAccepted?: number,
  cancelsOk?: number,
): Promise<CalRecycleSnapshot> {
  const [row] = await selectRows<{ n: number }>(pool, CAL_CANCELLED_BOOKINGS_SQL, [cfg.prefixLike]);
  const live = await caseLiveBookings(pool, cfg.prefixLike);
  const pairs = await selectRows(pool, RECYCLE_OVERLAP_SQL, [cfg.userId, cfg.prefixLike]);
  return {
    cancelled: row?.n ?? 0,
    live: live.length,
    overlapPairs: pairs.length,
    clientAccepted,
    cancelsOk,
  };
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
  cancelsOk?: number,
): Promise<AuditResult> {
  if (cfg.recycle === true)
    return evaluateCalRecycleAudit(
      await readCalRecycleSnapshot(pool, cfg, clientAccepted, cancelsOk),
      cfg.prefixLike,
    );
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
