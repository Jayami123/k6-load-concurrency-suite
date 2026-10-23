import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOrderCase, type RunOrderCaseResult } from "../../../src/medusa/run-order-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

// Plan D65, D69: PR count from the three full-count runs of plan §14 Step 12. X05 or F-M3 showed in k = 57 of m = 150
// valid trials; the lower end of the 95 % Wilson interval is p_L = 0.306, so n = ceil(ln 0.01 / ln(1 - 0.306)) = 13 and
// a PR run misses both bugs with probability 0.694^13 = 0.86 %. Full counts (main, nightly, dispatch) are unchanged.
const MED_RACE_009_PR_TRIALS = 13;
const trials =
  process.env.GITHUB_EVENT_NAME === "pull_request"
    ? Math.max(raceTrialsFromEnv(), MED_RACE_009_PR_TRIALS)
    : raceTrialsFromEnv();

/** Owner-labelled PRODUCT BUG signals of this case (plan D68, D69). */
const KNOWN_BUG = /\((X05|F-M3)\)$/;

test.describe("Medusa cancel vs fulfil", () => {
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let result: RunOrderCaseResult;
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();

  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await closePool(pool);
  });

  test.describe("P6-MED-RACE-009 cancel vs fulfil", () => {
    // 60 s + 10 s per trial (probe: at most 2.9 s per attempt; plan §12). The case runs once, in beforeAll.
    test.describe.configure({ timeout: 60_000 + trials * 10_000 });

    test.beforeAll(async () => {
      // The hook gets the 60 s config timeout unless it raises its own (CI: -013 at 50 trials took 56 s).
      test.setTimeout(60_000 + trials * 10_000);
      token = await seedAndLogin();
      catalog = await loadCatalog(token);
      result = await runOrderCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-009",
        title: "one cancel ‖ one fulfil of one order → exactly one takes effect",
        mode: "cancel-vs-fulfil",
        trials,
        labelled: [],
      });
    });

    test("P6-MED-RACE-009 one cancel ‖ one fulfil of one order → never canceled with an open fulfillment", () => {
      for (const line of result.suspected) {
        const type = KNOWN_BUG.test(line) ? "product-bug" : "suspected-bug";
        test.info().annotations.push({ type, description: line });
      }
      for (const line of result.reportedLeaked) {
        test.info().annotations.push({ type: "leaked-data", description: line });
      }
      // Guards: counters, 5xx, setup, cleanup and the leak check (labelled signals are never in the verdict, D54).
      expect(result.histogram.verdict).toBe("pass");
    });

    // PRODUCT BUG X05 and F-M3, labelled 2026-10-23 (plan D68, D69) after three full-count runs:
    // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008
    // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035
    // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959
    // X05 in 50 of 150 trials, F-M3 in 7 of 150, at least one of them in 57 of 150.
    // X05 is P1's known failure (docs/reference/p1-plan-example-medusa.md line 365: canceled + fulfilled with one open
    // fulfillment). F-M3: @medusajs/core-flows 2.21.2 dist/reservation/steps/delete-reservations-by-line-items.js
    // lines 10-29 (cancel) and delete-reservations.js line 28 (fulfil, create-fulfillment.js line 395) restore the
    // reservations on rollback, so the losing request's rollback restores what the winner deleted.
    // When this test turns red ("expected to fail but passed"), the bugs are fixed: remove test.fail().
    test("P6-MED-RACE-009 known bugs: X05 and F-M3 reproduce", () => {
      test.fail();
      expect(result.suspected.filter((line) => KNOWN_BUG.test(line))).toEqual([]);
    });
  });
});
