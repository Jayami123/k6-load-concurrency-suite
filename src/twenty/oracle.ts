import pg from "pg";
import { selectRows } from "../oracles/pg.ts";

const SCHEMA_RE = /^workspace_[a-z0-9]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The fork's getWorkspaceSchemaName: `workspace_` plus the UUID as a base-36 number.
 * Checked against the two live schemas in the probe (§3.6). Nothing else is hard-coded.
 */
export function workspaceSchemaName(workspaceId: string): string {
  if (!UUID.test(workspaceId)) {
    throw new Error("TEST BUG: workspace id is not a UUID");
  }
  return `workspace_${BigInt(`0x${workspaceId.replaceAll("-", "")}`).toString(36)}`;
}

/** Exactly one core.workspace row must match the subdomain, or the seed changed and the run is a setup error. */
export async function resolveWorkspaceSchema(
  pool: pg.Pool,
  subdomain: string,
): Promise<{ workspaceId: string; schema: string }> {
  const rows = await selectRows<{ id: string }>(
    pool,
    "SELECT id FROM core.workspace WHERE subdomain = $1",
    [subdomain],
  );
  if (rows.length !== 1) {
    throw new Error(
      `TEST BUG: expected one core.workspace row for subdomain ${subdomain}, got ${rows.length}`,
    );
  }
  const workspaceId = rows[0]!.id;
  return { workspaceId, schema: workspaceSchemaName(workspaceId) };
}

/**
 * A deliberate write on the read-only pool, rolled back. Returns the SQLSTATE ("25006" when refused).
 * Not a SELECT, so it does not go through selectRows (the same pattern as src/documenso's self-test).
 */
export async function readOnlyWriteSqlstate(pool: pg.Pool): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("CREATE TEMP TABLE p6_probe_write (x int)");
      return "accepted";
    } catch (err) {
      return err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** md5 of the stored password hash: the value changes when a redemption writes the hash (never the hash itself). */
export async function passwordHashMd5(pool: pg.Pool, email: string): Promise<string | null> {
  const rows = await selectRows<{ h: string | null }>(
    pool,
    `SELECT md5("passwordHash") AS h FROM core."user" WHERE email = $1`,
    [email],
  );
  return rows[0]?.h ?? null;
}

/** Reset-token rows of one member: how many exist and how many are revoked. */
export async function resetTokenCounts(
  pool: pg.Pool,
  email: string,
): Promise<{ total: number; revoked: number }> {
  const rows = await selectRows<{ total: string; revoked: string }>(
    pool,
    `SELECT count(*) AS total, count(*) FILTER (WHERE t."revokedAt" IS NOT NULL) AS revoked
       FROM core."appToken" t JOIN core."user" u ON u.id = t."userId"
      WHERE u.email = $1 AND t.type = 'PASSWORD_RESET_TOKEN'`,
    [email],
  );
  return { total: Number(rows[0]?.total ?? 0), revoked: Number(rows[0]?.revoked ?? 0) };
}

/** Live (not soft-deleted) company rows among the given ids. */
export async function companyLiveRows(
  pool: pg.Pool,
  schema: string,
  ids: string[],
): Promise<number> {
  if (!SCHEMA_RE.test(schema)) throw new Error("TEST BUG: schema name is not a workspace schema");
  const rows = await selectRows<{ n: string }>(
    pool,
    `SELECT count(*) AS n FROM "${schema}".company WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL`,
    [ids],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Company rows (any deletion state) whose name starts with the run prefix: the leak check (D16). */
export async function companyRowsByPrefix(
  pool: pg.Pool,
  schema: string,
  prefix: string,
): Promise<number> {
  if (!SCHEMA_RE.test(schema)) throw new Error("TEST BUG: schema name is not a workspace schema");
  const rows = await selectRows<{ n: string }>(
    pool,
    `SELECT count(*) AS n FROM "${schema}".company WHERE name LIKE $1`,
    [`${prefix}%`],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Throwaway members whose address starts with the run prefix: reported, not asserted (Q5). */
export async function memberCountByPrefix(pool: pg.Pool, prefix: string): Promise<number> {
  const rows = await selectRows<{ n: string }>(
    pool,
    `SELECT count(*) AS n FROM core."user" WHERE email LIKE $1`,
    [`${prefix.toLowerCase()}%`],
  );
  return Number(rows[0]?.n ?? 0);
}
