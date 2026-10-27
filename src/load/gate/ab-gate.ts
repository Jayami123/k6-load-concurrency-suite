// The A/B decision (plan Phase 4b task 12 §6.3): a candidate is blocked only by a repeated regression, above the A/A tolerance in
// every B arm. Missing tolerance is INVALID (no_reference), never PASS; a failed audit is a PRODUCT BUG, never a regression.
import { ratiosOf } from "./ratio.ts";

export const GATE_RULE = "repeated regression: every B arm's ratio is above 1 + toleranceRel";
export const MIN_VALID_ARMS = 3;

export interface GateInput {
  caseId: string;
  aMedians: number[]; // the A arms' run-level p95 (ms), VALID arms only
  bMedians: number[]; // the B arms' run-level p95 (ms), VALID arms only
  toleranceRel: number | undefined; // from tolerance.json for this product and metric; undefined = no_reference
  auditOk: boolean; // every arm's correctness audit passed
}

export type GateStatus =
  "PASS" | "FAIL (REGRESSION)" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";

export interface GateVerdict {
  verdict: GateStatus;
  ratios: number[]; // median(A arms) over each B arm's value: B / median(A), one per B arm
  rule: typeof GATE_RULE;
  reasons: string[];
}

/**
 * FAIL (REGRESSION) only when every B arm's ratio is above 1 + toleranceRel. One noisy B arm never fails the gate. Without a tolerance the
 * verdict is INVALID (no_reference). Fewer than three VALID arms on either side is INVALID. A failed audit is FAIL (PRODUCT BUG).
 */
export function abGate(input: GateInput): GateVerdict {
  const verdict = (v: GateStatus, ratios: number[], reasons: string[]): GateVerdict => ({
    verdict: v,
    ratios,
    rule: GATE_RULE,
    reasons,
  });
  if (input.toleranceRel === undefined)
    return verdict(
      "INVALID",
      [],
      [
        `no_reference: no tolerance for ${input.caseId} (k6/thresholds/tolerance.json is absent or has no entry)`,
      ],
    );
  if (!Number.isFinite(input.toleranceRel) || input.toleranceRel < 0)
    return verdict("TEST BUG", [], ["the tolerance must be a finite number ≥ 0"]);
  if (input.aMedians.length < MIN_VALID_ARMS || input.bMedians.length < MIN_VALID_ARMS)
    return verdict(
      "INVALID",
      [],
      [
        `fewer than ${MIN_VALID_ARMS} VALID arms (A ${input.aMedians.length}, B ${input.bMedians.length})`,
      ],
    );
  let ratios: number[];
  try {
    ratios = ratiosOf(input.aMedians, input.bMedians);
  } catch (err) {
    return verdict("TEST BUG", [], [(err as Error).message]);
  }
  if (!input.auditOk)
    return verdict("FAIL (PRODUCT BUG)", ratios, [
      "an arm's correctness audit failed (not a regression)",
    ]);
  const limit = 1 + input.toleranceRel;
  if (ratios.every((r) => r > limit))
    return verdict("FAIL (REGRESSION)", ratios, [
      `every B arm is above ${limit.toFixed(2)} x the A median`,
    ]);
  return verdict("PASS", ratios, []);
}
