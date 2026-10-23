import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOversellCase } from "../../../src/medusa/run-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import type { RaceHistogram } from "../../../src/races/types.ts";

const trials = raceTrialsFromEnv();

/** SUSPECTED findings (F-M5 orphan orders) as annotations. They never fail the case. */
function annotateSuspected(histogram: RaceHistogram): void {
  for (const line of histogram.suspected ?? []) {
    test.info().annotations.push({ type: "suspected-bug", description: line });
  }
}

test.describe("Medusa oversell", () => {
  test.describe.configure({ timeout: 180_000 });

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

  test.describe("P6-MED-RACE-001 Medusa oversell", () => {
    // 60 s + 30 s per trial: about 2x the worst measured per-trial time (16.5 s), so the full count fits.
    test.describe.configure({ timeout: 60_000 + trials * 30_000 });

    test("P6-MED-RACE-001 N carts vs stock S → orders≤S", async () => {
      const histogram = await runOversellCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "P6-MED-RACE-001",
        title: "N carts vs stock S → orders≤S",
        s: 5,
        n: 20,
        mode: "qty1",
        trials,
      });
      annotateSuspected(histogram);
      expect(histogram.verdict).toBe("pass");
    });
  });

  test.describe("Medusa oversell extras (unmapped)", () => {
    test.describe.configure({ timeout: 180_000 });

    test("extra (unmapped): S=1 vs N=2", async () => {
      const trials = Math.min(raceTrialsFromEnv(), 3);
      const histogram = await runOversellCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "extra-s1-n2",
        title: "extra (unmapped): S=1 vs N=2",
        s: 1,
        n: 2,
        mode: "qty1",
        trials,
      });
      annotateSuspected(histogram);
      expect(histogram.verdict).toBe("pass");
    });

    test("extra (unmapped): S=0 vs N=5", async () => {
      const trials = Math.min(raceTrialsFromEnv(), 3);
      const histogram = await runOversellCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "extra-s0-n5",
        title: "extra (unmapped): S=0 vs N=5",
        s: 0,
        n: 5,
        mode: "s0",
        trials,
      });
      annotateSuspected(histogram);
      expect(histogram.verdict).toBe("pass");
    });

    test("extra (unmapped): mixed quantities", async () => {
      const trials = Math.min(raceTrialsFromEnv(), 3);
      const histogram = await runOversellCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "extra-mixed-qty",
        title: "extra (unmapped): mixed quantities",
        s: 5,
        n: 5,
        mode: "mixed",
        quantities: [3, 1, 1, 1, 1],
        trials,
      });
      annotateSuspected(histogram);
      expect(histogram.verdict).toBe("pass");
    });

    test("extra (unmapped): same cart completed 10 times", async () => {
      const trials = Math.min(raceTrialsFromEnv(), 3);
      const histogram = await runOversellCase({
        pool,
        token,
        catalog,
        runPrefix,
        caseId: "extra-same-cart",
        title: "extra (unmapped): same cart completed 10 times",
        s: 5,
        n: 10,
        mode: "sameCart",
        trials,
      });
      annotateSuspected(histogram);
      expect(histogram.verdict).toBe("pass");
    });
  });
});
