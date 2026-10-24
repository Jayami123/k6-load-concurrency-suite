import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOversellCase } from "../../../src/medusa/run-case.ts";
import { lockProviderFromLog, readBackendLog } from "../../../src/medusa/harness-log.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import {
  medusaBaseUrlFromEnv,
  medusaLockModeFromEnv,
  medusaSecondBaseUrlFromEnv,
  raceTrialsFromEnv,
} from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("P6-MED-RACE-003 two Medusa backends, in-memory lock (characterization)", () => {
  // 60 s + 30 s per trial, as -001 (2x the worst measured per-trial time).
  test.describe.configure({ timeout: 60_000 + trials * 30_000 });
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let second: string;

  test.beforeAll(async () => {
    // Guards first: a wrong topology is ENV, never a product result.
    const url = medusaSecondBaseUrlFromEnv();
    if (url === undefined)
      throw new Error("ENV: MEDUSA_SECOND_BASE_URL is unset; the harness started one backend");
    second = url;
    if (medusaLockModeFromEnv() !== "memory")
      throw new Error("ENV: MEDUSA_LOCK must be memory for P6-MED-RACE-003");
    for (const [i, base] of [medusaBaseUrlFromEnv(), second].entries()) {
      const res = await fetch(`${base}/health`);
      if (res.status !== 200) throw new Error(`ENV: instance ${i} /health HTTP ${res.status}`);
      const provider = lockProviderFromLog(readBackendLog(i as 0 | 1));
      if (provider !== "memory")
        throw new Error(
          `ENV: instance ${i} lock provider is ${provider}, expected memory (harness config, not a product result)`,
        );
    }
    token = await seedAndLogin();
    catalog = await loadCatalog(token);
  });
  test.afterAll(async () => {
    await closePool(pool);
  });

  test("P6-MED-RACE-003 S=3, N=15 across two instances, in-memory lock", async () => {
    const histogram = await runOversellCase({
      pool,
      token,
      catalog,
      runPrefix,
      caseId: "P6-MED-RACE-003",
      title: "S=3, N=15 across two instances, in-memory lock (characterization)",
      s: 3,
      n: 15,
      mode: "qty1",
      trials,
      instances: [medusaBaseUrlFromEnv(), second],
      lock: "memory",
    });
    for (const line of histogram.suspected ?? [])
      test.info().annotations.push({ type: "suspected-bug", description: line });
    expect(histogram.verdict).toBe("pass");

    // Characterization (annotation, not a product bug): record it, then assert the documented behaviour.
    const valid = histogram.attempts.filter((a) => a.valid);
    const oversold = valid.filter((a) => a.oracle.oversold === 1).length;
    test.info().annotations.push({
      type: "characterization",
      description: `P6-MED-RACE-003: in-memory lock across two instances oversold in ${oversold} of ${valid.length} trials (expected; shows why a shared lock is required)`,
    });
    // Hard invariants of checkMemoryLockCharacterization held in every trial (the verdict above): no ghost orders, orderCount =
    // uniqueOrderIds = httpWinnerCount = reservationQty, and orders <= N. No instances x S bound is asserted: run 40119155757 has
    // one backend admitting 4 for S=3 in 7 trials, and it passed. Per-backend and per-trial oversell counts are the findings above.
    // The documented behaviour: at least one oversell in the trials (see §7.3 of the plan for the miss probability).
    expect(oversold).toBeGreaterThanOrEqual(1);
  });
});
