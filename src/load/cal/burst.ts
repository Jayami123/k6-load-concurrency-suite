// The burst classifier of P6-CAL-LOAD-002 (plan Phase 4b task 8 §6.2). Pure: the reads come from the caller.

export type BurstBodyKind = "accepted" | "slot-taken" | "redacted-400" | "conflict-409" | "other";

export interface BurstAttempt {
  intent: string; // "<prefix>-i<n> burst" (run prefix, the intent line of the audit)
  status: number | null; // HTTP status, null on a transport error
  bodyKind: BurstBodyKind;
}

export interface BurstVerdict {
  accepted: number; // ACCEPTED rows on S in the database (SLOT_ACCEPTED_SQL), not the client count
  attempts: number;
  histogram: Record<BurstBodyKind, number>;
  verdict: "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
  knownBugs: { "P6-OBS-CAL-001": number; "P6-OBS-CAL-003": number }; // counted, never a verdict input
}

/** The largest allowed spread of the attempts' request starts, in ms (plan §6.2: one burst is 100 ms). */
export const BURST_SPREAD_MAX_MS = 100;

const KINDS: BurstBodyKind[] = ["accepted", "slot-taken", "redacted-400", "conflict-409", "other"];

/**
 * Completeness is checked first: INVALID when attempts differ from expectedAttempts, when a dropped iteration was seen, or when the
 * request-start spread exceeds 100 ms. Then TEST BUG (the slot was not free at setup, or no attempt won), then the contention rules:
 * a 5xx or two or more ACCEPTED on S is a FAIL (PRODUCT BUG, SUSPECTED until repeated, rule 13); exactly one ACCEPTED is a PASS.
 */
export function classifyBurst(input: {
  targetSlot: string;
  accepted: number;
  attempts: BurstAttempt[];
  expectedAttempts: number;
  droppedIterations: number;
  requestStartMs: number[];
  slotFreeAtSetup: boolean;
  fiveXx: number;
  p2002Count?: number; // P6-OBS-CAL-003 lines in the web log for this burst (counted, not a verdict input)
}): BurstVerdict {
  const histogram = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<BurstBodyKind, number>;
  for (const a of input.attempts) histogram[a.bodyKind] += 1;
  const knownBugs = {
    "P6-OBS-CAL-001": histogram["redacted-400"],
    "P6-OBS-CAL-003": input.p2002Count ?? 0,
  };
  const result = (verdict: BurstVerdict["verdict"], reasons: string[]): BurstVerdict => ({
    accepted: input.accepted,
    attempts: input.attempts.length,
    histogram,
    verdict,
    reasons,
    knownBugs,
  });

  const spread =
    input.requestStartMs.length > 0
      ? Math.max(...input.requestStartMs) - Math.min(...input.requestStartMs)
      : 0;
  const incomplete: string[] = [];
  if (input.attempts.length !== input.expectedAttempts)
    incomplete.push(`${input.attempts.length} attempts, expected ${input.expectedAttempts}`);
  if (input.droppedIterations > 0)
    incomplete.push(`${input.droppedIterations} dropped iteration(s)`);
  if (spread > BURST_SPREAD_MAX_MS)
    incomplete.push(`request-start spread ${spread} ms exceeds ${BURST_SPREAD_MAX_MS} ms`);
  if (incomplete.length > 0) return result("INVALID", incomplete);

  if (!input.slotFreeAtSetup)
    return result("TEST BUG", [`target ${input.targetSlot} was not free at setup`]);
  if (input.accepted === 0)
    return result("TEST BUG", ["no ACCEPTED on the target: the burst did not run its attempt"]);

  const failures: string[] = [];
  if (input.accepted >= 2) failures.push(`${input.accepted} ACCEPTED on ${input.targetSlot}`);
  if (input.fiveXx > 0) failures.push(`${input.fiveXx} HTTP 5xx in the burst`);
  if (failures.length > 0) return result("FAIL (PRODUCT BUG)", failures);
  return result("PASS", [`exactly one ACCEPTED on ${input.targetSlot}`]);
}
