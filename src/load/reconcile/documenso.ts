import type pg from "pg";
import { DOCUMENT_COMPLETED_AUDIT_SQL, SEAL_JOBS_SQL } from "../../documenso/oracle.ts";
import { selectRows } from "../../oracles/pg.ts";
import type { AuditResult, AuditStageConfig } from "./types.ts";
import { addFinding } from "./types.ts";

export interface DocumensoEnvelopeRow {
  status: string;
  sealJobs: number;
  stuckJobs: number;
  completedAudit: number;
}

export interface DocumensoSnapshot {
  envelopes: DocumensoEnvelopeRow[];
  clientCompleted?: number;
  sequentialCompletions: boolean;
}

/** Polls the stuck-job count every pollMs until 0 or timeoutMs (default 30 000). The database wrapper that gives the count is added with the Documenso product case (Task 7). */
export async function waitForDrain(
  countStuck: () => Promise<number>,
  opts: {
    timeoutMs?: number;
    pollMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ drained: boolean; drainMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const pollMs = opts.pollMs ?? 500;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const start = now();
  for (;;) {
    if ((await countStuck()) === 0) return { drained: true, drainMs: now() - start };
    if (now() - start >= timeoutMs) return { drained: false, drainMs: now() - start };
    await sleep(pollMs);
  }
}

/** Pure. Checks in order: rows, drain, sealed-once (a double seal is a known bug; with sequential completions it is unexpected), client-matches-db. */
export function evaluateDocumensoAudit(
  s: DocumensoSnapshot,
  prefixLike: string,
  drain: { drained: boolean; drainMs: number },
  declaredBugs: string[] = [],
): AuditResult {
  const result: AuditResult = {
    schema: 1,
    product: "documenso",
    prefixLike,
    rowsSeen: s.envelopes.length,
    drainMs: drain.drainMs,
    checks: [],
    violations: [],
    knownBugs: {},
    unexpected: [],
    pending: [],
    leak: [],
  };
  const check = (name: string, ok: boolean, detail: string) =>
    result.checks.push({ name, ok, detail });
  const bug = (text: string) => addFinding(result, { kind: "PRODUCT BUG", text });

  check("rows", s.envelopes.length >= 1, `${s.envelopes.length} envelope(s)`);
  if (s.envelopes.length < 1)
    addFinding(result, {
      kind: "TEST BUG",
      text: `audit saw no envelopes (scope LIKE ${prefixLike})`,
    });

  const stuck = s.envelopes.reduce((n, e) => n + e.stuckJobs, 0);
  const drainOk = drain.drained && stuck === 0;
  check("drain", drainOk, `drained ${drain.drained} in ${drain.drainMs} ms, ${stuck} stuck job(s)`);
  if (!drainOk)
    bug(
      `pending jobs after ${drain.drainMs} ms drain (${s.envelopes.length} envelopes, ${stuck} stuck)`,
    );

  const completed = s.envelopes.filter((e) => e.status === "COMPLETED");
  for (const e of completed) {
    if (e.sealJobs === 0) bug("completed envelope never sealed");
    if (e.sealJobs > 1) {
      // A case that declares P6-OBS-DOC-005 (the retry storm) counts its duplicate seal under that ID, not as unexpected.
      const declared = declaredBugs.includes("P6-OBS-DOC-005");
      addFinding(result, {
        kind: "PRODUCT BUG",
        text: "double seal",
        knownBugId: declared ? "P6-OBS-DOC-005" : "P6-OBS-DOC-002",
      });
      if (s.sequentialCompletions && !declared)
        result.unexpected.push("double seal with sequential completions");
    }
  }
  const sealOnce = completed.every((e) => e.sealJobs <= 1 && e.completedAudit === 1);
  check("sealed-once", sealOnce, `${completed.length} completed envelope(s)`);

  if (s.clientCompleted !== undefined) {
    const ok = completed.length === s.clientCompleted;
    check("client-matches-db", ok, `client ${s.clientCompleted}, database ${completed.length}`);
    if (!ok)
      bug(
        `client completed ${s.clientCompleted} envelopes, the database holds ${completed.length} completed`,
      );
  }
  return result;
}

/** The run's envelopes by title prefix (live, not soft-deleted). */
export const ENVELOPES_BY_TITLE_SQL = `SELECT id, "secondaryId", status::text AS status FROM "Envelope" WHERE title LIKE $1 AND "deletedAt" IS NULL`;

/** Stuck seal and webhook jobs of the run: pending or processing, whose documentId is one of the run's documents. */
export const STUCK_JOBS_FOR_RUN_SQL = `SELECT COUNT(*)::int AS n FROM "BackgroundJob" WHERE status::text IN ('PENDING', 'PROCESSING') AND "jobId" IN ('internal.seal-document', 'internal.execute-webhook') AND payload->>'documentId' IN (SELECT substring("secondaryId" FROM 'document_([0-9]+)') FROM "Envelope" WHERE title LIKE $1)`;

/** Stuck seal and webhook jobs of one document. */
export const STUCK_JOBS_FOR_DOCUMENT_SQL = `SELECT COUNT(*)::int AS n FROM "BackgroundJob" WHERE status::text IN ('PENDING', 'PROCESSING') AND "jobId" IN ('internal.seal-document', 'internal.execute-webhook') AND payload->>'documentId' = $1`;

/** Reads the run's envelopes, with their seal jobs, stuck jobs and DOCUMENT_COMPLETED audit rows. */
export async function readDocumensoSnapshot(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "documenso" }>,
  clientCompleted?: number,
): Promise<DocumensoSnapshot> {
  const envelopes = await selectRows<{ id: string; secondaryId: string; status: string }>(
    pool,
    ENVELOPES_BY_TITLE_SQL,
    [cfg.prefixLike],
  );
  const rows: DocumensoEnvelopeRow[] = [];
  for (const env of envelopes) {
    const documentId = /^document_(\d+)$/.exec(env.secondaryId)?.[1] ?? "";
    const seals = documentId ? await selectRows(pool, SEAL_JOBS_SQL, [documentId]) : [];
    const stuck = documentId
      ? await selectRows<{ n: number }>(pool, STUCK_JOBS_FOR_DOCUMENT_SQL, [documentId])
      : [];
    const audit = await selectRows<{ n: number }>(pool, DOCUMENT_COMPLETED_AUDIT_SQL, [env.id]);
    rows.push({
      status: env.status,
      sealJobs: seals.length,
      stuckJobs: Number(stuck[0]?.n ?? 0),
      completedAudit: Number(audit[0]?.n ?? 0),
    });
  }
  return { envelopes: rows, clientCompleted, sequentialCompletions: cfg.sequentialCompletions };
}

/** The drain of the run's stuck jobs, polled from the database (plan §6.5). */
export async function waitForDrainPool(
  pool: pg.Pool,
  prefixLike: string,
  timeoutMs?: number,
): Promise<{ drained: boolean; drainMs: number }> {
  return waitForDrain(
    async () =>
      Number(
        (await selectRows<{ n: number }>(pool, STUCK_JOBS_FOR_RUN_SQL, [prefixLike]))[0]?.n ?? 0,
      ),
    { timeoutMs },
  );
}

/** Reads, then evaluates, including the drain. */
export async function reconcileDocumenso(
  pool: pg.Pool,
  cfg: Extract<AuditStageConfig, { product: "documenso" }>,
  clientCompleted?: number,
): Promise<AuditResult> {
  const drain = await waitForDrainPool(pool, cfg.prefixLike, cfg.drainTimeoutMs);
  const snapshot = await readDocumensoSnapshot(pool, cfg, clientCompleted);
  return evaluateDocumensoAudit(snapshot, cfg.prefixLike, drain, cfg.knownBugs ?? []);
}
