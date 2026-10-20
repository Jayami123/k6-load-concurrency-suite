import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { runTrials } from "../../../src/races/run-trials.ts";
import {
  aggregateDispatchSpread,
  createHistogram,
  mergeStatusCounts,
  writeHistogram,
} from "../../../src/races/histogram.ts";
import { recordTrial } from "../../../src/races/trial-record.ts";
import {
  calBaseUrlFromEnv,
  calDatabaseUrlFromEnv,
  raceMaxSpreadMsFromEnv,
  raceTrialsFromEnv,
} from "../../../src/races/env.ts";
import {
  closePool,
  createReadOnlyPool,
  selectRows,
  waitForStable,
} from "../../../src/oracles/pg.ts";
import type { RaceTrialResult } from "../../../src/races/types.ts";

const CONCURRENCY = 20;
// The booker page for the host and event type the Cal races use.
const HEALTH_PATH = "/pro/30min";

async function bookingCount(pool: ReturnType<typeof createReadOnlyPool>): Promise<number> {
  const rows = await selectRows<{ n: number | string }>(
    pool,
    'SELECT COUNT(*)::int AS n FROM "Booking"',
  );
  return Number(rows[0]?.n);
}

test.describe.configure({ timeout: 120_000 });

test("cal self-test (unmapped): 20 concurrent GET /pro/30min plus oracle", async () => {
  const trials = raceTrialsFromEnv();
  const spreadLimit = raceMaxSpreadMsFromEnv();
  const base = calBaseUrlFromEnv();
  const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
  const histogram = createHistogram({
    caseId: "cal-self-test",
    title: "cal self-test (unmapped)",
    product: "cal",
    concurrency: CONCURRENCY,
    trials,
  });

  try {
    const before = await bookingCount(pool);
    histogram.oracle.bookingCountBefore = before;
    const spreads: number[] = [];
    const perTrial: RaceTrialResult[] = [];

    const trialResults = await runTrials(trials, async (trial) => {
      const fired = await fireTogether(
        CONCURRENCY,
        async () => {
          const res = await fetch(`${base}${HEALTH_PATH}`);
          return { status: res.status, body: await res.text() };
        },
        {
          warm: async () => {
            const res = await fetch(`${base}${HEALTH_PATH}`);
            await res.text();
          },
        },
      );

      // Record first so perTrial and statusCounts keep the real statuses even when validation fails.
      const record = recordTrial(trial, fired, () => {
        for (const req of fired.requests) {
          if (req.status !== 200) {
            throw new Error(
              `PRODUCT BUG: GET ${HEALTH_PATH} HTTP ${req.status} ${req.bodySummary}`,
            );
          }
        }
        if (fired.dispatchSpreadMs >= spreadLimit) {
          throw new Error(`TEST BUG: dispatchSpreadMs ${fired.dispatchSpreadMs} >= ${spreadLimit}`);
        }
      });

      perTrial.push(record);
      spreads.push(record.dispatchSpreadMs);
      mergeStatusCounts(histogram.statusCounts, record.statusCounts);

      if (!record.ok) {
        throw new Error(record.error);
      }
      return fired;
    });

    // Trials that failed before a record existed (e.g. fireTogether threw).
    const recorded = new Set(perTrial.map((t) => t.trial));
    for (const failed of trialResults.filter((t) => !t.ok && !recorded.has(t.trial))) {
      perTrial.push({
        trial: failed.trial,
        ok: false,
        statuses: [],
        statusCounts: {},
        dispatchSpreadMs: 0,
        oracle: {},
        invariantViolations: failed.error ? [failed.error] : [],
        error: failed.error,
      });
    }

    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);

    const stableOne = await waitForStable(() =>
      selectRows<{ ok: number | string }>(pool, "SELECT 1 AS ok"),
    );
    histogram.oracle.selectOne = stableOne[0]?.ok ?? null;
    expect(Number(stableOne[0]?.ok)).toBe(1);

    // Read-only proof: an INSERT on "Booking" must fail with SQLSTATE 25006.
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO "Booking" (uid, title, "startTime", "endTime") VALUES ('p6-ro-probe', 'x', now(), now())`,
      );
      throw new Error("TEST BUG: read-only pool accepted INSERT");
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      histogram.oracle.readOnlySqlstate = code;
      if (code !== "25006") {
        throw new Error(`TEST BUG: expected SQLSTATE 25006, got ${code || "no code"}`);
      }
    } finally {
      client.release();
    }

    const after = await bookingCount(pool);
    histogram.oracle.bookingCountAfter = after;
    const leaks: string[] = [];
    if (after !== before) {
      leaks.push(`TEST BUG: Booking count ${before} -> ${after}`);
    }
    histogram.invariantViolations.push(...leaks);

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";

    expect(leaks, leaks.join("; ")).toEqual([]);
    expect(trialsOk).toBe(true);
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
    await closePool(pool);
  }

  const raw = JSON.parse(await readFile("results/races/cal-self-test.json", "utf8"));
  expect(raw.caseId).toBe("cal-self-test");
  expect(raw.title).toBe("cal self-test (unmapped)");
  expect(raw.product).toBe("cal");
  expect(raw.verdict).toBe("pass");
  expect(raw.trials).toBe(trials);
  expect(raw.concurrency).toBe(20);
  expect(raw.oracle.readOnlySqlstate).toBe("25006");
});
