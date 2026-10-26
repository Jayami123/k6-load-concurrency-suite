import type { PlateauResult } from "./plateau.ts";
import type { SlopeResult } from "./slope.ts";

export type SoakVerdict =
  "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID" | "NO THRESHOLD YET";

/**
 * The soak verdict from the parts that are already computed: the telemetry validity (gaps, drops), the per-intent audit,
 * the slope and plateau statistics, and the thresholds in soak-bounds.json (when present). Order of precedence:
 * TEST BUG (setup or slots ran out, L1) > INVALID (telemetry gap, dropped iterations, generator limit) > FAIL (audit or
 * a threshold) > NO THRESHOLD YET (no soak-bounds.json entry for the product) > PASS.
 *
 * Growth (a threshold FAIL) needs the least-squares slope and the Theil–Sen slope both positive: one step cannot make it.
 */
export function soakVerdict(input: {
  auditOk: boolean;
  invalidReasons: string[];
  testBugReasons: string[];
  slopeRpm: SlopeResult;
  plateau: PlateauResult;
  thresholds: { slopePerMin: number; plateauRatio: number } | null;
}): { verdict: SoakVerdict; reasons: string[] } {
  if (input.testBugReasons.length > 0)
    return { verdict: "TEST BUG", reasons: input.testBugReasons };
  if (input.invalidReasons.length > 0) return { verdict: "INVALID", reasons: input.invalidReasons };

  const failReasons: string[] = [];
  if (!input.auditOk) failReasons.push("audit mismatch");
  const { slopeRpm: s, plateau: p, thresholds: t } = input;
  if (t !== null) {
    const lsUp = s.slopePerMin !== null && s.slopePerMin > 0;
    const tsUp = s.theilSenPerMin !== null && s.theilSenPerMin > 0;
    if (s.slopePerMin !== null && s.slopePerMin > t.slopePerMin && tsUp)
      failReasons.push("slope above threshold");
    if (lsUp && tsUp && p.ratio !== null && p.ratio > t.plateauRatio)
      failReasons.push("plateau above threshold");
  }
  if (failReasons.length > 0) return { verdict: "FAIL (PRODUCT BUG)", reasons: failReasons };
  if (t === null)
    return { verdict: "NO THRESHOLD YET", reasons: ["no soak-bounds.json entry for this product"] };
  return { verdict: "PASS", reasons: [] };
}
