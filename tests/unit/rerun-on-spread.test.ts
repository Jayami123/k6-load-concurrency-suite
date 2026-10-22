import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHistogram } from "../../src/races/histogram.ts";
import {
  attemptTag,
  createRerunRunner,
  invalidBudget,
  isSpreadValid,
  spreadPolicyFromEnv,
  sumOracle,
  validAttempts,
} from "../../src/races/rerun-on-spread.ts";
import { runTrials } from "../../src/races/run-trials.ts";
import type { RaceAttemptResult, SpreadPolicy } from "../../src/races/types.ts";

const POLICY: SpreadPolicy = {
  limitMs: 5,
  maxReruns: 3,
  maxInvalidSharePct: 20,
  minInvalidBudget: 2,
  warmupBursts: 1,
};

/** What an attemptFn returns: the record recordTrial builds. attempt and valid are set by the runner. */
function record(
  trial: number,
  spreadMs: number,
  over: Partial<RaceAttemptResult> = {},
): RaceAttemptResult {
  return {
    trial,
    attempt: 1,
    valid: true,
    ok: true,
    statuses: [200, 400],
    statusCounts: { "200": 1, "400": 1 },
    dispatchSpreadMs: spreadMs,
    oracle: {},
    invariantViolations: [],
    ...over,
  };
}

/** An attemptFn that plays back one spread per attempt and counts how often fresh setup ran. */
function script(trial: number, spreads: number[], over: Partial<RaceAttemptResult> = {}) {
  const calls: number[] = [];
  const fn = async (attempt: number) => {
    calls.push(attempt);
    return record(trial, spreads[attempt - 1] ?? 0, over);
  };
  return { fn, calls };
}

function histogramFor(trials: number) {
  return createHistogram({
    caseId: "fake",
    title: "fake",
    product: "framework",
    concurrency: 2,
    trials,
  });
}

describe("isSpreadValid (D2)", () => {
  it("a spread exactly at the limit is valid", () => {
    assert.equal(isSpreadValid(5, 5), true);
  });
  it("a spread below the limit is valid", () => {
    assert.equal(isSpreadValid(0.4, 5), true);
  });
  it("a spread above the limit is invalid", () => {
    assert.equal(isSpreadValid(5.0001, 5), false);
  });
});

describe("invalidBudget", () => {
  it("is the larger of the minimum and the share of the trials, rounded up", () => {
    assert.equal(invalidBudget(3, 20, 2), 2);
    assert.equal(invalidBudget(5, 20, 2), 2);
    assert.equal(invalidBudget(30, 10, 2), 3);
    assert.equal(invalidBudget(50, 10, 2), 5);
    assert.equal(invalidBudget(50, 20, 2), 10);
    assert.equal(invalidBudget(51, 20, 2), 11);
  });
  it("RACE_MIN_INVALID_BUDGET raises or removes the floor", () => {
    assert.equal(invalidBudget(5, 20, 4), 4);
    assert.equal(invalidBudget(5, 20, 0), 1);
    assert.equal(invalidBudget(5, 0, 0), 0);
    assert.equal(invalidBudget(50, 20, 4), 10);
  });
});

describe("attemptTag", () => {
  it("keeps the first attempt's name and tags reruns", () => {
    assert.equal(attemptTag(3, 1), "t3");
    assert.equal(attemptTag(3, 2), "t3a2");
    assert.equal(attemptTag(12, 4), "t12a4");
  });
});

describe("spreadPolicyFromEnv", () => {
  it("defaults to 5 ms, 3 reruns, 20 percent, minimum budget 2, one warm-up burst", () => {
    assert.deepEqual(spreadPolicyFromEnv({}), POLICY);
  });
  it("reads the five variables", () => {
    assert.deepEqual(
      spreadPolicyFromEnv({
        RACE_MAX_SPREAD_MS: "8",
        RACE_MAX_SPREAD_RERUNS: "2",
        RACE_MAX_INVALID_SHARE_PCT: "30",
        RACE_MIN_INVALID_BUDGET: "0",
        RACE_WARMUP_BURSTS: "0",
      }),
      { limitMs: 8, maxReruns: 2, maxInvalidSharePct: 30, minInvalidBudget: 0, warmupBursts: 0 },
    );
  });
});

