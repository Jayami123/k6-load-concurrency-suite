import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOrderCase, type RunOrderCaseResult } from "../../../src/medusa/run-order-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

/** Owner-labelled PRODUCT BUG signals (plan D67, D68): annotated as product-bug, never asserted here (D54). */
const KNOWN_BUG = /\((X04|F-M3)\)$/;

test.describe("Medusa captured cancel burst", () => {
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let result: RunOrderCaseResult;
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();

  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await closePool(pool);
  });

  test.describe("P6-MED-RACE-014 captured cancel burst", () => {
    // 60 s + 10 s per trial (Task 3 pattern; probe: about 3.5 s per attempt, 61 attempts at most).
    test.describe.configure({ timeout: 60_000 + trials * 10_000 });

    test.beforeAll(async () => {
      token = await seedAndLogin();
      catalog = await loadCatalog(token);
      result = await runOrderCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-014",
        title: "ten parallel cancels of a captured order → refunds ≤ captured",
        mode: "double-cancel",
        concurrency: 10,
        captureFirst: true,
        trials,
        labelled: [],
      });
    });

    test("P6-MED-RACE-014 ten parallel cancels of a captured order → refunds ≤ captured", () => {
      for (const line of result.suspected) {
        const known = KNOWN_BUG.test(line);
        const description = known ? line.replace("SUSPECTED PRODUCT BUG:", "PRODUCT BUG:") : line;
        test.info().annotations.push({
          type: known ? "product-bug" : "suspected-bug",
          description,
        });
      }
      for (const line of result.reportedLeaked) {
        test.info().annotations.push({ type: "leaked-data", description: line });
      }
      // Guards: refunds ≤ captured (asserted), 5xx, setup, cleanup and the leak check (D54).
      expect(result.histogram.verdict).toBe("pass");
    });
  });
});
