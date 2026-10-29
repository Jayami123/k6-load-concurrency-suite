import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNoLimiterEnv,
  contractOk,
  fairnessVerdict,
  phaseCounts,
  verdictForRateLimit,
  type Phase,
  type PlannedPerPhase,
  type Sample,
} from "../../src/twenty/rate-limit-oracle.ts";

const PLANNED: PlannedPerPhase = { below: 120, at: 200, above: 400, recovery: 60 };

/** A 429 with the full contract (Retry-After, the three headers, RATE_LIMITED). */
const LIMITED = (phase: Phase, tMs: number): Sample => ({
  phase,
  tMs,
  status: 429,
  retryAfter: "1",
  hasRateHeaders: true,
  errorCode: "RATE_LIMITED",
  periodCount: 1,
  scopeKeys: ["spenderType", "spenderId", "operationType"],
});

const OK = (phase: Phase, tMs: number): Sample => ({
  phase,
  tMs,
  status: 200,
  retryAfter: null,
  hasRateHeaders: false,
  errorCode: null,
  periodCount: null,
  scopeKeys: [],
});

/** n samples of a phase: the first `limited` are 429s (with the contract unless `over` says otherwise), the rest 200s. */
function phaseOf(
  phase: Phase,
  n: number,
  limited: number,
  over: Partial<Sample> = {},
  base = 0,
): Sample[] {
  return Array.from({ length: n }, (_, i) =>
    i < limited ? { ...LIMITED(phase, base + i), ...over } : OK(phase, base + i),
  );
}

/** A full run that passes: below has no 429, above has `above429` contract-ok 429s, `at` has `at429`. */
function fullRun(above429 = 150, at429 = 0, extra: Sample[] = []): Sample[] {
  return [
    ...phaseOf("below", 120, 0, {}, 0),
    ...phaseOf("at", 200, at429, {}, 1_000_000),
    ...phaseOf("above", 400, above429, {}, 2_000_000),
    ...extra,
  ];
}

describe("rate-limit contract oracle", () => {
  it("passes a full run: no 429 below, 429s above with the contract, no 5xx, recovery found", () => {
    const samples = [...fullRun(150), OK("recovery", 3_000_000)];
    const verdict = verdictForRateLimit(samples, 600, PLANNED);
    assert.equal(verdict.verdict, "PASS");
    assert.deepEqual(verdict.reasons, []);
    assert.equal(phaseCounts(samples, "above").s429, 150);
  });

  it("flags a 429 under the limit and names the phase", () => {
    const samples = fullRun(150);
    samples[5] = LIMITED("below", 5);
    const verdict = verdictForRateLimit(samples, 600, PLANNED);
    assert.equal(verdict.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.ok(verdict.reasons.some((r) => r.startsWith("below: 1 429")));
  });

  it("flags an above phase with no 429", () => {
    const verdict = verdictForRateLimit(fullRun(0), 600, PLANNED);
    assert.equal(verdict.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.ok(verdict.reasons.includes("above: no 429 above the limit"));
  });

  it("flags a 429 without Retry-After, and the contract check says so", () => {
    const bad = LIMITED("above", 2_000_000);
    bad.retryAfter = null;
    assert.equal(contractOk(bad), false);
    assert.equal(contractOk(LIMITED("above", 0)), true);
    const samples = fullRun(150, 0, [bad]);
    const verdict = verdictForRateLimit(samples, 600, PLANNED);
    assert.equal(verdict.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.ok(verdict.reasons.some((r) => r.includes("without the contract")));
  });

  it("flags a 500 in the at phase", () => {
    const samples = fullRun(150);
    samples[130] = { ...OK("at", 1_000_100), status: 500 };
    const verdict = verdictForRateLimit(samples, 600, PLANNED);
    assert.equal(verdict.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.ok(verdict.reasons.some((r) => r.includes("5xx")));
  });

  it("flags a missing recovery (no 200 within 60 s) and keeps the other rules", () => {
    const verdict = verdictForRateLimit(fullRun(150), null, PLANNED);
    assert.equal(verdict.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.ok(verdict.reasons.includes("recovery: no 200 within 60 s of the stop"));
  });

  it("does not let a 429 count in the at phase decide the verdict", () => {
    const verdict = verdictForRateLimit(fullRun(150, 40), 600, PLANNED);
    assert.equal(verdict.verdict, "PASS");
    assert.equal(phaseCounts(fullRun(150, 40), "at").s429, 40);
  });

  it("is INCONCLUSIVE when a phase has under 90% of its planned requests", () => {
    const samples = fullRun(150).filter((s, i) => !(s.phase === "below" && i >= 80));
    assert.equal(phaseCounts(samples, "below").n, 80);
    const verdict = verdictForRateLimit(samples, 600, PLANNED);
    assert.equal(verdict.verdict, "INCONCLUSIVE");
    assert.ok(verdict.reasons.some((r) => r.startsWith("below: 80 of 120")));
  });

  it("throws a TEST BUG when there are no samples", () => {
    assert.throws(() => verdictForRateLimit([], 600, PLANNED), /TEST BUG/);
  });

  it("judges fairness: FINDING when L is refused inside F's refusals, PASS when not, INCONCLUSIVE when F is never refused", () => {
    const flood = [OK("above", 1_000), LIMITED("above", 2_000), LIMITED("above", 4_000)];
    const lowRefused = [{ ...LIMITED("above", 3_000) }];
    const lowOk = [OK("above", 3_000), OK("above", 3_500)];
    assert.equal(fairnessVerdict(flood, lowRefused).verdict, "FINDING");
    assert.equal(fairnessVerdict(flood, lowOk).verdict, "PASS");
    assert.equal(fairnessVerdict([OK("above", 1_000)], lowOk).verdict, "INCONCLUSIVE");
    assert.equal(fairnessVerdict(flood, [OK("above", 10_000)]).verdict, "INCONCLUSIVE");
  });

  it("names only the limiter variable that is set, exact names only, and NODE_OPTIONS too", () => {
    for (const name of [
      "API_RATE_LIMITING_SHORT_TTL_IN_MS",
      "API_RATE_LIMITING_SHORT_LIMIT",
      "API_RATE_LIMITING_LONG_TTL_IN_MS",
      "API_RATE_LIMITING_LONG_LIMIT",
      "APPLICATION_API_RATE_LIMITING_TTL_IN_MS",
      "APPLICATION_API_RATE_LIMITING_LIMIT",
      "NODE_OPTIONS",
    ]) {
      assert.throws(
        () => assertNoLimiterEnv(["PATH", name]),
        (err: Error) => {
          assert.match(err.message, /TEST BUG/);
          assert.ok(err.message.includes(name));
          return true;
        },
      );
    }
    assert.throws(() => assertNoLimiterEnv(["PATH", "API_RATE_LIMITING_LONG_LIMIT"]), /TEST BUG/);
    assert.doesNotThrow(() =>
      assertNoLimiterEnv(["PATH", "NODE_ENV", "API_RATE_LIMITING_LONG_LIMIT_X"]),
    );
  });
});
