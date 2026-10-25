// Database sessions, locks and counters of the case database, read without writing (plan task 5 §6.3).
import type pg from "pg";
import { selectRowsOn } from "../../oracles/pg.ts";

export const PG_ACTIVITY_SQL = `SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
  count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_tx,
  count(*) FILTER (WHERE state = 'active' AND wait_event_type IS NOT NULL AND wait_event_type <> 'Client')::int AS waiting,
  count(*)::int AS total, count(*) FILTER (WHERE state IS NOT NULL)::int AS visible
  FROM pg_stat_activity WHERE datname = current_database()`;
export const PG_LOCKS_SQL = `SELECT count(*) FILTER (WHERE NOT granted)::int AS waiting_locks FROM pg_locks`;
export const PG_DB_SQL = `SELECT xact_commit::bigint AS commits, xact_rollback::bigint AS rollbacks, deadlocks::bigint AS deadlocks,
  blks_read::bigint AS blks_read, blks_hit::bigint AS blks_hit FROM pg_stat_database WHERE datname = current_database()`;

export interface PgSample {
  active: number;
  idleInTx: number;
  waiting: number;
  total: number;
  visible: number;
  waitingLocks: number;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  blksRead: number;
  blksHit: number;
}

/** One connection (checked out once), three SELECTs through the select-only check. Bigint columns come back as strings and are cast. */
export async function readPgSample(pool: pg.Pool): Promise<PgSample> {
  const client = await pool.connect();
  try {
    const [activity] = await selectRowsOn<{
      active: number;
      idle_in_tx: number;
      waiting: number;
      total: number;
      visible: number;
    }>(client, PG_ACTIVITY_SQL);
    const [locks] = await selectRowsOn<{ waiting_locks: number }>(client, PG_LOCKS_SQL);
    const [db] = await selectRowsOn<{
      commits: string;
      rollbacks: string;
      deadlocks: string;
      blks_read: string;
      blks_hit: string;
    }>(client, PG_DB_SQL);
    if (!activity || !locks || !db) throw new Error("TEST BUG: pg sample returned no row");
    return {
      active: Number(activity.active),
      idleInTx: Number(activity.idle_in_tx),
      waiting: Number(activity.waiting),
      total: Number(activity.total),
      visible: Number(activity.visible),
      waitingLocks: Number(locks.waiting_locks),
      commits: Number(db.commits),
      rollbacks: Number(db.rollbacks),
      deadlocks: Number(db.deadlocks),
      blksRead: Number(db.blks_read),
      blksHit: Number(db.blks_hit),
    };
  } finally {
    client.release();
  }
}

export const PG_MAX_CONNECTIONS_SQL = `SELECT current_setting('max_connections')::int AS max_connections`;

/** The server's max_connections, read once per run (plan task 1 §3.9 R2, for the db_conn rule). Read-only. */
export async function readMaxConnections(pool: pg.Pool): Promise<number> {
  const client = await pool.connect();
  try {
    const [row] = await selectRowsOn<{ max_connections: number }>(client, PG_MAX_CONNECTIONS_SQL);
    return Number(row?.max_connections);
  } finally {
    client.release();
  }
}
