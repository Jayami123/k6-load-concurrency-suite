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
// Owner labels go here after 3 full-count CI runs (D-C7, O6). Empty until then.
const labelled: readonly string[] = [];
let setup: Awaited<ReturnType<typeof resolveHostSetup>>;
let slots: ReturnType<typeof createSlotAllocator>;
let cookie: string;

test.beforeAll(async () => {
  setup = await resolveHostSetup(pool); // TEST BUG if the seed changed (D11)
  slots = createSlotAllocator(setup.eventTypeId, { pool, userId: setup.userId });
  cookie = await loginAsHost(calBaseUrlFromEnv(), hostPasswordFromProducts());
});
test.afterAll(async () => closePool(pool));

const CASE = "P6-CAL-RACE-008";
const TITLE =
  "private link cap 3, N=10 parallel bookings → three accepted (SUSPECTED F-C1 recorded)";

test.describe.serial(`${CASE} Cal private link single use`, () => {
  test.describe.configure({ timeout: 120_000 + trials * 15_000 });

  test(`${CASE} ${TITLE}`, async () => {
    const { histogram, suspected } = await runLinkBurstCase({
      pool,
      setup,
      slots,
      cookie,
      runPrefix,
      caseId: CASE,
      title: TITLE,
      n: 10,
      cap: 3,
      trials,
      labelled,
    });
    for (const line of suspected) {
      test.info().annotations.push({ type: "suspected-bug", description: line });
    }
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
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
