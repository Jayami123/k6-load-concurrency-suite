import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createSlotAllocator } from "../../../src/cal/api.ts";
import { resolveHostSetup } from "../../../src/cal/oracle.ts";
import { hostPasswordFromProducts, loginAsHost } from "../../../src/cal/session.ts";
import { runLinkBurstCase } from "../../../src/cal/run-state-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import {
  calBaseUrlFromEnv,
  calDatabaseUrlFromEnv,
  raceTrialsFromEnv,
} from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const trials = raceTrialsFromEnv();
const runPrefix = p6RunPrefix();
const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
// Owner label (O6, 2026-10-23): F-C1 is PRODUCT BUG after three full-count runs; see the known-bug test.
const labelled: readonly string[] = ["F-C1"];
let labelledFound: string[] = [];
let setup: Awaited<ReturnType<typeof resolveHostSetup>>;
let slots: ReturnType<typeof createSlotAllocator>;
let cookie: string;

test.beforeAll(async () => {
  setup = await resolveHostSetup(pool); // TEST BUG if the seed changed (D11)
  slots = createSlotAllocator(setup.eventTypeId, { pool, userId: setup.userId });
  cookie = await loginAsHost(calBaseUrlFromEnv(), hostPasswordFromProducts());
});
test.afterAll(async () => closePool(pool));

const CASE = "P6-CAL-RACE-006";
const TITLE = "private link cap 1, N=10 parallel bookings → one accepted";

test.describe.serial(`${CASE} Cal private link single use`, () => {
  test.describe.configure({ timeout: 120_000 + trials * 15_000 });

  test(`${CASE} ${TITLE}`, async () => {
    const result = await runLinkBurstCase({
      pool,
      setup,
      slots,
      cookie,
      runPrefix,
      caseId: CASE,
      title: TITLE,
      n: 10,
      cap: 1,
      trials,
      labelled,
    });
    const { histogram, suspected } = result;
    labelledFound = result.labelled;
    for (const line of suspected) {
      const type = labelledFound.includes(line) ? "product-bug" : "suspected-bug";
      test.info().annotations.push({ type, description: line });
    }
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
  });

  // PRODUCT BUG F-C1 (private link single use): a link with maxUsageCount 1 admits all 10 parallel bookings; the counter stops at 1.
  // Labelled by the owner (O6, 2026-10-23) after three full-count runs, one attempt each in 50 trials:
  // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39932990882
  // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935674101
  // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39938126238
  // Trials 50 of 50 per run (150 of 150 attempts). When this test turns red ("expected to fail but passed"), the bug is
  // fixed: remove test.fail() and the label.
  test("P6-CAL-RACE-006 known bug F-C1: cap-1 link admits one booking reproduces", async () => {
    test.fail();
    expect(labelledFound, labelledFound.join("; ")).toEqual([]);
  });

  test(`${CASE} histogram artefact`, async () => {
    const raw = JSON.parse(await readFile(`results/races/${CASE}.json`, "utf8"));
    expect(raw.caseId).toBe(CASE);
    expect(raw.product).toBe("cal");
    expect(raw.concurrency).toBe(10);
    expect(raw.trialsRequested).toBe(trials);
    expect(raw.trials).toHaveLength(trials);
    expect(raw.attempts.filter((a: { valid: boolean }) => a.valid)).toHaveLength(trials);
    expect(raw.verdict).toBe("pass");
  });
});
