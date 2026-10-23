import pg from "pg";
import { selectRows } from "../oracles/pg.ts";

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
