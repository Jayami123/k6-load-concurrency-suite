import type pg from "pg";
import { selectRows } from "../../oracles/pg.ts";
import { judgeStorm } from "../retry-validity.ts";
import type { RetryCounters, RetryFinding, RetryJudgement } from "../retry-validity.ts";

/** Accepted bookings per intent (the intent is the attendee email, which carries the iteration id). Read-only. */
export const CAL_ACCEPTED_PER_INTENT_SQL = `SELECT a.email AS intent, count(DISTINCT b.id)::int AS n
FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id WHERE a.email LIKE $1 AND b.status = 'accepted' GROUP BY a.email`;

/** The private links of the event type that belong to the case. Read-only. */
export const CAL_LINKS_SQL = `SELECT link, "usageCount"::int AS "usageCount", "maxUsageCount"::int AS "maxUsageCount" FROM "HashedLink" WHERE "eventTypeId" = $1 AND link LIKE $2`;

export interface LinkRow {
  link: string;
  usageCount: number;
  maxUsageCount: number;
}

export interface CalRetryInput {
  intents: number;
  acceptedPerIntent: Record<string, number>;
  linkRows?: LinkRow[];
  counters: RetryCounters;
}

const CAL_KNOWN_REDACTED = "P6-OBS-CAL-001";

/**
 * Pure. Storm first, then one accepted booking per intent, the redacted 400 and 409 counted, no 5xx, and (when the case
 * uses private links, -009) every link used at most once and the link usage equal to the accepted bookings.
 */
export function judgeCalRetries(i: CalRetryInput): RetryJudgement {
  const findings: RetryFinding[] = [];
  const knownBugs: Record<string, number> = {};
  const c = i.counters;

  const storm = judgeStorm({
    intents: c.intents,
    firstTimeouts: c.firstTimeouts,
    retries: c.attempts - c.intents,
  });
  findings.push({ check: "storm", ok: storm.ok, kind: storm.kind, detail: storm.detail });

  const counts = Object.values(i.acceptedPerIntent);
  const duplicates = counts.filter((n) => n > 1).length;
  findings.push({
    check: "one-booking-per-intent",
    ok: duplicates === 0,
    kind: duplicates > 0 ? "PRODUCT BUG" : undefined,
    detail: `${duplicates} intent(s) with more than one accepted booking`,
  });

  const missing = i.intents - counts.length;
  if (c.intentsOk > counts.length) {
    findings.push({
      check: "accepted-missing",
      ok: false,
      kind: "PRODUCT BUG",
      detail: `${c.intentsOk} intent(s) got a 200 but ${counts.length} accepted booking(s) exist`,
    });
  } else if (missing > 0) {
    findings.push({
      check: "accepted-missing",
      ok: false,
      kind: "TEST BUG",
      detail: `${missing} intent(s) never reached the server`,
    });
  } else {
    findings.push({ check: "accepted-missing", ok: true, detail: "every intent booked" });
  }

  findings.push({
    check: "no-5xx",
    ok: c.retry5xx === 0,
    kind: c.retry5xx > 0 ? "PRODUCT BUG" : undefined,
    detail: `${c.retry5xx} attempt(s) answered 5xx`,
  });

  if (c.retryRedacted400 > 0) knownBugs[CAL_KNOWN_REDACTED] = c.retryRedacted400;
  findings.push({
    check: "redacted-400",
    ok: true,
    detail: `${c.retryRedacted400} redacted 400 answer(s), counted under ${CAL_KNOWN_REDACTED}`,
  });
  findings.push({
    check: "conflict-409",
    ok: true,
    detail: `${c.retryConflict} 409 answer(s), counted`,
  });

  if (i.linkRows !== undefined) {
    const over = i.linkRows.filter((r) => r.usageCount > 1 || r.usageCount > r.maxUsageCount);
    findings.push({
      check: "link-cap",
      ok: over.length === 0,
      kind: over.length > 0 ? "PRODUCT BUG" : undefined,
      detail:
        over.length === 0
          ? "every link used at most once"
          : `SUSPECTED; related to F-C1, different mechanism: ${over.length} link(s) used above the cap of 1`,
    });
    const usage = i.linkRows.reduce((sum, r) => sum + r.usageCount, 0);
    const accepted = counts.reduce((sum, n) => sum + n, 0);
    findings.push({
      check: "link-usage",
      ok: usage === accepted,
      kind: usage === accepted ? undefined : "PRODUCT BUG",
      detail: `link usage ${usage}, accepted bookings ${accepted}`,
    });
  }

  return { findings, knownBugs };
}

/** Reads the accepted bookings per intent and, when a link prefix is given, the case's links. Read-only. */
export async function readCalRetryAudit(
  pool: pg.Pool,
  cfg: { prefixLike: string; eventTypeId: number; linkLike?: string },
): Promise<Pick<CalRetryInput, "acceptedPerIntent" | "linkRows">> {
  const rows = await selectRows<{ intent: string; n: number }>(pool, CAL_ACCEPTED_PER_INTENT_SQL, [
    cfg.prefixLike,
  ]);
  const acceptedPerIntent: Record<string, number> = {};
  for (const r of rows) acceptedPerIntent[r.intent] = r.n;
  if (cfg.linkLike === undefined) return { acceptedPerIntent };
  const linkRows = await selectRows<LinkRow>(pool, CAL_LINKS_SQL, [cfg.eventTypeId, cfg.linkLike]);
  return { acceptedPerIntent, linkRows };
}