describe("createRerunRunner.runTrial", () => {
  it("a burst at the limit is one valid attempt and no rerun", async () => {
    const runner = createRerunRunner(POLICY, 1);
    const { fn, calls } = script(1, [5]);
    const got = await runner.runTrial(1, fn);
    assert.deepEqual(calls, [1]);
    assert.equal(got.valid, true);
    assert.equal(got.attempt, 1);
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 0);
    assert.equal(h.reruns, 0);
  });

  it("a burst above the limit is invalid, rerun with fresh setup, then valid", async () => {
    const runner = createRerunRunner(POLICY, 1);
    const { fn, calls } = script(1, [9, 1]);
    const got = await runner.runTrial(1, fn);
    assert.deepEqual(calls, [1, 2]); // attemptFn is the whole setup + burst + oracle + cleanup
    assert.equal(got.attempt, 2);
    assert.equal(got.valid, true);
    assert.deepEqual(
      runner.attempts.map((a) => [a.attempt, a.valid]),
      [
        [1, false],
        [2, true],
      ],
    );
  });

  it("stops at the per-trial cap with a TEST BUG and keeps every attempt", async () => {
    const runner = createRerunRunner({ ...POLICY, maxReruns: 2 }, 50); // budget 10, so the cap is hit first
    const { fn, calls } = script(4, [9, 8, 7, 1]);
    await assert.rejects(
      runner.runTrial(4, fn),
      /TEST BUG: runner too noisy: trial 4 still above RACE_MAX_SPREAD_MS=5 after 2 reruns \(spreads 9\.00, 8\.00, 7\.00 ms\)/,
    );
    assert.deepEqual(calls, [1, 2, 3]); // 1 burst + 2 reruns, never a fourth
    const h = histogramFor(50);
    runner.applyTo(h);
    assert.equal(h.attempts.length, 3);
    assert.equal(h.invalidTrials, 3);
    assert.equal(h.reruns, 2);
    assert.ok(h.invariantViolations.some((v) => v.includes("runner too noisy: trial 4")));
    assert.deepEqual(h.trials, [
      { trial: 4, attempts: 3, finalAttempt: null, outcome: "invalid-after-cap", ok: false },
    ]);
  });

  it("stops the whole case when the invalid-share budget is spent", async () => {
    const runner = createRerunRunner(POLICY, 5); // budget = max(2, ceil(5 * 20 / 100)) = 2
    const results = await runTrials(5, (trial) => runner.runTrial(trial, script(trial, [9, 1]).fn));
    assert.deepEqual(
      results.map((r) => r.ok),
      [true, true, false, false, false],
    );
    assert.match(results[2]?.error ?? "", /3 invalid attempts exceed the budget of 2/);
    assert.match(results[3]?.error ?? "", /runner too noisy/); // trial 4 never ran its setup
    const h = histogramFor(5);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 3);
    assert.equal(h.spreadPolicy.invalidBudget, 2);
    assert.ok(h.invariantViolations.some((v) => v.includes("exceed the budget of 2")));
    assert.equal(
      runner.attempts.some((a) => a.trial >= 4),
      false,
    );
    assert.deepEqual(
      h.trials.map((t) => [t.trial, t.outcome]),
      [
        [1, "valid"],
        [2, "valid"],
        [3, "invalid-after-cap"],
        [4, "not-run"],
        [5, "not-run"],
      ],
    );
  });

  it("RACE_MIN_INVALID_BUDGET=0 with a 0 percent share allows no invalid attempt at all", async () => {
    const runner = createRerunRunner({ ...POLICY, maxInvalidSharePct: 0, minInvalidBudget: 0 }, 5);
    await assert.rejects(
      runner.runTrial(1, script(1, [9, 1]).fn),
      /1 invalid attempts exceed the budget of 0/,
    );
  });

  it("a product violation in an invalid attempt still fails the trial (D3)", async () => {
    const runner = createRerunRunner(POLICY, 1);
    const fn = async (attempt: number) =>
      attempt === 1
        ? record(1, 9, {
            ok: false,
            error: "PRODUCT BUG: oversold",
            invariantViolations: ["PRODUCT BUG: oversold"],
          })
        : record(1, 1);
    await assert.rejects(runner.runTrial(1, fn), /PRODUCT BUG: oversold/);
    const invalid = runner.attempts.find((a) => !a.valid);
    assert.deepEqual(invalid?.invariantViolations, ["PRODUCT BUG: oversold"]); // recorded, not dropped
    assert.equal(runner.attempts.length, 2); // and the trial still reached a valid second attempt
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.deepEqual(h.trials, [
      { trial: 1, attempts: 2, finalAttempt: 2, outcome: "valid", ok: false },
    ]);
  });

  it("an invalid attempt with no violation does not fail the trial", async () => {
    const runner = createRerunRunner(POLICY, 1);
    await runner.runTrial(1, script(1, [9, 1]).fn);
    assert.deepEqual(runner.violations, []);
  });

  it("a throw from the attempt is a stub, is not rerun and is not an invalid trial", async () => {
    const runner = createRerunRunner(POLICY, 1);
    let calls = 0;
    await assert.rejects(
      runner.runTrial(1, async () => {
        calls += 1;
        throw new Error("TEST BUG: POST /admin/products HTTP 400");
      }),
      /HTTP 400/,
    );
    assert.equal(calls, 1);
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 0);
    assert.equal(h.attempts.length, 1);
    assert.equal(h.attempts[0]?.valid, false);
    assert.deepEqual(h.attempts[0]?.statuses, []);
    assert.deepEqual(h.trials, [
      { trial: 1, attempts: 1, finalAttempt: null, outcome: "failed", ok: false },
    ]);
  });
});

