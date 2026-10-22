import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runPromoCase } from "../../../src/medusa/run-promo-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa promotion usage limit", () => {
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

  test.describe("P6-MED-RACE-012 promotion usage limit", () => {
    // 60 s + 30 s per trial (probe: at most 15.9 s per attempt with 10 ready carts; plan §12).
    test.describe.configure({ timeout: 60_000 + trials * 30_000 });

    test("P6-MED-RACE-012 N carts with a limit-L promotion complete in parallel → usage ≤ L", async () => {
      const { histogram, suspected } = await runPromoCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-012",
        title: "N=10 carts with a usage-limit L=3 promotion complete in parallel → usage ≤ L",
        mode: "limit",
        n: 10,
        cap: 3,
        trials,
        labelled: [],
      });
      // D54: suspected signals (F-M2) are annotated, not asserted. Counters, 5xx and setup are asserted.
      for (const line of suspected) {
        test.info().annotations.push({ type: "suspected-bug", description: line });
      }
      expect(histogram.verdict).toBe("pass");
    });
  });
});
