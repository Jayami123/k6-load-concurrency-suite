/** Redeem the before token this long before its expiry, and the after token this long after it (P6-TW-LOAD-011). */
export const BOUNDARY_OFFSET_MS = 15_000;

/** The gate: an expiry above this many milliseconds (15 min of real time) closes P6-TW-LOAD-011 (plan §gate). */
export const GATE_MAX_EXPIRY_MS = 900_000;

/**
 * The reset-token lifetime at the image default: PASSWORD_RESET_TOKEN_EXPIRES_IN = '5m' (config-variables.ts:143, recorded by the
 * Task 3 probe, P17). The pre-run gate of P6-TW-LOAD-011 reads this value; the case still checks each issued token's real window.
 */
export const IMAGE_DEFAULT_RESET_LIFETIME_MS = 300_000;

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

/** Rounding allowed between the recorded lifetime and the observed one (database timestamps and clock reads). */
export const PREMISE_TOLERANCE_MS = 1_000;

/** Pure. Whether the observed token windows match the recorded lifetime (the gate's premise) and whether the gate is open. */
export function boundaryPremise(
  windows: ReadonlyArray<{ createdAtMs: number; expiresAtMs: number }>,
  recordedMs = IMAGE_DEFAULT_RESET_LIFETIME_MS,
): { gateOpen: boolean; premiseMatches: boolean; observedLifetimesMs: number[] } {
  const observedLifetimesMs = windows.map((w) => w.expiresAtMs - w.createdAtMs);
  return {
    gateOpen: windows.every((w) => expiryGateOpen(w.createdAtMs, w.expiresAtMs)),
    premiseMatches: observedLifetimesMs.every(
      (ms) => Math.abs(ms - recordedMs) <= PREMISE_TOLERANCE_MS,
    ),
    observedLifetimesMs,
  };
}

/** Pure. True when a token's lifetime (expiresAt minus createdAt) is at most the gate. */
export function expiryGateOpen(createdAtMs: number, expiresAtMs: number): boolean {
  return expiresAtMs - createdAtMs <= GATE_MAX_EXPIRY_MS;
}
