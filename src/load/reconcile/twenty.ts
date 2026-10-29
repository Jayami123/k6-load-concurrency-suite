import type pg from "pg";
import { selectRows } from "../../oracles/pg.ts";
import type { AuditResult, Finding } from "./types.ts";
import { addFinding } from "./types.ts";

/** The workspace schema pattern of src/twenty/oracle.ts (module-local there; copied here, the oracle file is not edited). */
const SCHEMA_RE = /^workspace_[a-z0-9]+$/;

/** What the Twenty case's setup stores in ctx.config.audit (the twenty variant of AuditStageConfig). */
export interface TwentyAuditConfig {
  product: "twenty";
  prefixLike: string; // "<prefix>%", the LIKE pattern of the run's names
  schema: string; // "workspace_<base36>", from resolveWorkspaceSchema (src/twenty/oracle.ts)
}

/** The background journey's k6 counters (the summary of the main run). */
export interface BackgroundCounts {
  created: number;
  patched: number;
  serverErrors: number;
  limited429: number;
}

/** The database side: rows with the run prefix (any state) and how many of them were updated after creation. */
export interface BackgroundRows {
  total: number;
  updated: number;
}

/**
 * Pure. Compares the client counters with the rows. A missing row is a lost write (PRODUCT BUG); a surplus row is a phantom
 * or a prefix collision (TEST BUG). The same two-way rule applies to patches. 5xx responses are a SUSPECTED product bug until
 * a repeated run reproduces them (rule 13). A 429 on a user token is a finding about the profile, not a product verdict.
 */
export function judgeBackground(counts: BackgroundCounts, rows: BackgroundRows): Finding[] {
  const findings: Finding[] = [];
  if (counts.created !== rows.total) {
    findings.push(
      rows.total < counts.created
        ? {
            kind: "PRODUCT BUG",
            text: `lost write: rows ${rows.total} below created ${counts.created}`,
          }
        : {
            kind: "TEST BUG",
            text: `phantom rows: rows ${rows.total} above created ${counts.created}`,
          },
    );
  }
  if (counts.patched !== rows.updated) {
    findings.push(
      rows.updated < counts.patched
        ? {
            kind: "PRODUCT BUG",
            text: `lost update: updated rows ${rows.updated} below patched ${counts.patched}`,
          }
        : {
            kind: "TEST BUG",
            text: `updated rows ${rows.updated} above patched ${counts.patched}`,
          },
    );
  }
  if (counts.serverErrors > 0) {
    findings.push({
      kind: "PRODUCT BUG",
      text: `SUSPECTED: ${counts.serverErrors} 5xx on background journey`,
    });
  }
  if (counts.limited429 > 0) {
    findings.push({
      kind: "TEST BUG",
      text: `limiter engaged on a user token: ${counts.limited429} 429`,
    });
  }
  return findings;
}

/**
 * The Twenty reconcile. One read-only SELECT counts the prefixed company rows and the rows updated after creation.
 * Without `counts` the patch, 5xx and 429 checks are pending (not findings), so a case that has no k6 counters can call it.
 */
export async function reconcileTwenty(
  pool: pg.Pool,
  cfg: TwentyAuditConfig,
  clientCount: number | undefined,
  counts?: BackgroundCounts,
): Promise<AuditResult> {
  if (!SCHEMA_RE.test(cfg.schema))
    throw new Error("TEST BUG: schema name is not a workspace schema");
  const [row] = await selectRows<{ total: string; updated: string }>(
    pool,
    `SELECT count(*) AS total, count(*) FILTER (WHERE "updatedAt" > "createdAt") AS updated FROM "${cfg.schema}".company WHERE name LIKE $1`,
    [cfg.prefixLike],
  );
  const rows: BackgroundRows = {
    total: Number(row?.total ?? 0),
    updated: Number(row?.updated ?? 0),
  };
  const result: AuditResult = {
    schema: 1,
    product: "twenty",
    prefixLike: cfg.prefixLike,
    rowsSeen: rows.total,
    checks: [],
    violations: [],
    knownBugs: {},
    unexpected: [],
    pending: [],
    leak: [],
  };

  if (clientCount === undefined) {
    result.pending.push("created-vs-rows: no client count");
  } else {
    result.checks.push({
      name: "created-vs-rows",
      ok: clientCount === rows.total,
      detail: `created=${clientCount} rows=${rows.total}`,
    });
  }
  if (counts === undefined) {
    result.pending.push("patched-vs-updated", "5xx", "429");
  } else {
    result.checks.push(
      {
        name: "patched-vs-updated",
        ok: counts.patched === rows.updated,
        detail: `patched=${counts.patched} updated=${rows.updated}`,
      },
      { name: "5xx", ok: counts.serverErrors === 0, detail: `5xx=${counts.serverErrors}` },
      { name: "429", ok: counts.limited429 === 0, detail: `429=${counts.limited429}` },
    );
  }

  // Absent inputs default to values that cannot produce a finding (rows as the created count, no errors, no 429s).
  const findings = judgeBackground(
    {
      created: clientCount ?? rows.total,
      patched: counts?.patched ?? rows.updated,
      serverErrors: counts?.serverErrors ?? 0,
      limited429: counts?.limited429 ?? 0,
    },
    rows,
  );
  for (const finding of findings) addFinding(result, finding);
  return result;
}
