/** Redeem the before token this long before its expiry, and the after token this long after it (P6-TW-LOAD-011). */
export const BOUNDARY_OFFSET_MS = 15_000;

/** The gate: an expiry above this many milliseconds (15 min of real time) closes P6-TW-LOAD-011 (plan §gate). */
export const GATE_MAX_EXPIRY_MS = 900_000;

export type BoundaryVerdict = "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";

/**
 * Pure. before = the token redeemed BOUNDARY_OFFSET_MS before its expiry; after = the token redeemed BOUNDARY_OFFSET_MS after.
 * A token accepted after expiry is a product bug whatever happened before it. One accepted before and refused after is PASS.
 * Nothing accepted is INCONCLUSIVE: there is no evidence either way.
 */
export function expiryBoundaryVerdict(
  before: { successes: number },
  after: { successes: number },
): BoundaryVerdict {
  if (after.successes >= 1 || before.successes > 1) return "PRODUCT_BUG_SUSPECTED";
  if (before.successes === 1) return "PASS";
  return "INCONCLUSIVE";
}

/** Pure. The two redemption instants of a token that expires at expiresAtMs. */
export function boundarySchedule(expiresAtMs: number): { beforeMs: number; afterMs: number } {
  return {
    beforeMs: expiresAtMs - BOUNDARY_OFFSET_MS,
    afterMs: expiresAtMs + BOUNDARY_OFFSET_MS,
  };
}

/** Pure. True when a token's lifetime (expiresAt minus createdAt) is at most the gate. */
export function expiryGateOpen(createdAtMs: number, expiresAtMs: number): boolean {
  return expiresAtMs - createdAtMs <= GATE_MAX_EXPIRY_MS;
}
