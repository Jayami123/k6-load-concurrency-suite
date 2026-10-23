import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import {
  runCancelBurstCase,
  type RunCancelBurstResult,
} from "../../../src/medusa/run-cancel-burst.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa cancel burst (authorised)", () => {
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let result: RunCancelBurstResult;
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();

  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await closePool(pool);
  });

  test.describe("P6-MED-RACE-013 cancel burst", () => {
    // 60 s + 10 s per trial (Task 3 pattern; probe: about 3.2 s per attempt, 61 attempts at most).
    test.describe.configure({ timeout: 60_000 + trials * 10_000 });

    test.beforeAll(async () => {
      token = await seedAndLogin();
      catalog = await loadCatalog(token);
      result = await runCancelBurstCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-013",
        title: "ten parallel cancels of one order → stock released once",
        concurrency: 10,
        captureFirst: false,
        trials,
        labelled: [],
      });
    });

    test("P6-MED-RACE-013 ten parallel cancels of one order → stock released once", () => {
      for (const line of result.suspected) {
        test.info().annotations.push({ type: "suspected-bug", description: line });
      }
      for (const line of result.reportedLeaked) {
        test.info().annotations.push({ type: "leaked-data", description: line });
      }
      // Guards: 5xx, setup, cleanup and the leak check. Labelled signals are never in the verdict (D54).
      expect(result.histogram.verdict).toBe("pass");
    });
  });
});
