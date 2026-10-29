// Top statements by total time from pg_stat_statements, as deltas between two snapshots of one run (plan §5.6).
import type pg from "pg";
import { selectRowsOn } from "../../oracles/pg.ts";

export const MISSING_PG_STATS_MESSAGE =
  "pg_stat_statements is not loaded: start the product with HARNESS_PG_STATS=1";

/** One SELECT for the current database only. P6's own sampler statements (pg_stat_*) are dropped. Query text cut at 200 characters. */
export const PG_STATEMENTS_SQL = `SELECT queryid::text AS queryid, calls::bigint AS calls, total_exec_time::float8 AS total_ms,
  rows::bigint AS rows, left(query, 200) AS query
  FROM pg_stat_statements
  WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND queryid IS NOT NULL
    AND query NOT LIKE '%pg_stat_%'`;
export const PG_STATEMENTS_INFO_SQL = `SELECT dealloc::bigint AS dealloc FROM pg_stat_statements_info`;

export interface StatementRow {
  queryid: string;
  calls: number;
  totalMs: number;
  rows: number;
  query: string;
}

export interface StatementSnapshot {
  rows: Map<string, StatementRow>;
  dealloc: number;
}

/** Reads one snapshot on one connection. SQLSTATE 42P01 (view missing) names the flag that loads the extension. */
export async function readStatementSnapshot(pool: pg.Pool): Promise<StatementSnapshot> {
  const client = await pool.connect();
  try {
    const statements = await selectRowsOn<{
      queryid: string;
      calls: string;
      total_ms: number;
      rows: string;
      query: string;
    }>(client, PG_STATEMENTS_SQL);
    const [info] = await selectRowsOn<{ dealloc: string }>(client, PG_STATEMENTS_INFO_SQL);
    const rows = new Map<string, StatementRow>();
    for (const r of statements) {
      rows.set(r.queryid, {
        queryid: r.queryid,
        calls: Number(r.calls),
        totalMs: Number(r.total_ms),
        rows: Number(r.rows),
        query: r.query,
      });
    }
    return { rows, dealloc: Number(info?.dealloc ?? 0) };
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") {
      throw new Error(MISSING_PG_STATS_MESSAGE, { cause: err });
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Top-N by totalMs delta. A queryid missing from start counts from 0. A negative delta drops the row and counts it.
 *  A dealloc increase between the snapshots means eviction. */
export function topQueryDeltas(
  start: StatementSnapshot,
  end: StatementSnapshot,
  topN = 10,
): { rows: StatementRow[]; droppedNegative: number; evicted: boolean } {
  let droppedNegative = 0;
  const deltas: StatementRow[] = [];
  for (const row of end.rows.values()) {
    const before = start.rows.get(row.queryid);
    const totalMs = row.totalMs - (before?.totalMs ?? 0);
    if (totalMs < 0) {
      droppedNegative += 1;
      continue;
    }
    deltas.push({
      ...row,
      calls: row.calls - (before?.calls ?? 0),
      rows: row.rows - (before?.rows ?? 0),
      totalMs,
    });
  }
  deltas.sort((a, b) => b.totalMs - a.totalMs);
  return {
    rows: deltas.slice(0, topN),
    droppedNegative,
    evicted: end.dealloc > start.dealloc,
  };
}