describe("createRerunRunner.applyTo (D4)", () => {
  it("counts statuses of valid attempts only and keeps invalid attempts in attempts[]", async () => {
    const runner = createRerunRunner(POLICY, 2);
    await runTrials(2, (trial) =>
      runner.runTrial(
        trial,
        trial === 1
          ? script(1, [9, 1], { statusCounts: { "200": 2 } }).fn
          : script(2, [1], { statusCounts: { "200": 1, "400": 1 } }).fn,
      ),
    );
    const h = histogramFor(2);
    runner.applyTo(h);
    assert.deepEqual(h.statusCounts, { "200": 3, "400": 1 }); // trial 1 attempt 2 + trial 2; not attempt 1
    assert.equal(h.trialsRequested, 2); // valid trials asked for, unchanged
    assert.deepEqual(
      h.attempts.map((t) => [t.trial, t.attempt, t.valid]),
      [
        [1, 1, false],
        [1, 2, true],
        [2, 1, true],
      ],
    );
    assert.deepEqual(h.attempts[0]?.statusCounts, { "200": 2 }); // the discarded burst keeps its own counts
  });

  it("has one trials[] entry per trial index, with its final valid attempt", async () => {
    const runner = createRerunRunner(POLICY, 3);
    await runTrials(3, (trial) =>
      runner.runTrial(trial, script(trial, [trial === 2 ? 9 : 1, 1]).fn),
    );
    const h = histogramFor(3);
    runner.applyTo(h);
    assert.deepEqual(h.trials, [
      { trial: 1, attempts: 1, finalAttempt: 1, outcome: "valid", ok: true },
      { trial: 2, attempts: 2, finalAttempt: 2, outcome: "valid", ok: true },
      { trial: 3, attempts: 1, finalAttempt: 1, outcome: "valid", ok: true },
    ]);
    assert.equal(h.trials.length, h.trialsRequested);
  });

  it("totals invalidTrials and reruns over several trials", async () => {
    const runner = createRerunRunner({ ...POLICY, maxInvalidSharePct: 100 }, 3); // budget 3: no abort here
    const plan: Record<number, number[]> = { 1: [9, 8, 1], 2: [1], 3: [7, 1] };
    await runTrials(3, (trial) => runner.runTrial(trial, script(trial, plan[trial]!).fn));
    const h = histogramFor(3);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 3);
    assert.equal(h.reruns, 3);
    assert.equal(h.trialsRequested, 3);
    assert.equal(h.attempts.length, 6);
  });

  it("aggregates the spread of valid and invalid attempts separately", async () => {
    const runner = createRerunRunner(POLICY, 1);
    await runner.runTrial(1, script(1, [9, 2]).fn);
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.deepEqual(h.dispatchSpreadMs, { min: 2, max: 2, mean: 2 });
    assert.deepEqual(h.invalidDispatchSpreadMs, { min: 9, max: 9, mean: 9 });
    assert.deepEqual(h.spreadPolicy, { ...POLICY, invalidBudget: 2 });
  });

  it("reports zero invalid and zero reruns for a clean run", async () => {
    const runner = createRerunRunner(POLICY, 2);
    await runTrials(2, (trial) => runner.runTrial(trial, script(trial, [1]).fn));
    const h = histogramFor(2);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 0);
    assert.equal(h.reruns, 0);
    assert.deepEqual(h.invalidDispatchSpreadMs, { min: 0, max: 0, mean: 0 });
  });
});

