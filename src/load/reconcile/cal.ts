import type pg from "pg";
import { caseLiveBookings, readOverlapPairs } from "../../cal/oracle.ts";
import type { AuditResult, AuditStageConfig } from "./types.ts";
import { addFinding } from "./types.ts";

/** Counts from the database after the run, scoped to the run's prefix. Pure input; the reads are added with the Cal product case (Task 7). */
export interface CalSnapshot {
  liveBookings: number;
  nonAccepted: number;
  overlapPairs: number;
  clientAccepted?: number;
}

/** Pure. Checks in order: rows, accepted-only, client-matches-db, no-overlap (a known bug, counted). */
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

  if (s.clientAccepted !== undefined) {
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

/** Reads, then evaluates. */
export async function reconcileCal(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "cal" }>,
  clientAccepted?: number,
): Promise<AuditResult> {
  return evaluateCalAudit(await readCalSnapshot(pool, cfg, clientAccepted), cfg.prefixLike);
}
