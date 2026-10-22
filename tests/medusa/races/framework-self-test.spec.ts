import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { runTrials } from "../../../src/races/run-trials.ts";
import { createHistogram, writeHistogram } from "../../../src/races/histogram.ts";
import { createRerunRunner, spreadPolicyFromEnv } from "../../../src/races/rerun-on-spread.ts";
import { recordTrial } from "../../../src/races/trial-record.ts";
import { raceTrialsFromEnv, medusaBaseUrlFromEnv } from "../../../src/races/env.ts";
import {
  closePool,
  createReadOnlyPool,
  selectRows,
  waitForStable,
} from "../../../src/oracles/pg.ts";

const CONCURRENCY = 20;

type TableCounts = {
  order: number;
  reservation_item: number;
  inventory_level: number;
};

async function snapshot(pool: ReturnType<typeof createReadOnlyPool>): Promise<TableCounts> {
  const [orderRows, resRows, invRows] = await Promise.all([
    selectRows<{ n: number | string }>(pool, 'SELECT COUNT(*)::int AS n FROM "order"'),
    selectRows<{ n: number | string }>(pool, "SELECT COUNT(*)::int AS n FROM reservation_item"),
    selectRows<{ n: number | string }>(pool, "SELECT COUNT(*)::int AS n FROM inventory_level"),
  ]);
  return {
    order: Number(orderRows[0]?.n),
    reservation_item: Number(resRows[0]?.n),
    inventory_level: Number(invRows[0]?.n),
  };
}

test.describe.configure({ timeout: 60_000 });

test("framework self-test (unmapped): 20 concurrent GET /health plus oracle", async () => {
  const trials = raceTrialsFromEnv();
  const base = medusaBaseUrlFromEnv();
  const pool = createReadOnlyPool();
  const histogram = createHistogram({
    caseId: "framework-self-test",
    title: "framework self-test (unmapped)",
    product: "framework",
    concurrency: CONCURRENCY,
    trials,
  });

  try {
    const before = await snapshot(pool);
    const runner = createRerunRunner(spreadPolicyFromEnv(), trials);

    const trialResults = await runTrials(trials, (trial) =>
      runner.runTrial(trial, async () => {
        // Raw bodies by request index: the exact "OK" check uses these, while
        // bodySummary stays diagnostics-only.
        const rawBodies: Array<string | undefined> = Array.from({ length: CONCURRENCY });
        const fired = await fireTogether(
          CONCURRENCY,
          async (index) => {
            const res = await fetch(`${base}/health`);
            const body = await res.text();
            rawBodies[index] = body;
            return { status: res.status, body };
          },
          {
            warm: async () => {
              const res = await fetch(`${base}/health`);
              await res.text();
            },
          },
        );

        // Record first so perTrial and statusCounts keep the real statuses even
        // when validation fails.
        const record = recordTrial(trial, fired, () => {
          for (const req of fired.requests) {
            if (req.status !== 200 || rawBodies[req.index] !== "OK") {
              throw new Error(
                `PRODUCT BUG: GET /health HTTP ${req.status} body=${req.bodySummary}`,
              );
            }
          }
        });

        return record;
      }),
    );

    runner.applyTo(histogram);

    const stableOne = await waitForStable(() =>
      selectRows<{ ok: number | string }>(pool, "SELECT 1 AS ok"),
    );
    histogram.oracle.selectOne = stableOne[0]?.ok ?? null;
    expect(Number(stableOne[0]?.ok)).toBe(1);

    const client = await pool.connect();
    try {
      await client.query("INSERT INTO inventory_item (id) VALUES ('iitem_p6_readonly_probe')");
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

    const after = await snapshot(pool);
    const leaks: string[] = [];
    const tables: Array<keyof TableCounts> = ["order", "reservation_item", "inventory_level"];
    for (const table of tables) {
      if (after[table] !== before[table]) {
        leaks.push(`TEST BUG: ${table} count ${before[table]} -> ${after[table]}`);
      }
    }
    histogram.invariantViolations.push(...leaks);
    histogram.oracle.orderCount = after.order;
    histogram.oracle.reservationItemCount = after.reservation_item;
    histogram.oracle.inventoryLevelCount = after.inventory_level;

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";

    expect(leaks, leaks.join("; ")).toEqual([]);
    expect(trialsOk).toBe(true);
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
    await closePool(pool);
  }

  const raw = JSON.parse(await readFile("results/races/framework-self-test.json", "utf8"));
  expect(raw.caseId).toBe("framework-self-test");
  expect(raw.title).toBe("framework self-test (unmapped)");
  expect(raw.verdict).toBe("pass");
  expect(raw.trialsRequested).toBe(trials);
  expect(raw.concurrency).toBe(20);
  expect(raw.oracle.readOnlySqlstate).toBe("25006");
});
