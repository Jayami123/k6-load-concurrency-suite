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

export function createReadOnlyPool(connectionString = medusaDatabaseUrlFromEnv()): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 5,
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
  opts?: { intervalMs?: number; stableReads?: number; timeoutMs?: number },
): Promise<T> {
  const intervalMs = opts?.intervalMs ?? 50;
  const stableReads = opts?.stableReads ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 10_000;

  const deadline = Date.now() + timeoutMs;
  let lastJson = "";
  let stable = 0;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    const value = await queryFn();
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
