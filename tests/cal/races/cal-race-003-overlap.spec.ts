import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createSlotAllocator } from "../../../src/cal/api.ts";
import { CAL_EVENT_SLUG_60, LONG_SLOT_MINUTES } from "../../../src/cal/payloads.ts";
import { resolveHostSetup } from "../../../src/cal/oracle.ts";
import { runOverlapPairCase } from "../../../src/cal/run-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { calDatabaseUrlFromEnv, raceTrialsFromEnv } from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

// Master plan CAL02: trials=30. CI passes RACE_TRIALS 5 (PR) or 50 (full); the case caps at 30.
const FULL_TRIALS = 30;
const trials = Math.min(raceTrialsFromEnv(), FULL_TRIALS);
const extraTrials = Math.min(raceTrialsFromEnv(), 4); // one trial per sequential shape A-D
const runPrefix = p6RunPrefix();
const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
let setup: { userId: number; eventTypeId30: number; eventTypeId60: number };
let windows: ReturnType<typeof createSlotAllocator>;

test.beforeAll(async () => {
  const s30 = await resolveHostSetup(pool, "30min", 30);
  const s60 = await resolveHostSetup(pool, CAL_EVENT_SLUG_60, LONG_SLOT_MINUTES);
  if (s30.userId !== s60.userId)
    throw new Error("TEST BUG: seed changed: 30min and 60min hosts differ");
  setup = { userId: s30.userId, eventTypeId30: s30.eventTypeId, eventTypeId60: s60.eventTypeId };
  windows = createSlotAllocator(setup.eventTypeId60, {
    slug: CAL_EVENT_SLUG_60,
    minutes: LONG_SLOT_MINUTES,
  });
});
test.afterAll(async () => closePool(pool));

const MAPPED_TITLE = "30-min and 60-min overlapping on same host";

test.describe("P6-CAL-RACE-003 Cal overlapping windows", () => {
  test.describe.configure({ timeout: 60_000 + trials * 10_000 });

  test(`P6-CAL-RACE-003 ${MAPPED_TITLE}`, async () => {
    const { histogram, guardViolations, overlapPairs, doubleBook } = await runOverlapPairCase({
      pool,
      setup,
      windows,
      runPrefix,
      caseId: "P6-CAL-RACE-003",
      title: MAPPED_TITLE,
      mode: "race",
      trials,
    });
    // D16: partial reproduction stays visible in the report even when test.fail() keeps it green.
    test.info().annotations.push({
      type: "P6-OBS-CAL-002",
      description: `double-booked ${doubleBook.trialsDoubleBooked}/${trials} trials, clean ${doubleBook.trialsClean}, pairs by trial ${doubleBook.doubleBookedByTrial}`,
    });
    // Setup, HTTP contract, spread, cleanup and leak must hold before the product assertion.
    expect(guardViolations, guardViolations.join("; ")).toEqual([]);
    const raw = JSON.parse(await readFile("results/races/P6-CAL-RACE-003.json", "utf8"));
    expect(raw.trials).toBe(trials);
    expect(raw.concurrency).toBe(2);
    // PRODUCT BUG, severity high (plan §2.5–2.6, P6-OBS-CAL-002): Cal checks availability outside the insert
    // transaction and only the idempotencyKey unique guards the DB, so a 60-min and an overlapping
    // 30-min booking sent together are both ACCEPTED. Reproduced 50/50 pairs on 2026-10-20.
    // Remove this line when Cal serialises overlapping bookings.
    test.fail();
    expect(
      overlapPairs,
      histogram.perTrial
        .flatMap((t) => t.invariantViolations)
        .slice(0, 3)
        .join(" | "),
    ).toBe(0);
  });
});

test.describe("Cal overlap extras (unmapped)", () => {
  test.describe.configure({ timeout: 60_000 + extraTrials * 10_000 });

  test("extra (unmapped): sequential overlapping booking is refused", async () => {
    const { histogram, guardViolations, overlapPairs } = await runOverlapPairCase({
      pool,
      setup,
      windows,
      runPrefix,
      caseId: "extra-overlap-sequential",
      title: "extra (unmapped): sequential overlapping booking is refused",
      mode: "sequential",
      trials: extraTrials,
    });
    expect(guardViolations, guardViolations.join("; ")).toEqual([]);
    expect(overlapPairs).toBe(0);
    expect(histogram.verdict).toBe("pass");
  });
});
