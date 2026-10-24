import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import {
  calCleanupWith,
  calSetupWith,
  calWindowDays,
  type CalDeps,
} from "../../src/load/products/cal.ts";
import type { LoadContext } from "../../src/load/types.ts";

type Query = (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;

/** A pool whose query answers from a script, one result per call. The last result repeats. */
function fakePool(results: unknown[][]): { pool: pg.Pool; sqls: string[] } {
  const sqls: string[] = [];
  let call = 0;
  const query: Query = async (sql) => {
    sqls.push(sql);
    const rows = results[Math.min(call, results.length - 1)] ?? [];
    call += 1;
    return { rows };
  };
  return { pool: { query, end: async () => {} } as unknown as pg.Pool, sqls };
}

const HOST_ROW = {
  userId: 5,
  eventTypeId: 7,
  length: 30,
  seatsPerTimeSlot: null,
  requiresConfirmation: false,
  periodType: "unlimited",
};

function fakeCtx(): LoadContext {
  return {
    caseDef: { id: "P6-CAL-LOAD-001" },
    profile: { rate: 2, durationSec: 30, maxLatencyMs: 1000 },
    runPrefix: "p6-qa-20261024T010203Z-3fa9c0d1",
    config: {},
    secrets: {},
  } as unknown as LoadContext;
}

describe("cal product setup and cleanup", () => {
  it("window length is ceil(planned / 11.4) + 3", () => {
    assert.equal(calWindowDays(0), 3);
    assert.equal(calWindowDays(20), 5);
    assert.equal(calWindowDays(60), 9);
    assert.equal(calWindowDays(114), 13);
  });

  it("the config holds no secret and the secrets map stays empty", async () => {
    const ctx = fakeCtx();
    const { pool } = fakePool([[HOST_ROW]]);
    const deps: CalDeps = { openPool: () => pool, cancel: async () => {} };
    const out = await calSetupWith(ctx, deps);
    assert.equal(out.ok, true);
    assert.doesNotMatch(JSON.stringify(ctx.config), /token|password|secret/i);
    assert.deepEqual(ctx.secrets, {});
    assert.equal(ctx.config.windowDays, calWindowDays(60));
  });

  it("the cleanup sweeps the uids the database returns, not the uids k6 returned", async () => {
    const booking = (id: number, uid: string) => ({
      id,
      uid,
      status: "accepted",
      start: "2026-12-01 10:00:00.000",
      end: "2026-12-01 10:30:00.000",
    });
    const { pool } = fakePool([[booking(1, "uid-a"), booking(2, "uid-b")], []]);
    const cancelled: string[] = [];
    const out = await calCleanupWith(fakeCtx(), {
      openPool: () => pool,
      cancel: async (uid) => {
        cancelled.push(uid);
      },
    });
    assert.deepEqual(cancelled, ["uid-a", "uid-b"]);
    assert.equal(out.ok, true);
  });

  it("a failed cancel becomes a TEST BUG line and the sweep continues", async () => {
    const booking = (id: number, uid: string) => ({
      id,
      uid,
      status: "accepted",
      start: "2026-12-01 10:00:00.000",
      end: "2026-12-01 10:30:00.000",
    });
    const { pool } = fakePool([[booking(1, "uid-a"), booking(2, "uid-b")], []]);
    const cancelled: string[] = [];
    const out = await calCleanupWith(fakeCtx(), {
      openPool: () => pool,
      cancel: async (uid) => {
        cancelled.push(uid);
        if (uid === "uid-a") throw new Error("cancel refused");
      },
    });
    assert.deepEqual(cancelled, ["uid-a", "uid-b"]);
    assert.equal(out.ok, false);
    assert.equal(out.kind, "TEST BUG");
    assert.deepEqual(out.reasons, ["TEST BUG: cancel booking 1 failed: cancel refused"]);
  });
});
