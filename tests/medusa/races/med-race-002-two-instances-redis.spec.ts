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

test.describe("P6-MED-RACE-002 two Medusa backends, Redis lock", () => {
  // 60 s + 30 s per trial, as -001 (2x the worst measured per-trial time).
  test.describe.configure({ timeout: 60_000 + trials * 30_000 });
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let second: string;

  test.beforeAll(async () => {
    // Guards first: a wrong topology is ENV, never a product result (rule: root-cause, never weaken).
    const url = medusaSecondBaseUrlFromEnv();
    if (url === undefined)
      throw new Error("ENV: MEDUSA_SECOND_BASE_URL is unset; the harness started one backend");
    second = url;
    if (medusaLockModeFromEnv() !== "redis")
      throw new Error("ENV: MEDUSA_LOCK must be redis for P6-MED-RACE-002");
    for (const [i, base] of [medusaBaseUrlFromEnv(), second].entries()) {
      const res = await fetch(`${base}/health`);
      if (res.status !== 200) throw new Error(`ENV: instance ${i} /health HTTP ${res.status}`);
      const provider = lockProviderFromLog(readBackendLog(i as 0 | 1));
      if (provider !== "redis")
        throw new Error(
          `ENV: instance ${i} lock provider is ${provider}, expected redis (harness config, not a product result)`,
        );
    }
    token = await seedAndLogin();
    catalog = await loadCatalog(token);
  });
  test.afterAll(async () => {
    await closePool(pool);
  });

  test("P6-MED-RACE-002 S=3, N=15 across two instances → orders≤S", async () => {
    const histogram = await runOversellCase({
      pool,
      token,
      catalog,
      runPrefix,
      caseId: "P6-MED-RACE-002",
      title: "S=3, N=15 across two instances, Redis lock → orders≤S",
      s: 3,
      n: 15,
      mode: "qty1",
      trials,
      instances: [medusaBaseUrlFromEnv(), second],
      lock: "redis",
    });
    for (const line of histogram.suspected ?? [])
      test.info().annotations.push({ type: "suspected-bug", description: line });
    expect(histogram.verdict).toBe("pass");
  });
});
