import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createSlotAllocator } from "../../../src/cal/api.ts";
import { nonConflictLosers } from "../../../src/cal/invariants.ts";
import { resolveHostSetup } from "../../../src/cal/oracle.ts";
import { runIdenticalSlotCase } from "../../../src/cal/run-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { calDatabaseUrlFromEnv, raceTrialsFromEnv } from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const trials = raceTrialsFromEnv();
const extraTrials = Math.min(trials, 3);
const runPrefix = p6RunPrefix();
const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
let setup: Awaited<ReturnType<typeof resolveHostSetup>>;
let slots: ReturnType<typeof createSlotAllocator>;

test.beforeAll(async () => {
  setup = await resolveHostSetup(pool); // TEST BUG if the seed changed (D11)
  slots = createSlotAllocator(setup.eventTypeId, { pool, userId: setup.userId });
});
test.afterAll(async () => closePool(pool));

const MAPPED_TITLE = "Identical slot, N=20 parallel POST; DB ACCEPTED count = 1";

test.describe.serial("P6-CAL-RACE-001 Cal identical slot", () => {
  test.describe.configure({ timeout: 60_000 + trials * 10_000 });

  test(`P6-CAL-RACE-001 ${MAPPED_TITLE}`, async () => {
    const { histogram } = await runIdenticalSlotCase({
      pool,
      setup,
      slots,
      runPrefix,
      caseId: "P6-CAL-RACE-001",
      title: MAPPED_TITLE,
      n: 20,
      mode: "distinct",
      trials,
    });
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
  });

  test("P6-CAL-RACE-002 Status histogram artefact for P6-CAL-RACE-001", async () => {
    const raw = JSON.parse(await readFile("results/races/P6-CAL-RACE-001.json", "utf8"));
    expect(raw.caseId).toBe("P6-CAL-RACE-001");
    expect(raw.product).toBe("cal");
    expect(raw.concurrency).toBe(20);
    expect(raw.trialsRequested).toBe(trials);
    // trials[] has one entry per trial index; attempts[] has every burst (valid and invalid).
    expect(raw.trials).toHaveLength(trials);
    expect(raw.attempts.filter((t: { valid: boolean }) => t.valid)).toHaveLength(trials);
    expect(raw.attempts).toHaveLength(trials + raw.invalidTrials);
    const counts = raw.statusCounts as Record<string, number>;
    for (const key of Object.keys(counts)) expect(key).toMatch(/^\d{3}$|^error$/);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(trials * 20);
    expect(String(raw.commitSha).length).toBeGreaterThan(0);
    expect(String(raw.finishedAt).length).toBeGreaterThan(0);
    expect(raw.verdict).toBe("pass");
  });
});

test.describe("Cal identical slot extras (unmapped)", () => {
  test.describe.configure({ timeout: 60_000 + extraTrials * 10_000 });

  test("extra (unmapped): same attendee double-submit ×20", async () => {
    const { histogram } = await runIdenticalSlotCase({
      pool,
      setup,
      slots,
      runPrefix,
      caseId: "extra-same-attendee",
      title: "extra (unmapped): same attendee double-submit ×20",
      n: 20,
      mode: "sameAttendee",
      trials: extraTrials,
    });
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
  });

  test("extra (unmapped): one instant written three ways ×21", async () => {
    const { histogram } = await runIdenticalSlotCase({
      pool,
      setup,
      slots,
      runPrefix,
      caseId: "extra-time-spellings",
      title: "extra (unmapped): one instant written three ways ×21",
      n: 21,
      mode: "spellings",
      trials: extraTrials,
    });
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
  });

  test("extra (unmapped): concurrent losers get 409, never 400/5xx", async () => {
    const { histogram, responses } = await runIdenticalSlotCase({
      pool,
      setup,
      slots,
      runPrefix,
      caseId: "extra-loser-contract",
      title: "extra (unmapped): concurrent losers get 409, never 400/5xx",
      n: 20,
      mode: "distinct",
      trials: extraTrials,
    });
    expect(histogram.verdict).toBe("pass"); // setup + one ACCEPTED per slot hold first
    // PRODUCT BUG (plan §2.4, P6-OBS-CAL-001): Cal maps P2002 to 409 booking_conflict_error, but
    // production redactError strips the code, so concurrent losers get 400 "An error occurred
    // while querying the database." Reproduced 1162/1162 on 2026-10-20. Remove this line when
    // Cal returns 409.
    test.info().annotations.push({
      type: "issue",
      description: "P6-OBS-CAL-001: concurrent losers get 400 instead of 409 (redacted P2002)",
    });
    test.fail();
    const bad = nonConflictLosers(responses);
    expect(
      bad.length,
      bad
        .slice(0, 3)
        .map((r) => r.summary)
        .join(" | "),
    ).toBe(0);
  });
});
