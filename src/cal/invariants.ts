import { pairEvidence, rowEvidence, type OverlapPair, type SlotRow } from "./oracle.ts";

export const LOSER_SLOT_TAKEN = "no_available_users_found_error";
export const LOSER_BOOKING_CONFLICT = "booking_conflict_error";
export const LOSER_DB_REDACTED = "An error occurred while querying the database.";

export type LoserKind = "slot-taken" | "booking-conflict" | "db-unique-redacted" | "unexpected";

export function classifyLoser(status: number | null, message: string | null): LoserKind {
  if (status === 409 && message === LOSER_SLOT_TAKEN) return "slot-taken";
  if (status === 409 && message === LOSER_BOOKING_CONFLICT) return "booking-conflict";
  if (status === 400 && message === LOSER_DB_REDACTED) return "db-unique-redacted";
  return "unexpected";
}

export type ParsedResponse = {
  status: number | null;
  uid: string | null;
  bodyStatus: string | null;
  message: string | null;
  summary: string;
};

export type AcceptedRow = {
  id: number;
  uid: string;
  status: string;
  start: string;
  end: string;
  hasKey: boolean;
};

function isWinner(r: ParsedResponse): boolean {
  return r.status !== null && r.status >= 200 && r.status < 300;
}

/** Losers are the non-2xx responses that carry a status. */
export function loserKinds(responses: ParsedResponse[]): LoserKind[] {
  return responses
    .filter((r) => r.status !== null && !isWinner(r))
    .map((r) => classifyLoser(r.status, r.message));
}

/** A refusal on a window the host already had booked is a TEST BUG (setup), never a PRODUCT BUG. */
export function setupViolation(evidence: string): string {
  return `TEST BUG: setup violation: ${evidence}`;
}

export function checkIdenticalSlotInvariants(input: {
  n: number;
  responses: ParsedResponse[];
  accepted: AcceptedRow[];
  dispatchSpreadMs: number;
  spreadLimit: number;
  setupEvidence?: string; // overlapEvidence() of the host's bookings in the slot, read before firing
}): string[] {
  const out: string[] = [];
  const { responses, accepted } = input;
  const setup = input.setupEvidence ?? "";
  if (setup) out.push(setupViolation(setup));

  if (responses.length !== input.n) {
    out.push(`TEST BUG: expected ${input.n} responses, got ${responses.length}`);
  }

  for (const r of responses) {
    if (r.status === null || r.status >= 500) {
      out.push(`PRODUCT BUG: HTTP ${r.status ?? "error"} ${r.summary}`);
    } else if (r.status === 429) {
      out.push("ENV: HTTP 429 rate limited (UNKEY_ROOT_KEY set?)");
    } else if (!isWinner(r) && classifyLoser(r.status, r.message) === "unexpected") {
      out.push(`TEST BUG: unexpected loser ${r.summary}`);
    }
  }

  if (accepted.length > 1) {
    out.push(
      `PRODUCT BUG: ${accepted.length} ACCEPTED bookings for one slot: ${rowEvidence(accepted)}`,
    );
  }
  if (accepted.length === 0 && !setup) {
    out.push("PRODUCT BUG: no ACCEPTED booking for a free slot");
  }

  const winners = responses.filter(isWinner);
  if (winners.length !== 1 && !(setup && winners.length === 0)) {
    out.push(`PRODUCT BUG: ${winners.length} HTTP 2xx for one slot`);
  } else if (accepted.length > 0) {
    const winner = winners[0]!;
    if (winner.bodyStatus !== "ACCEPTED" || winner.uid !== accepted[0]!.uid) {
      out.push(`PRODUCT BUG: HTTP winner uid ${winner.uid} != DB ACCEPTED uid ${accepted[0]!.uid}`);
    }
  }

  if (accepted.length === 1 && !accepted[0]!.hasKey) {
    out.push("PRODUCT BUG: ACCEPTED row has no idempotencyKey");
  }

  if (input.dispatchSpreadMs >= input.spreadLimit) {
    out.push(`TEST BUG: dispatchSpreadMs ${input.dispatchSpreadMs} >= ${input.spreadLimit}`);
  }

  return out;
}

/** Losers whose kind is not a 409 conflict (the contract the loser-contract extra asserts). */
export function nonConflictLosers(responses: ParsedResponse[]): ParsedResponse[] {
  return responses.filter((r) => {
    if (isWinner(r)) return false;
    const kind = classifyLoser(r.status, r.message);
    return kind !== "slot-taken" && kind !== "booking-conflict";
  });
}

export type OverlapLoserKind =
  "slot-taken" | "booking-conflict" | "refused-db-error" | "unexpected";

/**
 * Overlap pair losers. Windows of a pair never share start and end, so the idempotency key cannot
 * collide; a redacted db 400 here is some other db error that refused the leg (plan D7, CI run
 * 39441132613). Its Prisma code is only in Cal's server log, which is why the traceId is kept.
 */
