// The gate self-test (P6-X-LOAD-008, plan Phase 4b task 12 §6.5): the gate must fail on a deliberately slowed stub and pass on an
// unchanged one. The tolerance here is a labelled TEST constant, not a product tolerance (Q-SELFTOL): it does not depend on the runner.
import type { GateStatus } from "./ab-gate.ts";

export const SELFTEST_CASE = "P6-X-LOAD-008";
/** A fixed test constant (Q-SELFTOL), not a product tolerance. */
export const SELFTEST_TOLERANCE = 0.2;
export const SELFTEST_BASE_SERVICE_MS = 25;
export const SELFTEST_SLOW_EXTRA_MS = 60;
/** Stub ports: A (the reference), B-slow (slowed by SELFTEST_SLOW_EXTRA_MS), B-same (unchanged). */
export const SELFTEST_PORTS = { a: 18080, slow: 18081, same: 18082 } as const;
export const SELFTEST_EXPECTED = { slowed: "FAIL (REGRESSION)", unchanged: "PASS" } as const;

/** Both expectations must hold: the slowed candidate fails as a regression and the unchanged candidate passes. */
export function checkSelftest(
  slowed: GateStatus,
  unchanged: GateStatus,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (slowed !== SELFTEST_EXPECTED.slowed)
    reasons.push(`slowed candidate is ${slowed}, expected ${SELFTEST_EXPECTED.slowed}`);
  if (unchanged !== SELFTEST_EXPECTED.unchanged)
    reasons.push(`unchanged candidate is ${unchanged}, expected ${SELFTEST_EXPECTED.unchanged}`);
  return { ok: reasons.length === 0, reasons };
}
