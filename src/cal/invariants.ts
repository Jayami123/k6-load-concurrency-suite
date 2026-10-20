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

export function checkIdenticalSlotInvariants(input: {
  n: number;
  responses: ParsedResponse[];
  accepted: AcceptedRow[];
  dispatchSpreadMs: number;
  spreadLimit: number;
}): string[] {
  const out: string[] = [];
  const { responses, accepted } = input;

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
  if (accepted.length === 0) {
    out.push("PRODUCT BUG: no ACCEPTED booking for a free slot");
  }

  const winners = responses.filter(isWinner);
  if (winners.length !== 1) {
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

/** Everything except the overlap itself (plan D7). Empty = setup and HTTP contract held. */
export function checkOverlapPairGuards(input: {
  responses: ParsedResponse[];
  windowAccepted: SlotRow[];
  dispatchSpreadMs: number;
  spreadLimit: number;
  expectedResponses?: number; // default 2
}): string[] {
  const out: string[] = [];
  const n = input.expectedResponses ?? 2;
  if (input.responses.length !== n) {
    out.push(`TEST BUG: expected ${n} responses, got ${input.responses.length}`);
  }
  for (const r of input.responses) {
    if (r.status === null || r.status >= 500) {
      out.push(`PRODUCT BUG: HTTP ${r.status ?? "error"} ${r.summary}`);
    } else if (r.status === 429) {
      out.push("ENV: HTTP 429 rate limited (UNKEY_ROOT_KEY set?)");
    } else if (!isWinner(r)) {
      const kind = classifyLoser(r.status, r.message);
      if (kind === "db-unique-redacted") {
        out.push(
          `TEST BUG: idempotency key collided in an overlap pair (identical windows?) ${r.summary}`,
        );
      } else if (kind === "unexpected") {
        out.push(`TEST BUG: unexpected loser ${r.summary}`);
      }
    }
  }
  const winners = input.responses.filter(isWinner);
  if (winners.length === 0) out.push("PRODUCT BUG: no booking accepted for a free window");
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