export function classifyOverlapLoser(
  status: number | null,
  message: string | null,
): OverlapLoserKind {
  const kind = classifyLoser(status, message);
  return kind === "db-unique-redacted" ? "refused-db-error" : kind;
}

/** Redacted db 400s of a pair with the traceId to grep in Cal's web log ("unknown" if absent). */
export function refusedLegs(responses: ParsedResponse[]): Array<{ traceId: string }> {
  return responses
    .filter((r) => !isWinner(r) && classifyOverlapLoser(r.status, r.message) === "refused-db-error")
    .map((r) => ({ traceId: /"traceId":"([^"]+)"/.exec(r.summary)?.[1] ?? "unknown" }));
}

/** Everything except the overlap itself (plan D7). Empty = setup and HTTP contract held. */
export function checkOverlapPairGuards(input: {
  responses: ParsedResponse[];
  windowAccepted: SlotRow[];
  dispatchSpreadMs: number;
  spreadLimit: number;
  expectedResponses?: number; // default 2
  setupEvidence?: string; // overlapEvidence() of the host's bookings in the window, read before firing
}): string[] {
  const out: string[] = [];
  const n = input.expectedResponses ?? 2;
  const setup = input.setupEvidence ?? "";
  if (setup) out.push(setupViolation(setup));
  if (input.responses.length !== n) {
    out.push(`TEST BUG: expected ${n} responses, got ${input.responses.length}`);
  }
  for (const r of input.responses) {
    if (r.status === null || r.status >= 500) {
      out.push(`PRODUCT BUG: HTTP ${r.status ?? "error"} ${r.summary}`);
    } else if (r.status === 429) {
      out.push("ENV: HTTP 429 rate limited (UNKEY_ROOT_KEY set?)");
    } else if (!isWinner(r)) {
      // A refused leg (redacted db 400) means no double booking in that trial; it is counted
      // and reported (refusedLegs), never a guard violation.
      if (classifyOverlapLoser(r.status, r.message) === "unexpected") {
        out.push(`TEST BUG: unexpected loser ${r.summary}`);
      }
    }
  }
  const winners = input.responses.filter(isWinner);
  if (winners.length === 0 && !setup)
    out.push("PRODUCT BUG: no booking accepted for a free window");
  const dbUids = new Set(input.windowAccepted.map((r) => r.uid));
  for (const w of winners) {
    if (w.bodyStatus !== "ACCEPTED" || !w.uid || !dbUids.has(w.uid)) {
      out.push(`PRODUCT BUG: HTTP winner uid ${w.uid} status ${w.bodyStatus} not an ACCEPTED row`);
    }
  }
  if (winners.length !== input.windowAccepted.length) {
    out.push(
      `PRODUCT BUG: HTTP 2xx ${winners.length} != DB accepted ${input.windowAccepted.length} in window`,
    );
  }
  if (input.dispatchSpreadMs >= input.spreadLimit) {
    out.push(`TEST BUG: dispatchSpreadMs ${input.dispatchSpreadMs} >= ${input.spreadLimit}`);
  }
  return out;
}

/**
 * Sequential overlap control (plan D14): Cal must accept the first booking and refuse the second
 * with exactly 409 no_available_users_found_error. A redacted db 400 is not a refusal here (it is
 * only an allowed refused leg in the race). The summary keeps the traceId.
 */
export function checkSequentialRefusal(responses: ParsedResponse[], setupEvidence = ""): string[] {
  // A host overlap in the window is reported once, by checkOverlapPairGuards as a setup violation.
  if (setupEvidence) return [];
  const [first, second] = responses;
  const out: string[] = [];
  if (!first || !isWinner(first) || first.bodyStatus !== "ACCEPTED") {
    out.push(`PRODUCT BUG: sequential first booking not accepted: ${first?.summary ?? "missing"}`);
  }
  if (!second || second.status !== 409 || classifyLoser(409, second.message) !== "slot-taken") {
    out.push(
      `PRODUCT BUG: sequential overlap not refused with 409: ${second?.summary ?? "missing"}`,
    );
  }
  return out;
}

/** [] or one PRODUCT BUG line with every pair attached (plan D6). */
export function overlapViolations(pairs: OverlapPair[]): string[] {
  if (pairs.length === 0) return [];
  return [`PRODUCT BUG: ${pairs.length} overlapping ACCEPTED pair(s): ${pairEvidence(pairs)}`];
}

/** D16: per-trial pair counts (index = trial - 1) → histogram oracle fields. */
export function doubleBookSummary(pairsByTrial: number[]): {
  trialsDoubleBooked: number;
  trialsClean: number;
  overlapPairsTotal: number;
  doubleBookedByTrial: string;
} {
  const trialsDoubleBooked = pairsByTrial.filter((n) => n > 0).length;
  return {
    trialsDoubleBooked,
    trialsClean: pairsByTrial.length - trialsDoubleBooked,
    overlapPairsTotal: pairsByTrial.reduce((a, b) => a + b, 0),
    doubleBookedByTrial: pairsByTrial.join(","),
  };
}
