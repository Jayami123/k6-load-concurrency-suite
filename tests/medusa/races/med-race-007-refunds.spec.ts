import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runMoneyCase } from "../../../src/medusa/run-money-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa refunds", () => {
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

  test.describe("P6-MED-RACE-007 refunds of X on one captured payment", () => {
    // 60 s + 30 s per trial, as the oversell spec. Set from the measured timing (plan §12) once the live run is in.
    test.describe.configure({ timeout: 60_000 + trials * 30_000 });

    test("P6-MED-RACE-007 N parallel refunds of X → refunded ≤ captured", async () => {
      const { histogram, reportedLeakedOrderIds } = await runMoneyCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-007",
        title: "N parallel refunds of X → refunded ≤ captured",
        mode: "refund-all",
        n: 10,
        trials,
      });
      for (const id of reportedLeakedOrderIds) {
        test
          .info()
          .annotations.push({ type: "leaked-data", description: `order ${id} not archived (D41)` });
      }
      expect(histogram.verdict).toBe("pass");
    });
  });
});
