import assert from "node:assert/strict";
import type pg from "pg";
import { describe, it } from "node:test";
import {
  readStatementSnapshot,
  topQueryDeltas,
  type StatementRow,
  type StatementSnapshot,
} from "../../src/load/telemetry/pg-top-queries.ts";

interface Captured {
  sql: string[];
}

/** A pool whose connection answers the two statement queries; `fail` makes the first query throw. */
function fakePool(statements: unknown[], dealloc: number, captured: Captured, fail?: Error) {
  return {
    connect: async () => ({
      query: async (sql: string) => {
        captured.sql.push(sql);
        if (fail) throw fail;
        if (sql.includes("pg_stat_statements_info"))
          return { rows: [{ dealloc: String(dealloc) }] };
        return { rows: statements };
      },
      release: () => undefined,
    }),
  } as unknown as pg.Pool;
}

function row(queryid: string, totalMs: number, calls = 1): StatementRow {
  return { queryid, calls, totalMs, rows: calls, query: `SELECT ${queryid}` };
}

function snapshot(rows: StatementRow[], dealloc = 0): StatementSnapshot {
  return { rows: new Map(rows.map((r) => [r.queryid, r])), dealloc };
}

describe("pg top queries", () => {
  it("parses a snapshot into rows keyed by queryid", async () => {
    const captured: Captured = { sql: [] };
    const pool = fakePool(
      [{ queryid: "42", calls: "3", total_ms: 12.5, rows: "7", query: "SELECT $1" }],
      4,
      captured,
    );
    const snap = await readStatementSnapshot(pool);
    assert.deepEqual(snap.rows.get("42"), {
      queryid: "42",
      calls: 3,
      totalMs: 12.5,
      rows: 7,
      query: "SELECT $1",
    });
    assert.equal(snap.dealloc, 4);
  });

  it("keeps the top 10 deltas by total time", () => {
    const start = snapshot(Array.from({ length: 12 }, (_, i) => row(`q${i}`, 0)));
    const end = snapshot(Array.from({ length: 12 }, (_, i) => row(`q${i}`, i + 1)));
    const { rows } = topQueryDeltas(start, end);
    assert.equal(rows.length, 10);
    assert.deepEqual(
      rows.map((r) => r.totalMs),
      [12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
    );
  });

  it("counts a queryid missing from the start snapshot from zero", () => {
    const start = snapshot([]);
    const end = snapshot([row("new", 9.25)]);
    const { rows, droppedNegative } = topQueryDeltas(start, end);
    assert.equal(rows[0]?.totalMs, 9.25);
    assert.equal(droppedNegative, 0);
  });

  it("drops a negative delta and counts it", () => {
    const start = snapshot([row("reset", 50)]);
    const end = snapshot([row("reset", 10), row("ok", 4)]);
    const result = topQueryDeltas(start, end);
    assert.equal(result.droppedNegative, 1);
    assert.deepEqual(
      result.rows.map((r) => r.queryid),
      ["ok"],
    );
  });

  it("filters the snapshot to the current database by dbid", async () => {
    const captured: Captured = { sql: [] };
    await readStatementSnapshot(fakePool([], 0, captured));
    assert.match(
      captured.sql[0] ?? "",
      /dbid = \(SELECT oid FROM pg_database WHERE datname = current_database\(\)\)/,
    );
  });

  it("drops P6's own pg_stat_ sampler statements", async () => {
    const captured: Captured = { sql: [] };
    await readStatementSnapshot(fakePool([], 0, captured));
    assert.match(captured.sql[0] ?? "", /query NOT LIKE '%pg_stat_%'/);
  });

  it("marks the run evicted when the dealloc counter rises", () => {
    const start = snapshot([row("a", 1)], 5);
    assert.equal(topQueryDeltas(start, snapshot([row("a", 2)], 7)).evicted, true);
    assert.equal(topQueryDeltas(start, snapshot([row("a", 2)], 5)).evicted, false);
  });

  it("names HARNESS_PG_STATS=1 when the view is missing", async () => {
    const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    await assert.rejects(
      readStatementSnapshot(fakePool([], 0, { sql: [] }, missing)),
      /HARNESS_PG_STATS=1/,
    );
  });
});
