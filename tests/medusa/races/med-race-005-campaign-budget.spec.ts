import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runPromoCase } from "../../../src/medusa/run-promo-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("Medusa campaign budget", () => {
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

  test.describe("P6-MED-RACE-005 campaign budget", () => {
    // 60 s + 30 s per trial (probe: at most 15.9 s per attempt with 10 ready carts; plan §12).
    test.describe.configure({ timeout: 60_000 + trials * 30_000 });

    test("P6-MED-RACE-005 N carts with a budget-K promotion complete in parallel → usage ≤ K", async () => {
      const { histogram, suspected } = await runPromoCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-005",
        title: "N=10 carts with a usage-budget K=3 promotion complete in parallel → usage ≤ K",
        mode: "budget",
        n: 10,
        cap: 3,
        trials,
        labelled: [],
      });
      // F-M2 is a PRODUCT BUG (plan D70, labelled 2026-10-23) but has no test.fail(): at about 11 % per trial a PR run
      // cannot hold an expected failure stable (docs/BACKLOG.md). It is annotated as a labelled product bug with the
      // three full-count runs that showed it (32 of 150 trials in -012, 1 of 150 in -005):
      // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008
      // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035
      // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959
      // Counters, HTTP 200s against the cap, 5xx, setup and cleanup are asserted.
      for (const line of suspected) {
        const type = /\(F-M2\)$/.test(line) ? "product-bug" : "suspected-bug";
        test.info().annotations.push({ type, description: line });
      }
      expect(histogram.verdict).toBe("pass");
    });
  });
});
