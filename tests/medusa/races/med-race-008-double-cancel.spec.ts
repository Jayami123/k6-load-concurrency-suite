import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOrderCase, type RunOrderCaseResult } from "../../../src/medusa/run-order-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

/** Owner-labelled PRODUCT BUG signals of this case (plan D67, D68). */
const KNOWN_BUG = /\((X04|F-M3)\)$/;

test.describe("Medusa double cancel", () => {
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let result: RunOrderCaseResult;
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();

  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await closePool(pool);
  });

  test.describe("P6-MED-RACE-008 double cancel", () => {
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
        caseId: "P6-MED-RACE-008",
        title: "two parallel cancels of one order → one takes effect",
        mode: "double-cancel",
        trials,
        labelled: [],
      });
    });

    test("P6-MED-RACE-008 two parallel cancels of one order → one takes effect", () => {
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

    // PRODUCT BUG X04 and F-M3, labelled 2026-10-23 (plan D67, D68) after three full-count runs:
    // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008
    // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035
    // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959
    // X04 in 113 of 150 trials, F-M3 in 37 of 150, at least one of them in 150 of 150.
    // X04 is P1's known failure (docs/reference/p1-plan-example-medusa.md line 365: statuses [200, 200] with a pending
    // credit_line change). F-M3: @medusajs/core-flows 2.21.2 dist/reservation/steps/delete-reservations-by-line-items.js
    // lines 10-29 restore the reservations on rollback (restoreReservationItemsByLineItem); cancel-order.js lines 107-109
    // run that step in parallelize, so the losing cancel's rollback restores what the winner deleted.
    // When this test turns red ("expected to fail but passed"), the bugs are fixed: remove test.fail().
    test("P6-MED-RACE-008 known bugs: X04 and F-M3 reproduce", () => {
      test.fail();
      expect(result.suspected.filter((line) => KNOWN_BUG.test(line))).toEqual([]);
    });
  });
});