/** Every booking of one intent's attendee email, whatever its status (cancelled and rejected rows are evidence too). Read-only. */
export const CAL_BOOKINGS_BY_EMAIL_SQL = `SELECT a.email AS email, b.id::int AS id, b.uid AS uid, b.status::text AS status
FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b.id WHERE a.email LIKE $1 ORDER BY b.id`;

/** The usage count of every link of the case now (read after the run). Read-only. */
export const CAL_LINK_USAGE_SQL = `SELECT link, "usageCount"::int AS "usageCount" FROM "HashedLink" WHERE "eventTypeId" = $1 AND link LIKE $2`;

export interface JoinBooking {
  id: number;
  uid: string;
  status: string;
  email: string;
}

/** One intent: attendee e-mail `i<n>`, the link booked with (`links[n]`), and the link's usage before and after the run. */
export interface JoinIntent {
  n: number;
  email: string;
  link: string;
  usageBefore: number;
  usageAfter: number;
  bookings: JoinBooking[];
}

export interface JoinRow {
  n: number;
  link: string;
  usageBefore: number;
  usageAfter: number;
  usedBy: number; // usage delta: link uses this run
  bookings: Array<{ id: number; uid: string; status: string }>;
  flag: "ok" | "no-link-use" | "link-used-twice" | "no-booking";
}

export interface CalLinkJoin {
  rows: JoinRow[];
  findings: RetryFinding[];
}

/**
 * Pure. Joins each intent's bookings to its link's usage. An accepted booking whose link shows no use is a booking accepted
 * without a link (PRODUCT BUG, SUSPECTED); a link with two uses in one run is a link used twice (F-C1 surface, SUSPECTED).
 * The rows hold ids, uids, statuses and counts only.
 */
export function judgeCalLinkJoin(intents: JoinIntent[]): CalLinkJoin {
  const rows: JoinRow[] = intents.map((it) => {
    const usedBy = it.usageAfter - it.usageBefore;
    const accepted = it.bookings.filter((b) => b.status === "accepted").length;
    let flag: JoinRow["flag"] = "ok";
    if (it.bookings.length === 0) flag = "no-booking";
    else if (usedBy > 1) flag = "link-used-twice";
    else if (accepted > 0 && usedBy === 0) flag = "no-link-use";
    return {
      n: it.n,
      link: it.link,
      usageBefore: it.usageBefore,
      usageAfter: it.usageAfter,
      usedBy,
      bookings: it.bookings.map((b) => ({ id: b.id, uid: b.uid, status: b.status })),
      flag,
    };
  });
  const count = (f: JoinRow["flag"]) => rows.filter((r) => r.flag === f).length;
  const noUse = count("no-link-use");
  const twice = count("link-used-twice");
  const none = count("no-booking");
  const findings: RetryFinding[] = [
    {
      check: "link-join-no-link-use",
      ok: noUse === 0,
      kind: noUse > 0 ? "PRODUCT BUG" : undefined,
      detail: `SUSPECTED: ${noUse} accepted booking(s) whose link shows no use (rows: ${
        rows
          .filter((r) => r.flag === "no-link-use")
          .map((r) => r.n)
          .join(", ") || "none"
      })`,
    },
    {
      check: "link-join-used-twice",
      ok: twice === 0,
      kind: twice > 0 ? "PRODUCT BUG" : undefined,
      detail: `SUSPECTED; related to F-C1: ${twice} link(s) used twice in one run`,
    },
    {
      check: "link-join-no-booking",
      ok: none === 0,
      kind: none > 0 ? "TEST BUG" : undefined,
      detail: `${none} intent(s) with no booking row`,
    },
  ];
  return { rows, findings };
}

/** Reads the bookings and the usage after the run for the intents of a case. Read-only. */
export async function readCalLinkJoin(
  pool: pg.Pool,
  cfg: { prefixLike: string; eventTypeId: number; linkLike: string },
  intents: Array<{ n: number; email: string; link: string; usageBefore: number }>,
): Promise<JoinIntent[]> {
  const bookings = await selectRows<{ email: string; id: number; uid: string; status: string }>(
    pool,
    CAL_BOOKINGS_BY_EMAIL_SQL,
    [cfg.prefixLike],
  );
  const usage = await selectRows<{ link: string; usageCount: number }>(pool, CAL_LINK_USAGE_SQL, [
    cfg.eventTypeId,
    cfg.linkLike,
  ]);
  const usageOf = new Map(usage.map((u) => [u.link, u.usageCount]));
  return intents.map((it) => ({
    ...it,
    usageAfter: usageOf.get(it.link) ?? 0,
    bookings: bookings.filter((b) => b.email === it.email),
  }));
}
