import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { assertSelectOnly } from "../../src/oracles/pg.ts";
import {
  PG_ACTIVITY_SQL,
  PG_DB_SQL,
  PG_LOCKS_SQL,
  readPgSample,
} from "../../src/load/telemetry/pg-stats.ts";

function fakePool(answers: Array<unknown[]>, failConnect = false) {
  const sqls: string[] = [];
  let connects = 0;
  let call = 0;
  const client = {
    query: async (sql: string) => {
      sqls.push(sql);
      return { rows: answers[call++ % answers.length] ?? [] };
    },
    release: () => {},
  };
  const pool = {
    connect: async () => {
      connects += 1;
      if (failConnect) throw new Error("connection refused");
      return client;
    },
  } as unknown as pg.Pool;
  return { pool, sqls, connects: () => connects };
}

const ROWS = [
  [{ active: 2, idle_in_tx: 1, waiting: 0, total: 6, visible: 6 }],
  [{ waiting_locks: 3 }],
  [{ commits: "120", rollbacks: "2", deadlocks: "0", blks_read: "55", blks_hit: "900" }],
];

describe("telemetry pg source", () => {
  it("every telemetry query passes the select-only check", () => {
    for (const sql of [PG_ACTIVITY_SQL, PG_LOCKS_SQL, PG_DB_SQL])
      assert.doesNotThrow(() => assertSelectOnly(sql));
  });

  it("maps one real row, casting the bigint strings to numbers", async () => {
    const { pool } = fakePool(ROWS);
    const s = await readPgSample(pool);
    assert.deepEqual(s, {
      active: 2,
      idleInTx: 1,
      waiting: 0,
      total: 6,
      visible: 6,
      waitingLocks: 3,
      commits: 120,
      rollbacks: 2,
      deadlocks: 0,
      blksRead: 55,
      blksHit: 900,
    });
  });

  it("visible below total is passed through so the sampler can report it", async () => {
    const { pool } = fakePool([
      [{ active: 0, idle_in_tx: 0, waiting: 0, total: 9, visible: 4 }],
      ...ROWS.slice(1),
    ]);
    const s = await readPgSample(pool);
    assert.equal(s.total, 9);
    assert.equal(s.visible, 4);
  });

  it("a connection failure rejects, so the sampler can mark the source absent for that sample", async () => {
    const { pool } = fakePool(ROWS, true);
    await assert.rejects(readPgSample(pool), /connection refused/);
  });

  it("the three queries share one connection", async () => {
    const { pool, connects, sqls } = fakePool(ROWS);
    await readPgSample(pool);
    assert.equal(connects(), 1);
    assert.equal(sqls.length, 3);
  });

  it("the waiting count excludes idle sessions in ClientRead (wait_event_type Client)", () => {
    assert.match(PG_ACTIVITY_SQL, /wait_event_type <> 'Client'/);
  });
});