describe("helpers", () => {
  it("validAttempts and sumOracle", () => {
    const a = record(1, 1, { valid: true, oracle: { acceptedCount: 1 } });
    const b = record(1, 9, { valid: false, oracle: { acceptedCount: 1 } });
    const c = record(2, 1, { valid: true, oracle: {} });
    assert.deepEqual(validAttempts([a, b, c]), [a, c]);
    assert.equal(sumOracle([a, b, c], "acceptedCount"), 2);
    assert.equal(sumOracle(validAttempts([a, b, c]), "acceptedCount"), 1);
    assert.equal(sumOracle([c], "missing"), 0);
  });
});

describe("createRerunRunner.warmup", () => {
  it("fires RACE_WARMUP_BURSTS bursts with attempt numbers 1.., before any trial", async () => {
    const runner = createRerunRunner({ ...POLICY, warmupBursts: 2 }, 3);
    const calls: number[] = [];
    await runner.warmup(async (attempt) => {
      calls.push(attempt);
      return record(0, 9);
    });
    assert.deepEqual(calls, [1, 2]);
  });

  it("fires nothing when RACE_WARMUP_BURSTS is 0", async () => {
    const runner = createRerunRunner({ ...POLICY, warmupBursts: 0 }, 3);
    let calls = 0;
    await runner.warmup(async () => {
      calls += 1;
      return record(0, 1);
    });
    assert.equal(calls, 0);
    const h = histogramFor(3);
    runner.applyTo(h);
    assert.deepEqual(h.warmup, []);
  });

  it("is recorded with its spread and is left out of statusCounts, trials, attempts, spread and the verdict", async () => {
    const runner = createRerunRunner(POLICY, 2);
    await runner.warmup(async () => record(0, 9, { statusCounts: { "200": 7 } })); // above the limit: no rerun
    await runTrials(2, (trial) => runner.runTrial(trial, script(trial, [1]).fn));
    const h = histogramFor(2);
    runner.applyTo(h);
    assert.deepEqual(h.warmup, [
      {
        attempt: 1,
        dispatchSpreadMs: 9,
        statusCounts: { "200": 7 },
        ok: true,
        invariantViolations: [],
      },
    ]);
    assert.deepEqual(h.statusCounts, { "200": 2, "400": 2 }); // two valid trials only
    assert.equal(h.trials.length, 2);
    assert.equal(h.attempts.length, 2);
    assert.equal(h.invalidTrials, 0);
    assert.equal(h.reruns, 0);
    assert.deepEqual(h.dispatchSpreadMs, { min: 1, max: 1, mean: 1 });
    assert.deepEqual(h.invariantViolations, []);
  });

  it("does not use up the invalid-attempt budget", async () => {
    const runner = createRerunRunner({ ...POLICY, warmupBursts: 3, minInvalidBudget: 1 }, 1);
    await runner.warmup(async () => record(0, 9));
    const got = await runner.runTrial(1, script(1, [9, 1]).fn); // one invalid attempt is within the budget of 1
    assert.equal(got.valid, true);
  });

  it("a violation inside a warm-up is recorded but is not part of the verdict", async () => {
    const runner = createRerunRunner(POLICY, 1);
    await runner.warmup(async () =>
      record(0, 1, {
        ok: false,
        error: "PRODUCT BUG: x",
        invariantViolations: ["PRODUCT BUG: x"],
      }),
    );
    await runner.runTrial(1, script(1, [1]).fn);
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.equal(h.warmup[0]?.ok, false);
    assert.deepEqual(h.warmup[0]?.invariantViolations, ["PRODUCT BUG: x"]);
    assert.deepEqual(h.invariantViolations, []);
    assert.deepEqual(h.trials, [
      { trial: 1, attempts: 1, finalAttempt: 1, outcome: "valid", ok: true },
    ]);
  });

  it("a warm-up that throws is recorded and fails the case as a TEST BUG, without throwing", async () => {
    const runner = createRerunRunner(POLICY, 1);
    await runner.warmup(async () => {
      throw new Error("TEST BUG: POST /admin/products HTTP 400");
    });
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.equal(h.warmup[0]?.ok, false);
    assert.equal(h.warmup[0]?.error, "TEST BUG: POST /admin/products HTTP 400");
    assert.deepEqual(h.invariantViolations, [
      "TEST BUG: warm-up burst 1 failed: TEST BUG: POST /admin/products HTTP 400",
    ]);
  });
});
