import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOrderCase } from "../../../src/medusa/run-order-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa cancel vs fulfil", () => {
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

  test.describe("P6-MED-RACE-009 cancel vs fulfil", () => {
    // 60 s + 10 s per trial (probe: at most 2.9 s per attempt; plan §12).
    test.describe.configure({ timeout: 60_000 + trials * 10_000 });

    test("P6-MED-RACE-009 one cancel ‖ one fulfil of one order → never canceled with an open fulfillment", async () => {
      const { histogram, suspected, reportedLeaked } = await runOrderCase({
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
      // D54: suspected signals (X05, F-M3) are annotated, not asserted, until the owner labels them.
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
