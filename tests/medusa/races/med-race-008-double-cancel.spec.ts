import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOrderCase } from "../../../src/medusa/run-order-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa double cancel", () => {
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();

  test.beforeAll(async () => {
    token = await seedAndLogin();
    catalog = await loadCatalog(token);
  });

  test.afterAll(async () => {
    await closePool(pool);
  });

  test.describe("P6-MED-RACE-008 double cancel", () => {
    // 60 s + 10 s per trial (probe: at most 2.9 s per attempt; plan §12).
    test.describe.configure({ timeout: 60_000 + trials * 10_000 });

    test("P6-MED-RACE-008 two parallel cancels of one order → one takes effect", async () => {
      const { histogram, suspected, reportedLeaked } = await runOrderCase({
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
      // D54: suspected signals (X04, F-M3) are annotated, not asserted, until the owner labels them.
      for (const line of suspected) {
        test.info().annotations.push({ type: "suspected-bug", description: line });
      }
      for (const line of reportedLeaked) {
        test.info().annotations.push({ type: "leaked-data", description: line });
      }
      expect(histogram.verdict).toBe("pass");
    });
  });
});
