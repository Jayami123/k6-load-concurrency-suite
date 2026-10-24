import pg from "pg";
import { medusaDatabaseUrlFromEnv } from "../races/env.ts";

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY|CALL|DO)\b/i;

function stripLeadingComments(sql: string): string {
  let rest = sql.trim();
  for (;;) {
    if (rest.startsWith("--")) {
      const nl = rest.indexOf("\n");
      rest = nl === -1 ? "" : rest.slice(nl + 1).trim();
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end === -1) {
        return "";
      }
      rest = rest.slice(end + 2).trim();
      continue;
    }
    break;
  }
  return rest;
}

export function assertSelectOnly(sql: string): void {
  const stripped = stripLeadingComments(sql);
  const withoutTrailing = stripped.replace(/;\s*$/, "").trim();
  if (withoutTrailing.includes(";")) {
    throw new Error("TEST BUG: oracle query is not SELECT-only");
  }
  if (FORBIDDEN.test(withoutTrailing)) {
    throw new Error("TEST BUG: oracle query is not SELECT-only");
  }
  const first = withoutTrailing.split(/\s+/)[0];
  if (!first || first.toUpperCase() !== "SELECT") {
    throw new Error("TEST BUG: oracle query is not SELECT-only");
  }
}

export function createReadOnlyPool(
  connectionString = medusaDatabaseUrlFromEnv(),
  opts: { max?: number; connectionTimeoutMs?: number; queryTimeoutMs?: number } = {},
): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: opts.max ?? 5,
    connectionTimeoutMillis: opts.connectionTimeoutMs,
    query_timeout: opts.queryTimeoutMs,
    allowExitOnIdle: true,
    options: "-c default_transaction_read_only=on",
  });
}

export async function selectRows<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertSelectOnly(sql);
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

export async function waitForStable<T>(
  queryFn: () => Promise<T>,
  opts?: {
    intervalMs?: number;
    stableReads?: number;
    timeoutMs?: number;
    /** Reads that fail this predicate never count as stable (e.g. "at least one row"). */
    accept?: (value: T) => boolean;
    /** On timeout return the last read instead of throwing; the caller's assertion reports it. */
    returnOnTimeout?: boolean;
  },
): Promise<T> {
  const intervalMs = opts?.intervalMs ?? 50;
  const stableReads = opts?.stableReads ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const accept = opts?.accept ?? (() => true);

  const deadline = Date.now() + timeoutMs;
  let lastJson = "";
  let stable = 0;
  let lastValue: T | undefined;
  let lastRead: T | undefined;

  while (Date.now() < deadline) {
    const value = await queryFn();
    lastRead = value;
    if (!accept(value)) {
      lastJson = "";
      stable = 0;
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    const json = JSON.stringify(value);
    if (json === lastJson) {
      stable += 1;
      if (stable >= stableReads) {
        return value;
      }
    } else {
      lastJson = json;
      stable = 1;
      lastValue = value;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  if (opts?.returnOnTimeout && lastRead !== undefined) {
    return lastRead;
  }
  throw new Error(
    `TEST BUG: waitForStable timed out after ${timeoutMs}ms; last value ${JSON.stringify(lastValue)}`,
  );
}

const closedPools = new WeakSet<pg.Pool>();

export async function closePool(pool: pg.Pool | undefined): Promise<void> {
  if (!pool || closedPools.has(pool)) {
    return;
  }
  closedPools.add(pool);
  await pool.end();
}

/** Select-only rows on one checked-out client (the telemetry sampler runs its queries on a single connection). */
export async function selectRowsOn<T extends pg.QueryResultRow>(
  client: { query: pg.Pool["query"] },
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertSelectOnly(sql);
  const result = await client.query<T>(sql, params);
  return result.rows as T[];
}
